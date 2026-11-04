#!/usr/bin/env node
/**
 * One-shot capture harness for B-FPS-FIXED-CAPTURE-20261104.
 *
 * Runs the single production build, serves web-dist from 127.0.0.1 on an
 * ephemeral port, starts exactly one headless Chromium (SwiftShader), and
 * captures the three named quality cameras twice each in fresh contexts.
 *
 * Required environment:
 *   FPS_CAPTURE_CHROMIUM   absolute path to the already-installed Chrome for Testing binary
 *   NPM_CLI_JS             absolute path to npm-cli.js (runs under this Node 24 process)
 *   FPS_CAPTURE_OUT_ROOT   optional exclusive output root, resolved against the repo cwd;
 *                          defaults to outputs/B-FPS-FIXED-CAPTURE-20261104/fa8740d-swiftshader
 *
 * No game source is modified. All artifacts are written exclusively below the
 * output root (gitignored outputs/ by default); every artifact uses the 'wx' flag
 * so an existing file is never overwritten.
 */
import { chromium } from 'playwright';
import { preview } from 'vite';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const TASK_ID = 'B-FPS-FIXED-CAPTURE-20261104';
const COMMIT = 'fa8740de3bf2f4ffaaabec5c8df09d9f4c9088c8';
const TREE = '417652e69e45b06bb982cd5a0ca11265677f2fcd';
const OUT = process.env.FPS_CAPTURE_OUT_ROOT || 'outputs/B-FPS-FIXED-CAPTURE-20261104/fa8740d-swiftshader';
const REPLAY = { seed: 1, difficulty: 'easy', ticks: 120, hz: 60, playerInput: 'idle-zero-move' };
const CAPTURE_SIZE = { width: 1280, height: 720, dpr: 1 };
const VIEWPORT = { width: 1280, height: 720, pixelRatio: 1, bufferWidth: 1280, bufferHeight: 720 };
const LIGHTING_ID = 'courtyard-light-v1';
// The build imports these directly; verify the installed copies against the lock
// before building so a stale node_modules cannot silently produce the artifacts.
const LOCKED_DEPENDENCIES = ['vite', 'playwright', 'pngjs', 'three', 'typescript'];
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--enable-automation',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];
const CAMERAS = [
  {
    name: 'gameplay',
    query: '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&qualityCapture=gameplay',
  },
  {
    name: 'courtyard-gap',
    query: '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&qualityCapture=courtyard-gap',
    camera: { position: { x: 2.6, y: 1.62, z: 6.4 }, yaw: -0.28, pitch: -0.04, fov: 80 },
  },
  {
    name: 'cross-lane',
    query: '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&lighting=courtyard-light-v1&qualityCapture=cross-lane',
    camera: { position: { x: -7.5, y: 1.62, z: -9.5 }, yaw: 0.32, pitch: -0.03, fov: 80 },
  },
];

const repo = process.cwd();
const outDir = path.resolve(repo, OUT);
const now = () => new Date().toISOString();
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// PW_DEBUG_LOG is a harness-side tee target, not a Playwright variable: Playwright
// writes its DEBUG=pw:browser events to this process's stderr, so mirror stderr
// into the file here. Writes stay disabled until the output root has been claimed,
// so a rejected root (Node version or exclusivity failure) is never modified even
// when the log path points inside it.
let outputRootPrepared = false;
const debugLogPath = process.env.PW_DEBUG_LOG || null;
if (debugLogPath) {
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, callback) => {
    if (outputRootPrepared) {
      try {
        appendFileSync(debugLogPath, typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      } catch { /* best effort; keep stderr flowing */ }
    }
    return originalStderrWrite(chunk, encoding, callback);
  };
}

function stable(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return '"__undefined__"';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
const stableSha = value => sha256(Buffer.from(stable(value)));
const deepEqual = (a, b) => stable(a) === stable(b);

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return files;
}

async function hashTree(dir) {
  const files = await listFiles(dir);
  const records = [];
  for (const file of files) {
    const buf = await readFile(path.join(dir, file));
    records.push({ file, bytes: buf.length, sha256: sha256(buf) });
  }
  return records;
}

function snapshotProcesses() {
  const script = [
    'Get-CimInstance Win32_Process | ForEach-Object {',
    '  $d = $null; if ($_.CreationDate) { $d = $_.CreationDate.ToString("o") };',
    '  [pscustomobject]@{ ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId; CreationDate = $d; Name = $_.Name; CommandLine = $_.CommandLine }',
    '} | ConvertTo-Json -Compress',
  ].join(' ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Process snapshot failed: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout || '[]');
  return Array.isArray(parsed) ? parsed : [parsed];
}

function descendantProcesses(all, rootPid) {
  const children = new Map();
  for (const process of all) {
    if (!children.has(process.ParentProcessId)) children.set(process.ParentProcessId, []);
    children.get(process.ParentProcessId).push(process);
  }
  const out = [];
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    for (const child of children.get(pid) || []) { out.push(child); stack.push(child.ProcessId); }
  }
  return out;
}

function processType(commandLine) {
  const match = /--type=([^\s]+)/.exec(commandLine || '');
  return match ? match[1] : 'browser';
}

