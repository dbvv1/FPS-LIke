import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { CONTENT_PIECES, ContentRifle, ContentOpponent, ContentSetAssets, contentNode, contentSetEnabled, contentSetDiagnostics, CONTENT_SOURCE, disposeContent, excludeMergedSleeve, loadContentPiece, type ContentPiece } from '../src/render/content-set-assets.js';
import { weaponParts, weaponPartPosition, weaponPose, weaponMesh } from '../src/render/weapon.js';
import { targetVertices, targetSource } from '../src/render/target.js';
import { SECOND, type Actor, type GameState, type Shot } from '../src/sim/types.js';

async function bytes(id: ContentPiece) { return readFile(new URL(`../assets/content-set/${id}.glb`, import.meta.url)); }
async function load(id: ContentPiece) {
  const b = await bytes(id);
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
}
function actor(id = 'bot'): Actor {
  return { id, team: 'blue', side: 'defend', hp: 100, position: { x: 2, y: .2, z: -3 }, yaw: 0, pitch: 0,
    input: { x: 0, z: 0, walk: false, crouch: false, interact: false }, weapon: 'rifle', reload: null,
    weapons: { rifle: { ammo: 24, reserve: 48, shots: 0, lastShot: -100000 }, pistol: { ammo: 12, reserve: 24, shots: 0, lastShot: -100000 } },
    nextShot: 0, nextFootstep: 0, bot: 'normal' };
}
function state(a = actor()): GameState {
  return { seed: 1, random: 1, tick: 0, time: 0, round: 1, roundEndsAt: 70 * SECOND, phase: 'live', score: { amber: 0, blue: 0 },
    actors: [a], bomb: { carrier: null, position: { x: 0, y: 0, z: 0 }, planted: false, explodeAt: null }, interaction: null,
    result: null, shots: [], sounds: [], soundSequence: 0 };
}
function shot(a: Actor, time: number): Shot {
  return { actorId: a.id, weapon: a.weapon, time, yaw: 0, pitch: 0, hit: null, part: null, damage: 0, visible: true, targetId: null, targetVisible: false };
}
function transforms(object: THREE.Object3D) {
  const values: number[][] = [];
  object.traverse(node => values.push([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]));
  return values;
}
function resources(gltf: GLTF) {
  const found = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  gltf.scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    found.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) found.add(mat);
  });
  const counts = new Map([...found].map(resource => [resource, 0]));
  for (const resource of found) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return counts;
}
function assertDisposed(counts: ReturnType<typeof resources>, count = 1) { assert.ok([...counts.values()].every(n => n === count), JSON.stringify([...counts.values()])); }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('opt-in is exact and singular; original default and malformed values stay off', () => {
  for (const value of ['', '?contentSet=0', '?contentSet=characters-v2', '?contentSet=characters-v1&contentSet=characters-v1', '?contentSet=characters-v1&contentSet=off']) assert.equal(contentSetEnabled(value), false);
  assert.equal(contentSetEnabled('?contentSet=characters-v1'), true);
  const owner = new ContentSetAssets(() => { throw new Error('default must not request GLBs'); });
  assert.equal(owner.status, 'off'); owner.dispose(); assert.equal(owner.status, 'disposed');
});

test('runtime GLBs are exactly the accepted source bytes, not regenerated variants', async () => {
  for (const id of Object.keys(CONTENT_PIECES) as ContentPiece[]) {
    const b = await bytes(id); assert.equal(b.byteLength, CONTENT_PIECES[id].bytes);
    assert.equal(createHash('sha256').update(b).digest('hex'), CONTENT_PIECES[id].sha256);
  }
});

test('real loader validates integrity/scene extras, handles HTTP/abort/corrupt source', async t => {
  const good = await bytes('fp-arms-rx24');
  t.mock.method(globalThis, 'fetch', async () => new Response(good));
  const controller = new AbortController();
  const gltf = await loadContentPiece('fp-arms-rx24', controller.signal);
  assert.equal(gltf.scene.userData.id, 'fp-arms-rx24'); disposeContent(gltf.scene);
  controller.abort(); await assert.rejects(loadContentPiece('fp-arms-rx24', controller.signal));
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(good.length)));
  await assert.rejects(loadContentPiece('fp-arms-rx24', new AbortController().signal), /integrity/);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  await assert.rejects(loadContentPiece('fp-arms-rx24', new AbortController().signal), /HTTP 404/);
});

