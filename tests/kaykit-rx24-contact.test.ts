import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { locateGloveSurface, sampleGloveSurface, rigidPairResidual } from '../asset-pipeline/kaykit-rx24/knight-contact.js';
function fixture() {
  const root = new THREE.Group(), hand = new THREE.Bone(), other = new THREE.Bone(), slot = new THREE.Bone();
  hand.name = 'hand'; other.name = 'wrist'; slot.name = 'slot'; slot.position.set(.25, .25, .2);
  root.add(hand, other); hand.add(slot);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([.75, .25, 0, 0, .75, .25, 0, 0, .75, .25, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = 'glove'; root.add(mesh);
  root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([hand, other]));
  return { root, hand, other, slot, mesh };
}
const anchor = (root: THREE.Object3D) => locateGloveSurface(root, 'glove', 'hand', 'slot');
function close(actual: readonly number[], expected: readonly number[]) { assert.ok(actual.every((v, i) => Math.abs(v - expected[i]!) < 1e-7), `${actual} != ${expected}`); }
test('nearest triangle yields barycentric surface, not the slot or bone origin', () => {
  const { root } = fixture(), found = anchor(root), value = sampleGloveSurface(root, found);
  assert.deepEqual(found.vertices, [0, 1, 2]); close(found.barycentric, [.5, .25, .25]);
  close(value.point.toArray(), [.25, .25, 0]); close(value.normal.toArray(), [0, 0, 1]);
  assert.equal(value.point.distanceTo(value.slot), .2);
  assert.deepEqual(anchor(root), found);
});
test('surface follows actual mixed skin weights instead of a frozen hand offset', () => {
  const { root, other } = fixture(), found = anchor(root);
  other.position.z = 2;
  close(sampleGloveSurface(root, found).point.toArray(), [.25, .25, .5]);
  close(sampleGloveSurface(root, found).normal.toArray(), [0, 0, 1]);
  root.position.set(10, 2, -3); root.rotation.y = Math.PI / 2;
  close(sampleGloveSurface(root, found).point.toArray(), [10.5, 2.25, -3.25]);
});
test('missing, duplicate, non-skinned and incorrect hand hierarchy are rejected', () => {
  const { root, hand, slot } = fixture();
  assert.throws(() => locateGloveSurface(root, 'missing', 'hand', 'slot'), /Unique/);
  assert.throws(() => locateGloveSurface(root, 'slot', 'hand', 'slot'), /Skinned/);
  const duplicate = new THREE.Bone(); duplicate.name = 'hand'; root.add(duplicate);
  assert.throws(() => anchor(root), /Unique/); root.remove(duplicate);
  hand.remove(slot); root.add(slot); assert.throws(() => anchor(root), /hierarchy/);
});
test('ambiguous sleeve-only or degenerate surfaces cannot silently succeed', () => {
  const first = fixture(); first.mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([.5, .5, 0, 0, .5, .5, 0, 0, .5, .5, 0, 0], 4));
  assert.throws(() => anchor(first.root), /No majority/);
  const second = fixture(); second.mesh.geometry.setIndex([0, 0, 0]);
  assert.throws(() => anchor(second.root), /Degenerate/);
});
test('changed topology, extrapolated weights and nonfinite vertices are rejected', () => {
  const { root, mesh } = fixture(), found = anchor(root);
  assert.throws(() => sampleGloveSurface(root, { ...found, barycentric: [-.1, .5, .6] }), /barycentric/);
  assert.throws(() => sampleGloveSurface(root, { ...found, barycentric: [.4, .4, .4] }), /barycentric/);
  assert.throws(() => sampleGloveSurface(root, { ...found, vertices: [1, 0, 2] }), /topology/);
  assert.throws(() => sampleGloveSurface(root, { ...found, triangle: NaN }), /topology/);
  mesh.geometry.getAttribute('position').setX(0, NaN);
  assert.throws(() => sampleGloveSurface(root, found), /Nonfinite/);
});
test('distance invariant states rigid-fit residual without inventing a contact tolerance', () => {
  assert.deepEqual(rigidPairResidual(.6, .3), { separationMismatch: .3, withPrimaryFixedSupportError: .3, bestEqualErrorPerHand: .15 });
  assert.deepEqual(rigidPairResidual(.3, .3), { separationMismatch: 0, withPrimaryFixedSupportError: 0, bestEqualErrorPerHand: 0 });
  for (const value of [0, -1, NaN, Infinity]) assert.throws(() => rigidPairResidual(value, .3), /Positive/);
});
test('CLI rejects missing input, missing files and altered fixed sources without success JSON', () => {
  const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'tools/check-kaykit-rx24-contact.ts', ...args], { encoding: 'utf8' });
  const absent = run([]); assert.equal(absent.status, 2); assert.equal(absent.stdout, '');
  const dir = mkdtempSync(path.join(tmpdir(), 'fps-contact-fixture-'));
  try {
    const missing = run([dir]); assert.notEqual(missing.status, 0); assert.equal(missing.stdout, '');
    writeFileSync(path.join(dir, 'Knight.glb'), 'not-the-fixed-source');
    const altered = run([dir]); assert.notEqual(altered.status, 0); assert.equal(altered.stdout, ''); assert.match(altered.stderr, /fixed hash/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
