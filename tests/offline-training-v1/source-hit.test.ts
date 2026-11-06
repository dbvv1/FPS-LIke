import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { TrainingHitMarker, TrainingHitAssets, HIT_SOURCE } from '../../src/candidates/offline-training-v1/render/source-hit.js';
import { loadVerifiedContent, disposeContent, contentNode, CONTENT_PIECES } from '../../src/render/content-set-assets.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { angles } from '../../src/candidates/offline-training-v1/sim/math.js';
import { eye } from '../../src/candidates/offline-training-v1/sim/physics.js';
import { Feedback } from '../../src/candidates/offline-training-v1/render/feedback.js';
import type { PlayerSpec } from '../../src/candidates/offline-training-v1/sim/types.js';

const bytes = readFileSync(new URL('../../assets/content-set/hit-feedback.glb', import.meta.url));
const load = () => new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
const specs: PlayerSpec[] = [{ id: 'player', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'enemy', team: 'blue', position: { x: 0, y: 0, z: 5 } }];
const actor = (game: Game, id = 'player') => game.state.actors.find(actor => actor.id === id)!;
const shoot = (game: Game, body = false) => game.step([{ actorId: 'player', type: 'shoot', ...angles(eye(actor(game)), { ...actor(game, 'enemy').position, y: body ? .95 : eye(actor(game, 'enemy')).y }) }]);

test('unchanged source has real marker geometry/keys and does not expand the legacy character set', async () => {
  assert.equal(bytes.length, HIT_SOURCE.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), HIT_SOURCE.sha256);
  assert.deepEqual(Object.keys(CONTENT_PIECES), ['fp-arms-rx24', 'enemy-relay-guard']);
  const gltf = await load(), marker = new TrainingHitMarker(gltf);
  try {
    assert.deepEqual(gltf.animations.map(clip => clip.name), ['hit-body', 'hit-head', 'hit-kill', 'impact']);
    assert.equal(marker.mount.position.z, -.5);
    assert.equal(marker.mount.getObjectByName('impact-burst'), undefined);
    const core = contentNode(marker.marker, 'marker-core') as THREE.Mesh;
    assert.equal(core.geometry, (contentNode(gltf.scene, 'marker-core') as THREE.Mesh).geometry);
    const material = core.material as THREE.MeshBasicMaterial;
    assert.equal(material.depthTest, false); assert.equal(material.depthWrite, false);
    assert.equal(material.vertexColors, false); assert.equal(material.toneMapped, false);
    const bounds = new THREE.Box3().setFromObject(marker.marker), size = bounds.getSize(new THREE.Vector3());
    const span1080 = size.y / (2 * .5 * Math.tan(80 * Math.PI / 360)) * 1080;
    assert.ok(span1080 > 17 && span1080 < 18, 'accent extends beyond the nominal 14 px core target');
    console.log(JSON.stringify({ evidence: 'CPU projection, not pixel/GPU acceptance', accentRestSpanAt1080: span1080 }));
  } finally { marker.dispose(); disposeContent(gltf.scene); }
});

test('real body/head shots sample accepted pop keys then retain the existing 320 ms hold', async () => {
  for (const body of [true, false]) {
    const gltf = await load(), marker = new TrainingHitMarker(gltf), game = await Game.create(1, specs), feedback = new Feedback();
    try {
      shoot(game, body); const state = game.state, player = actor(game), effects = feedback.update(state, 1000), hash = game.stateHash;
      for (const [age, expected] of [[0, 1], [body ? 40 : 60, body ? 1.18 : 1.3], [body ? 120 : 180, 1], [319, 1]]) {
        const samples = effects.map(effect => ({ ...effect, age: age! }));
        assert.equal(marker.update(state, player, samples), body ? 'body' : 'head');
        assert.ok(Math.abs(marker.marker.scale.x - expected!) < 1e-6);
        assert.equal(contentNode(marker.marker, 'marker-accent').visible, !body);
      }
      assert.equal(marker.update(state, player, effects.map(effect => ({ ...effect, age: 320 }))), null);
      assert.equal(game.stateHash, hash);
      marker.update(state, player, feedback.update(state, 9000)); const scale = marker.marker.scale.clone();
      marker.update(game.state, actor(game), feedback.update(game.state, 19000));
      assert.ok(marker.marker.scale.equals(scale), 'paused simulation must not advance pop keys');
      marker.reset(); assert.equal(marker.mount.visible, false); assert.deepEqual(marker.marker.scale.toArray(), [1, 1, 1]);
    } finally { game.dispose(); marker.dispose(); disposeContent(gltf.scene); }
  }
});

