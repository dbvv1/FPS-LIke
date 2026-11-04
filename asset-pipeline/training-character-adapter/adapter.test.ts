import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  TrainingCharacter,
  TrainingCharacterSet,
  TRAINING_CHARACTER_SOURCE,
  TRAINING_CLIPS,
  disposeTrainingCharacter,
  loadTrainingCharacter,
  parseTrainingCharacter,
  sha256Hex,
  trainingNode,
} from './adapter.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Feedback, RESULT_HOLD_MS, type ShotEffect } from '../../src/candidates/offline-training-v1/render/feedback.js';
import { SECOND, type Actor, type GameState, type PlayerSpec, type Shot, type Team } from '../../src/candidates/offline-training-v1/sim/types.js';
import { targetVertices } from '../../src/candidates/offline-training-v1/render/target.js';

const GLB_URL = new URL('../../assets/content-set/enemy-relay-guard.glb', import.meta.url);

function arrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
async function sourceBuffer() { return readFile(GLB_URL); }
async function accepted() { return parseTrainingCharacter(arrayBuffer(await sourceBuffer())); }
async function rawGltf() { return new GLTFLoader().parseAsync(arrayBuffer(await sourceBuffer()), ''); }

function actor(id = 'bot', team: Team = 'blue'): Actor {
  return { id, team, side: 'defend', hp: 100, position: { x: 2, y: 0, z: -3 }, yaw: 0, pitch: 0,
    input: { x: 0, z: 0, walk: false, crouch: false, interact: false }, weapon: 'rifle', reload: null,
    weapons: { rifle: { ammo: 24, reserve: 48, shots: 0, lastShot: -SECOND }, pistol: { ammo: 12, reserve: 24, shots: 0, lastShot: -SECOND } },
    nextShot: 0, nextFootstep: 0, bot: null };
}
function state(a = actor()): GameState {
  return { seed: 1, random: 1, tick: 0, time: 0, round: 1, roundEndsAt: 70 * SECOND, phase: 'live', score: { amber: 0, blue: 0 },
    actors: [a], bomb: { carrier: null, position: { x: 0, y: 0, z: 0 }, planted: false, explodeAt: null }, interaction: null,
    result: null, shots: [], sounds: [], soundSequence: 0 };
}
function shot(actorId: string, time: number, weapon: 'rifle' | 'pistol' = 'rifle'): Shot {
  return { actorId, weapon, time, yaw: 0, pitch: 0, hit: null, part: null, damage: 0, visible: true, targetId: null, targetVisible: false };
}
function hitEvent(actorId: string, time: number, age: number, killed = false): ShotEffect {
  return {
    shot: { ...shot('shooter', time), hit: actorId, impact: { origin: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0 }, kind: 'actor', killed } },
    born: 0,
    age,
  };
}
function transforms(object: THREE.Object3D): number[][] {
  const values: number[][] = [];
  object.traverse(node => values.push([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]));
  return values;
}
function resources(gltf: GLTF) {
  const found = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  gltf.scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    found.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) found.add(material);
  });
  const counts = new Map([...found].map(resource => [resource, 0]));
  for (const resource of found) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return counts;
}
function assertDisposed(counts: ReturnType<typeof resources>, count = 1) {
  assert.ok([...counts.values()].every(value => value === count), JSON.stringify([...counts.values()]));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// A source retime must prove the consumer reads the parsed clip duration.
async function retimedEnemy(name: string, scale: number) {
  const source = await sourceBuffer();
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength + 8;
  const bin = Buffer.from(source.subarray(binStart));
  const animation = json.animations.find((entry: { name: string }) => entry.name === name);
  for (const index of new Set<number>(animation.samplers.map((sampler: { input: number }) => sampler.input))) {
    const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    assert.equal(accessor.type, 'SCALAR');
    for (let i = 0; i < accessor.count; i++) {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 4);
      bin.writeFloatLE(bin.readFloatLE(offset) * scale, offset);
    }
    accessor.min = accessor.min.map((n: number) => n * scale);
    accessor.max = accessor.max.map((n: number) => n * scale);
  }
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
  encoded.copy(padded);
  const result = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20);
  const binHeader = 20 + padded.length;
  result.writeUInt32LE(bin.length, binHeader); result.writeUInt32LE(0x004e4942, binHeader + 4); bin.copy(result, binHeader + 8);
  return new GLTFLoader().parseAsync(arrayBuffer(result), '');
}

