import { KAYKIT_RIFLE_BODY, KAYKIT_MELEE_EQUIPMENT } from '../src/render/kaykit-skinned-character.js';
import { SECOND } from '../src/sim/types.js';
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
  for (const name of [...KAYKIT_RIFLE_BODY, ...KAYKIT_MELEE_EQUIPMENT]) {
    const mesh = new THREE.Mesh(); mesh.name = name; character.add(mesh);
  }
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

import { Game } from '../src/sim/game.js';
import { syncKayKitGameAction } from '../src/render/kaykit-game-action.js';

test('actual Game reload snapshots drive actual skin; pause, rewind, switch and completion reset', async () => {
  const game = await Game.create(17);
  const actorId = game.state.actors[0]!.id;
  const character = new KayKitSkinnedCharacter(movingSkinSources());
  const skin = skinsOf(character.scene)[0]!;
  const sync = () => syncKayKitGameAction(character, game.state, actorId);
  try {
    sync(); assert.equal(character.currentAction, null);
    game.step([{ actorId, type: 'shoot', yaw: Math.PI / 2, pitch: 0 }]);
    game.step([{ actorId, type: 'reload' }]);
    const early = game.state;
    sync(); assert.equal(character.currentAction, 'reload-two-hand');
    for (let i = 0; i < 56; i++) game.step();
    const hash = game.stateHash;
    sync(); const x = skin.boundingBox!.min.x; assert.ok(x > 4 && x < 6);
    sync(); assert.equal(skin.boundingBox!.min.x, x); assert.equal(game.stateHash, hash);
    syncKayKitGameAction(character, early, actorId); assert.ok(skin.boundingBox!.min.x < 1);
    sync(); assert.equal(skin.boundingBox!.min.x, x);
    game.step([{ actorId, type: 'switch', weapon: 'pistol' }]); sync();
    assert.equal(character.currentAction, null); assert.ok(skin.boundingBox!.min.x < 1);
    for (let i = 0; i < 13; i++) game.step();
    game.step([{ actorId, type: 'shoot', yaw: Math.PI / 2, pitch: 0 }]);
    game.step([{ actorId, type: 'reload' }]); sync();
    assert.equal(character.currentAction, 'reload-one-hand');
    const pistol = game.state;
    const dead = structuredClone(pistol); dead.actors[0]!.hp = 0;
    syncKayKitGameAction(character, dead, actorId); assert.equal(character.currentAction, null);
    sync(); const over = structuredClone(pistol); over.phase = 'over';
    syncKayKitGameAction(character, over, actorId); assert.equal(character.currentAction, null);
    sync(); syncKayKitGameAction(character, pistol, 'absent'); assert.equal(character.currentAction, null);
    for (let i = 0; i < 84; i++) game.step(); sync(); assert.equal(character.currentAction, null);
    character.dispose(); sync(); assert.equal(character.disposed, true);
  } finally { character.dispose(); game.dispose(); }
});

test('absolute clip sampling supports finish then rewind without stale clamp', () => {
  const character = new KayKitSkinnedCharacter(movingSkinSources());
  try {
    character.sample('reload-two-hand', 1);
    assert.ok(skinsOf(character.scene)[0]!.boundingBox!.min.x > 9.9);
    character.sample('reload-two-hand', 0.25);
    assert.ok(Math.abs(skinsOf(character.scene)[0]!.boundingBox!.min.x - 2.5) < 1e-5);
    assert.throws(() => character.sample('reload-one-hand', NaN));
  } finally { character.dispose(); }
});

