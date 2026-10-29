import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lightingEnabled, renderRole } from '../../src/candidates/offline-training-v1/render/lighting-style.js';
import { aoKernel } from '../../src/candidates/offline-training-v1/render/lighting-post.js';
test('lighting remains explicit and rejects ambiguous parameters',()=>{
  for(const query of ['', '?feel=ground-v1','?lighting=unknown','?lighting=courtyard-light-v1&lighting=courtyard-light-v1'])assert.equal(lightingEnabled(query),false);
  assert.equal(lightingEnabled('?feel=ground-v1&lighting=courtyard-light-v1'),true);
});
test('camera weapon descendants and emissive cues bypass world AO',()=>{
  const world=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  const cue=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  assert.equal(renderRole(world),'world');assert.equal(renderRole(cue),'cue');
  const weapon=new THREE.Group();weapon.userData.lightingCue=true;weapon.add(world);assert.equal(renderRole(world),'cue');
  for(const mesh of [world,cue]){mesh.geometry.dispose();mesh.material.dispose();}
});
test('AO sampling is repeatable without consuming simulation randomness',()=>{
  assert.deepEqual(aoKernel(),aoKernel());
  for(const v of aoKernel())assert(v.z>0&&v.length()<=1.000001);
});
