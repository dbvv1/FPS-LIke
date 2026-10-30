import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  GUARD_MATERIALS_ID, GUARD_LEG_MIN, GUARD_HIP_MIN, GUARD_TOP,
  GUARD_PALETTES, guardMaterialsEnabled, guardZone, guardColor,
  type GuardFace,
} from '../../src/candidates/offline-training-v1/render/guard-materials.js';
import {
  targetSource, targetTriangles, targetVertices, targetColor,
  targetGuardColor, targetGuardZone,
} from '../../src/candidates/offline-training-v1/render/target.js';
import { lightingEnabled } from '../../src/candidates/offline-training-v1/render/lighting-style.js';
import { artEnabled } from '../../src/candidates/offline-training-v1/render/art-standards.js';
import { aiMaterialsEnabled } from '../../src/candidates/offline-training-v1/render/ai-materials.js';
import { environmentEnabled } from '../../src/candidates/offline-training-v1/render/environment-kit.js';
import { qualityCaptureOptions } from '../../src/candidates/offline-training-v1/capture/quality-route.js';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const meanHeight = (indices: readonly number[]) => indices.reduce((sum, index) => sum + targetSource.vertices[index]![1]!, 0) / indices.length;
const bodyFaces = targetSource.faces.filter(face => face.part === 'body');
const waistFaces = bodyFaces.filter(face => meanHeight(face.indices) >= GUARD_HIP_MIN && meanHeight(face.indices) < GUARD_TOP);
const legFaces = bodyFaces.filter(face => meanHeight(face.indices) >= GUARD_LEG_MIN && meanHeight(face.indices) < GUARD_HIP_MIN);
const face = (height: number, color: number, part = 'body', region = 'detail'): GuardFace => ({ part, region, color, height });

test('guard-materials opt-in is one exact value and does not leak other candidate switches', () => {
  for (const query of [
    '', '?guard-materials=', '?guard-materials=continuous-v1', '?guard-materials=continuous-v2 ',
    '?guard-materials=Continuous-v2', '?guardMaterials=continuous-v2', '?Guard-Materials=continuous-v2',
    '?guard-materials=continuous-v2&guard-materials=continuous-v2',
    '?guard-materials=continuous-v2&guard-materials=other',
  ]) assert.equal(guardMaterialsEnabled(query), false, query);
  for (const query of [
    '?guard-materials=continuous-v2',
    '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&guard-materials=continuous-v2',
  ]) assert.equal(guardMaterialsEnabled(query), true, query);
  assert.equal(GUARD_MATERIALS_ID, 'continuous-v2');

  const onlyGuard = '?guard-materials=continuous-v2';
  assert.equal(environmentEnabled(onlyGuard), false);
  assert.equal(lightingEnabled(onlyGuard), false);
  assert.equal(artEnabled(onlyGuard), false);
  assert.equal(aiMaterialsEnabled(onlyGuard), false);
  const others = '?environment=courtyard-v1&lighting=courtyard-light-v1&art=standards-v1&materials=ai-courtyard-v1';
  assert.equal(guardMaterialsEnabled(others), false);
  const combined = others + '&guard-materials=continuous-v2';
  assert.equal(guardMaterialsEnabled(combined), true);
  assert.equal(environmentEnabled(combined), true);
  assert.equal(lightingEnabled(combined), true);
  assert.equal(artEnabled(combined), true);
  assert.equal(aiMaterialsEnabled(combined), true);
});

test('source waist and leg bands re-verify the job counts before any recolour', () => {
  assert.equal(bodyFaces.length, 439);
  assert.equal(waistFaces.length, 64);
  assert.equal(legFaces.length, 78);
  // The job's waist figure counts all three dark armor shades; the leg figure
  // 26 is the darkest shade alone. Both definitions are pinned here.
  const darkArmor = new Set([0x1c1c1c, 0x222222, 0x2b2b2b]);
  assert.equal(waistFaces.filter(face => darkArmor.has(face.color)).length, 36);
  assert.equal(legFaces.filter(face => face.color === 0x1c1c1c).length, 26);
  assert.equal(legFaces.filter(face => darkArmor.has(face.color)).length, 35);
  // Every body face in the two bands has a semantic zone; nothing else does.
  const bandTriangles = targetTriangles.filter(f => f.part === 'body' && meanHeight(f.indices) >= GUARD_LEG_MIN && meanHeight(f.indices) < GUARD_TOP);
  assert.equal(bandTriangles.length, 142);
  assert.ok(bandTriangles.every(f => targetGuardZone(f) !== null));
  assert.ok(targetTriangles.filter(f => f.part !== 'body').every(f => targetGuardZone(f) === null));
  assert.ok(targetTriangles.filter(f => f.part === 'body' && !bandTriangles.includes(f)).every(f => targetGuardZone(f) === null));
});