import { KAYKIT_NATIVE_ACTIONS, validateKayKitNative } from '../src/render/kaykit-skinned-character.js';
test('native character clips are explicit, cloned and fail closed on invalid bindings', async () => {
  const source = movingSkinSources();
  const nativeAnimations = Object.values(KAYKIT_NATIVE_ACTIONS).map(name => {
    const clip = source.animations[0]!.clone(); clip.name = name;
    clip.tracks.forEach(t => { t.name = t.name.replace('Rig_Medium.', 'Rig.'); }); return clip;
  });
  const before = JSON.stringify(nativeAnimations.map(c => THREE.AnimationClip.toJSON(c)));
  const actor = new KayKitSkinnedCharacter({ ...source, nativeAnimations });
  for (const name of Object.keys(KAYKIT_NATIVE_ACTIONS) as (keyof typeof KAYKIT_NATIVE_ACTIONS)[]) {
    assert.equal(actor.sample(name, .5), true); assert.equal(actor.currentAction, name);
    assert.ok(skinsOf(actor.scene)[0]!.boundingBox!.min.x > 4.99);
  }
  actor.stop(); assert.equal(actor.currentAction, null); actor.dispose();
  assert.equal(JSON.stringify(nativeAnimations.map(c => THREE.AnimationClip.toJSON(c))), before);
  const invalid = nativeAnimations[0]!.clone(); invalid.tracks[0]!.name = 'absent.position';
  assert.throws(() => validateKayKitNative(source.character, invalid), /Unique node/);
  const duplicate = nativeAnimations[0]!.clone(); duplicate.tracks.push(duplicate.tracks[0]!.clone());
  assert.throws(() => validateKayKitNative(source.character, duplicate), /Duplicate/);
  const broken = new KayKitCharacterSlot(); await broken.load(async () => ({ ...source, nativeAnimations: [] }));
  assert.equal(broken.status, 'fallback'); assert.ok(broken.error); broken.dispose();
});


import { syncKayKitNativeAction } from '../src/render/kaykit-game-action.js';
test('native stationary rifle follows accepted Game snapshots; switch and unsupported states restore rest', async () => {
  const sources = movingSkinSources();
  const nativeAnimations = Object.values(KAYKIT_NATIVE_ACTIONS).map(name => {
    const clip = sources.animations[0]!.clone(); clip.name = name;
    clip.tracks.forEach(t => { t.name = t.name.replace('Rig_Medium.', 'Rig.'); }); return clip;
  });
  const character = new KayKitSkinnedCharacter({ ...sources, nativeAnimations });
  const old = new KayKitSkinnedCharacter(sources);
  const game = await Game.create(17); const id = game.state.actors[0]!.id;
  const sync = () => syncKayKitNativeAction(character, game.state, id);
  try {
    sync(); assert.equal(character.currentAction, 'native-aim-two-hand');
    const held = character.scene.getObjectByName('Rig')!.position.clone();
    character.sample('native-aim-two-hand', 1);
    assert.ok(character.scene.getObjectByName('Rig')!.position.equals(held), 'held pose is source end, not raise pre-roll');
    game.step([{actorId:id,type:'shoot',yaw:Math.PI/2,pitch:0}]);
    const shot = game.state, hash = game.stateHash;
    sync(); assert.equal(character.currentAction, 'native-fire-two-hand');
    const skin = skinsOf(character.scene)[0]!; const early = skin.boundingBox!.min.x;
    sync(); assert.equal(skin.boundingBox!.min.x,early); assert.equal(game.stateHash,hash);
    for(let i=0;i<15;i++)game.step(); sync(); assert.ok(skin.boundingBox!.min.x > early);
    syncKayKitNativeAction(character,shot,id); assert.equal(skin.boundingBox!.min.x,early);
    game.step([{actorId:id,type:'reload'}]); sync(); assert.equal(character.currentAction,'native-reload-two-hand');
    game.step([{actorId:id,type:'switch',weapon:'pistol'}]); sync(); assert.equal(character.currentAction,null);
    game.step([{actorId:id,type:'switch',weapon:'rifle'}]); sync(); assert.equal(character.currentAction,'native-aim-two-hand');
    for(let i=0;i<13;i++)game.step();
    game.step([{actorId:id,type:'shoot',yaw:Math.PI/2,pitch:0}]); sync(); assert.equal(character.currentAction,'native-fire-two-hand');
    const recent = game.state;
    for(const mutate of [
      (s:typeof recent)=>{s.actors[0]!.input.x=1},
      (s:typeof recent)=>{s.actors[0]!.input.crouch=true},
      (s:typeof recent)=>{s.actors[0]!.input.interact=true},
      (s:typeof recent)=>{s.actors[0]!.hp=0},
      (s:typeof recent)=>{s.phase='over'},
    ]) {const blocked=structuredClone(recent);mutate(blocked);syncKayKitNativeAction(character,blocked,id);assert.equal(character.currentAction,null);}
    const noShot=structuredClone(recent);noShot.shots=[];syncKayKitNativeAction(character,noShot,id);assert.equal(character.currentAction,'native-aim-two-hand');
    syncKayKitNativeAction(old,recent,id);assert.equal(old.currentAction,null);
    for(let i=0;i<65;i++)game.step();sync();assert.equal(character.currentAction,'native-aim-two-hand');
    syncKayKitNativeAction(character,recent,'absent');assert.equal(character.currentAction,null);
    character.dispose();sync();assert.equal(character.currentAction,null);
  } finally {character.dispose();old.dispose();game.dispose();}
});

 test('native snapshot window holds final aim and omits shot pre-roll at original speed', async () => {
  const game = await Game.create(17); const id=game.state.actors[0]!.id;
  const calls: [string,number][]=[];
  const fake = {disposed:false,currentAction:null,duration:()=>32/30, sample:(a:string,p:number)=>{calls.push([a,p]);return true}, stop:()=>{}} as unknown as KayKitSkinnedCharacter;
  try {
    syncKayKitNativeAction(fake,game.state,id);assert.deepEqual(calls.pop(),['native-aim-two-hand',1]);
    game.step([{actorId:id,type:'shoot',yaw:0,pitch:0}]);
    const state=game.state;const shot=state.actors[0]!.weapons.rifle.lastShot;
    state.time=shot;syncKayKitNativeAction(fake,state,id);assert.deepEqual(calls.pop(),['native-fire-two-hand',.25]);
    state.time=shot+SECOND/10;syncKayKitNativeAction(fake,state,id);
    assert.deepEqual(calls.pop(),['native-fire-two-hand',.25+.1/(32/30)]);
    state.time=shot+SECOND*.8;syncKayKitNativeAction(fake,state,id);assert.deepEqual(calls.pop(),['native-aim-two-hand',1]);
  } finally {game.dispose();}
});

