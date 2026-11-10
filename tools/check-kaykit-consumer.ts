// Mandatory external fixture command: absent or altered input is a failure, not a skip.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { KAYKIT_NATIVE_ACTIONS, KAYKIT_ACTIONS, KayKitSkinnedCharacter, KayKitCharacterSlot, remapKayKitParent, type KayKitAction } from '../src/render/kaykit-skinned-character.js';
const sample = process.argv[2];
if (!sample) { console.error('Usage: npm run check:kaykit -- <fixed-sample-directory>'); process.exit(2); }
async function load(name: string, hash: string) {
  const bytes = await readFile(path.join(sample!, `${name}.glb`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `${name} fixed input`);
  return new GLTFLoader().register(() => ({ name: 'cpu-texture-omission', loadTexture: async () => new THREE.Texture() }))
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const target = await load('Knight', '60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168');
const source = await load('Med_CombatRanged', '08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d');
const inputs = { character: target.scene, motion: source.scene, animations: source.animations };
function transforms(root: THREE.Object3D) {
  const result: unknown[] = [];
  root.traverse(node => result.push([node.name, node.position.toArray(), node.quaternion.toArray(), node.scale.toArray(), node.matrix.toArray(), node.matrixWorld.toArray()]));
  return JSON.stringify(result);
}
function meshes(root: THREE.Object3D) { const result: THREE.SkinnedMesh[] = []; root.traverse(n => { if (n instanceof THREE.SkinnedMesh) result.push(n); }); return result; }
const before = [transforms(target.scene), transforms(source.scene), JSON.stringify(source.animations.map(c => THREE.AnimationClip.toJSON(c)))];
const originalMeshes = meshes(target.scene);
function sharedResourceState() {
  return JSON.stringify(originalMeshes.map(mesh => ({ geometry: mesh.geometry.toJSON(),
    box: mesh.geometry.boundingBox, sphere: mesh.geometry.boundingSphere,
    materials: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.toJSON()) })));
}
const originalResources = sharedResourceState();
const originalPalettes = originalMeshes.map(mesh => ({ bones: Array.from(mesh.skeleton.boneMatrices!), inverses: mesh.skeleton.boneInverses.map(m => m.toArray()) }));
// Official SkinnedMesh.copy retains the skeleton. Plain Object3D.clone is unsafe.
assert.equal(meshes(target.scene.clone(true))[0]!.skeleton, originalMeshes[0]!.skeleton);
const a = new KayKitSkinnedCharacter(inputs), b = new KayKitSkinnedCharacter(inputs);
assert.equal(meshes(a.scene).length, 6);
for (const [index, mesh] of meshes(a.scene).entries()) {
  assert.notEqual(mesh.skeleton, originalMeshes[index]!.skeleton);
  assert.notEqual(mesh.skeleton, meshes(b.scene)[index]!.skeleton);
  for (const [boneIndex, bone] of mesh.skeleton.bones.entries()) {
    assert.notEqual(bone, originalMeshes[index]!.skeleton.bones[boneIndex]);
    assert.notEqual(bone, meshes(b.scene)[index]!.skeleton.bones[boneIndex]);
    assert.notEqual(mesh.skeleton.boneInverses[boneIndex], originalMeshes[index]!.skeleton.boneInverses[boneIndex]);
    assert.notEqual(mesh.skeleton.boneInverses[boneIndex], meshes(b.scene)[index]!.skeleton.boneInverses[boneIndex]);
  }
  assert.notEqual(mesh.skeleton.boneMatrices, originalMeshes[index]!.skeleton.boneMatrices);
  assert.notEqual(mesh.skeleton.boneMatrices, meshes(b.scene)[index]!.skeleton.boneMatrices);
  assert.equal(mesh.geometry, originalMeshes[index]!.geometry, 'immutable shared geometry');
}
const restingB = transforms(b.scene), restA = transforms(a.scene);
let boundVerticesChecked = 0;
let samples = 0, verticesChecked = 0, maxMatrixError = 0, maxSkinError = 0;
for (const action of Object.keys(KAYKIT_ACTIONS) as (keyof typeof KAYKIT_ACTIONS)[]) {
  const clip = source.animations.find(c => c.name === KAYKIT_ACTIONS[action])!;
  const reference = clone(source.scene), mixer = new THREE.AnimationMixer(reference);
  const referenceAction = mixer.clipAction(clip.clone()); referenceAction.setLoop(THREE.LoopOnce, 1); referenceAction.clampWhenFinished = true; referenceAction.play();
  a.play(action);
  for (let i = 0; i <= Math.ceil(clip.duration * 60); i++) {
    const t = Math.min(i / 60, clip.duration);
    if (i) a.update(t - Math.min((i - 1) / 60, clip.duration));
    mixer.setTime(t); reference.updateMatrixWorld(true);
    for (const name of new Set(clip.tracks.map(track => THREE.PropertyBinding.parseTrackName(track.name).nodeName))) {
      const actual = a.scene.getObjectByName(name === 'Rig_Medium' ? 'Rig' : name)!;
      const expected = reference.getObjectByName(name)!;
      actual.matrixWorld.elements.forEach((value, index) => { maxMatrixError = Math.max(maxMatrixError, Math.abs(value - expected.matrixWorld.elements[index]!)); });
    }
    // Three CPU skinning against independently weighted source-bone matrices.
    for (const mesh of meshes(a.scene)) {
      mesh.skeleton.update();
      for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
        const point = mesh.getVertexPosition(vertex, new THREE.Vector3());
        assert.ok(mesh.boundingBox!.clone().expandByScalar(1e-8).containsPoint(point));
        assert.ok(point.distanceTo(mesh.boundingSphere!.center) <= mesh.boundingSphere!.radius + 1e-8);
        boundVerticesChecked++;
      }
      const position = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
      for (const vertex of [0, Math.floor(position.count / 2), position.count - 1]) {
        const actual = mesh.applyBoneTransform(vertex, new THREE.Vector3().fromBufferAttribute(position, vertex)).applyMatrix4(mesh.matrixWorld);
        const bind = new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.bindMatrix), expected = new THREE.Vector3();
        for (let component = 0; component < 4; component++) {
          const weight = weights.getComponent(vertex, component); if (!weight) continue;
          const index = indices.getComponent(vertex, component), bone = mesh.skeleton.bones[index]!;
          expected.addScaledVector(bind.clone().applyMatrix4(mesh.skeleton.boneInverses[index]!).applyMatrix4(reference.getObjectByName(bone.name)!.matrixWorld), weight);
        }
        const error = actual.distanceTo(expected); assert.ok(Number.isFinite(error)); maxSkinError = Math.max(maxSkinError, error); verticesChecked++;
      }
    }
    samples++;
  }
  mixer.stopAllAction(); mixer.uncacheRoot(reference);
}
assert.ok(maxSkinError < 1e-6, `CPU skin drift: ${maxSkinError}`);
assert.deepEqual(originalMeshes.map(mesh => ({ bones: Array.from(mesh.skeleton.boneMatrices!), inverses: mesh.skeleton.boneInverses.map(m => m.toArray()) })), originalPalettes);
assert.ok(maxMatrixError < 1e-6, `Parent remap drift: ${maxMatrixError}`);
assert.equal(transforms(b.scene), restingB, 'advancing and switching A does not advance B');
b.play('reload-one-hand'); b.update(.4); const playingB = transforms(b.scene);
a.play('reload-two-hand'); a.update(.2); assert.equal(transforms(b.scene), playingB, 'mixers isolated');
assert.equal(a.play('unknown' as KayKitAction), false); assert.equal(a.currentAction, 'reload-two-hand');
assert.throws(() => a.update(NaN), /delta/); assert.throws(() => a.update(-1), /delta/);
a.stop(); assert.equal(a.currentAction, null);
// stop restores local rest pose; world caches are now intentionally refreshed.
const rest = JSON.parse(restA), stopped = JSON.parse(transforms(a.scene));
assert.deepEqual(stopped.map((n: unknown[]) => n.slice(0, 4)), rest.map((n: unknown[]) => n.slice(0, 4)));
a.play('reload-one-hand'); a.update(.3);
const resources = new Set<THREE.EventDispatcher<any>>();
for (const mesh of originalMeshes) { resources.add(mesh.geometry); for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(mat); }
let borrowedDisposals = 0; for (const resource of resources) resource.addEventListener('dispose', () => borrowedDisposals++);
let paletteDisposals = 0;
for (const mesh of meshes(a.scene)) { mesh.skeleton.computeBoneTexture(); mesh.skeleton.boneTexture!.addEventListener('dispose', () => paletteDisposals++); }
const parent = new THREE.Group(); parent.add(a.scene); a.dispose(); a.dispose();
assert.equal(a.scene.parent, null); assert.equal(a.disposed, true); assert.equal(a.play('reload-one-hand'), false); a.update(.5);
assert.equal(paletteDisposals, 6); assert.equal(borrowedDisposals, 0); assert.equal(transforms(b.scene), playingB);
b.update(.1); assert.notEqual(transforms(b.scene), playingB); b.dispose(); assert.equal(borrowedDisposals, 0);
assert.deepEqual([transforms(target.scene), transforms(source.scene), JSON.stringify(source.animations.map(c => THREE.AnimationClip.toJSON(c)))], before, 'original sources unchanged');
assert.equal(sharedResourceState(), originalResources, 'shared source geometry and materials unchanged');
const clip = source.animations.find(c => c.name === KAYKIT_ACTIONS['reload-one-hand'])!;
const broken = clip.clone(); broken.tracks = broken.tracks.filter(t => t.name !== 'Rig_Medium.quaternion');
assert.throws(() => remapKayKitParent(source.scene, target.scene, broken), /channels/);
const duplicate = new THREE.Bone(); duplicate.name = 'head'; const bad = clone(target.scene); bad.add(duplicate);
assert.throws(() => new KayKitSkinnedCharacter({ ...inputs, character: bad }), /Unique node/);
const fallbackScene = new THREE.Group(), rigidFallback = new THREE.Object3D(); fallbackScene.add(rigidFallback);
const failedSlot = new KayKitCharacterSlot();
await failedSlot.load(async () => ({ ...inputs, animations: [broken] }));
assert.equal(failedSlot.status, 'fallback'); assert.equal(failedSlot.character, null);
assert.equal(rigidFallback.parent, fallbackScene); assert.equal(rigidFallback.visible, true);
failedSlot.dispose(); assert.equal(rigidFallback.parent, fallbackScene);
// Absolute snapshot sampling must match independent elapsed-time evaluation,
// including a finished clip rewound and switching both fixed source clips.
const sampled = new KayKitSkinnedCharacter(inputs), elapsed = new KayKitSkinnedCharacter(inputs);
let absoluteSamples = 0;
for (const action of Object.keys(KAYKIT_ACTIONS) as (keyof typeof KAYKIT_ACTIONS)[]) {
  const duration = source.animations.find(c => c.name === KAYKIT_ACTIONS[action])!.duration;
  for (const phase of [1, 0.25, 0, 0.75, 0.25]) {
    sampled.sample(action, phase);
    elapsed.play(action); elapsed.update(duration * phase);
    const left: THREE.Object3D[] = [], right: THREE.Object3D[] = [];
    sampled.scene.traverse(n => left.push(n)); elapsed.scene.traverse(n => right.push(n));
    for (let i = 0; i < left.length; i++) {
      const l = left[i]!.matrixWorld.elements, r = right[i]!.matrixWorld.elements;
      assert.ok(l.every((v, j) => Math.abs(v - r[j]!) < 1e-6), `absolute sample ${action} ${phase}`);
    }
    absoluteSamples++;
  }
}
sampled.dispose(); elapsed.dispose();
const slot = new KayKitCharacterSlot(); await slot.load(async () => inputs); assert.equal(slot.status, 'ready'); slot.dispose(); assert.equal(slot.status, 'disposed');
console.log(JSON.stringify({ absoluteSamples, samples, boundVerticesChecked, verticesChecked, maxMatrixError, maxSkinError, clones: 2, skinnedMeshesPerClone: 6, paletteDisposals, borrowedDisposals, textureDecoded: false, browser: false }));

