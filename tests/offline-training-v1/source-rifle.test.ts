import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { TrainingRifle, TrainingRifleAssets, RIFLE_RELOAD_SOURCE } from '../../src/candidates/offline-training-v1/render/source-rifle.js';
import { contentNode, disposeContent } from '../../src/render/content-set-assets.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { weaponPose, weaponParts, weaponPartPosition } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { armJoints } from '../../src/candidates/offline-training-v1/render/arm.js';
import { SECOND } from '../../src/candidates/offline-training-v1/sim/types.js';

const bytes = readFileSync(new URL('../../assets/content-set/fp-arms-rx24.glb', import.meta.url));
const load = () => new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
const actor = (game: Game) => game.state.actors.find(actor => actor.id === 'player')!;
const gameForReload = () => Game.create(1, [{ id: 'player', team: 'amber' }, { id: 'enemy', team: 'blue' }], {}, { weaponPresentation: 'generation-v1' });
function resources(gltf: GLTF) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let geometryDisposals = 0, materialDisposals = 0;
  gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) {
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  } });
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
  return () => assert.deepEqual([geometryDisposals, materialDisposals], [geometries.size, materials.size]);
}

test('unchanged accepted source exposes only two rigid reload component tracks and no switch or skin', async () => {
  assert.equal(bytes.length, RIFLE_RELOAD_SOURCE.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), RIFLE_RELOAD_SOURCE.sha256);
  const gltf = await load();
  try {
    assert.deepEqual(gltf.animations.map(clip => clip.name), ['idle', 'fire', 'reload-magazine', 'reload-bolt']);
    gltf.scene.traverse(node => assert.equal(node instanceof THREE.SkinnedMesh, false));
    assert.ok(new TrainingRifle(gltf));
  } finally { disposeContent(gltf.scene); }
});

test('1901 source-key samples share exact magazine displacement with palm and reachable procedural sleeves', async () => {
  const gltf = await load(), game = await gameForReload();
  try {
    const magazine = contentNode(gltf.scene, 'rifle-magazine'), support = contentNode(gltf.scene, 'support-hand'), bolt = contentNode(gltf.scene, 'rifle-bolt');
    const restMag = magazine.position.clone(), restPalm = support.position.clone(), restBolt = bolt.position.clone();
    const rifle = new TrainingRifle(gltf);
    const palmPart = weaponParts('rifle').find(part => part.id === 'support-palm')!;
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 0 }]); game.step([{ actorId: 'player', type: 'reload' }]);
    const state = game.state, player = state.actors.find(actor => actor.id === 'player')!;
    const sampleTrack = (name: string, progress: number) => {
      const clip = gltf.animations.find(clip => clip.name === name)!, track = clip.tracks[0]!, time = progress * clip.duration;
      let key = 0; while (key + 1 < track.times.length && track.times[key + 1]! < time) key++;
      const next = Math.min(track.times.length - 1, key + 1), alpha = next === key ? 0 : (time - track.times[key]!) / (track.times[next]! - track.times[key]!);
      const axis = name === 'reload-magazine' ? 1 : 2;
      return track.values[key * 3 + axis]! + (track.values[next * 3 + axis]! - track.values[key * 3 + axis]!) * alpha - track.values[axis]!;
    };
    let contactSamples = 0, largestReach = 0, differsFromOld = false;
    for (let index = 0; index <= 1900; index++) {
      const progress = index / 1900;
      // Dense synthetic display phases of an actual reload snapshot. This does
      // not write Game state; the next test uses only real simulation ticks.
      state.time = player.reload!.end - (1 - progress) * 1.9 * SECOND;
      const base = weaponPose(state, player), pose = rifle.pose(base);
      const mag = sampleTrack('reload-magazine', progress), charging = sampleTrack('reload-bolt', progress);
      assert.ok(Math.abs(magazine.position.y - restMag.y - mag) < 1e-7);
      assert.ok(Math.abs(bolt.position.z - restBolt.z - charging) < 1e-7);
      assert.deepEqual([magazine.position.x, magazine.position.z], [restMag.x, restMag.z]);
      assert.deepEqual(rifle.model.root.position.toArray(), [0, 0, 0]);
      if (pose.magazine > .01) {
        contactSamples++; assert.equal(pose.grasp, 1);
        assert.ok(Math.abs(support.position.y - restPalm.y - (mag + palmPart.gripOffset![1])) < 1e-7);
      }
      for (const part of weaponParts('rifle').filter(part => part.arm)) {
        const position = weaponPartPosition(part, pose), shift = position.map((v, i) => v - part.position[i]!) as [number, number, number];
        const joints = armJoints(part.arm!, pose, shift);
        assert.equal(joints.reachable, true, `phase ${progress}: ${part.id}`);
        largestReach = Math.max(largestReach, joints.distance);
      }
      if (Math.abs(pose.magazine - base.magazine) > .1) differsFromOld = true;
    }
    assert.ok(contactSamples > 500); assert.ok(differsFromOld, 'must consume source keys, not silently retain the old envelope');
    assert.ok(largestReach < .58);
    console.log(JSON.stringify({ evidence: 'source-track CPU sampling; no visual acceptance', samples: 1901, contactSamples, largestReach }));
  } finally { game.dispose(); disposeContent(gltf.scene); }
});

