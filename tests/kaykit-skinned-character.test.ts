import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KAYKIT_ACTIONS, KayKitSkinnedCharacter, KayKitCharacterSlot, remapKayKitParent } from '../src/render/kaykit-skinned-character.js';

test('unused skinned slot does not load or change the rigid fallback', () => {
  const slot = new KayKitCharacterSlot();
  assert.equal(slot.status, 'off'); assert.equal(slot.character, null);
  slot.dispose(); slot.dispose(); assert.equal(slot.status, 'disposed');
});
test('missing, failed and invalid sources keep the slot in fallback', async () => {
  for (const loader of [async () => null, async () => { throw new Error('HTTP 404'); },
    async () => ({ character: new THREE.Group(), motion: new THREE.Group(), animations: [] })]) {
    const slot = new KayKitCharacterSlot(); await slot.load(loader);
    assert.equal(slot.status, 'fallback'); assert.equal(slot.character, null); assert.ok(slot.error);
    slot.dispose(); assert.equal(slot.status, 'disposed');
  }
});
test('dispose cancels pending load; late success/failure cannot resurrect a slot', async () => {
  for (const fail of [false, true]) {
    const slot = new KayKitCharacterSlot();
    let release!: () => void;
    const pending = slot.load(async signal => {
      await new Promise<void>(resolve => { release = resolve; });
      assert.equal(signal.aborted, true);
      if (fail) throw new Error('late failure');
      return { character: new THREE.Group(), motion: new THREE.Group(), animations: [] };
    });
    assert.equal(slot.status, 'loading'); slot.dispose(); release(); await pending;
    assert.equal(slot.status, 'disposed'); assert.equal(slot.character, null); assert.equal(slot.error, null);
    await slot.load(async () => { assert.fail('Disposed slot must not load'); });
  }
});
test('parent adapter rejects missing hierarchy rather than silently dropping tracks', () => {
  assert.throws(() => remapKayKitParent(new THREE.Group(), new THREE.Group(), new THREE.AnimationClip()), /Unique node/);
});

// Small real skinned fixture: one bone moves all vertices across the frustum.
function movingSkinSources() {
  const character = new THREE.Group(), motion = new THREE.Group();
  for (const [scene, rigName] of [[character, 'Rig'], [motion, 'Rig_Medium']] as const) {
    const rig = new THREE.Group(); rig.name = rigName; scene.add(rig);
    const bone = new THREE.Bone(); bone.name = 'root'; rig.add(bone);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .2, 0, 0, 0, .2, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); character.add(skin);
  character.updateMatrixWorld(true); skin.bind(new THREE.Skeleton([character.getObjectByName('root') as THREE.Bone]));
  const tracks: THREE.KeyframeTrack[] = [];
  for (const name of ['Rig_Medium', 'root']) {
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, [0, 1], name === 'root' ? [0, 0, 0, 10, 0, 0] : [0, 0, 0, 0, 0, 0]));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]));
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, [0, 1], [1, 1, 1, 1, 1, 1]));
  }
  return { character, motion, animations: Object.values(KAYKIT_ACTIONS).map(name => new THREE.AnimationClip(name, 1, tracks.map(t => t.clone()))) };
}
function skinsOf(root: THREE.Object3D) {
  const skins: THREE.SkinnedMesh[] = []; root.traverse(n => { if (n instanceof THREE.SkinnedMesh) skins.push(n); }); return skins;
}
test('animated bounds follow current pose, replay and stop without changing shared geometry or sibling', () => {
  const sources = movingSkinSources(), actor = new KayKitSkinnedCharacter(sources), sibling = new KayKitSkinnedCharacter(sources);
  const skin = skinsOf(actor.scene)[0]!, siblingSkin = skinsOf(sibling.scene)[0]!, original = skinsOf(sources.character)[0]!;
  assert.ok(skin.boundingBox); assert.ok(skin.boundingSphere);
  const restBox = skin.boundingBox.clone(), restSphere = skin.boundingSphere.clone();
  actor.play('reload-one-hand'); actor.update(1);
  assert.ok(skin.boundingBox.min.x > 9.99);
  assert.ok(skin.boundingSphere.center.x > 9.99);
  assert.deepEqual(siblingSkin.boundingBox, restBox); assert.deepEqual(siblingSkin.boundingSphere, restSphere);
  assert.equal(original.boundingBox, null); assert.equal(original.boundingSphere, null);
  assert.equal(skin.geometry.boundingBox, null); assert.equal(skin.geometry.boundingSphere, null);
  actor.play('reload-two-hand'); assert.deepEqual(skin.boundingBox, restBox);
  actor.update(.5); assert.ok(skin.boundingBox.min.x > 4.99);
  actor.stop(); assert.deepEqual(skin.boundingBox, restBox); assert.deepEqual(skin.boundingSphere, restSphere);
  actor.dispose(); const final = skin.boundingBox.clone(); actor.update(1); assert.deepEqual(skin.boundingBox, final); sibling.dispose();
});
test('CPU frustum uses updated skin sphere after offscreen pose and actor parent movement', () => {
  const actor = new KayKitSkinnedCharacter(movingSkinSources()), skin = skinsOf(actor.scene)[0]!;
  const parent = new THREE.Group(); parent.add(actor.scene);
  const camera = new THREE.OrthographicCamera(8, 12, 2, -2, .1, 20); camera.position.z = 5; camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(skin), false);
  actor.play('reload-one-hand'); actor.update(1); assert.equal(frustum.intersectsObject(skin), true);
  parent.position.x = -10; actor.update(0); assert.equal(frustum.intersectsObject(skin), false);
  parent.position.x = 0; actor.update(0); assert.equal(frustum.intersectsObject(skin), true);
  actor.stop(); assert.equal(frustum.intersectsObject(skin), false); actor.dispose();
});