function sanitizeProcess(process) {
  return { pid: process.ProcessId, parentPid: process.ParentProcessId, createdAt: process.CreationDate, name: process.Name, type: processType(process.CommandLine) };
}

async function readChromeVersionInfo(executablePath) {
  const script = '$f=$env:FPS_CAPTURE_CHROMIUM; $i=Get-Item $f; [pscustomobject]@{ FileVersion=$i.VersionInfo.FileVersion; ProductVersion=$i.VersionInfo.ProductVersion; Sha256=(Get-FileHash -Algorithm SHA256 $f).Hash } | ConvertTo-Json -Compress';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true, encoding: 'utf8', env: { ...process.env, FPS_CAPTURE_CHROMIUM: executablePath },
  });
  if (result.status !== 0) throw new Error(`Chrome VersionInfo read failed: ${result.stderr}`);
  const info = JSON.parse(result.stdout);
  const binary = await readFile(executablePath);
  return { ...info, Sha256: sha256(binary), versionSource: 'VersionInfo and SHA-256 of the existing binary' };
}

async function verifyDependencies(root = repo) {
  const lockPath = path.join(root, 'package-lock.json');
  let lockBuffer;
  try {
    lockBuffer = await readFile(lockPath);
  } catch (error) {
    throw new Error(`package-lock.json is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const packageLockSha256 = sha256(lockBuffer);
  let lock;
  try {
    lock = JSON.parse(lockBuffer.toString('utf8'));
  } catch (error) {
    throw new Error(`package-lock.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const problems = [];
  const packages = {};
  for (const name of LOCKED_DEPENDENCIES) {
    const lockVersion = lock.packages?.[`node_modules/${name}`]?.version ?? null;
    let installedVersion = null;
    try {
      installedVersion = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version ?? null;
    } catch { /* missing node_modules/<name>/package.json is reported below */ }
    packages[name] = installedVersion;
    if (!lockVersion) problems.push(`${name} is missing from package-lock.json packages["node_modules/${name}"]`);
    else if (!installedVersion) problems.push(`node_modules/${name}/package.json is missing or has no version`);
    else if (installedVersion !== lockVersion) problems.push(`${name}: installed ${installedVersion} != package-lock.json ${lockVersion}`);
  }
  const expectedLockSha256 = process.env.PACKAGE_LOCK_SHA256;
  if (expectedLockSha256 && expectedLockSha256.toLowerCase() !== packageLockSha256) {
    problems.push(`package-lock.json sha256 ${packageLockSha256} != PACKAGE_LOCK_SHA256 ${expectedLockSha256}`);
  }
  assert(problems.length === 0, `dependency verification failed: ${problems.join('; ')}`);
  return { packageLockSha256, packages, verifiedDependencies: [...LOCKED_DEPENDENCIES] };
}

async function runBuild(buildState) {
  const npmCli = process.env.NPM_CLI_JS;
  assert(npmCli && existsSync(npmCli), 'NPM_CLI_JS must point to npm-cli.js');
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH || ''}` };
  const startedAt = now();
  const child = spawn(process.execPath, [npmCli, 'run', 'build'], {
    cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, at: now() }));
  });
  const log = `# node ${process.version}\n# npm-cli.js run build\n# stdout\n${Buffer.concat(stdout).toString('utf8')}\n# stderr\n${Buffer.concat(stderr).toString('utf8')}\n`;
  await writeFile(path.join(outDir, 'build.log'), log, { flag: 'wx' });
  Object.assign(buildState, {
    command: 'npm run build (node npm-cli.js run build)',
    nodeVersion: process.version,
    pid: child.pid,
    startedAt,
    endedAt: exit.at,
    exitCode: exit.code,
    signal: exit.signal,
    windowsHide: true,
    log: 'build.log',
  });
  assert(exit.code === 0, `npm run build exited with code ${exit.code}`);
}

async function prepareOutputRoot() {
  await mkdir(outDir, { recursive: true });
  const preflightPath = path.join(outDir, 'preflight.json');
  const entries = await readdir(outDir);
  if (!entries.includes('preflight.json')) {
    assert(entries.length === 0, `Output root is not exclusive; it already contains: ${entries.join(', ')} (set FPS_CAPTURE_OUT_ROOT to a fresh directory)`);
    await writeFile(preflightPath, JSON.stringify({
      taskId: TASK_ID, commit: COMMIT, tree: TREE, createdAt: now(),
      purpose: 'exclusive output root marker created by the capture harness',
    }, null, 2), { flag: 'wx' });
    return;
  }
  const preflight = JSON.parse(await readFile(preflightPath, 'utf8'));
  assert(preflight.taskId === TASK_ID, `preflight.json taskId ${preflight.taskId} != ${TASK_ID}`);
  const unexpected = entries.filter(name => name !== 'preflight.json');
  assert(unexpected.length === 0, `Output root is not exclusive; it already contains: ${unexpected.join(', ')} (set FPS_CAPTURE_OUT_ROOT to a fresh directory)`);
}

async function waitForPortClosed(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      setTimeout(() => { socket.destroy(); resolve(false); }, 1000);
    });
    if (!open) return true;
    await sleep(100);
  }
  return false;
}