test('zone boundaries, materials and overlap priority are explicit', () => {
  // Height boundaries: 0.3 inclusive, 0.8 switches leg to hip, 1.05 exclusive.
  assert.equal(guardZone(face(0.2999, 0x1c1c1c)), null);
  assert.equal(guardZone(face(GUARD_LEG_MIN, 0x1c1c1c)), 'leg-armor');
  assert.equal(guardZone(face(GUARD_HIP_MIN - 1e-6, 0x1c1c1c)), 'leg-armor');
  assert.equal(guardZone(face(GUARD_HIP_MIN, 0x1c1c1c)), 'hip');
  assert.equal(guardZone(face(GUARD_TOP - 1e-6, 0x1c1c1c)), 'hip');
  assert.equal(guardZone(face(GUARD_TOP, 0x1c1c1c)), null);
  // Existing ownership wins before the candidate pass.
  assert.equal(guardZone(face(0.6, 0x1c1c1c, 'weapon')), null);
  assert.equal(guardZone(face(0.6, 0x1c1c1c, 'body', 'helmet')), null);
  assert.equal(guardZone(face(0.6, 0x1c1c1c, 'body', 'carrier')), null);
  // Equipment and cloth read over armor in either band; hip is the armored
  // remainder of the waist band.
  for (const height of [0.5, 0.9]) {
    assert.equal(guardZone(face(height, 0x6b624b)), 'equipment');
    assert.equal(guardZone(face(height, 0xcfaf7c)), 'cloth');
    assert.equal(guardZone(face(height, 0x211d1e)), 'cloth');
    assert.equal(guardZone(face(height, 0x4c4c4c)), height < GUARD_HIP_MIN ? 'leg-armor' : 'hip');
  }
  // Visor and any unlisted source colour keep the default rule.
  assert.equal(guardZone(face(0.9, 0x1f6eb3)), null);
  assert.equal(guardZone(face(0.9, 0x121212)), null);
});

test('candidate reuses the enemy-warm/friendly-cool families and only adds dark cloth', () => {
  const armorShades = [0x1c1c1c, 0x222222, 0x2b2b2b, 0x333333, 0x4c4c4c, 0x5c5c5c, 0x707070];
  for (const shaded of armorShades) for (const friend of [false, true]) {
    assert.equal(guardColor(shaded, friend, 'hip'), targetColor(shaded, friend, 'carrier'));
    assert.equal(guardColor(shaded, friend, 'leg-armor'), targetColor(shaded, friend, 'carrier'));
  }
  for (const friend of [false, true]) {
    // Equipment and bright cloth already had team mappings; the semantic pass
    // must not invent another colour for them.
    assert.equal(guardColor(0x6b624b, friend, 'equipment'), targetColor(0x6b624b, friend));
    assert.equal(guardColor(0xcfaf7c, friend, 'cloth'), targetColor(0xcfaf7c, friend));
    const dark = guardColor(0x211d1e, friend, 'cloth');
    assert.equal(dark, friend ? GUARD_PALETTES.clothDark.friend : GUARD_PALETTES.clothDark.enemy);
    assert.notEqual(dark, 0x211d1e);
    assert.notEqual(dark, guardColor(0x6b624b, friend, 'equipment'));
    assert.notEqual(dark, guardColor(0x1c1c1c, friend, 'hip'));
    assert.notEqual(dark, guardColor(0xcfaf7c, friend, 'cloth'));
  }
  for (const triangle of targetTriangles) {
    const zone = targetGuardZone(triangle);
    if (zone === null) continue;
    assert.notEqual(targetGuardColor(triangle, false), targetGuardColor(triangle, true), zone);
  }
});

test('weapon and blue visor keep source values under every zone', () => {
  for (const triangle of targetTriangles.filter(t => t.part === 'weapon')) {
    assert.equal(targetGuardColor(triangle, false), triangle.color);
    assert.equal(targetGuardColor(triangle, true), triangle.color);
  }
  const visor = targetTriangles.filter(t => t.color === 0x1f6eb3);
  assert.equal(visor.length, 4);
  for (const triangle of visor) for (const friend of [false, true]) {
    assert.equal(targetGuardColor(triangle, friend), 0x1f6eb3);
  }
});

