import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkRifleMovement } from '../tools/check-kaykit-rifle-movement.js';

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