function parseDebugLog(logPath, browserPid) {
  if (!logPath || !existsSync(logPath)) return { available: false };
  const text = readFileSyncSafe(logPath);
  const lines = text.split(/\r?\n/);
  const launch = lines.find(line => line.includes('<launching>'));
  const launched = lines.find(line => line.includes('<launched>'));
  const exitLines = lines.filter(line => line.includes('<browser closed>') || line.includes('<kill>') || line.includes('browser process exited'));
  return {
    available: true,
    hasLaunchingEvent: !!launch,
    hasLaunchedEvent: !!launched,
    pidFromLog: launched ? (/(?:pid=)(\d+)/.exec(launched)?.[1] ?? null) : null,
    pidMatches: launched ? /(?:pid=)(\d+)/.exec(launched)?.[1] === String(browserPid) : false,
    exitEventCount: exitLines.length,
    redacted: 'full launch argv and paths remain local only',
  };
}

function readFileSyncSafe(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

async function captureOne({ browser, camera, take, baseUrl, origin, webDistIndex, state }) {
  const url = `${baseUrl}/${camera.query}`;
  const startedAt = now();
  const context = await browser.newContext({
    viewport: { width: CAPTURE_SIZE.width, height: CAPTURE_SIZE.height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  const responsePromises = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await context.route('**/*', route => {
    const requestUrl = route.request().url();
    let parsed;
    try { parsed = new URL(requestUrl); } catch { return route.continue(); }
    if (parsed.protocol.startsWith('http') && parsed.origin !== origin) {
      externalRequests.push(requestUrl);
      return route.abort();
    }
    return route.continue();
  });
  page.on('response', response => {
    if (!response.url().startsWith(origin)) return;
    const resourceType = response.request().resourceType();
    if (!['document', 'script', 'stylesheet'].includes(resourceType)) return;
    responsePromises.push((async () => {
      let body;
      try { body = await response.body(); } catch (error) { return { url: response.url(), status: response.status(), resourceType, error: String(error) }; }
      const parsed = new URL(response.url());
      const file = parsed.pathname === '/' ? 'index.html' : decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      const localPath = path.join(repo, 'web-dist', file);
      let localSha256 = null;
      let localFileExists = false;
      try { localSha256 = sha256(await readFile(localPath)); localFileExists = true; } catch { /* missing local file is a mismatch */ }
      return {
        url: response.url(), status: response.status(), resourceType, file,
        servedSha256: sha256(body), localFileExists, localSha256,
        match: localFileExists && sha256(body) === localSha256,
        containsQualityCapture: body.includes('qualityCapture'),
      };
    })());
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__shot && (window.__shot.ready || window.__shot.error), null, { timeout: 180000, polling: 100 });
    await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, null, { timeout: 30000, polling: 100 });
    const first = await page.evaluate(() => window.__shot);
    await page.waitForTimeout(150);
    const second = await page.evaluate(() => window.__shot);
    const bootHidden = await page.evaluate(() => document.getElementById('boot')?.hidden === true);
    const responses = (await Promise.all(responsePromises)).filter(Boolean);

    assert(!first?.error, `__shot.error: ${first?.error}`);
    assert(first?.ready === true, '__shot.ready is not true');

    const pngPrefix = 'data:image/png;base64,';
    assert(typeof first.pngDataUrl === 'string' && first.pngDataUrl.startsWith(pngPrefix), 'pngDataUrl is missing or not a PNG data URL');
    const pngBuffer = Buffer.from(first.pngDataUrl.slice(pngPrefix.length), 'base64');
    const png = PNG.sync.read(pngBuffer);
    assert(png.width === CAPTURE_SIZE.width && png.height === CAPTURE_SIZE.height, `PNG decoded as ${png.width}x${png.height}`);
    assert(png.data.length === png.width * png.height * 4, 'PNG did not decode to RGBA');

    const colors = new Set();
    for (let pixel = 0; pixel < png.width * png.height; pixel += 4) {
      const offset = pixel * 4;
      colors.add(((png.data[offset] >> 3) << 10) | ((png.data[offset + 1] >> 3) << 5) | (png.data[offset + 2] >> 3));
    }

    const checks = [];
    const check = (name, ok, actual) => { checks.push({ name, ok, actual }); };
    const player = first.state?.actors?.find(actor => actor.id === 'player');
    check('ready', first.ready === true, first.ready);
    check('errorEmpty', !first.error, first.error ?? null);
    check('backendWebgl2', first.backend === 'webgl2', first.backend);
    check('imageSize', deepEqual(first.image, CAPTURE_SIZE), first.image);
    check('viewportSize', deepEqual(first.viewport, VIEWPORT), first.viewport);
    check('stateTick120', first.state?.tick === 120, first.state?.tick);
    check('frame0', first.frame === 0, first.frame);
    check('t2', first.t === 2, first.t);
    check('hz60', first.hz === 60, first.hz);
    check('replayFixed', deepEqual(first.replay, REPLAY), first.replay);
    check('artReady', first.renderInfo?.art?.state === 'ready' && first.renderInfo?.art?.active === true, first.renderInfo?.art);
    check('renderLighting', first.renderInfo?.lighting?.id === LIGHTING_ID, first.renderInfo?.lighting?.id);
    check('qualityLighting', first.qualityParameters?.lighting?.id === LIGHTING_ID, first.qualityParameters?.lighting?.id);
    check('bootHidden', bootHidden === true, bootHidden);
    check('softwareRenderer', first.rendererEvidence?.rendererClass === 'software', first.rendererEvidence);
    check('pngSignal', colors.size > 32, { colors: colors.size, sampledEvery: 4 });
    check('playerPresent', !!player, player?.id ?? null);
    check('actualPlayerPose', deepEqual(first.actualPlayerPose?.position, player?.position) && first.actualPlayerPose?.yaw === player?.yaw && first.actualPlayerPose?.pitch === player?.pitch, { actualPlayerPose: first.actualPlayerPose, player: player && { position: player.position, yaw: player.yaw, pitch: player.pitch } });
    check('cameraFov80', first.camera?.fov === 80, first.camera?.fov);
    if (camera.camera) {
      check('cameraObserverKind', first.cameraKind === 'observer' && first.firstPersonWeapon === false, { cameraKind: first.cameraKind, firstPersonWeapon: first.firstPersonWeapon });
      check('cameraObserverPose', deepEqual(
        { position: first.camera?.position, yaw: first.camera?.yaw, pitch: first.camera?.pitch, fov: first.camera?.fov },
        camera.camera,
      ), { actual: first.camera, expected: camera.camera });
    } else {
      check('cameraPlayerKind', first.cameraKind === 'player' && first.firstPersonWeapon === true, { cameraKind: first.cameraKind, firstPersonWeapon: first.firstPersonWeapon });
    }
    const pngHashFirst = sha256(pngBuffer);
    const rgbaHashFirst = sha256(png.data);
    check('frame0Waited150msStable',
      first.stateHash === second.stateHash && first.t === second.t && first.frame === second.frame
        && deepEqual(first.camera, second.camera) && deepEqual(first.actualPlayerPose, second.actualPlayerPose)
        && first.pngDataUrl === second.pngDataUrl,
      { stateHashSame: first.stateHash === second.stateHash, pngSame: first.pngDataUrl === second.pngDataUrl });
    check('pageErrorsEmpty', pageErrors.length === 0, pageErrors);
    check('externalRequestsEmpty', externalRequests.length === 0, externalRequests);
    check('servedBundlesMatch', responses.every(record => record.status !== 200 || record.match), responses.filter(record => record.status === 200 && !record.match));
    check('entryServed', responses.some(record => record.file === 'index.html' && record.match), responses.filter(record => record.file === 'index.html'));
    check('qualityChunkServed', responses.some(record => record.resourceType === 'script' && record.containsQualityCapture && record.match), responses.filter(record => record.containsQualityCapture).map(record => record.url));

    const validation = { passed: checks.every(item => item.ok), checks };
    const snapshot = { ...first };
    delete snapshot.pngDataUrl;
    const fileBase = `capture-${camera.name}-${take}`;
    await writeFile(path.join(outDir, `${fileBase}.png`), pngBuffer, { flag: 'wx' });
    await writeFile(path.join(outDir, `${fileBase}.json`), JSON.stringify({
      taskId: TASK_ID, camera: camera.name, take, url, capturedAt: startedAt, completedAt: now(),
      commit: COMMIT, tree: TREE, replay: REPLAY, validation, responses, pageErrors, consoleErrors, externalRequests,
      png: { file: `${fileBase}.png`, width: png.width, height: png.height, bytes: pngBuffer.length, sha256: pngHashFirst, rgbaSha256: rgbaHashFirst, sampledColors5bit: colors.size },
      stateStableSha256: stableSha(first.state), commandsStableSha256: stableSha(first.commands),
      cameraStableSha256: stableSha({ camera: first.camera, actualPlayerPose: first.actualPlayerPose }),
      rendererStableSha256: stableSha(first.rendererEvidence),
      shot: snapshot,
    }, null, 2), { flag: 'wx' });
    if (!validation.passed) throw new Error(`validation failed for ${camera.name} take ${take}: ${checks.filter(item => !item.ok).map(item => item.name).join(', ')}`);

    const record = {
      camera: camera.name, take, url, startedAt, completedAt: now(),
      pngFile: `${fileBase}.png`, jsonFile: `${fileBase}.json`,
      pngSha256: pngHashFirst, rgbaSha256: rgbaHashFirst,
      stateHash: first.stateHash, stateStableSha256: stableSha(first.state), commandsStableSha256: stableSha(first.commands),
      cameraStableSha256: stableSha({ camera: first.camera, actualPlayerPose: first.actualPlayerPose }),
      rendererStableSha256: stableSha(first.rendererEvidence),
      t: first.t, frame: first.frame, hz: first.hz, tick: first.state.tick,
      cameraInfo: first.camera, actualPlayerPose: first.actualPlayerPose, replay: first.replay,
      qualityParameters: first.qualityParameters, rendererEvidence: first.rendererEvidence,
      renderInfo: { art: first.renderInfo?.art, lighting: first.renderInfo?.lighting, render: first.renderInfo?.render, memory: first.renderInfo?.memory },
      viewport: first.viewport, image: first.image, backend: first.backend,
      sampledColors5bit: colors.size, validation,
    };
    return record;
  } finally {
    await context.close();
  }
}

function computeOutcome(state, cameraCount = CAMERAS.length) {
  const captureComplete = !state.failure
    && state.build?.exitCode === 0
    && state.shots.length === cameraCount * 2
    && state.comparisons.length === cameraCount
    && state.comparisons.every(item => item.passed)
    && state.shots.every(shot => shot.validation.passed);
  const exitBaselineComplete = state.chromium?.exitCode === 0
    && state.cleanup?.portClosed === true
    && state.cleanup?.childrenRemaining?.length === 0;
  const passed = captureComplete && exitBaselineComplete;
  const status = passed
    ? 'complete'
    : captureComplete
      ? 'capture-complete, exit-baseline-incomplete'
      : 'capture-failed';
  return { captureComplete, exitBaselineComplete, passed, status };
}

async function main() {
  assert(process.version.startsWith('v24.'), `Harness must run under Node 24, got ${process.version}`);
  await prepareOutputRoot();
  outputRootPrepared = true;
  const chromeExecutable = process.env.FPS_CAPTURE_CHROMIUM;
  assert(chromeExecutable && existsSync(chromeExecutable), 'FPS_CAPTURE_CHROMIUM must point to the existing Chrome for Testing binary');

  const harness = {
    taskId: TASK_ID,
    pid: process.pid,
    nodeVersion: process.version,
    startedAt: now(),
    cwdIsRepo: path.basename(repo) === 'B-FPS-FIXED-CAPTURE-20261104',
    debug: process.env.DEBUG || null,
  };

  const state = {
    harness,
    commit: COMMIT,
    tree: TREE,
    sourceCleanBeforeBuild: git(['status', '--porcelain', '--untracked-files=no']).stdout === '',
    sourceCleanAfterBuild: null,
    headObserved: git(['rev-parse', 'HEAD']).stdout,
    treeObserved: git(['rev-parse', 'HEAD^{tree}']).stdout,
    dependencies: null,
    chrome: null,
    build: null,
    preview: null,
    chromium: null,
    shots: [],
    comparisons: [],
    failure: null,
    cleanup: null,
    externalProcesses: null,
  };

  let browserServer = null;
  let browser = null;
  let server = null;
  let exitInfo = null;
  let exitPromise = null;
  let browserClosedAt = null;
  let browserChildren = [];

  try {
    assert(state.headObserved === COMMIT, `HEAD ${state.headObserved} != ${COMMIT}`);
    assert(state.treeObserved === TREE, `tree ${state.treeObserved} != ${TREE}`);
    assert(state.sourceCleanBeforeBuild, 'tracked worktree is dirty before build');
    state.dependencies = await verifyDependencies();
    state.chrome = await readChromeVersionInfo(chromeExecutable);
    state.build = {};
    await runBuild(state.build);
    state.sourceCleanAfterBuild = git(['status', '--porcelain', '--untracked-files=no']).stdout === '';
    assert(state.sourceCleanAfterBuild, 'tracked worktree is dirty after build');

    const webDistIndex = await hashTree(path.join(repo, 'web-dist'));
    assert(webDistIndex.some(file => file.file === 'index.html'), 'web-dist/index.html missing');
    state.webDist = { fileCount: webDistIndex.length, files: webDistIndex };

    const externalSnapshot = snapshotProcesses();
    state.externalProcesses = externalSnapshot.filter(process => /chrome\.exe|node\.exe/i.test(process.Name || ''))
      .map(sanitizeProcess);

    const previewStartedAt = now();
    server = await preview({
      root: repo,
      configFile: path.join(repo, 'vite.config.ts'),
      logLevel: 'info',
      preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
    });
    const address = server.httpServer.address();
    assert(address && typeof address === 'object' && address.port > 0, 'Preview did not expose an ephemeral port');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = new URL(baseUrl).origin;
    state.preview = {
      sameProcess: true, pid: process.pid, host: address.address, port: address.port, baseUrl,
      startedAt: previewStartedAt, exitCode: null, exitSignal: null,
    };

    const launchStartedAt = now();
    browserServer = await chromium.launchServer({
      executablePath: chromeExecutable,
      headless: true,
      chromiumSandbox: false,
      args: LAUNCH_ARGS,
      timeout: 120000,
    });
    const browserProcess = browserServer.process();
    const browserPid = browserProcess.pid;
    exitPromise = new Promise(resolve => {
      if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
        resolve({ code: browserProcess.exitCode, signal: browserProcess.signalCode, at: now(), immediate: true });
      } else {
        browserProcess.once('exit', (code, signal) => resolve({ code, signal, at: now(), immediate: false }));
      }
    });
    browserServer.once('close', () => { browserClosedAt = now(); });
    const processTree = snapshotProcesses();
    browserChildren = descendantProcesses(processTree, browserPid).map(sanitizeProcess);
    browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 120000 });
    state.chromium = {
      version: browser.version(),
      executableSha256: state.chrome.Sha256,
      executableVersionInfo: state.chrome.FileVersion,
      versionSource: state.chrome.versionSource,
      pid: browserPid,
      parentPid: process.pid,
      parentChain: [{ pid: process.pid, role: 'harness' }],
      startedAt: launchStartedAt,
      creationDateFromOs: processTree.find(process => process.ProcessId === browserPid)?.CreationDate ?? null,
      launch: { headless: true, chromiumSandbox: false, args: LAUNCH_ARGS, ignoreDefaultArgs: false },
      childrenAtLaunch: browserChildren,
      exitCode: null, exitSignal: null, endedAt: null, serverClosedAt: null,
      debugLog: null,
    };

    let commandLine = null;
    for (const camera of CAMERAS) {
      let firstRecord = null;
      for (let take = 1; take <= 2; take++) {
        let record;
        try {
          record = await captureOne({ browser, camera, take, baseUrl, origin, webDistIndex, state });
        } catch (error) {
          state.failure = { camera: camera.name, take, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? (error.stack || '') : '' };
          throw error;
        }
        state.shots.push(record);
        if (take === 1) {
          firstRecord = record;
          // The first image is decoded and validated before the second capture starts.
        } else {
          const same = {
            rgbaSha256: firstRecord.rgbaSha256 === record.rgbaSha256,
            stateHash: firstRecord.stateHash === record.stateHash,
            stateStable: firstRecord.stateStableSha256 === record.stateStableSha256,
            commandsStable: firstRecord.commandsStableSha256 === record.commandsStableSha256,
            cameraStable: firstRecord.cameraStableSha256 === record.cameraStableSha256,
            rendererStable: firstRecord.rendererStableSha256 === record.rendererStableSha256,
            t: firstRecord.t === record.t,
            frame: firstRecord.frame === record.frame,
            tick: firstRecord.tick === record.tick,
          };
          state.comparisons.push({ camera: camera.name, same, passed: Object.values(same).every(Boolean) });
          if (!Object.values(same).every(Boolean)) throw new Error(`two takes differ for ${camera.name}: ${JSON.stringify(same)}`);
        }
        if (take === 1) {
          // Attach the actual Chromium command line from the first page of the first camera.
          if (!commandLine) {
            try {
              const context = await browser.newContext();
              const page = await context.newPage();
              const cdp = await context.newCDPSession(page);
              commandLine = await cdp.send('Browser.getBrowserCommandLine');
              await context.close();
            } catch (error) {
              state.chromium.commandLineError = String(error);
            }
          }
        }
      }
    }

    const actualArgs = commandLine?.arguments ?? [];
    const has = predicate => actualArgs.some(predicate);
    state.chromium.actualCommandLine = {
      argumentCount: actualArgs.length,
      headless: has(arg => arg === '--headless' || arg.startsWith('--headless=')),
      noSandbox: has(arg => arg === '--no-sandbox'),
      unsafeSwiftshader: has(arg => arg === '--enable-unsafe-swiftshader'),
      angleSwiftshader: has(arg => arg === '--use-angle=swiftshader'),
      automation: has(arg => arg === '--enable-automation'),
      backgroundTimerThrottlingDisabled: has(arg => arg === '--disable-background-timer-throttling'),
      rendererBackgroundingDisabled: has(arg => arg === '--disable-renderer-backgrounding'),
      occludedBackgroundingDisabled: has(arg => arg === '--disable-backgrounding-occluded-windows'),
      gpuDisabled: has(arg => arg === '--disable-gpu'),
      angleD3d11: has(arg => arg === '--use-angle=d3d11'),
      source: 'Browser.getBrowserCommandLine over CDP',
    };
    assert(state.chromium.actualCommandLine.headless, 'actual argv lacks headless');
    assert(state.chromium.actualCommandLine.noSandbox, 'actual argv lacks --no-sandbox');
    assert(state.chromium.actualCommandLine.unsafeSwiftshader, 'actual argv lacks --enable-unsafe-swiftshader');
    assert(state.chromium.actualCommandLine.angleSwiftshader, 'actual argv lacks --use-angle=swiftshader');
    assert(state.chromium.actualCommandLine.automation, 'actual argv lacks --enable-automation');
  } catch (error) {
    state.failure ??= { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? (error.stack || '') : '' };
  } finally {
    const cleanup = { startedAt: now(), contextsClosed: true, browser: null, preview: null, childrenRemaining: [], portClosed: null };
    try {
      // browser.close() on a browser obtained via connect() only disconnects the
      // client; BrowserServer.close() is the graceful path for a launched server.
      if (browserServer) {
        cleanup.browserCloseMode = 'browserServer.close';
        cleanup.browserCloseRequestedAt = now();
        await browserServer.close().catch(() => {});
        const exit = await Promise.race([
          exitPromise ?? Promise.resolve({ code: null, signal: null, at: null, immediate: false }),
          sleep(15000).then(() => null),
        ]);
        if (!exit) {
          cleanup.killRequestedAt = now();
          await browserServer.kill().catch(() => {});
          exitInfo = await Promise.race([exitPromise ?? Promise.resolve(null), sleep(10000).then(() => null)]);
        } else exitInfo = exit;
      } else if (browser) {
        await browser.close().catch(() => {});
      }
      if (server) {
        const serverClose = new Promise(resolve => server.httpServer.once('close', () => resolve(now())));
        await server.close().catch(() => {});
        const closedAt = await Promise.race([serverClose, sleep(10000).then(() => null)]);
        cleanup.preview = {
          sameProcess: true, pid: process.pid, closeCallbackAt: closedAt,
          httpServerListeningAfterClose: server.httpServer.listening,
          closeInvoked: true,
        };
        cleanup.portClosed = await waitForPortClosed(state.preview?.port);
      }
      if (browserPidForCleanup(state)) {
        const finalTree = snapshotProcesses();
        const remaining = descendantProcesses(finalTree, state.chromium.pid).map(sanitizeProcess);
        cleanup.childrenRemaining = remaining;
      }
    } catch (error) {
      cleanup.error = error instanceof Error ? error.message : String(error);
    }
    cleanup.endedAt = now();
    state.cleanup = cleanup;
    if (state.chromium) {
      state.chromium.endedAt = exitInfo?.at ?? null;
      state.chromium.exitCode = exitInfo?.code ?? null;
      state.chromium.exitSignal = exitInfo?.signal ?? null;
      state.chromium.serverClosedAt = browserClosedAt;
      state.chromium.debugLog = parseDebugLog(debugLogPath, state.chromium.pid);
      state.chromium.exitImmediate = exitInfo?.immediate ?? null;
    }
    if (state.preview) {
      state.preview.closedAt = cleanup.preview?.closeCallbackAt ?? null;
      state.preview.httpServerListeningAfterClose = cleanup.preview?.httpServerListeningAfterClose ?? null;
      state.preview.portClosed = cleanup.portClosed;
    }
    state.harness.endedAt = now();
  }

  const { captureComplete, exitBaselineComplete, passed, status } = computeOutcome(state);
  state.harness.selfReportedPassed = passed;
  state.harness.selfReportedExitCode = passed ? 0 : 1;

  // Describe where local-only evidence actually lives instead of assuming the
  // default gitignored outputs/ root, since FPS_CAPTURE_OUT_ROOT may point elsewhere.
  const outRel = path.relative(repo, outDir);
  const insideWorktree = outRel !== '' && !path.isAbsolute(outRel)
    && outRel !== '..' && !outRel.startsWith('..' + path.sep);
  const gitIgnored = insideWorktree && git(['check-ignore', '-q', outRel.split(path.sep).join('/')]).status === 0;
  const locationNote = insideWorktree
    ? (gitIgnored
      ? 'an output directory inside the repository worktree that git ignores'
      : 'an output directory inside the repository worktree that is NOT gitignored; keep it untracked and do not commit it')
    : 'an output directory outside the repository worktree';
  const publicCopyNote = `Local-only evidence remains in ${locationNote}; it is not published.`;
  const redactionNote = `Public copy omits machine username, absolute paths, full browser argv, CDP/debug endpoints, and raw debug logs. Local-only records remain in ${locationNote}.`;

  const report = {
    taskId: TASK_ID,
    commit: COMMIT,
    tree: TREE,
    passed,
    captureComplete,
    exitBaselineComplete,
    complete: passed,
    status,
    passedScope: 'capture-and-cleanup',
    cleanExitBaseline: state.chromium?.exitCode === 0,
    generatedAt: now(),
    source: {
      headObserved: state.headObserved,
      treeObserved: state.treeObserved,
      headMatchesFixed: state.headObserved === COMMIT,
      treeMatchesFixed: state.treeObserved === TREE,
      trackedCleanBeforeBuild: state.sourceCleanBeforeBuild,
      trackedCleanAfterBuild: state.sourceCleanAfterBuild,
    },
    environment: {
      node: process.version,
      nodeOnPath: process.env.NODE_ON_PATH || null,
      python: process.env.PYTHON_VERSION || null,
      chromium: {
        version: state.chromium?.version ?? null,
        executableVersionInfo: state.chrome?.FileVersion ?? null,
        executableSha256: state.chrome?.Sha256 ?? null,
        versionSource: state.chrome?.versionSource ?? null,
      },
      dependencies: state.dependencies?.packages ?? null,
      dependenciesSource: state.dependencies ? 'installed node_modules versions, each checked against package-lock.json before the build' : null,
      packageLockSha256: state.dependencies?.packageLockSha256 ?? null,
    },
    build: state.build,
    webDist: state.webDist ? { fileCount: state.webDist.fileCount, files: state.webDist.files } : null,
    server: state.preview,
    chromium: state.chromium,
    processRecords: {
      harness: state.harness,
      build: state.build && { pid: state.build.pid, startedAt: state.build.startedAt, endedAt: state.build.endedAt, exitCode: state.build.exitCode, signal: state.build.signal },
      preview: state.preview && { sameProcess: true, pid: state.preview.pid, startedAt: state.preview.startedAt, closedAt: state.preview.closedAt, port: state.preview.port, portClosed: state.preview.portClosed, httpServerListeningAfterClose: state.preview.httpServerListeningAfterClose },
      chromium: state.chromium && { pid: state.chromium.pid, parentPid: state.chromium.parentPid, startedAt: state.chromium.startedAt, endedAt: state.chromium.endedAt, exitCode: state.chromium.exitCode, exitSignal: state.chromium.exitSignal, childrenAtLaunch: state.chromium.childrenAtLaunch, childrenRemaining: state.cleanup?.childrenRemaining ?? null },
    },
    shots: state.shots.map(shot => ({
      camera: shot.camera, take: shot.take, url: shot.url, startedAt: shot.startedAt, completedAt: shot.completedAt,
      pngFile: shot.pngFile, jsonFile: shot.jsonFile, pngSha256: shot.pngSha256, rgbaSha256: shot.rgbaSha256,
      stateHash: shot.stateHash, stateStableSha256: shot.stateStableSha256, commandsStableSha256: shot.commandsStableSha256,
      cameraStableSha256: shot.cameraStableSha256, rendererStableSha256: shot.rendererStableSha256,
      t: shot.t, frame: shot.frame, hz: shot.hz, tick: shot.tick,
      backend: shot.backend, image: shot.image, viewport: shot.viewport,
      cameraInfo: shot.cameraInfo, actualPlayerPose: shot.actualPlayerPose, replay: shot.replay,
      qualityParameters: shot.qualityParameters, rendererEvidence: shot.rendererEvidence,
      renderInfo: shot.renderInfo, sampledColors5bit: shot.sampledColors5bit, validation: shot.validation,
    })),
    comparisons: state.comparisons,
    cleanup: state.cleanup,
    failure: state.failure,
    externalProcessesObserved: state.externalProcesses,
    openIssues: [
      'SwiftShader software rendering only; not a hardware-GPU baseline.',
      'One fixed 120-tick state per camera, not a full six-round match.',
      'Audio, feel, reference registration, and picture ranking are not verified by this capture.',
    ],
    publicCopy: { sanitized: true, note: publicCopyNote },
    redaction: redactionNote,
    passedMeaning: 'passed is captureComplete && exitBaselineComplete; complete mirrors passed. status is complete, capture-complete, exit-baseline-incomplete, or capture-failed.',
  };

  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify({
    taskId: TASK_ID, passed, captureComplete, exitBaselineComplete, complete: passed,
    status,
    cleanExitBaseline: state.chromium?.exitCode === 0,
    generatedAt: report.generatedAt,
    summary: passed
      ? 'Six PNGs captured, decoded, and verified; each camera has two identical fresh-context takes.'
      : captureComplete
        ? 'Capture complete and verified, but the exit baseline is incomplete; see cleanupDeviation.'
        : 'Capture failed; see failure and per-shot validation.',
    failure: state.failure, comparisons: state.comparisons,
    checks: {
      buildExit0: state.build?.exitCode === 0,
      sixShots: state.shots.length === 6,
      allShotValidationPassed: state.shots.every(shot => shot.validation.passed),
      allTakesMatch: state.comparisons.every(item => item.passed),
      softwareRendererEveryShot: state.shots.every(shot => shot.validation.checks.find(check => check.name === 'softwareRenderer')?.ok === true),
      servedBundlesMatch: state.shots.every(shot => shot.validation.checks.find(check => check.name === 'servedBundlesMatch')?.ok === true),
      previewPortClosed: state.cleanup?.portClosed === true,
      browserChildrenGone: state.cleanup?.childrenRemaining?.length === 0,
      chromiumExit0: state.chromium?.exitCode === 0,
    },
    harnessSelfReportedExitCode: state.harness.selfReportedExitCode,
    processRecords: report.processRecords,
    cleanup: state.cleanup,
    openIssues: report.openIssues,
    redaction: report.redaction,
  }, null, 2), { flag: 'wx' });
  await writeFile(path.join(outDir, 'processes.local.json'), JSON.stringify({
    note: 'Local-only process evidence; full command lines and paths are not part of the public copy.',
    harness: state.harness,
    build: state.build,
    preview: state.preview,
    chromium: state.chromium,
    externalProcessesObserved: state.externalProcesses,
  }, null, 2), { flag: 'wx' });
  if (state.failure) await writeFile(path.join(outDir, 'failure.json'), JSON.stringify(state.failure, null, 2), { flag: 'wx' });

  process.exitCode = passed ? 0 : 1;
}

function browserPidForCleanup(state) {
  return !!state.chromium?.pid;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async error => {
    console.error(error instanceof Error ? (error.stack || error.message) : String(error));
    // Only write into a root this process has successfully claimed. If the Node
    // version check or prepareOutputRoot() rejected the root (for example a
    // non-exclusive directory), leave it untouched as promised.
    if (outputRootPrepared) {
      try {
        await writeFile(path.join(outDir, 'harness-fatal.json'), JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? (error.stack || '') : '', at: now(),
        }, null, 2), { flag: 'wx' });
      } catch { /* best effort */ }
    }
    process.exitCode = 1;
  });
}

export { prepareOutputRoot, computeOutcome, verifyDependencies };