test('accepted source bytes are exactly the training character GLB', async () => {
  const bytes = await sourceBuffer();
  assert.equal(bytes.byteLength, TRAINING_CHARACTER_SOURCE.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), TRAINING_CHARACTER_SOURCE.sha256);
  assert.equal(await sha256Hex(arrayBuffer(bytes)), TRAINING_CHARACTER_SOURCE.sha256);
  assert.ok(decodeURIComponent(new URL(TRAINING_CHARACTER_SOURCE.url).pathname).endsWith('/assets/content-set/enemy-relay-guard.glb'));
  assert.equal(TRAINING_CHARACTER_SOURCE.sourceCommit, 'b198df62a56f4c520716fbc9cb4afac47dd62213');
});

test('real GLB loads with its five rigid clips and source durations', async () => {
  const gltf = await accepted();
  try {
    const character = new TrainingCharacter(gltf);
    assert.deepEqual([...character.clipDurations.keys()], [...TRAINING_CLIPS]);
    const expected = { idle: 4, walk: .9, fire: .12, hit: .18, death: .6 };
    for (const [name, duration] of Object.entries(expected)) assert.ok(Math.abs(character.clipDurations.get(name)! - duration) < 1e-6, name);
    for (const name of ['enemy-root', 'spine', 'head', 'leg-l', 'leg-r', 'weapon']) trainingNode(character.scene, name);
    let skinned = false;
    gltf.scene.traverse(node => { if (node instanceof THREE.SkinnedMesh) skinned = true; });
    assert.equal(skinned, false);
    character.detach();
  } finally {
    disposeTrainingCharacter(gltf.scene);
  }
});

test('fetch loader verifies the response and the accepted bytes', async () => {
  const bytes = await sourceBuffer();
  const signal = new AbortController().signal;
  const gltf = await loadTrainingCharacter(signal, async () => new Response(arrayBuffer(bytes)));
  try {
    assert.deepEqual([...new TrainingCharacter(gltf).clipDurations.keys()], [...TRAINING_CLIPS]);
  } finally { disposeTrainingCharacter(gltf.scene); }
  await assert.rejects(loadTrainingCharacter(signal, async () => new Response('', { status: 404 })), /HTTP 404/);
  await assert.rejects(loadTrainingCharacter(signal, async () => new Response(new Uint8Array(bytes.length))), /integrity mismatch/);
});

test('bad hash, wrong size, missing clip and overlong hit/death fail closed', async () => {
  const good = arrayBuffer(await sourceBuffer());
  const tampered = good.slice(0);
  const bytes = new Uint8Array(tampered);
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
  await assert.rejects(parseTrainingCharacter(tampered), /integrity mismatch/);
  await assert.rejects(parseTrainingCharacter(good.slice(0, 100)), /expected 40388 bytes/);

  const missing = await rawGltf();
  try {
    missing.animations = missing.animations.filter(clip => clip.name !== 'walk');
    assert.throws(() => new TrainingCharacter(missing), /Missing rigid clip walk/);
  } finally { disposeTrainingCharacter(missing.scene); }

  for (const name of ['hit', 'death'] as const) {
    const overlong = await rawGltf();
    try {
      overlong.animations.find(clip => clip.name === name)!.duration = RESULT_HOLD_MS / 1000 + .1;
      assert.throws(() => new TrainingCharacter(overlong), /exceeds Feedback retention/);
    } finally { disposeTrainingCharacter(overlong.scene); }
  }
});