test('suffixed stable node names work; ambiguous matching fails closed', async () => {
  const gltf = await load('fp-arms-rx24');
  try {
    for (const name of ['rx24-root', 'rifle-static', 'rifle-magazine', 'rifle-bolt', 'support-hand', 'trigger-hand', 'muzzle', 'grip']) contentNode(gltf.scene, name).name += '_1';
    const rifle = new ContentRifle(gltf); assert.equal(rifle.root.name, 'rx24-root_1');
    const duplicate = new THREE.Object3D(); duplicate.name = 'muzzle'; gltf.scene.add(duplicate);
    assert.throws(() => contentNode(gltf.scene, 'muzzle'), /expected one/);
  } finally { disposeContent(gltf.scene); }
});

test('merged sleeve exclusion preserves every non-sleeve triangle and exact sleeve boundary', async () => {
  const gltf = await load('fp-arms-rx24');
  try {
    for (const prefix of ['support', 'trigger']) {
      const mesh = contentNode(gltf.scene, `${prefix}-hand`) as THREE.Mesh;
      const positions = mesh.geometry.getAttribute('position'), before = Array.from(positions.array);
      const count = positions.count;
      assert.equal(excludeMergedSleeve(mesh, `${prefix}-sleeve`), 140);
      assert.equal(mesh.geometry.index!.count, count - 420);
      assert.deepEqual(Array.from(positions.array), before, 'accepted vertex payload is unchanged');
      const kept = new Set(Array.from(mesh.geometry.index!.array));
      const part = weaponParts('rifle').find(p => p.id === `${prefix}-sleeve`)!;
      const sleeve = weaponMesh(part).vertices.map(p => p.map((n, axis) => n + part.position[axis]!));
      for (let i = 0; i < count; i++) if (!kept.has(i)) {
        const p = [positions.getX(i) + mesh.position.x, positions.getY(i) + mesh.position.y, positions.getZ(i) + mesh.position.z];
        assert.ok(sleeve.some(expected => expected.every((n, axis) => Math.abs(n - p[axis]!) < 1e-7)), 'only proven source sleeve vertices are excluded');
      }
    }
  } finally { disposeContent(gltf.scene); }
});

test('sleeve mask rejects changed transforms, near precision mutation and duplicate triangles without partial draw changes', async () => {
  for (const mutation of ['transform', 'precision', 'duplicate'] as const) {
    const gltf = await load('fp-arms-rx24');
    try {
      const mesh = contentNode(gltf.scene, 'support-hand') as THREE.Mesh;
      const position = mesh.geometry.getAttribute('position');
      if (mutation === 'transform') mesh.position.x += .01;
      else {
        // First sleeve follows the 80-triangle palm in this fixed source. Find
        // a sleeve vertex by its source location instead of relying on order.
        const original = position.clone();
        excludeMergedSleeve(mesh, 'support-sleeve');
        const kept = new Set(Array.from(mesh.geometry.index!.array));
        const removed = Array.from({ length: position.count }, (_, i) => i).find(i => !kept.has(i))!;
        mesh.geometry.setIndex(null);
        if (mutation === 'precision') for (let k = 0; k < 3; k++) position.setX(removed + k, position.getX(removed + k) + .000001);
        else for (let k = 0; k < 3; k++) position.setXYZ(0 + k, original.getX(removed + k), original.getY(removed + k), original.getZ(removed + k));
      }
      assert.throws(() => excludeMergedSleeve(mesh, 'support-sleeve'), /mismatch|duplicate/);
      assert.equal(mesh.geometry.index, null, 'failure never installs a partial mask');
    } finally { disposeContent(gltf.scene); }
  }
});

