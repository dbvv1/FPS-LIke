import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { TrainingCharacterSet, parseTrainingCharacter } from '../../asset-pipeline/training-character-adapter/adapter.js';
import { weaponPose } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { WEAPONS } from '../../src/candidates/offline-training-v1/content/weapons.js';
import { TrainingMatch } from '../../src/candidates/offline-training-v1/session/match.js';
import { squadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { SUBTICKS } from '../../src/candidates/offline-training-v1/sim/types.js';

const sourceBytes = readFileSync(new URL('../../assets/content-set/enemy-relay-guard.glb', import.meta.url));
const load = () => parseTrainingCharacter(Uint8Array.from(sourceBytes).buffer);
const sceneUrl = new URL('../../src/candidates/offline-training-v1/render/scene.ts', import.meta.url);
const sceneSource = readFileSync(sceneUrl, 'utf8');
// Execute the actual View constructor/render/reset/dispose with real Three CPU
// objects and GLTFLoader. The fixture supplies original local asset bytes and
// replaces WebGLRenderer; this is not GPU QA.
async function viewFixture(loader = load) {
  const deps: Record<string, unknown> = { devicePixelRatio: 1 };
  for (const match of sceneSource.matchAll(/^import (.+) from '(.+)';$/gm)) {
    const path = match[2]!;
    if (path === 'three') continue;
    Object.assign(deps, await import(new URL(path.replace(/\.js$/, '.ts'), sceneUrl).href));
  }
  class Renderer {
    info = { memory: {}, render: { calls: 0 } };
    domElement = { clientWidth: 800, clientHeight: 600 };
    disposed = 0;
    setPixelRatio() {} setSize() {} render() { this.info.render.calls++; }
    dispose() { this.disposed++; }
  }
  deps.THREE = { ...THREE, WebGLRenderer: Renderer };
  deps.TrainingCharacterSet = class extends TrainingCharacterSet {
    started: Promise<void> | null = null;
    constructor() { super(loader); }
    override start() { this.started = super.start(); return this.started; }
  };
  const body = stripTypeScriptTypes(sceneSource.replace(/^import .+;\n/gm, '').replace('export class View', 'class View'));
  const View = new Function(...Object.keys(deps), `${body}\nreturn View;`)(...Object.values(deps));
  const view = new View({});
  const settle = async () => { await view.characters.started; };
  return { view, settle };
}
const specs = [{ id: 'player', team: 'amber' as const }, { id: 'ally', team: 'amber' as const }, { id: 'enemy', team: 'blue' as const }];
const draw = (view: any, game: Game, now = 0) => view.render(game.state, game.state.actors.find(actor => actor.id === 'player'), 0, 0, now, 1 / 60);

test('actual training View replaces enemy fallback only after verified GLB loads; reset and dispose own clones', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const { view, settle } = await viewFixture(async () => { await pending; return load(); });
  const game = await Game.create(1, specs, {}, { weaponPresentation: 'generation-v1' });
  try {
    draw(view, game);
    assert.equal(view.info.characters.state, 'loading');
    assert.equal(view.actors.get('enemy').visible, true);
    release(); await settle(); draw(view, game);
    assert.equal(view.info.characters.state, 'ready');
    assert.deepEqual(view.info.characters.activeIds, ['enemy']);
    assert.equal(view.actors.get('enemy').visible, false);
    assert.equal(view.actors.get('ally').visible, true);
    const character = view.characters.character('enemy');
    assert.equal(character.mount.parent, view.scene);
    view.reset(); assert.equal(character.mount.parent, null);
    assert.deepEqual(view.info.characters.activeIds, []);
    draw(view, game);
    assert.notEqual(view.characters.character('enemy'), character);
    assert.deepEqual(view.info.characters.activeIds, ['enemy']);
    view.dispose(); assert.equal(view.info.characters.state, 'disposed');
    assert.deepEqual(view.info.characters.activeIds, []);
  } finally { game.dispose(); view.dispose(); }
});

test('failed source loads preserve actual procedural enemy and a usable training render', async () => {
  const { view, settle } = await viewFixture(async () => { throw new Error('source unavailable'); });
  const game = await Game.create(1, specs);
  try {
    await settle(); draw(view, game);
    assert.equal(view.info.characters.state, 'fallback');
    assert.deepEqual(view.info.characters.activeIds, []);
    assert.equal(view.actors.get('enemy').visible, true);
    assert.equal(view.renderer.info.render.calls, 1);
  } finally { game.dispose(); view.dispose(); }
});

test('late GLB resolution after View disposal cannot attach or revive a character', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let geometryDisposals = 0, materialDisposals = 0;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const { view } = await viewFixture(async () => {
    await pending; const gltf = await load();
    gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    } });
    for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
    for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
    return gltf;
  });
  view.dispose(); release();
  await view.characters.started;
  assert.equal(view.info.characters.state, 'disposed');
  assert.equal(view.characters.character('enemy'), null);
  assert.ok(geometries.size > 0 && materials.size > 0);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
});