test('real reload completes source tracks and switch interruption returns them to rest on return', async () => {
  const gltf = await load(), game = await gameForReload();
  try {
    const rifle = new TrainingRifle(gltf), magazine = contentNode(gltf.scene, 'rifle-magazine'), rest = magazine.position.clone();
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 0 }]); game.step([{ actorId: 'player', type: 'reload' }]);
    for (let tick = 0; tick < 35; tick++) game.step([]);
    rifle.pose(weaponPose(game.state, actor(game))); assert.ok(magazine.position.y < rest.y - .17);
    game.step([{ actorId: 'player', type: 'switch', weapon: 'pistol' }, { actorId: 'player', type: 'switch', weapon: 'rifle' }]);
    const cancelled = rifle.pose(weaponPose(game.state, actor(game)));
    assert.equal(actor(game).reload, null); assert.equal(cancelled.magazine + cancelled.bolt, 0); assert.ok(magazine.position.equals(rest));
    game.step([{ actorId: 'player', type: 'reload' }]);
    let moved = false;
    while (actor(game).reload) { game.step([]); const pose = rifle.pose(weaponPose(game.state, actor(game))); moved ||= pose.magazine > .99; }
    assert.equal(moved, true); assert.equal(actor(game).weapons.rifle.ammo, 24); assert.ok(magazine.position.equals(rest));
  } finally { game.dispose(); disposeContent(gltf.scene); }
});

test('missing, non-linear, unclosed or sideways reload sources fail rather than approximating a new action', async () => {
  for (const damage of ['missing', 'nonlinear', 'unclosed', 'sideways'] as const) {
    const gltf = await load(), clip = gltf.animations.find(clip => clip.name === 'reload-magazine')!;
    if (damage === 'missing') gltf.animations = gltf.animations.filter(value => value !== clip);
    if (damage === 'nonlinear') clip.tracks[0]!.setInterpolation(THREE.InterpolateDiscrete);
    if (damage === 'unclosed') clip.tracks[0]!.values[clip.tracks[0]!.values.length - 2] = -.2;
    if (damage === 'sideways') clip.tracks[0]!.values[3] = .1;
    const checkDisposed = resources(gltf), assets = new TrainingRifleAssets(async () => gltf);
    await assets.start(); assert.equal(assets.status, 'fallback'); assert.equal(assets.rifle, null); assert.ok(assets.error); checkDisposed();
    assets.dispose(); checkDisposed();
  }
});

test('rifle owner detaches on reset, frees once on disposal, and rejects a late load after departure', async () => {
  const gltf = await load(), checkDisposed = resources(gltf), assets = new TrainingRifleAssets(async () => gltf);
  await assets.start(); assert.equal(assets.status, 'ready');
  const mount = new THREE.Group(); mount.add(assets.rifle!.scene); assets.reset(); assert.equal(mount.children.length, 0); assert.equal(assets.status, 'ready');
  assets.dispose(); assets.dispose(); checkDisposed();
  const late = await load(), checkLate = resources(late);
  let release!: (gltf: GLTF) => void;
  const delayed = new TrainingRifleAssets(async () => new Promise<GLTF>(resolve => { release = resolve; }));
  const loading = delayed.start(); delayed.dispose(); release(late); await loading;
  assert.equal(delayed.status, 'disposed'); assert.equal(delayed.rifle, null); checkLate();
});