test('rifle root never doubles recoil; support/magazine/bolt use existing procedural pose and reset on switch/reload cancellation', async () => {
  const gltf = await load('fp-arms-rx24'), rifle = new ContentRifle(gltf), a = actor('player'), s = state(a);
  try {
    const palm = weaponParts('rifle').find(p => p.id === 'support-palm')!;
    const magazine = contentNode(gltf.scene, 'rifle-magazine'), bolt = contentNode(gltf.scene, 'rifle-bolt');
    const restMag = magazine.position.clone(), restBolt = bolt.position.clone();
    for (const time of [0, .03, .16, .4, 1.2, .03, 0]) {
      s.time = time * SECOND; s.shots = [shot(a, 0)]; a.reload = time > .15 ? { weapon: 'rifle', end: 1.9 * SECOND } : null;
      const pose = weaponPose(s, a); rifle.pose(pose);
      assert.deepEqual(rifle.root.position.toArray(), [0, 0, 0]); assert.deepEqual(rifle.root.quaternion.toArray(), [0, 0, 0, 1]);
      assert.ok(magazine.position.distanceTo(restMag.clone().add(new THREE.Vector3(0, -pose.magazine * .18, 0))) < 1e-12);
      assert.ok(bolt.position.distanceTo(restBolt.clone().add(new THREE.Vector3(0, 0, pose.bolt * .065))) < 1e-12);
      assert.ok(contentNode(gltf.scene, 'support-hand').position.distanceTo(new THREE.Vector3(...weaponPartPosition(palm, pose))) < 1e-12);
    }
    a.reload = null; a.weapon = 'pistol'; rifle.pose(weaponPose(s, a));
    assert.deepEqual(magazine.position.toArray(), restMag.toArray()); assert.deepEqual(bolt.position.toArray(), restBolt.toArray());
  } finally { disposeContent(gltf.scene); }
});

test('opponent rest placement preserves yaw and crouch within accepted pivot rounding (0.06 mm)', async () => {
  const gltf = await load('enemy-relay-guard'), opponent = new ContentOpponent(gltf), a = actor(), s = state(a);
  try {
    for (const yaw of [0, .73, Math.PI / 2, Math.PI, -2.1]) for (const crouch of [false, true]) {
      a.yaw = yaw; a.input.crouch = crouch; opponent.pose(s, a, [], true); opponent.mount.updateMatrixWorld(true);
      const expected = targetVertices(a, 0).map(([x, y, z]) => new THREE.Vector3(x, y, -z));
      opponent.scene.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const p = node.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const point = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(node.matrixWorld);
          assert.ok(expected.some(v => v.distanceTo(point) < .00006), `mapped vertex ${point.toArray()}`);
        }
      });
    }
    assert.equal(targetSource.aimForward[2], 1);
  } finally { opponent.detach(); disposeContent(gltf.scene); }
});

test('rigid clips are deterministic absolute samples; hit/death/respawn and rewind do not accumulate or mutate gameplay', async () => {
  const gltf = await load('enemy-relay-guard'), current = new ContentOpponent(gltf), direct = new ContentOpponent(gltf), a = actor(), s = state(a);
  try {
    for (const seconds of [1.1, .3, 4.12, .03, 0]) {
      s.time = seconds * SECOND; a.input.z = seconds ? 1 : 0; s.shots = [shot(a, s.time - .03 * SECOND)];
      const before = JSON.stringify(s); current.pose(s, a, [], true); direct.pose(s, a, [], true);
      assert.deepEqual(transforms(current.mount), transforms(direct.mount)); assert.equal(JSON.stringify(s), before);
      const paused = transforms(current.mount); current.pose(s, a, [], true); assert.deepEqual(transforms(current.mount), paused);
    }
    const hit: Shot = { ...shot(actor('player'), 0), hit: a.id, impact: { origin: a.position, end: a.position, kind: 'actor', killed: true } };
    a.hp = 0; a.input.crouch = true; current.pose(s, a, [{ shot: hit, born: 0, age: 350 }], true);
    assert.ok(contentNode(current.scene, 'enemy-root').rotation.x > .8);
    a.hp = 100; a.input.crouch = false; a.input.z = 0; s.shots = []; s.time = 0; s.round++;
    current.pose(s, a, [], true); direct.pose(s, a, [], true);
    assert.deepEqual(transforms(current.mount), transforms(direct.mount));
    assert.deepEqual(contentNode(current.scene, 'enemy-root').quaternion.toArray(), [0, 0, 0, 1]);
  } finally { current.detach(); direct.detach(); disposeContent(gltf.scene); }
});

test('owner reset removes instances but preserves resources, final teardown disposes shared resources exactly once', async () => {
  const loaded: GLTF[] = []; const counts: ReturnType<typeof resources>[] = [];
  const owner = new ContentSetAssets(async id => { const gltf = await load(id); loaded.push(gltf); counts.push(resources(gltf)); return gltf; });
  await owner.start(); assert.equal(owner.status, 'ready');
  const world = new THREE.Group(), a = owner.actor('a')!, b = owner.actor('b')!;
  world.add(a.mount, b.mount); owner.reset(); assert.equal(world.children.length, 0);
  counts.forEach(count => assertDisposed(count, 0));
  const fresh = owner.actor('a')!; assert.notEqual(fresh, a); world.add(fresh.mount);
  owner.dispose(); owner.dispose(); assert.equal(world.children.length, 0); counts.forEach(count => assertDisposed(count));
  assert.equal(owner.actor('a'), null); await owner.start(); assert.equal(owner.status, 'disposed');
});