test('default colours, triangles, posed vertices and source asset stay byte-identical', () => {
  assert.equal(sha(JSON.stringify(targetTriangles)), 'ab1b7cc59fd645a9ab745d6a0320c5a7d72474b251c5623c50ab4cae0e34ca73');
  assert.equal(sha(targetTriangles.map(f => targetColor(f.color, false, f.region).toString(16)).join(',')), '9b66e5ecb29eadd15442fa941c29171f336c2296de621658967d7cff4adc2824');
  assert.equal(sha(targetTriangles.map(f => targetColor(f.color, true, f.region).toString(16)).join(',')), '1127947fd0add264e6cb3155dcf6aa71636f0710b1ba6a5412f6acca070de9c8');
  const actor = { position: { x: 1, y: 0, z: -2 }, yaw: 0.7, input: { crouch: undefined } } as unknown as Parameters<typeof targetVertices>[0];
  assert.equal(sha(JSON.stringify(targetVertices(actor, 0.3))), 'd51bddda9b8de075b522aef147f9ec43be60d591c2aacbb569ed826e1535dfcb');
  assert.equal(sha(JSON.stringify(targetSource)), 'd5fed6757cb3040e06ad3665aef51d8dbf5ce64f8bba6160bd171985191dc577');
  assert.equal(sha(readFileSync(new URL('../../assets/characters/relay-guard/guard.json', import.meta.url))), 'c98491a7f98932f0c2d53464e1990f1ca2d10eadde9347b7245d4551630ffea9');
});

test('classification never mutates triangles or posed vertices', () => {
  const snapshot = JSON.stringify(targetTriangles);
  const indices = JSON.stringify(targetTriangles.map(f => f.indices));
  for (const triangle of targetTriangles) targetGuardColor(triangle, false);
  assert.equal(JSON.stringify(targetTriangles), snapshot);
  assert.equal(JSON.stringify(targetTriangles.map(f => f.indices)), indices);
  const actor = { position: { x: 0, y: 0, z: 0 }, yaw: 0.2, input: { crouch: undefined } } as unknown as Parameters<typeof targetVertices>[0];
  assert.deepEqual(targetVertices(actor, 0.4), targetVertices(actor, 0.4));
});

test('fixed-camera capture route keeps its camera and replay contract', () => {
  const route = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1';
  const base = qualityCaptureOptions(route + '&qualityCapture=cross-lane');
  const guarded = qualityCaptureOptions(route + '&qualityCapture=cross-lane&guard-materials=continuous-v2');
  assert.deepEqual(guarded, base);
  assert.equal(guarded?.name, 'cross-lane');
  assert.ok(guarded?.camera);
});

