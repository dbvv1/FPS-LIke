#!/usr/bin/env node
// Current training match only. Run headless on the authorized local receiver.
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { PNG } from 'pngjs';
import { captureBuildInvocation } from './capture-support.ts';
import { QUALITY_SHOTS, qualityPairQuery, validatePairQuery, DEFAULT_PAIR_QUERY, validateQualityShot, comparableQualityShot } from './quality-pair-support.ts';
const { values } = parseArgs({ options: { sha: { type: 'string' }, commit: { type: 'string' }, query: { type: 'string' }, 'candidate-query': { type: 'string' }, out: { type: 'string' } } });
assert.ok(!values.sha || !values.commit || values.sha === values.commit, '--sha and --commit must agree');
const commit = values.commit ?? values.sha;
assert.match(commit ?? '', /^[a-f0-9]{40}$/, '--commit (or --sha) requires the exact full source SHA');
const queries = { default: validatePairQuery(values.query ?? DEFAULT_PAIR_QUERY, 'default'), materials: validatePairQuery(values['candidate-query'] ?? DEFAULT_PAIR_QUERY + '&materials=ai-courtyard-full-v1', 'materials') };
assert.ok(values.out, '--out requires a new output directory');
assert.notEqual(process.env.FPS_CLOUD_NO_SANDBOX, '1', 'Local runner keeps Chromium sandbox');
const root = fileURLToPath(new URL('..', import.meta.url)), output = resolve(values.out);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const source = () => ({ commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), changes: git('status', '--porcelain', '--untracked-files=no') });
const before = source(); assert.equal(before.commit, commit); assert.equal(before.changes, '', 'Tracked source must be clean');
await mkdir(output, { recursive: false }); // Refuse an old or concurrent output, never overwrite.
const hash = data => createHash('sha256').update(data).digest('hex');
const report = { passed: false, source: before, nodeVersion: process.version, queries, startedAt: new Date().toISOString(), shots: [], errors: [], warnings: [], cleanup: {}, buildFiles: [] };
let browser, server;
try {
  const build = captureBuildInvocation(process.platform, process.env.ComSpec);
  execFileSync(build.file, build.args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
  report.buildExitCode = 0;
  assert.deepEqual(source(), before, 'Build changed source');
  async function inventory(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) await inventory(path); else if (entry.isFile()) report.buildFiles.push({ file: relative(root, path).replaceAll('\\', '/'), sha256: hash(await readFile(path)) }); } }
  await inventory(join(root, 'web-dist'));
  server = await preview({ configFile: false, root, build: { outDir: 'web-dist' }, preview: { host: '127.0.0.1', port: 0, open: false } });
  const addr = server.httpServer.address(); assert.ok(addr && typeof addr !== 'string');
  const base = `http://127.0.0.1:${addr.port}/`;
  report.launch = { headless: true, chromiumSandbox: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--use-angle=swiftshader'], ...(process.env.FPS_CAPTURE_CHROMIUM ? { executablePath: process.env.FPS_CAPTURE_CHROMIUM } : { channel: 'chromium' }) };
  browser = await chromium.launch(report.launch); report.chromiumVersion = browser.version();
  browser.on('disconnected', () => { report.cleanup.browserDisconnected = true; });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  for (const shot of QUALITY_SHOTS) {
    let previousVariant;
    for (const variant of ['default', 'materials']) {
      let first;
      for (let repeat = 1; repeat <= 2; repeat++) {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') report.warnings.push(m.text()); });
        const url = new URL(qualityPairQuery(shot, variant, queries[variant]), base).href;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__shot?.ready || window.__shot?.error, null, { timeout: 120000 });
        const meta = await page.evaluate(() => window.__shot);
        validateQualityShot(meta, shot, variant);
        await page.locator('#boot').waitFor({ state: 'hidden' });
        await page.waitForTimeout(150);
        assert.deepEqual(await page.evaluate(() => window.__shot), meta, 'Frozen shot changed with wall time');
        const bytes = Buffer.from(meta.pngDataUrl.split(',')[1], 'base64'), png = PNG.sync.read(bytes);
        assert.equal(png.width, 1280); assert.equal(png.height, 720);
        const comparable = comparableQualityShot(meta), rgbaSha256 = hash(png.data);
        const file = `${shot}-${variant}-${repeat}`;
        const { pngDataUrl, ...metadata } = meta;
        await writeFile(join(output, `${file}.png`), bytes, { flag: 'wx' });
        await writeFile(join(output, `${file}.json`), JSON.stringify({ ...metadata, url, source: before, rgbaSha256, pngSha256: hash(bytes) }, null, 2), { flag: 'wx' });
        report.shots.push({ file, url, rgbaSha256, pngSha256: hash(bytes) });
        assert.deepEqual(errors, [], 'Page errors');
        if (first) assert.deepEqual({ comparable, rgbaSha256 }, first, 'Repeated capture differs');
        else first = { comparable, rgbaSha256 };
        if (previousVariant) assert.deepEqual(comparable, previousVariant, 'Paired simulation/camera/renderer differs');
        await page.close();
      }
      previousVariant = first.comparable;
    }
  }
  await context.close(); report.passed = true;
} catch (error) { report.errors.push(String(error.stack ?? error)); report.buildExitCode ??= typeof error.status === 'number' ? error.status : null; process.exitCode = 1; }
finally {
  if (browser) try { await browser.close(); assert.equal(browser.isConnected(), false); report.cleanup.browserDisconnected = true; } catch (e) { report.errors.push(`browser cleanup: ${e}`); report.passed = false; process.exitCode = 1; }
  if (server) try { server.httpServer.closeAllConnections(); await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve())); report.cleanup.previewPortClosed = !server.httpServer.listening; } catch (e) { report.errors.push(`preview cleanup: ${e}`); report.passed = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  report.exitCode = process.exitCode ?? 0;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report));
}
