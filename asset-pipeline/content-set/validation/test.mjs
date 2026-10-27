import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EXPECTED_PIECES } from './validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SET = resolve(here, '..');
const DIST = resolve(SET, 'dist');
const cli = fileURLToPath(new URL('./validate.mjs', import.meta.url));

function run(args = []) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return { status: result.status, report: JSON.parse(result.stdout) };
}

test('all four committed GLBs pass glTF 2.0 with zero errors and warnings', () => {
  const { status, report } = run();
  assert.equal(status, 0);
  assert.equal(report.exit, 0);
  assert.equal(report.validator, '2.0.0-dev.3.10');
  assert.equal(report.results.length, EXPECTED_PIECES);
  for (const result of report.results) {
    assert.equal(result.issues.numErrors, 0, result.id);
    assert.equal(result.issues.numWarnings, 0, result.id);
    assert.equal(result.issues.truncated, false, result.id);
    assert.equal(result.externalRequests, 0, result.id);
    assert.ok(result.bytes > 0, result.id);
    assert.match(result.sha256, /^[0-9a-f]{64}$/, result.id);
  }
});

test('truncated GLB fails through the real CLI instead of passing on a parse attempt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'content-set-gltf-negative-'));
  try {
    const files = ['fp-arms-rx24.glb', 'enemy-relay-guard.glb', 'passage-cover.glb', 'hit-feedback.glb'];
    for (const file of files) await copyFile(join(DIST, file), join(dir, file));
    // Original 12-byte GLB header: declares a JSON chunk that is absent.
    await writeFile(join(dir, 'fp-arms-rx24.glb'), Buffer.from('676c54460200000020000000', 'hex'));
    const { status, report } = run(['--dist-dir', dir]);
    assert.equal(status, 1);
    assert.equal(report.exit, 1);
    assert.equal(report.results.length, EXPECTED_PIECES);
    assert.ok(report.results[0].issues.numErrors > 0);
    assert.ok(report.results[0].issues.messages.some((message) => message.code === 'GLB_LENGTH_MISMATCH'));
    for (const result of report.results.slice(1)) assert.equal(result.issues.numErrors, 0, result.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('missing dist directory rejects every expected piece', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'content-set-gltf-missing-'));
  try {
    const { status, report } = run(['--dist-dir', dir]);
    assert.equal(status, 1);
    assert.equal(report.exit, 1);
    assert.deepEqual(report.results.map((result) => result.failure), Array(EXPECTED_PIECES).fill('ENOENT'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
