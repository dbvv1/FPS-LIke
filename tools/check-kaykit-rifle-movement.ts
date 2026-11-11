// CPU-only fixed-source acceptance. Does not load a View, GPU or new asset URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { KAYKIT_LOOP_ACTIONS, KayKitSkinnedCharacter, type KayKitAction } from '../src/render/kaykit-skinned-character.js';
import { syncKayKitRifleAction } from '../src/render/kaykit-game-action.js';
import { Game } from '../src/sim/game.js';
import { SECOND } from '../src/sim/types.js';

export const FIXED_MOVEMENT_INPUTS = {
  Knight: '60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168',
  Med_CombatRanged: '08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d',
  Med_MovementAdvanced: '5d309533953185acc19800ce8d89c13cba8a68986214cb87520496139cf418e2',
} as const;
function transforms(scene: THREE.Object3D) {
  const nodes: unknown[] = [];
  scene.traverse(n => nodes.push([n.name, n.position.toArray(), n.quaternion.toArray(), n.scale.toArray(), n.matrix.toArray(), n.matrixWorld.toArray()]));
  return JSON.stringify(nodes);
}
function skins(scene: THREE.Object3D) {
  const result: THREE.SkinnedMesh[] = [];
  scene.traverse(n => { if (n instanceof THREE.SkinnedMesh) result.push(n); }); return result;
}
export async function checkRifleMovement(directory: string) {
  assert.ok(directory, 'fixed sample directory required');
  async function load(name: keyof typeof FIXED_MOVEMENT_INPUTS) {
    const bytes = await readFile(path.join(directory, `${name}.glb`));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), FIXED_MOVEMENT_INPUTS[name], `${name} fixed source SHA256`);
    return new GLTFLoader().register(() => ({ name: 'cpu-texture-omission', loadTexture: async () => new THREE.Texture() }))
      .parseAsync(Uint8Array.from(bytes).buffer, '');
  }
  const target = await load('Knight'), ranged = await load('Med_CombatRanged'), movement = await load('Med_MovementAdvanced');
  const borrowed = [target, ranged, movement];
  const before = borrowed.map(g => [transforms(g.scene), JSON.stringify(g.animations.map(c => THREE.AnimationClip.toJSON(c)))]);
  const inputs = { character: target.scene, motion: ranged.scene, animations: ranged.animations,
    nativeAnimations: target.animations, rifleMovement: { motion: movement.scene, animations: movement.animations } };
  const actor = new KayKitSkinnedCharacter(inputs), sibling = new KayKitSkinnedCharacter(inputs);
  const siblingRest = transforms(sibling.scene);
  const reference = clone(movement.scene), mixer = new THREE.AnimationMixer(reference);
  const clip = movement.animations.find(c => c.name === KAYKIT_LOOP_ACTIONS['run-rifle'])!;
  const refAction = mixer.clipAction(clip.clone()); refAction.setLoop(THREE.LoopOnce, 1); refAction.clampWhenFinished = true;
  let samples = 0, vertices = 0, maxMatrixError = 0, maxSkinError = 0, maxLoopSeam = 0;
  let sourceRootMotion = 0;
  let gameMovementSamples = 0;
  const gameSpeeds: number[] = [];
  // Joint landmarks are measurements, not inferred sole contact or a stride.
  const footTrajectories = Object.fromEntries(['footl', 'footr', 'toesl', 'toesr']
    .map(name => [name, [] as { time: number; y: number; z: number }[]]));
  const start = new Map<string, number[]>();
  const boundSkins = skins(actor.scene);
  assert.equal(boundSkins.length, 6);
  try {
    const phases = [...Array.from({ length: Math.ceil(clip.duration * 60) + 1 }, (_, i) => Math.min(i / 60 / clip.duration, 1)), 0, 1, .25, .75, 0];
    for (const phase of phases) {
      actor.sample('run-rifle', phase);
      mixer.stopAllAction(); refAction.reset().play(); mixer.update(clip.duration * phase); reference.updateMatrixWorld(true);
      for (const name of new Set(clip.tracks.map(t => THREE.PropertyBinding.parseTrackName(t.name).nodeName))) {
        const expected = reference.getObjectByName(name)!, actual = actor.scene.getObjectByName(name === 'Rig_Medium' ? 'Rig' : name)!;
        actual.matrixWorld.elements.forEach((value, i) => { maxMatrixError = Math.max(maxMatrixError, Math.abs(value - expected.matrixWorld.elements[i]!)); });
        if (phase === 0) start.set(name, expected.matrixWorld.toArray());
        if (phase === 1) expected.matrixWorld.elements.forEach((v, i) => { maxLoopSeam = Math.max(maxLoopSeam, Math.abs(v - start.get(name)![i]!)); });
        if (name === 'root' && start.has(name)) sourceRootMotion = Math.max(sourceRootMotion,
          expected.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(start.get(name)!))));
      }
      for (const mesh of boundSkins) {
        const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          const local = mesh.getVertexPosition(vertex, new THREE.Vector3());
          assert.ok(mesh.boundingBox!.clone().expandByScalar(1e-8).containsPoint(local));
          assert.ok(local.distanceTo(mesh.boundingSphere!.center) <= mesh.boundingSphere!.radius + 1e-8);
          const actual = local.clone().applyMatrix4(mesh.matrixWorld), bind = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.bindMatrix);
          const expected = new THREE.Vector3();
          for (let component = 0; component < 4; component++) {
            const weight = weights.getComponent(vertex, component); if (!weight) continue;
            const bone = mesh.skeleton.bones[indices.getComponent(vertex, component)]!;
            expected.addScaledVector(bind.clone().applyMatrix4(mesh.skeleton.boneInverses[indices.getComponent(vertex, component)]!)
              .applyMatrix4(reference.getObjectByName(bone.name)!.matrixWorld), weight);
          }
          maxSkinError = Math.max(maxSkinError, actual.distanceTo(expected)); vertices++;
        }
      }
      samples++;
    }
    // Exact endpoint plus 240 Hz samples. Use a separate pass so repeated and
    // rewind checks above cannot accidentally become a locomotion trajectory.
    for (let i = 0, count = Math.ceil(clip.duration * 240); i <= count; i++) {
      const time = clip.duration * i / count;
      actor.sample('run-rifle', i / count);
      for (const [name, trajectory] of Object.entries(footTrajectories)) {
        const node = actor.scene.getObjectByName(name);
        assert.ok(node, `fixed foot landmark missing: ${name}`);
        const point = node.getWorldPosition(new THREE.Vector3());
        trajectory.push({ time, y: point.y, z: point.z });
      }
    }
    assert.ok(maxMatrixError < 1e-6 && maxSkinError < 1e-6, 'fixed source parent/skin contract');
    assert.ok(maxLoopSeam < 1e-6 && sourceRootMotion < 1e-6, 'fixed source loop seam/root displacement');
    for (const seconds of [0, clip.duration, clip.duration * 2.25, clip.duration * 9.75, clip.duration * .25]) {
      actor.sampleLoop('run-rifle', seconds); const pose = transforms(actor.scene);
      actor.sampleLoop('run-rifle', seconds); assert.equal(transforms(actor.scene), pose, 'pause is stable');
      sibling.sample('run-rifle', (seconds % clip.duration) / clip.duration); assert.equal(transforms(actor.scene), transforms(sibling.scene));
    }
    sibling.stop(); assert.equal(transforms(sibling.scene), siblingRest);
    // All existing body clips still sample after movement, and vice versa.
    const actions: KayKitAction[] = ['native-aim-two-hand', 'native-fire-two-hand', 'native-reload-two-hand', 'reload-one-hand', 'reload-two-hand'];
    for (const action of actions) {
      actor.sampleLoop('run-rifle', clip.duration * 3.25); actor.sample(action, .75); sibling.sample(action, .75);
      assert.equal(transforms(actor.scene), transforms(sibling.scene), `switch from run to ${action}`);
    }
    // Actual Rapier-backed Game snapshots drive the actual fixed GLB skin.
    // A direct sample on the sibling independently checks the consumed phase.
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, Math.PI]) {
      const game = await Game.create(17), id = game.state.actors[0]!.id;
      try {
        let previous = game.state;
        game.step([{ actorId: id, type: 'aim', yaw, pitch: 0 },
          { actorId: id, type: 'move', x: Math.sin(yaw), z: Math.cos(yaw) }]);
        const first = [previous, game.state] as const;
        for (let i = 0; i < 12; i++) {
          const current = game.state, hash = game.stateHash;
          const input = JSON.stringify([previous, current]);
          syncKayKitRifleAction(actor, current, id, previous); assert.equal(actor.currentAction, 'run-rifle');
          sibling.sample('run-rifle', ((current.time / SECOND) % clip.duration) / clip.duration);
          assert.equal(transforms(actor.scene), transforms(sibling.scene));
          const pose = transforms(actor.scene); syncKayKitRifleAction(actor, current, id, previous);
          assert.equal(transforms(actor.scene), pose); assert.equal(game.stateHash, hash);
          assert.equal(JSON.stringify([previous, current]), input);
          const oldActor = previous.actors.find(a => a.id === id)!, newActor = current.actors.find(a => a.id === id)!;
          gameSpeeds.push(Math.hypot(newActor.position.x - oldActor.position.x, newActor.position.z - oldActor.position.z)
            / ((current.time - previous.time) / SECOND));
          previous = current; game.step(); gameMovementSamples++;
        }
        syncKayKitRifleAction(actor, first[1], id, first[0]); assert.equal(actor.currentAction, 'run-rifle');
        game.step([{ actorId: id, type: 'move', x: 0, z: 0 }]);
        syncKayKitRifleAction(actor, game.state, id); assert.equal(actor.currentAction, 'native-aim-two-hand');
        game.step([{ actorId: id, type: 'shoot', yaw, pitch: 0 }]);
        syncKayKitRifleAction(actor, game.state, id); assert.equal(actor.currentAction, 'native-fire-two-hand');
        game.step([{ actorId: id, type: 'reload' }]);
        syncKayKitRifleAction(actor, game.state, id); assert.equal(actor.currentAction, 'native-reload-two-hand');
      } finally { game.dispose(); }
    }
    actor.stop(); sibling.stop();
    assert.deepEqual(borrowed.map(g => [transforms(g.scene), JSON.stringify(g.animations.map(c => THREE.AnimationClip.toJSON(c)))]), before);
  } finally { actor.dispose(); sibling.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(reference); }
  return { inputs: FIXED_MOVEMENT_INPUTS, sourceClip: clip.name, durationSeconds: clip.duration, tracks: clip.tracks.length,
    samples, vertices, maxMatrixError, maxSkinError, maxLoopSeam, sourceRootMotion, gameMovementSamples,
    locomotionCalibration: {
      gameSpeedMetersPerSecond: { min: Math.min(...gameSpeeds), max: Math.max(...gameSpeeds) },
      estimatedTravelPerSourceCycleAtConstantSpeedMeters: { min: Math.min(...gameSpeeds) * clip.duration, max: Math.max(...gameSpeeds) * clip.duration },
      landmarks: Object.fromEntries(Object.entries(footTrajectories).map(([name, points]) => [name, summarizeTrajectory(points)])),
      contactIdentified: false, strideCalibrated: false, playbackRateChanged: false,
    },
    textureDecoded: false, viewConnected: false, browser: false, weaponContactVerified: false };
}
/** Finite chronological landmark samples, not a ground-contact classifier. */
export function summarizeTrajectory(points: readonly { time: number; y: number; z: number }[]) {
  assert.ok(points.length >= 2, 'two trajectory samples required');
  const velocities: number[] = [];
  for (const [i, p] of points.entries()) {
    assert.ok([p.time, p.y, p.z].every(Number.isFinite), 'finite trajectory required');
    if (i) {
      const previous = points[i - 1]!;
      assert.ok(p.time > previous.time, 'strictly increasing trajectory times required');
      velocities.push((p.z - previous.z) / (p.time - previous.time));
    }
  }
  return { samples: points.length, durationSeconds: points.at(-1)!.time - points[0]!.time,
    heightMeters: { min: Math.min(...points.map(p => p.y)), max: Math.max(...points.map(p => p.y)) },
    sourceZSweepMeters: Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)),
    sourceZVelocityMetersPerSecond: { min: Math.min(...velocities), max: Math.max(...velocities) } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) { console.error('Usage: node --import tsx tools/check-kaykit-rifle-movement.ts <fixed-sample-directory>'); process.exitCode = 2; }
  else console.log(JSON.stringify(await checkRifleMovement(process.argv[2])));
}