// Same-GLB native source animations: direct independent mixer comparison, no
// cross-rig adaptation and no claim about the absent gun/magazine contact.
const nativeBefore = JSON.stringify(target.animations.map(c => THREE.AnimationClip.toJSON(c)));
const nativeInputs = { ...inputs, nativeAnimations: target.animations };
const nativeActor = new KayKitSkinnedCharacter(nativeInputs);
const nativeSibling = new KayKitSkinnedCharacter(nativeInputs);
const nativeSiblingRest = transforms(nativeSibling.scene);
let nativeSamples = 0, nativeBoundVertices = 0, nativeMaxError = 0;
for (const action of Object.keys(KAYKIT_NATIVE_ACTIONS) as (keyof typeof KAYKIT_NATIVE_ACTIONS)[]) {
  const clip = target.animations.find(c => c.name === KAYKIT_NATIVE_ACTIONS[action])!;
  const reference = clone(target.scene), mixer = new THREE.AnimationMixer(reference);
  const refAction = mixer.clipAction(clip.clone());
  refAction.setLoop(THREE.LoopOnce, 1); refAction.clampWhenFinished = true;
  // Full 60 Hz sequence plus rewind, end and restart after prior native action.
  const phases = [...Array.from({length: Math.ceil(clip.duration * 60) + 1}, (_,i) => Math.min(i / 60 / clip.duration, 1)), .75, .25, 1, 0];
  for (const phase of phases) {
    assert.equal(nativeActor.sample(action, phase), true);
    mixer.stopAllAction(); refAction.reset().play(); mixer.update(clip.duration * phase);
    reference.updateMatrixWorld(true);
    nativeActor.scene.traverse(node => {
      if (!node.name) return;
      const expected = reference.getObjectByName(node.name)!;
      node.matrixWorld.elements.forEach((value, index) => {
        nativeMaxError = Math.max(nativeMaxError, Math.abs(value - expected.matrixWorld.elements[index]!));
      });
    });
    for (const skin of meshes(nativeActor.scene)) for (let i = 0; i < skin.geometry.getAttribute('position').count; i++) {
      const point = skin.getVertexPosition(i, new THREE.Vector3());
      assert.ok(skin.boundingBox!.clone().expandByScalar(1e-8).containsPoint(point));
      assert.ok(point.distanceTo(skin.boundingSphere!.center) <= skin.boundingSphere!.radius + 1e-8);
      nativeBoundVertices++;
    }
    nativeSamples++;
  }
  mixer.stopAllAction(); mixer.uncacheRoot(reference);
}
assert.ok(nativeMaxError < 1e-6, `native source drift ${nativeMaxError}`);
assert.equal(transforms(nativeSibling.scene), nativeSiblingRest);
assert.equal(JSON.stringify(target.animations.map(c => THREE.AnimationClip.toJSON(c))), nativeBefore);
const legacy = new KayKitSkinnedCharacter(inputs);
assert.equal(legacy.play('native-fire-two-hand'), false, 'native actions are opt-in'); legacy.dispose();
const missingNative = new KayKitCharacterSlot();
await missingNative.load(async () => ({ ...inputs, nativeAnimations: [] }));
assert.equal(missingNative.status, 'fallback'); assert.equal(missingNative.character, null); missingNative.dispose();
// Native elapsed playback and switches back to the existing remapped actions.
const mixed = new KayKitSkinnedCharacter(nativeInputs);
for (const [name, duration] of [
  ['native-fire-two-hand', target.animations.find(c => c.name === KAYKIT_NATIVE_ACTIONS['native-fire-two-hand'])!.duration],
  ['reload-one-hand', source.animations.find(c => c.name === KAYKIT_ACTIONS['reload-one-hand'])!.duration],
  ['native-aim-two-hand', target.animations.find(c => c.name === KAYKIT_NATIVE_ACTIONS['native-aim-two-hand'])!.duration],
] as const) {
  mixed.play(name); mixed.update(duration * .5); nativeActor.sample(name, .5);
  assert.equal(transforms(mixed.scene), transforms(nativeActor.scene));
}
mixed.stop(); nativeActor.stop();
const localRest = (root: THREE.Object3D) => JSON.parse(transforms(root)).map((n: unknown[]) => n.slice(0,4));
assert.deepEqual(localRest(mixed.scene), localRest(target.scene));
assert.deepEqual(localRest(nativeActor.scene), localRest(target.scene)); mixed.dispose();
assert.equal(nativeActor.currentAction, null);
nativeActor.dispose(); nativeActor.dispose(); nativeSibling.dispose();
assert.deepEqual([transforms(target.scene), transforms(source.scene), JSON.stringify(source.animations.map(c => THREE.AnimationClip.toJSON(c)))], before);
assert.equal(sharedResourceState(), originalResources);
console.log(JSON.stringify({ nativeSamples, nativeBoundVertices, nativeMaxError, nativeActions: KAYKIT_NATIVE_ACTIONS, browser: false, gunMagazineContact: 'unverified', defaultChanged: false }));