test('obsolete generations and post-dispose completion release every late asset without attaching', async () => {
  const pending = [deferred<GLTF>(), deferred<GLTF>(), deferred<GLTF>(), deferred<GLTF>()]; let requests = 0;
  const owner = new ContentSetAssets((_id, _signal) => pending[requests++]!.promise);
  const first = owner.start(), second = owner.start();
  const gltfs = await Promise.all(['fp-arms-rx24', 'enemy-relay-guard', 'fp-arms-rx24', 'enemy-relay-guard'].map(id => load(id as ContentPiece)));
  const counts = gltfs.map(resources);
  pending[2]!.resolve(gltfs[2]!); pending[3]!.resolve(gltfs[3]!); await second; assert.equal(owner.status, 'ready');
  pending[0]!.resolve(gltfs[0]!); pending[1]!.resolve(gltfs[1]!); await first;
  assert.equal(owner.status, 'ready'); counts.slice(0, 2).forEach(count => assertDisposed(count));
  counts.slice(2).forEach(count => assertDisposed(count, 0)); owner.dispose(); counts.forEach(count => assertDisposed(count));
  const late = deferred<GLTF>(), other = deferred<GLTF>(); let i = 0;
  const disposed = new ContentSetAssets(() => [late, other][i++]!.promise); const waiting = disposed.start(); disposed.dispose();
  const lateGltfs = await Promise.all([load('fp-arms-rx24'), load('enemy-relay-guard')]), lateCounts = lateGltfs.map(resources);
  late.resolve(lateGltfs[0]!); other.resolve(lateGltfs[1]!); await waiting;
  assert.equal(disposed.status, 'disposed'); assert.equal(disposed.rifle, null); lateCounts.forEach(count => assertDisposed(count));
});

test('partial failure aborts sibling, keeps procedural fallback and allows a later successful generation', async () => {
  const gltf = await load('fp-arms-rx24'), counts = resources(gltf); let aborted = false;
  const owner = new ContentSetAssets(async (id, signal) => {
    signal.addEventListener('abort', () => { aborted = true; });
    if (id === 'enemy-relay-guard') throw new Error('unavailable');
    return gltf;
  });
  await owner.start(); assert.equal(owner.status, 'fallback'); assert.equal(owner.rifle, null); assert.equal(owner.actor('a'), null);
  assert.equal(aborted, true); assert.match(owner.error!, /unavailable/); assertDisposed(counts); owner.dispose(); assertDisposed(counts);
  const retry = new ContentSetAssets(load); await retry.start(); assert.equal(retry.status, 'ready'); retry.dispose();
});

test('invalid second sleeve leaves neither half-installed rifle nor opponent candidate; all loaded resources released', async () => {
  const gltfs = await Promise.all([load('fp-arms-rx24'), load('enemy-relay-guard')]);
  contentNode(gltfs[0]!.scene, 'trigger-hand').position.x += .01;
  const counts = gltfs.map(resources); let i = 0;
  const owner = new ContentSetAssets(async () => gltfs[i++]!);
  await owner.start(); assert.equal(owner.status, 'fallback'); assert.equal(owner.rifle, null); assert.equal(owner.actor('a'), null);
  assert.match(owner.error!, /sleeve/); counts.forEach(count => assertDisposed(count)); owner.dispose();
});