test('normal client and fixed-camera View share one parser and change only actor colours', async () => {
  const THREE = await import('three');
  const { stripTypeScriptTypes } = await import('node:module');
  const ai = await import('../../src/candidates/offline-training-v1/render/ai-materials.js');
  const lighting = await import('../../src/candidates/offline-training-v1/render/lighting-style.js');
  const art = await import('../../src/candidates/offline-training-v1/render/art-standards.js');
  const kit = await import('../../src/candidates/offline-training-v1/render/environment-kit.js');
  const ground = await import('../../src/candidates/offline-training-v1/render/ground.js');
  const yard = await import('../../src/candidates/offline-training-v1/render/yard.js');
  const feedback = await import('../../src/candidates/offline-training-v1/render/feedback.js');
  const target = await import('../../src/candidates/offline-training-v1/render/target.js');
  const guard = await import('../../src/candidates/offline-training-v1/render/guard-materials.js');
  const physics = await import('../../src/candidates/offline-training-v1/sim/physics.js');
  const weapon = await import('../../src/candidates/offline-training-v1/render/weapon.js');
  const coordinates = await import('../../src/candidates/offline-training-v1/render/coordinates.js');
  const { MAP } = await import('../../src/candidates/offline-training-v1/content/map.js');
  const { Game } = await import('../../src/candidates/offline-training-v1/sim/game.js');
  class Renderer {
    domElement = { clientWidth: 640, clientHeight: 360 };
    info = { memory: {}, render: { calls: 0 } };
    setPixelRatio() {} setSize() {} render() {} dispose() {}
  }
  const source = stripTypeScriptTypes(readFileSync(new URL('../../src/candidates/offline-training-v1/render/scene.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export class View', 'class View'));
  const makeView = (search: string) => {
    const deps = { THREE: { ...THREE, WebGLRenderer: Renderer }, ...ai, ...lighting, ...art, ...kit, ...ground, ...yard, ...feedback, ...target, ...guard, ...physics, ...weapon, ...coordinates, MAP, devicePixelRatio: 1, globalThis: { location: { search } } };
    const View = new Function(...Object.keys(deps), `${source};return View;`)(...Object.values(deps)) as new (canvas: unknown) => {
      guard: boolean; info: { guardMaterials: { id: string; active: boolean } }; actors: Map<string, { geometry: { getAttribute(name: string): { array: ArrayLike<number> } } }>;
      render(...args: unknown[]): void; dispose(): void;
    };
    return new View({});
  };
  const off = makeView('?environment=courtyard-v1');
  const on = makeView('?environment=courtyard-v1&guard-materials=continuous-v2');
  assert.deepEqual(off.info.guardMaterials, { id: 'continuous-v2', active: false });
  assert.deepEqual(on.info.guardMaterials, { id: 'continuous-v2', active: true });
  const game = await Game.create(1, [
    { id: 'player', team: 'amber', position: { x: 0, y: 0, z: -16 } },
    { id: 'mate', team: 'amber', position: { x: 1, y: 0, z: -14 } },
    { id: 'foe', team: 'blue', position: { x: -1, y: 0, z: -14 } },
  ]);
  try {
    const state = game.state, player = state.actors.find(actor => actor.id === 'player')!;
    off.render(state, player, 0, 0, 0, 0);
    on.render(state, player, 0, 0, 0, 0);
    for (const id of ['mate', 'foe']) {
      const actor = state.actors.find(item => item.id === id)!;
      const offMesh = off.actors.get(id)!, onMesh = on.actors.get(id)!;
      const offColors = Array.from(offMesh.geometry.getAttribute('color').array);
      const onColors = Array.from(onMesh.geometry.getAttribute('color').array);
      const offPositions = Array.from(offMesh.geometry.getAttribute('position').array);
      const onPositions = Array.from(onMesh.geometry.getAttribute('position').array);
      assert.deepEqual(onPositions, offPositions, 'candidate must not move vertices');
      const friend = actor.team === player.team;
      const expectedOff: number[] = [], expectedOn: number[] = [];
      for (const triangle of targetTriangles) {
        const a = new THREE.Color(targetColor(triangle.color, friend, triangle.region));
        const b = new THREE.Color(targetGuardColor(triangle, friend) as number);
        for (let i = 0; i < 3; i++) {
          expectedOff.push(a.r, a.g, a.b); expectedOn.push(b.r, b.g, b.b);
        }
      }
      assert.deepEqual(offColors, Array.from(new Float32Array(expectedOff)));
      assert.deepEqual(onColors, Array.from(new Float32Array(expectedOn)));
      let changed = 0;
      for (let i = 0; i < onColors.length; i += 9) {
        let differs = false;
        for (let j = 0; j < 9; j++) if (onColors[i + j] !== offColors[i + j]) differs = true;
        if (differs) changed++;
      }
      assert.equal(changed, 113, 'only semantic band faces change; weapon/upper body stay put');
    }
    // The fixed-camera path passes an observer, not another material parser.
    const observer = { position: { x: 0, y: 1.62, z: -16 }, yaw: 0, pitch: 0, fov: 80 };
    const before = Array.from(on.actors.get('foe')!.geometry.getAttribute('color').array);
    on.render(state, player, 0, 0, 0, 0, observer);
    assert.deepEqual(on.info.guardMaterials, { id: 'continuous-v2', active: true });
    assert.deepEqual(Array.from(on.actors.get('foe')!.geometry.getAttribute('color').array), before);
  } finally { game.dispose(); off.dispose(); on.dispose(); }

  const client = readFileSync(new URL('../../src/candidates/offline-training-v1/client.ts', import.meta.url), 'utf8');
  const quality = readFileSync(new URL('../../src/candidates/offline-training-v1/capture/quality-client.ts', import.meta.url), 'utf8');
  assert.match(client, /new View\(canvas\)/);
  assert.match(quality, /new View\(canvas\)/);
  for (const sourceFile of [client, quality]) assert.doesNotMatch(sourceFile, /guard-materials|guardMaterialsEnabled/);
  assert.match(quality, /renderInfo: \{ \.\.\.view\.info/);
});