// Actual fixed-source skin consumes real simulation snapshots without changing them.
const { Game } = await import('../src/sim/game.js');
const { syncKayKitNativeAction } = await import('../src/render/kaykit-game-action.js');
const game = await Game.create(17), gameActor = new KayKitSkinnedCharacter(nativeInputs);
const player = game.state.actors[0]!.id;
try {
  syncKayKitNativeAction(gameActor, game.state, player);
  assert.equal(gameActor.currentAction, 'native-aim-two-hand');
  game.step([{actorId:player,type:'shoot',yaw:Math.PI/2,pitch:0}]);
  const hash = game.stateHash;
  syncKayKitNativeAction(gameActor, game.state, player);
  assert.equal(gameActor.currentAction, 'native-fire-two-hand');
  const pose = transforms(gameActor.scene); syncKayKitNativeAction(gameActor, game.state, player);
  assert.equal(transforms(gameActor.scene), pose); assert.equal(game.stateHash, hash);
  game.step([{actorId:player,type:'reload'}]); syncKayKitNativeAction(gameActor, game.state, player);
  assert.equal(gameActor.currentAction, 'native-reload-two-hand');
  game.step([{actorId:player,type:'switch',weapon:'pistol'}]); syncKayKitNativeAction(gameActor, game.state, player);
  assert.equal(gameActor.currentAction, null);
} finally { gameActor.dispose(); game.dispose(); }
console.log(JSON.stringify({ nativeGameSnapshots: true, simulationUnchanged: true, browser: false, viewConnected: false }));
