import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { diagnose, samplePose, uniqueClip, uniqueNode, verifiedDocument } from '../tools/check-kaykit-contact.js';

test('fixed contact input fails on missing directory, missing file and hash mismatch', async () => {
  await assert.rejects(diagnose(''), /directory required/);
  await assert.rejects(diagnose('missing-contact-fixture-directory'), /ENOENT/);
  assert.throws(() => verifiedDocument(Buffer.from('not glb'), 'bad'), /SHA256/);
});
test('missing and ambiguous bindings and clips never produce empty successful samples', () => {
  const scene = new THREE.Group();
  assert.throws(() => uniqueNode(scene, 'hand.l'), /unique node/);
  const normalized=new THREE.Bone(); normalized.name='handl'; normalized.userData.name='hand.l';
  scene.add(normalized); assert.equal(uniqueNode(scene, 'hand.l'),normalized); scene.remove(normalized);
  for (let i=0;i<2;i++) { const n=new THREE.Bone(); n.name='hand.l'; scene.add(n); }
  assert.throws(() => uniqueNode(scene, 'hand.l'), /unique node/);
  assert.throws(() => uniqueClip([], 'aim'), /unique clip/);
  assert.throws(() => uniqueClip([new THREE.AnimationClip('aim', 0, [])], 'aim'), /positive/);
});
test('pose sampler includes complete ancestors and deterministic clip endpoint', () => {
  const parent = new THREE.Group(); parent.position.set(10, 2, -5);
  const scene = new THREE.Group(); parent.add(scene);
  for (const name of ['hand.l','hand.r','handslot.l','handslot.r']) { const n=new THREE.Bone(); n.name=name; scene.add(n); }
  const clip = new THREE.AnimationClip('aim', 1, [new THREE.VectorKeyframeTrack('hand.l.position',[0,1],[1,0,0,3,0,0])]);
  assert.deepEqual(samplePose(scene, [clip], 'aim', .5).points['hand.l']!.worldPosition, [12,2,-5]);
  assert.deepEqual(samplePose(scene, [clip], 'aim', 1).points['hand.l']!.worldPosition, [13,2,-5]);
  assert.deepEqual(samplePose(scene, [clip], 'aim', .5).points['hand.l']!.worldPosition, [12,2,-5]);
  assert.throws(() => samplePose(scene, [clip], 'aim', -1), /phase/);
});
