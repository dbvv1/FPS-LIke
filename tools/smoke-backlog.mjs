// One serial headless gate over the exact production build. Never launches a visible window.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD'), sourceTree = git('rev-parse', 'HEAD^{tree}');
assert.equal(git('status', '--porcelain'), '', 'Commit all intended source changes before smoke');
const base = resolve(root, 'outputs/backlog-smoke'); mkdirSync(base, { recursive: true });
const output = mkdtempSync(join(base, sourceCommit.slice(0, 12) + '-'));
const manifest = { passed: false, sourceCommit, sourceTree, build: [], runs: [], output, qualityAcceptance: 'not-performed' };
try {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'];
  const build = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  writeFileSync(join(output, 'build.log'), (build.stdout ?? '') + (build.stderr ?? ''));
  assert.equal(build.status, 0, 'production build');
  function walk(dir) { for (const name of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, name.name); if (name.isDirectory()) walk(p); else manifest.build.push({ path: relative(root, p).split('\\').join('/'), sha256: createHash('sha256').update(readFileSync(p)).digest('hex') }); } }
  walk(join(root, 'web-dist'));
  for (const [label, query] of [['default', ''], ['characters', '?contentSet=characters-v1'], ['movement', '?gameplay=movement-v2'], ['combined', '?gameplay=movement-v2&contentSet=characters-v1']]) {
    const dir = join(output, label); mkdirSync(dir);
    const result = spawnSync(process.execPath, ['tools/smoke.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, DEBUG: 'pw:browser', FPS_SMOKE_QUERY: query, FPS_SMOKE_OUTPUT: dir } });
    writeFileSync(join(dir, 'browser.log'), (result.stdout ?? '') + (result.stderr ?? ''));
    manifest.runs.push({ label, query, status: result.status, signal: result.signal, report: `${label}/report.json` });
    assert.equal(result.status, 0, `${label} smoke`);
    assert.equal(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).passed, true);
  }
  const captureArgs = ['--import', 'tsx', 'tools/capture.mjs', '--shot', 'gameplay', '--t', '1', '--frames', '2', '--repeat', '2', '--out', join(output, 'capture'), ...(process.env.FPS_SMOKE_RENDERER === 'native' ? [] : ['--software'])];
  const capture = spawnSync(process.execPath, captureArgs, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, DEBUG: 'pw:browser', ...(process.env.FPS_SMOKE_CHROMIUM ? { FPS_CAPTURE_CHROMIUM: process.env.FPS_SMOKE_CHROMIUM } : {}) } });
  writeFileSync(join(output, 'capture-browser.log'), (capture.stdout ?? '') + (capture.stderr ?? ''));
  manifest.runs.push({ label: 'capture', status: capture.status, signal: capture.signal, report: 'capture/*/report.json' });
  assert.equal(capture.status, 0, 'capture smoke');
  assert.equal(git('rev-parse', 'HEAD'), sourceCommit, 'source commit must remain fixed');
  assert.equal(git('status', '--porcelain'), '', 'source tree must remain clean');
  for (const file of manifest.build) assert.equal(createHash('sha256').update(readFileSync(resolve(root, file.path))).digest('hex'), file.sha256, `build changed after capture: ${file.path}`);
  manifest.passed = true;
} catch (error) { manifest.failure = String(error.stack ?? error); process.exitCode = 1; }
finally { writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); console.log(JSON.stringify(manifest, null, 2)); }