test('actual View render path switches atomically, keeps only procedural sleeves, preserves pistol and resets opponents', async () => {
  const { View } = await import('../src/render/scene.js');
  const { Feedback } = await import('../src/render/feedback.js');
  const owner = new ContentSetAssets(load);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(80, 1, .05, 100);
  const weapon = new THREE.Group(), rifle = new THREE.Group(), pistol = new THREE.Group();
  const flash = new THREE.Mesh(new THREE.SphereGeometry(.1), new THREE.MeshBasicMaterial());
  const geometries = new Set<THREE.BufferGeometry>([flash.geometry]), materials = new Set<THREE.Material>([flash.material]);
  weapon.add(rifle, pistol, flash); camera.add(weapon); scene.add(camera);
  let draws = 0;
  // Real View.render with a non-GPU drawing sink: checks the integration path,
  // not pixels, WebGL allocation, browser smoke or visual quality.
  const view: InstanceType<typeof View> = Object.assign(Object.create(View.prototype), {
    renderer: { render() { draws++; }, dispose() {}, info: { memory: {}, render: { calls: 0 } } },
    content: owner, scene, camera, weapon, rifle, pistol, flash, bomb: new THREE.Group(), feedback: new Feedback(),
    impacts: [], actors: new Map(), geometries, materials, textures: new Set(),
  });
  Reflect.get(view, 'makeWeapon').call(view, rifle, false); Reflect.get(view, 'makeWeapon').call(view, pistol, true);
  const player = actor('player'); player.team = 'amber'; const enemy = actor('bot'); const s = state(player); s.actors.push(enemy);
  try {
    view.render(s, player, 0, 0, 0, 0); assert.ok(rifle.children.every(part => part.visible));
    const fallback = Reflect.get(view, 'actors').get(enemy.id) as THREE.Mesh;
    assert.equal(fallback.visible, true);
    const loading = owner.start(); view.render(s, player, 0, 0, 0, 0); assert.ok(rifle.children.every(part => part.visible));
    await loading; assert.equal(owner.status, 'ready');
    assert.equal(view.info.contentSet?.active, false, 'loaded is not yet render-path adoption');
    const before = JSON.stringify(s); view.render(s, player, 0, 0, 0, 0);
    assert.equal(JSON.stringify(s), before); assert.equal(fallback.visible, false);
    assert.equal(view.info.contentSet?.active, true, 'actual View render has completed');
    assert.deepEqual(rifle.children.filter(part => part.visible).map(part => part.userData.part.id).sort(), ['support-sleeve', 'trigger-sleeve']);
    assert.equal(owner.rifle!.scene.parent, weapon); assert.equal(owner.rifle!.scene.visible, true);
    const contentActor = owner.actor(enemy.id)!; assert.equal(contentActor.mount.parent, scene);
    player.weapon = 'pistol'; view.render(s, player, .2, -.1, 0, 0);
    assert.equal(rifle.visible, false); assert.equal(owner.rifle!.scene.visible, false); assert.equal(pistol.visible, true);
    assert.ok(pistol.children.every(part => part.visible));
    view.reset(); assert.equal(contentActor.mount.parent, null); assert.equal(view.info.contentSet?.active, false);
    player.weapon = 'rifle'; view.render(s, player, 0, 0, 0, 0); assert.notEqual(owner.actor(enemy.id), contentActor);
    player.hp = 0; view.render(s, player, 0, 0, 0, 0); assert.equal(weapon.visible, false);
    assert.ok(draws >= 6);
  } finally { view.dispose(); }
  assert.equal(owner.status, 'disposed');
});


test('candidate diagnostics distinguish loading, active ready and failure fallback; default exposes no candidate identity', () => {
  const query = '?contentSet=characters-v1';
  assert.deepEqual(contentSetDiagnostics('', 'three-webgl2', { contentSet: { status: 'off', error: null } }), {});
  for (const status of ['loading', 'ready', 'fallback', 'disposed']) {
    const error = status === 'fallback' ? 'integrity mismatch' : null;
    const snapshot = contentSetDiagnostics(query, 'three-webgl2', { contentSet: { status, error, active: status === 'ready' } }).contentSet!;
    assert.equal(snapshot.status, status); assert.equal(snapshot.error, error);
    assert.equal(snapshot.active, status === 'ready'); assert.equal(snapshot.sourceCommit, CONTENT_SOURCE);
    assert.deepEqual(snapshot.assets.map(asset => asset.sha256), Object.values(CONTENT_PIECES).map(piece => piece.sha256));
  }
  assert.equal(contentSetDiagnostics(query, 'three-webgl2', { contentSet: { status: 'ready', error: null, active: false } }).contentSet!.active, false, 'loaded before first frame is not active');
  assert.equal(contentSetDiagnostics(query, 'three-webgl2', { contentSet: { status: 'ready', error: null } }).contentSet!.active, false, 'missing adoption evidence is not active');
  const cpu = contentSetDiagnostics(query, 'canvas2d-cpu').contentSet!;
  assert.equal(cpu.status, 'fallback'); assert.equal(cpu.active, false); assert.match(cpu.error!, /WebGL2/);
  const missing = contentSetDiagnostics(query, 'three-webgl2').contentSet!;
  assert.equal(missing.status, 'fallback'); assert.equal(missing.active, false);
});
