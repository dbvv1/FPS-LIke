import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkRifleMovement, summarizeTrajectory } from '../tools/check-kaykit-rifle-movement.js';

test('fixed movement checker rejects absent directory, missing files and wrong hash without skipping', async () => {
  await assert.rejects(checkRifleMovement(''), /sample directory required/);
  const directory = await mkdtemp(path.join(tmpdir(), 'kaykit-run-invalid-'));
  try {
    await assert.rejects(checkRifleMovement(directory), /ENOENT/);
    await writeFile(path.join(directory, 'Knight.glb'), 'not the fixed GLB');
    await assert.rejects(checkRifleMovement(directory), /Knight fixed source SHA256/);
  } finally { await rm(directory, { recursive: true }); }
});
test('fixed movement CLI without input exits 2 and prints no success report', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'tools/check-kaykit-rifle-movement.ts'], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.match(result.stderr, /Usage:/); assert.equal(result.stdout, '');
});


test('landmark calibration preserves signed velocity and does not label a sweep as stride', () => {
  const result = summarizeTrajectory([{ time: 0, y: .1, z: .4 }, { time: .2, y: .2, z: -.2 }, { time: .5, y: .3, z: .4 }]);
  assert.equal(result.durationSeconds, .5);
  assert.ok(Math.abs(result.sourceZSweepMeters - .6) < 1e-12);
  assert.ok(Math.abs(result.sourceZVelocityMetersPerSecond.min + 3) < 1e-12);
  assert.ok(Math.abs(result.sourceZVelocityMetersPerSecond.max - 2) < 1e-12);
  assert.deepEqual(result.heightMeters, { min: .1, max: .3 });
});
test('landmark calibration rejects missing, nonfinite, duplicate and reversed samples', () => {
  assert.throws(() => summarizeTrajectory([]), /two trajectory/);
  for (const time of [0, -1, NaN]) assert.throws(() => summarizeTrajectory([{ time: 0, y: 0, z: 0 }, { time, y: 0, z: 0 }]));
  assert.throws(() => summarizeTrajectory([{ time: 0, y: 0, z: 0 }, { time: 1, y: Infinity, z: 0 }]), /finite trajectory/);
});