import { KAYKIT_LOOP_ACTIONS, type KayKitLoopAction } from '../src/render/kaykit-skinned-character.js';
function rifleRunSources() {
  const sources = movingSkinSources();
  const clip = sources.animations[0]!.clone();
  clip.name = KAYKIT_LOOP_ACTIONS['run-rifle'];
  clip.tracks = clip.tracks.map(track => track.name === 'root.position'
    ? new THREE.VectorKeyframeTrack(track.name, [0, .5, 1], [0, 0, 0, 4, 0, 0, 0, 0, 0]) : track);
  return { ...sources, rifleMovement: { motion: sources.motion, animations: [clip] } };
}
test('optional rifle run consumes a separate complete source without changing old callers', () => {
  const sources = rifleRunSources(), before = JSON.stringify(THREE.AnimationClip.toJSON(sources.rifleMovement.animations[0]!));
  const actor = new KayKitSkinnedCharacter(sources), old = new KayKitSkinnedCharacter(movingSkinSources());
  try {
    assert.equal(old.duration('run-rifle'), null); old.play('reload-one-hand');
    assert.equal(old.sampleLoop('run-rifle', .5), false); assert.equal(old.currentAction, 'reload-one-hand');
    assert.equal(actor.duration('run-rifle'), 1); actor.sample('run-rifle', .5);
    assert.equal(actor.currentAction, 'run-rifle');
    assert.ok(Math.abs(skinsOf(actor.scene)[0]!.boundingBox!.min.x - 4) < 1e-6);
    // Instance action clips are copied, not the borrowed source's live arrays.
    sources.rifleMovement.animations[0]!.tracks[0]!.values.fill(999);
    actor.sample('run-rifle', .5); assert.ok(Math.abs(skinsOf(actor.scene)[0]!.boundingBox!.min.x - 4) < 1e-6);
    assert.notEqual(JSON.stringify(THREE.AnimationClip.toJSON(sources.rifleMovement.animations[0]!)), before);
  } finally { actor.dispose(); old.dispose(); }
});
test('rifle loop absolute time wraps, rewinds and survives switches without advancing siblings', () => {
  const sources = rifleRunSources(), actor = new KayKitSkinnedCharacter(sources), sibling = new KayKitSkinnedCharacter(sources);
  const skin = skinsOf(actor.scene)[0]!, rest = skinsOf(sibling.scene)[0]!.boundingBox!.clone();
  const original = JSON.stringify(sources.rifleMovement.animations.map(c => THREE.AnimationClip.toJSON(c)));
  try {
    for (const [seconds, x] of [[0, 0], [.25, 2], [.5, 4], [1, 0], [10.25, 2], [.25, 2], [1e6 + .75, 2]]) {
      assert.equal(actor.sampleLoop('run-rifle', seconds!), true);
      assert.ok(Math.abs(skin.boundingBox!.min.x - x!) < 1e-6);
      const pose = skin.boundingBox!.clone(); actor.sampleLoop('run-rifle', seconds!); assert.deepEqual(skin.boundingBox, pose);
      assert.deepEqual(skinsOf(sibling.scene)[0]!.boundingBox, rest);
    }
    actor.sample('reload-two-hand', .75); actor.sampleLoop('run-rifle', .5);
    assert.ok(Math.abs(skin.boundingBox!.min.x - 4) < 1e-6);
    actor.stop(); assert.equal(actor.currentAction, null); assert.deepEqual(skin.boundingBox, rest);
    actor.sampleLoop('run-rifle', .5);
    for (const bad of [-1, NaN, Infinity]) assert.throws(() => actor.sampleLoop('run-rifle', bad), /loop time/);
    const pose = skin.boundingBox!.clone();
    assert.equal(actor.sampleLoop('reload-two-hand' as KayKitLoopAction, .5), false);
    assert.deepEqual(skin.boundingBox, pose); assert.equal(actor.currentAction, 'run-rifle');
    assert.equal(JSON.stringify(sources.rifleMovement.animations.map(c => THREE.AnimationClip.toJSON(c))), original);
    actor.dispose(); assert.equal(actor.sampleLoop('run-rifle', .5), false);
  } finally { actor.dispose(); sibling.dispose(); }
});
test('movement opt-in fails closed on missing, ambiguous or incomplete clips and invalid hierarchy', async () => {
  const sources = rifleRunSources(), clip = sources.rifleMovement.animations[0]!;
  const incomplete = clip.clone(); incomplete.tracks = incomplete.tracks.filter(t => t.name !== 'Rig_Medium.scale');
  const zero = clip.clone(); zero.duration = 0;
  for (const animations of [[], [clip, clip], [incomplete], [zero]]) {
    const slot = new KayKitCharacterSlot();
    await slot.load(async () => ({ ...sources, rifleMovement: { ...sources.rifleMovement, animations } }));
    assert.equal(slot.status, 'fallback'); assert.equal(slot.character, null); assert.ok(slot.error); slot.dispose();
  }
  assert.throws(() => new KayKitSkinnedCharacter({ ...sources,
    rifleMovement: { motion: new THREE.Group(), animations: [clip] } }), /Unique node/);
});

