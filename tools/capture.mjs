#!/usr/bin/env node
// Run with: node --import tsx tools/capture.mjs [options]
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { PNG } from 'pngjs';
import { CAMERAS, CAPTURE_SIZE } from '../src/capture/cameras.ts';
import { parseCaptureConfig } from '../src/capture/config.ts';
import { createCaptureRun, captureBuildInvocation } from './capture-support.ts';

const { values } = parseArgs({ options: {
  base: { type: 'string' }, out: { type: 'string', default: 'outputs/capture' },
  shot: { type: 'string', default: 'all' }, seed: { type: 'string', default: '1' },
  t: { type: 'string', default: '10' }, input: { type: 'string', default: 'idle' },
  frames: { type: 'string', default: '1' }, repeat: { type: 'string', default: '2' },
  software: { type: 'boolean', default: false }, headed: { type: 'boolean', default: false },
  'require-gpu': { type: 'boolean', default: false }, 'check-live': { type: 'boolean', default: false },
} });
const names = values.shot === 'all' ? Object.keys(CAMERAS) : [values.shot];
const repeat = Number(values.repeat);
assert.ok(Number.isInteger(repeat) && repeat >= 1 && repeat <= 5, '--repeat must be 1–5');
assert.ok(!(values.software && values['require-gpu']), '--software and --require-gpu are contradictory');
for (const shot of names) parseCaptureConfig(new URLSearchParams({ shot, seed: values.seed, t: values.t, input: values.input, frames: values.frames }).toString());
const outputRoot = resolve(values.out);
const root = fileURLToPath(new URL('..', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { passed: false, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  shots: [], errors: [], warnings: [], checks: [], qualityAcceptance: 'not-performed; this is capture infrastructure, not a lighting/material quality approval' };
const output = await createCaptureRun(outputRoot, report.sourceCommit, values.input);
report.runId = basename(output);
report.outputDirectory = output;
report.parameters = { input: values.input, shots: names, seed: values.seed, t: values.t, frames: values.frames, repeat };
let browser, server;
try {
  let base = values.base;
  if (!base) {
    // Bind the tested artifact to this checkout rather than a stale web-dist.
    const build = captureBuildInvocation(process.platform, process.env.ComSpec);
    execFileSync(build.file, build.args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    report.sourceBinding = 'local build produced in this capture invocation';
    server = await preview({ configFile: false, root, build: { outDir: 'web-dist' }, preview: { host: '127.0.0.1', port: 0, open: false } });
    const address = server.httpServer.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}/`;
  }
  if (values.base) report.sourceBinding = 'unverified external base; local sourceCommit does not attest served content';
  const allowedOrigin = new URL(base).origin;
  const args = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(values.software ? ['--use-angle=swiftshader'] : [])];
  const launch = { headless: !values.headed, chromiumSandbox: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args,
    ...(process.env.FPS_CAPTURE_CHROMIUM ? { executablePath: process.env.FPS_CAPTURE_CHROMIUM } : { channel: 'chromium' }) };
  report.launch = launch; report.launchEvidence = 'Requested options; retain DEBUG=pw:browser log to verify actual argv. Sandbox remains enabled.';
  browser = await chromium.launch(launch); report.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: CAPTURE_SIZE, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  await context.route('**/*', route => new URL(route.request().url()).origin === allowedOrigin ? route.continue() : route.abort('blockedbyclient'));
  for (const shot of names) {
    const baseline = [];
    for (let run = 1; run <= repeat; run++) {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
      page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
      const url = new URL(base); for (const [key, value] of Object.entries({ shot, seed: values.seed, t: values.t, input: values.input, frames: values.frames })) url.searchParams.set(key, value);
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__shot?.ready || window.__shot?.error, null, { timeout: 120_000 });
      assert.equal(await page.evaluate(() => window.__shot.error), undefined);
      await page.locator('#boot').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => typeof window.fpsClient), 'undefined', 'Capture must not construct the live player client');
      for (let frame = 0; frame < Number(values.frames); frame++) {
        const meta = await page.evaluate(() => window.__shot);
        assert.equal(meta.ready, true); assert.equal(meta.frame, frame); assert.equal(meta.backend, 'three-webgl2');
        assert.deepEqual(meta.viewport, { ...CAPTURE_SIZE, pixelRatio: 1, bufferWidth: CAPTURE_SIZE.width, bufferHeight: CAPTURE_SIZE.height });
        if (values['require-gpu']) { assert.equal(meta.rendererClass, 'gpu', `Hardware renderer required; raw renderer: ${meta.renderer}`); assert.equal(meta.unmasked, true); }
        if (frame === 0) {
          // Verify wall-time waiting does not tick the sim, feedback or camera.
          await page.waitForTimeout(150); assert.deepEqual(await page.evaluate(() => window.__shot), meta);
        }
        const png = await page.screenshot(), pixels = PNG.sync.read(png);
        const colors = new Set(); for (let i = 0; i < pixels.data.length; i += 16) colors.add(`${pixels.data[i] >> 3},${pixels.data[i + 1] >> 3},${pixels.data[i + 2] >> 3}`);
        assert.ok(colors.size > 32, 'Capture must contain a rendered scene, not a blank/loading frame');
        const rawHash = hash(Buffer.from(meta.renderer)).slice(0, 10);
        const rendererSlug = meta.renderer.replace(/[^a-z0-9]+/gi, '-').slice(0, 64).replace(/-$/, '') || 'unreported';
        const directory = `${shot}-${meta.rendererClass}-${rendererSlug}-${rawHash}-seed${meta.seed}-tick${meta.virtualTick - frame}-r${run}`;
        await mkdir(join(output, directory), { recursive: true });
        const file = join(directory, `${String(frame).padStart(5, '0')}.png`);
        await writeFile(join(output, file), png, { flag: 'wx' });
        const entry = { file, run, runId: report.runId, sourceCommit: report.sourceCommit, sourceDirty: report.sourceDirty, rgbaSha256: hash(pixels.data), pngSha256: hash(png), ...meta };
        await writeFile(join(output, directory, `${String(frame).padStart(5, '0')}.json`), JSON.stringify(entry, null, 2) + '\n', { flag: 'wx' });
        report.shots.push(entry);
        const comparable = { hash: entry.rgbaSha256, stateHash: meta.stateHash, camera: meta.camera, renderer: meta.renderer, t: meta.t };
        if (run === 1) baseline.push(comparable); else assert.deepEqual(comparable, baseline[frame], `${shot} frame ${frame} must repeat pixel-identically on the same renderer`);
        const advanced = await page.evaluate(frame => window.__shotNext(frame), frame);
        assert.equal(advanced, frame < Number(values.frames) - 1);
      }
      assert.deepEqual(errors, []); await page.close();
    }
    report.checks.push(`${shot}: ${repeat} runs × ${values.frames} frames; exact RGBA/state/camera repeat comparison`);
  }
  if (values['check-live']) {
    const page = await context.newPage(), url = new URL(base); url.search = '';
    await page.goto(url.href); await page.waitForFunction(() => window.fpsClient?.state().ready);
    assert.equal(await page.evaluate(() => typeof window.__shot), 'undefined'); assert.equal(await page.evaluate(() => typeof window.__shotNext), 'undefined');
    assert.equal(await page.evaluate(() => window.fpsClient.snapshot().tick), 0);
    await page.locator('#audio').uncheck(); await page.locator('#start').click();
    await page.waitForFunction(() => window.fpsClient.state().running && window.fpsClient.snapshot().tick > 2);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.fpsClient.state().running);
    report.checks.push('Normal route: no capture globals, start advances live game, Esc pauses'); await page.close();
  }
  await context.close(); report.passed = true;
} catch (error) { report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await browser?.close();
  if (server) { server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve)); }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}
