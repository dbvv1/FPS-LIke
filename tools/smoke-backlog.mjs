// One serial headless gate over the exact production build. Never launches a visible window.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { OFFLINE_QUERY, FULL_MATERIALS_QUERY, browserExitReceipt } from './smoke-offline-support.mjs';
const artStandards = process.argv.slice(2).includes('--art-standards');
const fullMaterials = process.argv.slice(2).includes('--full-materials');
const offline = fullMaterials || artStandards || process.argv.slice(2).includes('--offline-training');
assert.ok(process.argv.slice(2).every(arg => arg === '--offline-training' || arg === '--art-standards' || arg === '--full-materials'), 'Unknown smoke option');
assert.ok(!(fullMaterials && artStandards), 'Choose either full-materials or art-standards comparison');
const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD'), sourceTree = git('rev-parse', 'HEAD^{tree}');
assert.equal(git('status', '--porcelain'), '', 'Commit all intended source changes before smoke');
const base = resolve(root, artStandards ? 'outputs/art-standards-smoke' : offline ? 'outputs/offline-training-smoke' : 'outputs/backlog-smoke'); mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, sourceCommit.slice(0, 12) + '-'));
const manifest = { passed: false, sourceCommit, sourceTree, build: [], runs: [], output, qualityAcceptance: 'not-performed', scope: offline ? 'six natural rounds, halftime, final restart and frame intervals; no visual quality acceptance' : 'v13-backlog' };
try {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'];
  const build = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  writeFileSync(join(output, 'build.log'), (build.stdout ?? '') + (build.stderr ?? ''));
  assert.equal(build.status, 0, 'production build');
  function walk(dir) { for (const name of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, name.name); if (name.isDirectory()) walk(p); else manifest.build.push({ path: relative(root, p).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(p)).digest('hex') }); } }
  walk(join(root, 'web-dist'));
  for (const [label, query] of (fullMaterials ? [['current-default', ''], ['full-materials', FULL_MATERIALS_QUERY]] : artStandards ? [['offline-base', OFFLINE_QUERY], ['art-standards', OFFLINE_QUERY + '&art=standards-v1']] : offline ? [['offline-training', OFFLINE_QUERY]] : [['default', ''], ['characters', '?contentSet=characters-v1'], ['movement', '?gameplay=movement-v2'], ['combined', '?gameplay=movement-v2&contentSet=characters-v1']])) {
    const dir = join(output, label); mkdirSync(dir);
    const result = spawnSync(process.execPath, ['tools/smoke.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, DEBUG: 'pw:browser', FPS_SMOKE_QUERY: query, FPS_SMOKE_OUTPUT: dir, FPS_ART_COMPARE: artStandards ? '1' : '0' } });
    writeFileSync(join(dir, 'browser.log'), (result.stdout ?? '') + (result.stderr ?? ''));
    manifest.runs.push({ label, query, status: result.status, signal: result.signal, report: `${label}/report.json` });
    assert.equal(result.status, 0, `${label} smoke`);
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    assert.equal(report.passed, true);
    if (offline) {
      manifest.runs.at(-1).browserExit = browserExitReceipt((result.stdout ?? '') + (result.stderr ?? ''));
      assert.equal(report.cleanup.browserDisconnected, true);
      assert.equal(report.cleanup.previewPortClosed, true);
      manifest.runs.at(-1).rendererClass = report.rendererClass;
      manifest.runs.at(-1).coverage = report.offlineCoverage;
      assert.equal(report.offlineCoverage.fullMatchPlaythrough, true);
      assert.equal(report.frameTiming.rounds.length, 6);
      assert.ok(report.frameTiming.rounds.every(round => round.count > 0));
      manifest.runs.at(-1).frameTiming = report.frameTiming;
    }
  }
  if (fullMaterials) {
    const before = JSON.parse(readFileSync(join(output, 'current-default/report.json'), 'utf8'));
    const after = JSON.parse(readFileSync(join(output, 'full-materials/report.json'), 'utf8'));
    assert.deepEqual(before.webgl, after.webgl, 'full-match comparison requires the same renderer');
    manifest.frameComparison = { metric: before.frameTiming.metric,
      before: before.frameTiming.active, after: after.frameTiming.active,
      meanRatio: after.frameTiming.active.meanMs / before.frameTiming.active.meanMs,
      p95Ratio: after.frameTiming.active.p95Ms / before.frameTiming.active.p95Ms,
      interpretation: 'natural UI matches, not identical input replays; inspect raw samples and round durations before judging regression' };
  }
  if (artStandards) {
    const before = JSON.parse(readFileSync(join(output, 'offline-base/report.json'), 'utf8'));
    const after = JSON.parse(readFileSync(join(output, 'art-standards/report.json'), 'utf8'));
    assert.equal(before.artComparison.stateSha256, after.artComparison.stateSha256, 'before/after must share state and camera');
    assert.deepEqual(before.webgl, after.webgl, 'before/after renderer identity');
    manifest.artComparison = { shot: before.artComparison.shot, stateSha256: before.artComparison.stateSha256,
      rendererClass: after.rendererClass, scope: 'initial-deployment-only; not visual acceptance' };
  }
  if (!offline) {
    const captureArgs = ['--import', 'tsx', 'tools/capture.mjs', '--shot', 'gameplay', '--t', '1', '--frames', '2', '--repeat', '2', '--out', join(output, 'capture'), ...(process.env.FPS_SMOKE_RENDERER === 'native' ? [] : ['--software'])];
    const capture = spawnSync(process.execPath, captureArgs, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, DEBUG: 'pw:browser', ...(process.env.FPS_SMOKE_CHROMIUM ? { FPS_CAPTURE_CHROMIUM: process.env.FPS_SMOKE_CHROMIUM } : {}) } });
    writeFileSync(join(output, 'capture-browser.log'), (capture.stdout ?? '') + (capture.stderr ?? ''));
    manifest.runs.push({ label: 'capture', status: capture.status, signal: capture.signal, report: 'capture/*/report.json' });
    assert.equal(capture.status, 0, 'capture smoke');
  }
  assert.equal(git('rev-parse', 'HEAD'), sourceCommit, 'source commit must remain fixed');
  assert.equal(git('status', '--porcelain'), '', 'source tree must remain clean');
  for (const file of manifest.build) assert.equal(createHash('sha256').update(readFileSync(resolve(root, file.path))).digest('hex'), file.sha256, `build changed after capture: ${file.path}`);
  manifest.passed = true;
} catch (error) { manifest.failure = String(error.stack ?? error); process.exitCode = 1; }
finally { writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); console.log(JSON.stringify(manifest, null, 2)); }