import { syncKayKitRifleAction } from '../src/render/kaykit-game-action.js';
function completeBodySources() {
  const sources = rifleRunSources();
  return { ...sources, nativeAnimations: Object.values(KAYKIT_NATIVE_ACTIONS).map(name => {
    const clip = sources.animations[0]!.clone(); clip.name = name;
    clip.tracks.forEach(t => { t.name = t.name.replace('Rig_Medium.', 'Rig.'); }); return clip;
  }) };
}
test('real Game forward displacement drives the body chain at authoritative time without sim writes', async () => {
  const game = await Game.create(17), id = game.state.actors[0]!.id;
  const character = new KayKitSkinnedCharacter(completeBodySources());
  try {
    syncKayKitRifleAction(character, game.state, id); assert.equal(character.currentAction, 'native-aim-two-hand');
    let previous = game.state;
    game.step([{ actorId: id, type: 'move', x: 0, z: 1 }]);
    const firstPair = [previous, game.state] as const;
    for (let i = 0; i < 55; i++) {
      const current = game.state, hash = game.stateHash, json = JSON.stringify([previous, current]);
      syncKayKitRifleAction(character, current, id, previous); assert.equal(character.currentAction, 'run-rifle');
      const expected = (current.time / SECOND) % 1;
      const x = skinsOf(character.scene)[0]!.boundingBox!.min.x;
      assert.ok(Math.abs(x - 8 * Math.min(expected, 1 - expected)) < 1e-5);
      syncKayKitRifleAction(character, current, id, previous); assert.equal(skinsOf(character.scene)[0]!.boundingBox!.min.x, x);
      assert.equal(game.stateHash, hash); assert.equal(JSON.stringify([previous, current]), json);
      previous = current; game.step();
    }
    syncKayKitRifleAction(character, firstPair[1], id, firstPair[0]);
    assert.equal(character.currentAction, 'run-rifle'); // Replay old authoritative pair, no accumulated clock.
    game.step([{ actorId: id, type: 'move', x: 0, z: 0 }]);
    syncKayKitRifleAction(character, game.state, id); assert.equal(character.currentAction, 'native-aim-two-hand');
    game.step([{ actorId: id, type: 'shoot', yaw: Math.PI / 2, pitch: 0 }]);
    syncKayKitRifleAction(character, game.state, id); assert.equal(character.currentAction, 'native-fire-two-hand');
    game.step([{ actorId: id, type: 'reload' }]);
    syncKayKitRifleAction(character, game.state, id); assert.equal(character.currentAction, 'native-reload-two-hand');
    game.step([{ actorId: id, type: 'switch', weapon: 'pistol' }]);
    syncKayKitRifleAction(character, game.state, id); assert.equal(character.currentAction, null);
  } finally { character.dispose(); game.dispose(); }
});
test('real Game wall blocking and unsupported movement never become forward-run playback', async () => {
  const game = await Game.create(17), id = game.state.actors[0]!.id;
  const character = new KayKitSkinnedCharacter(completeBodySources());
  try {
    let previous = game.state;
    game.step([{ actorId: id, type: 'move', x: 0, z: 1 }]);
    for (let i = 0; i < 125; i++) { previous = game.state; game.step(); }
    const current = game.state;
    assert.ok(Math.hypot(current.actors[0]!.position.x - previous.actors[0]!.position.x,
      current.actors[0]!.position.z - previous.actors[0]!.position.z) < .001, 'actual collision is below Game footstep displacement floor');
    character.sampleLoop('run-rifle', .5); syncKayKitRifleAction(character, current, id, previous);
    assert.equal(character.currentAction, null);
    for (const command of [
      { type: 'move', x: 1, z: 0 }, { type: 'move', x: 0, z: -1 },
      { type: 'move', x: 0, z: -1, walk: true }, { type: 'move', x: 0, z: -1, crouch: true },
    ] as const) {
      previous = game.state; game.step([{ actorId: id, ...command }]);
      character.sampleLoop('run-rifle', .5); syncKayKitRifleAction(character, game.state, id, previous);
      assert.equal(character.currentAction, null);
    }
  } finally { character.dispose(); game.dispose(); }
});
test('movement witness rejects stale, absent, cross-round and fighting snapshots with same-frame reset', async () => {
  const game = await Game.create(17), id = game.state.actors[0]!.id;
  const character = new KayKitSkinnedCharacter(completeBodySources());
  try {
    const previous = game.state; game.step([{ actorId: id, type: 'move', x: 0, z: 1 }]); const current = game.state;
    for (const old of [undefined, current, { ...previous, seed: 21 }, { ...previous, round: 2 }, { ...previous, actors: [] }]) {
      character.sampleLoop('run-rifle', .5); syncKayKitRifleAction(character, current, id, old); assert.equal(character.currentAction, null);
    }
    const unsupported = [
      (s:typeof current) => { s.phase = 'over'; }, (s:typeof current) => { s.actors[0]!.hp = 0; },
      (s:typeof current) => { s.actors[0]!.input.interact = true; }, (s:typeof current) => { s.time = NaN; },
      (s:typeof current) => { s.tick += 1; s.time += 1000; }, (s:typeof current) => { s.actors[0]!.position.x += 1; },
    ];
    for (const mutate of unsupported) { const bad = structuredClone(current); mutate(bad);
      character.sampleLoop('run-rifle', .5); syncKayKitRifleAction(character, bad, id, previous); assert.equal(character.currentAction, null); }
    let old = game.state; game.step([{ actorId: id, type: 'shoot', yaw: 0, pitch: 0 }]);
    syncKayKitRifleAction(character, game.state, id, old); assert.equal(character.currentAction, null, 'no running-fire clip');
    old = game.state; game.step([{ actorId: id, type: 'reload' }]);
    syncKayKitRifleAction(character, game.state, id, old); assert.equal(character.currentAction, null, 'no running-reload clip');
    const missing = new KayKitSkinnedCharacter(movingSkinSources());
    try { missing.play('reload-two-hand'); syncKayKitRifleAction(missing, current, id, previous); assert.equal(missing.currentAction, null); }
    finally { missing.dispose(); }
    character.dispose(); syncKayKitRifleAction(character, current, id, previous); assert.equal(character.currentAction, null);
  } finally { character.dispose(); game.dispose(); }
});
test('real Game forward movement uses world-space input at nonzero yaw in all quadrants', async () => {
  for (const yaw of [Math.PI / 2, -Math.PI / 2, Math.PI / 4, Math.PI]) {
    const game = await Game.create(17), id = game.state.actors[0]!.id;
    const character = new KayKitSkinnedCharacter(completeBodySources());
    try {
      let previous = game.state;
      game.step([{ actorId: id, type: 'aim', yaw, pitch: 0 },
        { actorId: id, type: 'move', x: Math.sin(yaw), z: Math.cos(yaw) }]);
      for (let i = 0; i < 12; i++) {
        const current = game.state;
        syncKayKitRifleAction(character, current, id, previous);
        assert.equal(character.currentAction, 'run-rifle', `yaw ${yaw}, step ${i}`);
        previous = current; game.step();
      }
    } finally { character.dispose(); game.dispose(); }
  }
});