test('real kill uses source hold and bounded terminal tail; reset and next round clear it', async () => {
  const gltf = await load(), marker = new TrainingHitMarker(gltf), game = await Game.create(1, specs), feedback = new Feedback();
  try {
    shoot(game); for (let tick = 0; tick < 12; tick++) game.step(); shoot(game);
    const state = game.state; assert.equal(state.phase, 'over');
    const effects = feedback.update(state, 1000);
    assert.equal(marker.update(state, actor(game), effects), 'kill');
    assert.equal(marker.update(state, actor(game), effects.map(effect => ({ ...effect, age: 80 }))), 'kill');
    assert.ok(Math.abs(marker.marker.scale.x - 1.35) < 1e-6);
    assert.equal(marker.update(state, actor(game), feedback.update(state, 1701)), null);
    feedback.reset(); marker.reset(); game.nextRound();
    assert.equal(marker.update(game.state, actor(game), feedback.update(game.state, 1800)), null);
  } finally { game.dispose(); marker.dispose(); disposeContent(gltf.scene); }
});

test('latest miss cancels success; nonlocal, unknown target, zero damage, missing impact and observer never confirm', async () => {
  const gltf = await load(), marker = new TrainingHitMarker(gltf), game = await Game.create(1, specs), feedback = new Feedback();
  try {
    shoot(game, true); const state = game.state, player = actor(game), effects = feedback.update(state, 0);
    assert.equal(marker.update(state, player, effects), 'body');
    assert.equal(marker.update(state, null, effects), null);
    for (const patch of [{ actorId: 'enemy' }, { hit: 'missing' }, { damage: 0 }, { impact: undefined }]) {
      const shots = state.shots.map(shot => ({ ...shot, ...patch }));
      assert.equal(marker.update({ ...state, shots }, player, effects.map((effect, i) => ({ ...effect, shot: shots[i]! }))), null);
    }
    for (let tick = 0; tick < 12; tick++) game.step();
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 1.4 }]);
    assert.equal(game.state.shots.at(-1)!.hit, null);
    assert.equal(marker.update(game.state, actor(game), feedback.update(game.state, 220)), null);
  } finally { game.dispose(); marker.dispose(); disposeContent(gltf.scene); }
});

test('friendly lethal hit uses source friendly tint without head/kill accent', async () => {
  const gltf = await load(), marker = new TrainingHitMarker(gltf);
  const game = await Game.create(1, [...specs, { id: 'friend', team: 'amber', position: { x: 0, y: 0, z: 2 } }]), feedback = new Feedback();
  try {
    shoot(game); for (let tick = 0; tick < 12; tick++) game.step(); shoot(game);
    assert.equal(game.state.shots.at(-1)!.impact!.killed, true);
    assert.equal(marker.update(game.state, actor(game), feedback.update(game.state, 1000)), 'friendly');
    assert.equal(contentNode(marker.marker, 'marker-accent').visible, false);
    const core = contentNode(marker.marker, 'marker-core') as THREE.Mesh;
    assert.equal((core.material as THREE.MeshBasicMaterial).color.getHex(), 0x54c9c0);
  } finally { game.dispose(); marker.dispose(); disposeContent(gltf.scene); }
});