test('one world-Z reflection and crouch scale match the current procedural target', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    for (const yaw of [0, .73, Math.PI / 2, Math.PI, -2.1]) for (const crouch of [false, true]) {
      a.yaw = yaw; a.input.crouch = crouch;
      character.pose(s, a, [], true);
      character.mount.updateMatrixWorld(true);
      const expected = targetVertices(a, 0).map(([x, y, z]) => new THREE.Vector3(x, y, -z));
      let compared = 0;
      character.scene.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const position = node.geometry.getAttribute('position');
        for (let index = 0; index < position.count; index++) {
          const point = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)).applyMatrix4(node.matrixWorld);
          assert.ok(expected.some(value => value.distanceTo(point) < .00006), `mapped vertex ${point.toArray()}`);
          compared++;
        }
      });
      assert.ok(compared > 0);
    }
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('priority is death > hit > fire > walk > idle', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    s.time = .05 * SECOND; a.input.z = 1;
    assert.equal(character.selectMotion(s, a, [])!.clip, 'walk');
    s.shots = [shot(a.id, 0)];
    assert.equal(character.selectMotion(s, a, [])!.clip, 'fire');
    const hit = hitEvent(a.id, 0, 50);
    assert.equal(character.selectMotion(s, a, [hit])!.clip, 'hit');
    const death = hitEvent(a.id, 0, 50, true);
    assert.equal(character.selectMotion(s, a, [hit, death])!.clip, 'hit');
    a.hp = 0;
    assert.equal(character.selectMotion(s, a, [death])!.clip, 'death');
    a.hp = 100; a.input.z = 0; s.shots = [];
    assert.equal(character.selectMotion(s, a, [])!.clip, 'idle');
    a.velocity = { x: 0, z: 2 };
    assert.equal(character.selectMotion(s, a, [])!.clip, 'walk');
    a.velocity = { x: 0, z: 0 };
    assert.equal(character.selectMotion(s, a, [])!.clip, 'idle');
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('live hit and fire read simulation age, not a supplied presentation tail', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    s.time = .06 * SECOND; a.input.z = 1;
    s.shots = [shot(a.id, 0)];
    const hit = hitEvent(a.id, 0, 640);
    assert.equal(character.selectMotion(s, a, [hit])!.seconds, .06);
    s.time = .1 * SECOND;
    assert.equal(character.selectMotion(s, a, [hit])!.clip, 'hit');
    assert.equal(character.selectMotion(s, a, [hit])!.seconds, .1);
    assert.equal(character.selectMotion(s, a, [])!.clip, 'fire');
    s.time = .2 * SECOND;
    assert.equal(character.selectMotion(s, a, [hit])!.clip, 'walk');
    assert.equal(character.selectMotion(s, a, [])!.clip, 'walk');
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('fire duration is read from the retimed GLB clip, not a copied constant', async () => {
  const gltf = await retimedEnemy('fire', 2), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    s.time = .18 * SECOND; s.shots = [shot(a.id, 0)];
    assert.equal(character.selectMotion(s, a, [])!.clip, 'fire');
    character.pose(s, a, [], true);
    const expected = gltf.animations.find(clip => clip.name === 'fire')!.tracks.find(track => track.name === 'weapon.quaternion')!
      .InterpolantFactoryMethodLinear().evaluate(.18);
    const actual = trainingNode(character.scene, 'weapon').quaternion.toArray();
    actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-7));
    s.time = .25 * SECOND;
    assert.equal(character.selectMotion(s, a, [])!.clip, 'idle');
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('actual walk, fire and hit tracks are sampled at the selected ages', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    const compare = (clip: string, name: string, seconds: number) => {
      const track = gltf.animations.find(value => value.name === clip)!.tracks.find(value => value.name === `${name}.quaternion`)!;
      const expected = track.InterpolantFactoryMethodLinear().evaluate(seconds);
      const actual = trainingNode(character.scene, name).quaternion.toArray();
      actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-7, `${clip} ${name} ${index}`));
      return actual;
    };

    a.input.z = 1; s.time = .3 * SECOND;
    character.pose(s, a, [], true);
    for (const leg of ['leg-l', 'leg-r']) assert.ok(Math.hypot(...compare('walk', leg, .3)) > 1e-4);

    a.input.z = 0; s.time = .06 * SECOND; s.shots = [shot(a.id, 0)];
    character.pose(s, a, [], true);
    compare('fire', 'weapon', .06);

    s.shots = []; s.time = .09 * SECOND;
    const hit = hitEvent(a.id, 0, 90);
    character.pose(s, a, [hit], true);
    compare('hit', 'spine', .09);
    compare('hit', 'head', .09);

    s.time = .2 * SECOND;
    character.pose(s, a, [hit], true);
    compare('idle', 'head', .2);
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

const duel: PlayerSpec[] = [
  { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } },
  { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } },
];