test('native rifle poses select only melee visibility, restoring source selection on exit', () => {
  const sources = completeBodySources();
  sources.character.getObjectByName('Round_Shield')!.visible = false;
  sources.character.getObjectByName('Knight_Cape')!.visible = false;
  const actor = new KayKitSkinnedCharacter(sources), sibling = new KayKitSkinnedCharacter(sources);
  const sourceState = sources.character.toJSON();
  for (const action of ['native-aim-two-hand', 'native-fire-two-hand', 'native-reload-two-hand', 'run-rifle'] as const) {
    assert.equal(actor.sample(action, .5), true);
    for (const name of KAYKIT_MELEE_EQUIPMENT) assert.equal(actor.scene.getObjectByName(name)!.visible, false);
    for (const name of KAYKIT_RIFLE_BODY) assert.equal(actor.scene.getObjectByName(name)!.visible, sources.character.getObjectByName(name)!.visible);
    assert.equal(sibling.scene.getObjectByName('1H_Sword')!.visible, true);
    assert.deepEqual(sources.character.toJSON(), sourceState);
  }
  actor.stop(); assert.equal(actor.scene.getObjectByName('1H_Sword')!.visible, true);
  assert.equal(actor.scene.getObjectByName('Round_Shield')!.visible, false);
  actor.play('native-aim-two-hand'); actor.play('reload-one-hand');
  assert.equal(actor.scene.getObjectByName('1H_Sword')!.visible, true);
  actor.dispose(); sibling.dispose();
});
test('native rifle body preparation rejects missing, duplicate and non-mesh semantic nodes', () => {
  for (const mode of ['missing', 'duplicate', 'wrong-kind']) {
    const sources = completeBodySources(), node = sources.character.getObjectByName('Knight_Cape')!;
    if (mode !== 'duplicate') node.removeFromParent();
    if (mode !== 'missing') { const replacement = mode === 'duplicate' ? new THREE.Mesh() : new THREE.Group();
      replacement.name = 'Knight_Cape'; sources.character.add(replacement); }
    assert.throws(() => new KayKitSkinnedCharacter(sources), /Unique node required|Knight mesh required/);
  }
});