test('missing and incompatible source components fall back and release resources', async () => {
  for (const mutate of [
    (gltf: GLTF) => { contentNode(gltf.scene, 'marker-core').name = 'missing-core'; },
    (gltf: GLTF) => gltf.animations.splice(0, 1),
    (gltf: GLTF) => { gltf.animations[0]!.tracks[0]!.name = 'hit-marker.position'; },
    (gltf: GLTF) => { gltf.animations[0]!.tracks[0]!.values[0] = NaN; },
  ]) {
    const gltf = await load(); mutate(gltf);
    const assets = new TrainingHitAssets(async () => gltf); await assets.start();
    assert.equal(assets.status, 'fallback'); assert.equal(assets.marker, null); assert.ok(assets.error); assets.dispose();
  }
  const assets = new TrainingHitAssets(async () => { throw new Error('missing source'); }); await assets.start();
  assert.equal(assets.status, 'fallback'); assert.match(assets.error!, /missing source/); assets.dispose();
});

test('dispose cancels pending source and frees late completion exactly once', async () => {
  const gltf = await load(), resources = new Set<THREE.BufferGeometry | THREE.Material>();
  gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) { resources.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) resources.add(material); } });
  let disposed = 0; for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
  let release!: () => void, signal!: AbortSignal;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const assets = new TrainingHitAssets(async received => { signal = received; await pending; return gltf; });
  const started = assets.start(); assets.dispose(); assets.dispose();
  assert.equal(signal.aborted, true); release(); await started;
  assert.equal(assets.status, 'disposed'); assert.equal(assets.marker, null); assert.equal(disposed, resources.size);
});

test('shared real loader accepts source bytes and rejects missing, truncated and altered bytes', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(bytes);
    const gltf = await loadVerifiedContent(HIT_SOURCE.id, HIT_SOURCE, new AbortController().signal); disposeContent(gltf.scene);
    globalThis.fetch = async () => new Response(null, { status: 404 });
    await assert.rejects(loadVerifiedContent(HIT_SOURCE.id, HIT_SOURCE, new AbortController().signal), /HTTP 404/);
    for (const invalid of [Buffer.from(bytes.subarray(0, 20)), Buffer.from(bytes)]) {
      invalid[19] = invalid[19]! ^ 1;
      globalThis.fetch = async () => new Response(invalid);
      await assert.rejects(loadVerifiedContent(HIT_SOURCE.id, HIT_SOURCE, new AbortController().signal), /integrity mismatch/);
    }
  } finally { globalThis.fetch = previous; }
});

test('ready owner releases each template geometry, source material and UI material once', async () => {
  const gltf=await load(),assets=new TrainingHitAssets(async()=>gltf);
  await assets.start();assert.equal(assets.status,'ready');
  const resources=new Set<THREE.BufferGeometry|THREE.Material>();
  for(const root of [gltf.scene,assets.marker!.mount])root.traverse(node=>{if(node instanceof THREE.Mesh){resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])resources.add(material);}});
  const counts=new Map([...resources].map(resource=>[resource,0]));
  for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));
  assets.reset();assert.ok([...counts.values()].every(count=>count===0));
  assets.dispose();assets.dispose();assert.ok([...counts.values()].every(count=>count===1));
});

test('restarting source load rejects and frees the old late generation without replacing the new marker', async () => {
  const old=await load();let release!:(gltf:GLTF)=>void,calls=0,disposed=0;
  old.scene.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.addEventListener('dispose',()=>disposed++);});
  const assets=new TrainingHitAssets(async()=>++calls===1?new Promise(resolve=>{release=resolve;}):load());
  const first=assets.start();await assets.start();const current=assets.marker;
  release(old);await first;
  assert.equal(assets.status,'ready');assert.equal(assets.marker,current);assert.equal(disposed,3);assets.dispose();
});
