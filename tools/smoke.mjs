import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { PNG } from 'pngjs';
import { OFFLINE_QUERY, assertOfflineReady, assertMatchReset, finishOfflineRound, portClosed } from './smoke-offline-support.mjs';
const output = process.env.FPS_SMOKE_OUTPUT ? pathToFileURL(resolve(process.env.FPS_SMOKE_OUTPUT) + sep) : new URL('../outputs/browser-smoke/', import.meta.url);
const query = process.env.FPS_SMOKE_QUERY ?? '';
if (query && !query.startsWith('?')) throw new Error('Smoke query must start with ?');
await mkdir(output, { recursive: true });
const report = { passed: false, errors: [], warnings: [], stages: [] };
const offline = query === OFFLINE_QUERY;
if (new URLSearchParams(query).get('gameplay') === 'offline-training-v1' && !offline) throw new Error('Offline smoke requires the exact complete entry');
if (offline) report.offlineCoverage = { fullMatchPlaythrough: false, completedRounds: [], restartScope: 'whole match via existing restart UI; no separate round-restart control', unverified: ['six-round completion UI', 'halftime transition', 'end-of-match replay', 'human visual/audio quality'] };
let server, browser, page, previewPort;
try {
  server = await preview({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), build: { outDir: 'web-dist' }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  previewPort = address.port;
  const origin = `http://127.0.0.1:${address.port}`;
  const executablePath = process.env.FPS_SMOKE_CHROMIUM;
  // Playwright 1.64 also inserts this switch in its defaults. Omitting it from
  // args alone is insufficient; preserve every other default and the sandbox.
  const ignoreDefaultArgs = ['--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, ignoreDefaultArgs, ...(executablePath ? { executablePath } : {}), args: process.env.FPS_SMOKE_RENDERER === 'native' ? [] : ['--use-angle=swiftshader'] });
  report.requestedLaunch = { headless: true, chromiumSandbox: true, executablePath, ignoreDefaultArgs, args: process.env.FPS_SMOKE_RENDERER === 'native' ? [] : ['--use-angle=swiftshader'], browserVersion: browser.version() };
  report.launchEvidence = 'Requested options only; verify final argv in DEBUG=pw:browser output.';
  page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); else if (e.type() === 'warning') report.warnings.push(e.text()); });
  page.on('requestfailed', r => report.errors.push(`Request failed: ${r.url()} ${r.failure()?.errorText}`));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  report.query = query;
  await page.goto(origin + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.fpsClient?.state().ready);
  report.webgl = await page.locator('#stage').evaluate(canvas => { const gl = canvas.getContext('webgl2'); if (!gl || gl.isContextLost()) return null; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR), unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null }; });
  assert.ok(report.webgl, 'A real WebGL2 context is required');
  const raw = report.webgl.unmaskedRenderer ?? report.webgl.renderer;
  report.rendererClass = /(swiftshader|llvmpipe|softpipe|swrast|lavapipe|software|basic render|microsoft remote)/i.test(raw) ? 'software' : report.webgl.unmaskedRenderer && !/(virgl|virtual|vmware|parallels)/i.test(raw) && /(nvidia|geforce|quadro|radeon|\bAMD\b|\bIntel\b|Apple\s+(?:M\d|GPU)|adreno|mali)/i.test(raw) ? 'gpu' : 'unknown';
  assert.equal(await page.evaluate(() => window.fpsClient.snapshot().gameplayVersion ?? 1), new URLSearchParams(query).get('gameplay') === 'movement-v2' ? 2 : 1);
  if (new URLSearchParams(query).get('contentSet') === 'characters-v1') {
    await page.waitForFunction(() => { const state = JSON.parse(document.getElementById('debug-state').textContent); return state.contentSet?.status === 'ready' && state.contentSet?.active === true; });
    report.contentSet = await page.evaluate(() => JSON.parse(document.getElementById('debug-state').textContent).contentSet);
  }
  if (offline) {
    await page.waitForFunction(() => window.fpsClient.state().environment?.active === true);
    const initial = await page.evaluate(() => ({ state: window.fpsClient.state(), snapshot: window.fpsClient.snapshot(), hud: { progress: document.getElementById('round').textContent, goal: document.getElementById('goal').textContent, title: document.getElementById('match-title').textContent } }));
    assertOfflineReady(initial.state, initial.snapshot, initial.hud);
    report.offlineInitial = initial;
    report.stages.push('nine bot controllers, ten actors, complete-match HUD, courtyard active');
  }
  await page.screenshot({ path: fileURLToPath(new URL('menu.png', output)) });
  const pixels = PNG.sync.read(await page.locator('#stage').screenshot());
  const colors = new Map();
  for (let i = 0; i < pixels.data.length; i += 4) { const key = `${pixels.data[i] >> 3},${pixels.data[i + 1] >> 3},${pixels.data[i + 2] >> 3}`; colors.set(key, (colors.get(key) ?? 0) + 1); }
  report.pixels = { colors: colors.size, dominant: Math.max(...colors.values()) / (pixels.width * pixels.height) };
  assert.ok(report.pixels.colors > 32 && report.pixels.dominant < 0.99, 'Canvas must have non-background pixels');
  report.stages.push('loaded real WebGL2 scene');
  await page.locator('#audio').uncheck();
  await page.locator('#start').click();
  await page.waitForFunction(() => window.fpsClient.state().locked && window.fpsClient.state().running);
  await page.waitForFunction(() => window.fpsClient.snapshot().tick > 4);
  const initial = await page.evaluate(() => window.fpsClient.snapshot());
  await page.keyboard.down('s'); await page.waitForTimeout(230); await page.keyboard.up('s');
  const moved = await page.evaluate(() => window.fpsClient.snapshot());
  const p0 = initial.actors.find(a => a.id === 'player'), p1 = moved.actors.find(a => a.id === 'player');
  assert.ok(p1.position.z < p0.position.z - 0.3, 'Actual keyboard input moves the shared simulation');
  const yaw = await page.evaluate(() => window.fpsClient.state().yaw);
  await page.mouse.move(800, 450); await page.mouse.move(900, 440);
  await page.waitForFunction(yaw => Math.abs(window.fpsClient.state().yaw - yaw) > 0.01, yaw);
  await page.keyboard.press('2');
  await page.waitForFunction(() => window.fpsClient.snapshot().actors.find(a => a.id === 'player').weapon === 'pistol');
  await page.waitForTimeout(250); await page.mouse.click(682, 450);
  await page.waitForFunction(() => window.fpsClient.snapshot().actors.find(a => a.id === 'player').weapons.pistol.ammo === 9);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.fpsClient.snapshot().actors.find(a => a.id === 'player').reload !== null);
  await page.keyboard.press('1');
  await page.waitForFunction(() => { const a = window.fpsClient.snapshot().actors.find(a => a.id === 'player'); return a.weapon === 'rifle' && a.reload === null; });
  report.stages.push('pointer lock, mouse aim, movement, pistol shot, reload interruption');
  await page.screenshot({ path: fileURLToPath(new URL('playing.png', output)) });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.fpsClient.state().running);
  const paused = await page.evaluate(() => window.fpsClient.snapshot().tick);
  await page.waitForTimeout(200); assert.equal(await page.evaluate(() => window.fpsClient.snapshot().tick), paused);
  await page.locator('#start').click(); await page.waitForFunction(() => window.fpsClient.state().running);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.fpsClient.state().running);
  if (offline) await finishOfflineRound(page, report);
  await page.locator('#restart').click();
  await page.waitForFunction(() => window.fpsClient.snapshot().tick === 0);
  assert.equal(await page.evaluate(() => window.fpsClient.snapshot().actors.find(a => a.id === 'player').weapons.pistol.ammo), 10);
  if (offline) {
    const reset = await page.evaluate(() => ({ state: window.fpsClient.state(), snapshot: window.fpsClient.snapshot() }));
    assertMatchReset(reset.state, reset.snapshot);
    report.offlineReset = reset;
    report.stages.push('whole-match restart clears completed-round record and score');
  }
  report.stages.push('pause freezes clock, resume and restart clear input/ammo state');
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  if (page) { try { await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)) }); } catch {} }
} finally {
  report.cleanup = {};
  try {
    await browser?.close();
    report.cleanup.browserDisconnected = !!browser && !browser.isConnected();
  } catch (error) { report.cleanup.browserError = String(error); report.passed = false; process.exitCode = 1; }
  try {
    if (server) { server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); }
    report.cleanup.previewPortClosed = previewPort !== undefined && await portClosed(previewPort);
    if (previewPort !== undefined) assert.equal(report.cleanup.previewPortClosed, true);
  } catch (error) { report.cleanup.previewError = String(error); report.passed = false; process.exitCode = 1; }
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