test('real Game switching cancels reload and cannot resurrect first-person flash/recoil', async () => {
  const game = await Game.create(1, specs, {}, { weaponPresentation: 'generation-v1' });
  try {
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 0 }]);
    assert.ok(weaponPose(game.state, game.state.actors.find(actor => actor.id === 'player')!).flash > 0);
    game.step([{ actorId: 'player', type: 'reload' }]);
    assert.ok(game.state.actors.find(actor => actor.id === 'player')!.reload);
    game.step([{ actorId: 'player', type: 'switch', weapon: 'pistol' }, { actorId: 'player', type: 'switch', weapon: 'rifle' }]);
    assert.equal(game.state.actors.find(actor => actor.id === 'player')!.reload, null);
    assert.equal(weaponPose(game.state, game.state.actors.find(actor => actor.id === 'player')!).flash, 0);
    assert.equal(weaponPose(game.state, game.state.actors.find(actor => actor.id === 'player')!).kick, 0);
    assert.equal(weaponPose(game.state, game.state.actors.find(actor => actor.id === 'player')!).magazine, 0);
  } finally { game.dispose(); }
});

test('actual rifle and pistol reloads finish with seated magazine, neutral arms and replenished ammo', async () => {
  for (const weapon of ['rifle', 'pistol'] as const) {
    const game = await Game.create(1, specs, {}, { weaponPresentation: 'generation-v1' });
    try {
      if (weapon === 'pistol') game.step([{ actorId: 'player', type: 'switch', weapon }]);
      while (game.state.time < game.state.actors.find(actor => actor.id === 'player')!.nextShot) game.step([]);
      game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 0 }]);
      assert.equal(game.state.shots.length, 1);
      game.step([{ actorId: 'player', type: 'reload' }]);
      const start = game.state.time, end = game.state.actors.find(actor => actor.id === 'player')!.reload!.end;
      let maxMagazine = 0, maxGrasp = 0, maxBolt = 0;
      while (game.state.time <= end && game.state.actors.find(actor => actor.id === 'player')!.reload) {
        game.step([]);
        const pose = weaponPose(game.state, game.state.actors.find(actor => actor.id === 'player')!);
        maxMagazine = Math.max(maxMagazine, pose.magazine);
        maxGrasp = Math.max(maxGrasp, pose.grasp);
        maxBolt = Math.max(maxBolt, pose.bolt);
      }
      assert.ok(game.state.time - start >= WEAPONS[weapon].reload * SUBTICKS - SUBTICKS);
      assert.ok(maxMagazine > .99 && maxGrasp > .99 && maxBolt > .9);
      const actor = game.state.actors.find(actor => actor.id === 'player')!, pose = weaponPose(game.state, actor);
      assert.equal(actor.weapons[weapon].ammo, WEAPONS[weapon].magazine);
      assert.equal(actor.reload, null);
      assert.equal(pose.magazine + pose.grasp + pose.bolt + pose.lower, 0);
    } finally { game.dispose(); }
  }
});


test('actual nine-bot six-round match drives the integrated View through combat, halftime, end and replay reset', async () => {
  await initNavigation();
  const nav = new Navigation();
  const game = await Game.create(1, squadSpecs('normal'), {}, { formation: 'squads-v1', weaponPresentation: 'generation-v1' });
  const bots = squadBots('normal', 1, nav), match = new TrainingMatch();
  const { view, settle } = await viewFixture();
  const motions = new Set<string>(), rounds: { round: number; ticks: number; side: string; reason: string }[] = [];
  try {
    await settle();
    assert.equal(view.info.characters.state, 'ready');
    for (let round = 1; round <= 6; round++) {
      draw(view, game);
      assert.equal(view.info.characters.activeIds.length, 5);
      const startTick = game.state.tick;
      for (let elapsed = 0; elapsed < 6000; elapsed++) {
        const before = game.state;
        if (before.phase !== 'live') break;
        game.step(bots.flatMap(bot => bot.commands(game.observe(bot.id))));
        if (game.state.tick % 6 === 0 || game.state.phase === 'over') {
          const state = game.state, player = state.actors.find(actor => actor.id === 'player')!;
          const now = state.tick * 1000 / 60;
          view.render(state, player, 0, 0, now, .1);
          const effects = view.feedback.update(state, now);
          for (const actor of state.actors.filter(actor => actor.team !== player.team)) {
            const character = view.characters.character(actor.id)!;
            assert.equal(character.mount.parent, view.scene);
            const motion = character.selectMotion(state, actor, effects);
            if (motion) motions.add(motion.clip);
          }
        }
      }
      const state = game.state, player = state.actors.find(actor => actor.id === 'player')!;
      assert.equal(state.phase, 'over');
      assert.equal(player.side, round <= 3 ? 'attack' : 'defend');
      match.observe(state, player);
      assert.equal(match.summary.rounds.length, round);
      rounds.push({ round, ticks: state.tick - startTick, side: player.side, reason: state.result!.reason });
      view.render(state, player, 0, 0, state.tick * 1000 / 60 + 701, .1);
      for (const actor of state.actors.filter(actor => actor.team !== player.team && actor.hp <= 0)) {
        assert.equal(view.characters.character(actor.id)!.mount.visible, false);
      }
      if (round < 6) { game.nextRound(); view.reset(); }
    }
    assert.equal(match.summary.complete, true);
    assert.deepEqual([...motions].sort(), ['death', 'fire', 'hit', 'idle', 'walk']);
    view.reset(); match.reset();
    assert.deepEqual(view.info.characters.activeIds, []);
    assert.equal(match.summary.complete, false);
    console.log(JSON.stringify({ evidence: 'CPU actual Game + GLTFLoader + View; WebGLRenderer substituted, no browser/audio/device', rounds, motions: [...motions].sort(), score: game.state.score }));
  } finally { view.dispose(); game.dispose(); nav.dispose(); }
});