test('settled death advances on the existing Feedback tail after simulation stops, then expires without replay', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  const game = await Game.create(1, duel), feedback = new Feedback();
  try {
    game.step([{ actorId: 'a', type: 'shoot', yaw: 0, pitch: 0, at: 500 }]);
    for (let frame = 0; frame < 30; frame++) game.step();
    game.step([{ actorId: 'a', type: 'shoot', yaw: 0, pitch: 0, at: 999 }]);
    const s = game.state;
    assert.equal(s.phase, 'over');
    const defender = s.actors.find(value => value.id === 'd')!;
    assert.equal(defender.hp, 0);
    const before = JSON.stringify(s);
    const root = trainingNode(character.scene, 'enemy-root');

    let effects = feedback.update(s, 1000);
    character.pose(s, defender, effects, true);
    const early = root.rotation.x;
    assert.equal(character.mount.visible, true);

    effects = feedback.update(s, 1300);
    character.pose(s, defender, effects, true);
    const late = root.rotation.x;
    assert.ok(late > early, `death tail advanced: ${late} > ${early}`);
    assert.equal(JSON.parse(before).time, JSON.parse(JSON.stringify(s)).time);

    effects = feedback.update(s, 1000 + RESULT_HOLD_MS + 10);
    character.pose(s, defender, effects, true);
    assert.equal(character.mount.visible, false);
    assert.deepEqual(root.quaternion.toArray(), [0, 0, 0, 1]);

    effects = feedback.update(s, 1000 + 2 * RESULT_HOLD_MS);
    character.pose(s, defender, effects, true);
    assert.equal(character.mount.visible, false);
    assert.deepEqual(root.quaternion.toArray(), [0, 0, 0, 1]);
    assert.equal(JSON.stringify(s), before);

    // Next round resets the same instance: the old event cannot leak into it.
    game.nextRound();
    const next = game.state;
    const revived = next.actors.find(value => value.id === 'd')!;
    assert.equal(revived.hp, 100);
    const nextEffects = feedback.update(next, 5000);
    character.pose(next, revived, nextEffects, true);
    assert.equal(character.mount.visible, true);
    assert.equal(character.selectMotion(next, revived, nextEffects)!.clip, 'idle');
    assert.deepEqual(root.quaternion.toArray(), [0, 0, 0, 1]);
  } finally {
    game.dispose();
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('settled nonlethal hit uses the Feedback tail and stops at its loaded duration', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    s.phase = 'over'; s.time = 5 * SECOND;
    const hit = hitEvent(a.id, 0, 60);
    const motion = character.selectMotion(s, a, [hit])!;
    assert.equal(motion.clip, 'hit');
    assert.ok(Math.abs(motion.seconds - .06) < 1e-12);
    hit.age = 179;
    assert.ok(Math.abs(character.selectMotion(s, a, [hit])!.seconds - .179) < 1e-12);
    hit.age = 181;
    assert.equal(character.selectMotion(s, a, [hit])!.clip, 'idle');
    hit.age = RESULT_HOLD_MS;
    assert.equal(character.selectMotion(s, a, [hit])!.clip, 'idle');
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('pose is a pure function of simulation time and presentation age', async () => {
  const gltf = await accepted(), first = new TrainingCharacter(gltf), second = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    a.input.z = 1;
    const hit = hitEvent(a.id, 0, 30);
    for (let frame = 0; frame < 17; frame++) {
      s.time = (frame / 60) * SECOND;
      first.pose(s, a, [], true);
    }
    s.time = 1.1 * SECOND;
    const before = JSON.stringify(s);
    first.pose(s, a, [hit], true);
    const frozen = transforms(first.mount);
    first.pose(s, a, [hit], true);
    assert.deepEqual(transforms(first.mount), frozen);
    second.pose(s, a, [hit], true);
    assert.deepEqual(transforms(first.mount), transforms(second.mount));
    assert.equal(JSON.stringify(s), before);
  } finally {
    first.detach(); second.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('instances share source resources and leave the source palette unchanged', async () => {
  const gltf = await accepted(), first = new TrainingCharacter(gltf), second = new TrainingCharacter(gltf);
  try {
    const templateTransforms = transforms(gltf.scene);
    const materials = new Set<THREE.Material>();
    const colors: { attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; values: number[] }[] = [];
    gltf.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      const color = node.geometry.getAttribute('color');
      if (!color) return;
      const values: number[] = [];
      for (let index = 0; index < color.count; index++) values.push(color.getX(index), color.getY(index), color.getZ(index));
      colors.push({ attribute: color, values });
    });
    assert.ok(materials.size > 0);
    assert.ok(colors.length > 0);

    const a = actor('a', 'amber'), b = actor('b', 'blue');
    first.pose(state(a), a, [], true);
    second.pose(state(b), b, [], true);
    for (const character of [first, second]) {
      character.scene.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) assert.ok(materials.has(material));
      });
    }
    for (const { attribute, values } of colors) {
      const current: number[] = [];
      for (let index = 0; index < attribute.count; index++) current.push(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
      assert.deepEqual(current, values);
    }
    assert.deepEqual(transforms(gltf.scene), templateTransforms);
  } finally {
    first.detach(); second.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('reload and switch have no source clip; presentation falls back without inventing motion', async () => {
  const gltf = await accepted(), character = new TrainingCharacter(gltf);
  try {
    const a = actor(), s = state(a);
    s.time = .05 * SECOND; s.shots = [shot(a.id, 0)];
    assert.equal(character.selectMotion(s, a, [])!.clip, 'fire');
    a.reload = { weapon: 'rifle', end: 2 * SECOND };
    assert.equal(character.selectMotion(s, a, [])!.clip, 'idle');
    a.reload = null; a.weapon = 'pistol';
    assert.equal(character.selectMotion(s, a, [])!.clip, 'idle');
    const names = [...character.clipDurations.keys()];
    for (const missing of ['reload', 'switch']) assert.equal(names.includes(missing), false);
  } finally {
    character.detach();
    disposeTrainingCharacter(gltf.scene);
  }
});

test('owner detaches instances without disposing shared template resources', async () => {
  const gltfs: GLTF[] = [], counts: ReturnType<typeof resources>[] = [];
  const owner = new TrainingCharacterSet(async () => {
    const gltf = await accepted();
    gltfs.push(gltf);
    counts.push(resources(gltf));
    return gltf;
  });
  await owner.start();
  assert.equal(owner.status, 'ready');
  const world = new THREE.Group();
  const a = owner.character('a')!, b = owner.character('b')!;
  world.add(a.mount, b.mount);
  owner.reset();
  assert.equal(world.children.length, 0);
  counts.forEach(count => assertDisposed(count, 0));
  const fresh = owner.character('a')!;
  world.add(fresh.mount);
  owner.dispose();
  owner.dispose();
  assert.equal(world.children.length, 0);
  counts.forEach(count => assertDisposed(count, 1));
  assert.equal(owner.character('a'), null);
  await owner.start();
  assert.equal(owner.status, 'disposed');
});

test('stale, late and post-dispose completions release only their own template', async () => {
  const pending = [deferred<GLTF>(), deferred<GLTF>()];
  let calls = 0;
  const owner = new TrainingCharacterSet(() => pending[calls++]!.promise);
  const first = owner.start(), second = owner.start();
  const gltfs = [await accepted(), await accepted()];
  const counts = gltfs.map(resources);
  pending[1]!.resolve(gltfs[1]!);
  await second;
  assert.equal(owner.status, 'ready');
  pending[0]!.resolve(gltfs[0]!);
  await first;
  assert.equal(owner.status, 'ready');
  assertDisposed(counts[0]!, 1);
  assertDisposed(counts[1]!, 0);
  owner.dispose();
  assertDisposed(counts[1]!, 1);

  const late = deferred<GLTF>();
  const disposing = new TrainingCharacterSet(() => late.promise);
  const waiting = disposing.start();
  disposing.dispose();
  const lateGltf = await accepted(), lateCounts = resources(lateGltf);
  late.resolve(lateGltf);
  await waiting;
  assert.equal(disposing.status, 'disposed');
  assertDisposed(lateCounts, 1);
});

test('load failure and invalid clips keep the procedural representation', async () => {
  const failing = new TrainingCharacterSet(async () => { throw new Error('boom'); });
  await failing.start();
  assert.equal(failing.status, 'fallback');
  assert.match(failing.error!, /boom/);
  assert.equal(failing.character('a'), null);
  failing.dispose();

  const missing = await rawGltf();
  missing.animations = missing.animations.filter(clip => clip.name !== 'walk');
  const counts = resources(missing);
  const invalid = new TrainingCharacterSet(async () => missing);
  await invalid.start();
  assert.equal(invalid.status, 'fallback');
  assert.match(invalid.error!, /Missing rigid clip walk/);
  assert.equal(invalid.character('a'), null);
  assertDisposed(counts, 1);
  invalid.dispose();
  assertDisposed(counts, 1);

  const owner = new TrainingCharacterSet(async (): Promise<GLTF> => accepted());
  await owner.start();
  assert.equal(owner.status, 'ready');
  assert.ok(owner.character('a'));
  owner.dispose();
});
