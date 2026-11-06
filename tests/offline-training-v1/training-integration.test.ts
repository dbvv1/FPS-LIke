import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Soundscape, reloadAudioPolicyFromSearch } from '../../src/candidates/offline-training-v1/render/audio.js';
import { synthesize, type Cue } from '../../src/candidates/offline-training-v1/render/synth.js';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { TrainingCharacterSet, parseTrainingCharacter } from '../../asset-pipeline/training-character-adapter/adapter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TrainingRifleAssets } from '../../src/candidates/offline-training-v1/render/source-rifle.js';
import { weaponPose } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { WEAPONS } from '../../src/candidates/offline-training-v1/content/weapons.js';
import { TrainingMatch } from '../../src/candidates/offline-training-v1/session/match.js';
import { squadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { SUBTICKS } from '../../src/candidates/offline-training-v1/sim/types.js';

const sourceBytes = readFileSync(new URL('../../assets/content-set/enemy-relay-guard.glb', import.meta.url));
const load = () => parseTrainingCharacter(Uint8Array.from(sourceBytes).buffer);
const rifleBytes = readFileSync(new URL('../../assets/content-set/fp-arms-rx24.glb', import.meta.url));
const loadRifle = () => new GLTFLoader().parseAsync(Uint8Array.from(rifleBytes).buffer, '');
const sceneUrl = new URL('../../src/candidates/offline-training-v1/render/scene.ts', import.meta.url);
const sceneSource = readFileSync(sceneUrl, 'utf8');
// Execute the actual View constructor/render/reset/dispose with real Three CPU
// objects and GLTFLoader. The fixture supplies original local asset bytes and
// replaces WebGLRenderer; this is not GPU QA.
async function viewFixture(loader = load, rifleLoader = loadRifle) {
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
  deps.TrainingRifleAssets = class extends TrainingRifleAssets {
    started: Promise<void> | null = null;
    constructor() { super(rifleLoader); }
    override start() { this.started = super.start(); return this.started; }
  };
  const body = stripTypeScriptTypes(sceneSource.replace(/^import .+;\n/gm, '').replace('export class View', 'class View'));
  const View = new Function(...Object.keys(deps), `${body}\nreturn View;`)(...Object.values(deps));
  const view = new View({});
  const settle = async () => { await Promise.all([view.characters.started, view.sourceRifle.started]); };
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


test('actual View consumes source rifle tracks, keeps only procedural sleeves, and restores on interrupted reload', async () => {
  const { view, settle } = await viewFixture();
  const game = await Game.create(1, specs, {}, { weaponPresentation: 'generation-v1' });
  try {
    await settle(); draw(view, game);
    assert.equal(view.info.rifleSource.active, true);
    assert.equal(view.sourceRifle.rifle.scene.parent, view.rifle);
    const procedural = view.rifle.children.filter((part: THREE.Object3D) => part.userData.part);
    assert.equal(procedural.filter((part: THREE.Object3D) => part.visible).length, 2);
    assert.ok(procedural.every((part: THREE.Object3D) => part.visible === !!part.userData.part.arm));
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 0 }]);
    game.step([{ actorId: 'player', type: 'reload' }]);
    for (let tick = 0; tick < 35; tick++) game.step([]);
    draw(view, game);
    const magazine = view.sourceRifle.rifle.scene.getObjectByName('rifle-magazine_1') ?? view.sourceRifle.rifle.scene.getObjectByName('rifle-magazine');
    assert.ok(magazine.position.y < -.3);
    game.step([{ actorId: 'player', type: 'switch', weapon: 'pistol' }]); draw(view, game);
    assert.equal(view.info.rifleSource.active, false); assert.equal(view.rifle.visible, false); assert.equal(view.pistol.visible, true);
    assert.ok(view.pistol.children.every((part: THREE.Object3D) => part.visible));
    game.step([{ actorId: 'player', type: 'switch', weapon: 'rifle' }]); draw(view, game);
    assert.equal(view.info.rifleSource.active, true); assert.ok(Math.abs(magazine.position.y + .1284) < 1e-6);
    view.reset(); assert.equal(view.info.rifleSource.active, false); assert.equal(view.sourceRifle.rifle.scene.parent, null);
    draw(view, game); assert.equal(view.info.rifleSource.active, true);
  } finally { view.dispose(); game.dispose(); }
});

test('rifle source failure is independent of enemy source and retains all original rifle parts', async () => {
  const { view, settle } = await viewFixture(load, async () => { throw new Error('rifle unavailable'); });
  const game = await Game.create(1, specs);
  try {
    await settle(); draw(view, game);
    assert.equal(view.info.rifleSource.state, 'fallback'); assert.equal(view.info.rifleSource.active, false);
    assert.equal(view.info.characters.state, 'ready');
    assert.ok(view.rifle.children.every((part: THREE.Object3D) => part.visible));
  } finally { view.dispose(); game.dispose(); }
});

// Real Soundscape playback dispatch with an AudioContext device substitute.
// This checks waveform selection and event timing, not speakers or listening.
function audioFixture() {
  const original = globalThis.AudioContext;
  const events: { cue: string; progress: number }[] = [];
  let progress = 0;
  const hash = (samples: Float32Array) => createHash('sha256').update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)).digest('hex');
  const cues = new Map<string, string>();
  for (const weapon of ['rifle', 'pistol'] as const) for (const cue of ['shot', 'reload-out', 'reload-in', 'bolt', 'hit', 'head', 'kill'] as Cue[]) cues.set(hash(synthesize(cue, weapon, 48000)), cue);
  class Context {
    state = 'running'; sampleRate = 48000; destination = {};
    createBuffer() { return { cue: '', copyToChannel(samples: Float32Array) { this.cue = cues.get(hash(samples)) ?? 'other'; } }; }
    createBufferSource() { return { buffer: null as null | { cue: string }, onended: null as null | (() => void), connect() { return this; }, disconnect() {}, start() { events.push({ cue: this.buffer!.cue, progress }); this.onended?.(); }, stop() { this.onended?.(); } }; }
    createGain() { return { gain: { value: 0 }, connect() { return this; }, disconnect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() { return this; }, disconnect() {} }; }
    async close() { this.state = 'closed'; }
  }
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  return { events, setProgress(value: number) { progress = value; }, restore() { globalThis.AudioContext = original; } };
}
async function reloadAudioFixture(policy: 'baseline' | 'source-rifle-v1' = 'source-rifle-v1', ready = true) {
  const audio = audioFixture(), { view, settle } = await viewFixture();
  const game = await Game.create(1, specs, {}, { weaponPresentation: 'generation-v1' });
  const sound = new Soundscape('baseline', policy);
  await sound.unlock(); if (ready) await settle();
  const actor = () => game.state.actors.find(a => a.id === 'player')!;
  const update = (present = true) => {
    draw(view, game); const receipt = view.info.rifleSource;
    audio.setProgress(weaponPose(game.state, actor()).progress);
    sound.update(game.state, actor(), 0, [], present ? receipt : undefined);
  };
  update(); game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 0 }]); update();
  audio.events.length = 0;
  return { audio, view, game, sound, actor, update, settle,
    start(present = true) { game.step([{ actorId: 'player', type: 'reload' }]); update(present); },
    close() { sound.dispose(); view.dispose(); game.dispose(); audio.restore(); } };
}

test('source reload audio requires one explicit known opt-in value', () => {
  for (const search of ['', '?reloadAudio=other', '?reloadAudio=source-rifle-v1&reloadAudio=source-rifle-v1', '?reloadAudio=source-rifle-v1&reloadAudio=baseline']) assert.equal(reloadAudioPolicyFromSearch(search), 'baseline');
  assert.equal(reloadAudioPolicyFromSearch('?reloadAudio=source-rifle-v1&matchAudio=result-cues-v1'), 'source-rifle-v1');
});
test('actual View + Soundscape follow three source motion onsets once, within one simulation tick', async () => {
  const f = await reloadAudioFixture();
  try {
    f.start(); assert.equal(f.audio.events.length, 0); assert.equal(f.sound.reloadAudioState.sourceTimeline, true);
    const phases = f.view.info.rifleSource.cuePhases;
    assert.ok(Math.abs(phases.out * 1.9 - .38) < 1e-6);
    assert.ok(Math.abs(phases.in * 1.9 - 1) < 1e-6);
    assert.ok(Math.abs(phases.bolt * 1.9 - 1.44) < 1e-6);
    while (f.actor().reload) { f.game.step(); const before = f.game.stateHash; f.update(); f.update(); assert.equal(f.game.stateHash, before); }
    assert.deepEqual(f.audio.events.map(event => event.cue), ['reload-out', 'reload-in', 'bolt']);
    for (const [index, threshold] of [phases.out, phases.in, phases.bolt].entries()) {
      const delta = (f.audio.events[index]!.progress - threshold) * 1.9;
      assert.ok(delta >= 0 && delta <= 1 / 60 + 1e-6, `source onset delta=${delta}`);
    }
    assert.equal(f.actor().weapons.rifle.ammo, 24);
  } finally { f.close(); }
});
test('default audio and absent rendered source receipt keep the original timeline', async () => {
  for (const [policy, presented] of [['baseline', true], ['source-rifle-v1', false]] as const) {
    const f = await reloadAudioFixture(policy);
    try {
      f.start(presented); assert.deepEqual(f.audio.events.map(event => event.cue), ['reload-out']);
      while (f.actor().reload) { f.game.step(); f.update(presented); }
      assert.deepEqual(f.audio.events.map(event => event.cue), ['reload-out', 'reload-in', 'bolt']);
      assert.equal(f.sound.reloadAudioState.sourceTimeline, false);
      assert.ok(Math.abs(f.audio.events[1]!.progress - .56) < .01);
    } finally { f.close(); }
  }
});
test('late source availability cannot switch or replay a reload selected on baseline', async () => {
  const f = await reloadAudioFixture();
  try {
    f.start(false); while (weaponPose(f.game.state, f.actor()).progress < .3) { f.game.step(); f.update(false); }
    while (f.actor().reload) { f.game.step(); f.update(true); }
    assert.deepEqual(f.audio.events.map(event => event.cue), ['reload-out', 'reload-in', 'bolt']);
    assert.ok(f.audio.events[0]!.progress < .02); assert.ok(Math.abs(f.audio.events[1]!.progress - .56) < .01);
  } finally { f.close(); }
});
test('source cues crossed while muted or without a rendered receipt are consumed, not replayed', async () => {
  for (const missing of [false, true]) {
    const f = await reloadAudioFixture();
    try {
      f.start(); if (!missing) f.sound.enabled = false;
      while (weaponPose(f.game.state, f.actor()).progress < .32) { f.game.step(); f.update(!missing); }
      f.sound.enabled = true; f.update(); assert.equal(f.audio.events.length, 0);
      while (f.actor().reload) { f.game.step(); f.update(); }
      assert.deepEqual(f.audio.events.map(event => event.cue), ['reload-in', 'bolt']);
    } finally { f.close(); }
  }
});
test('switch cancellation clears source timeline and no future cue leaks into pistol or next reload', async () => {
  const f = await reloadAudioFixture();
  try {
    f.start(); f.game.step([{ actorId: 'player', type: 'switch', weapon: 'pistol' }]); f.update();
    for (let i = 0; i < 120; i++) { f.game.step(); f.update(); }
    assert.equal(f.audio.events.length, 0); assert.equal(f.sound.reloadAudioState.sourceTimeline, false);
    f.game.step([{ actorId: 'player', type: 'switch', weapon: 'rifle' }]); f.update(); f.start();
    while (f.actor().reload) { f.game.step(); f.update(); }
    assert.deepEqual(f.audio.events.map(event => event.cue), ['reload-out', 'reload-in', 'bolt']);
    f.sound.reset(); f.update(); assert.equal(f.audio.events.length, 3);
  } finally { f.close(); }
});
test('a delayed source update consumes missed onsets instead of emitting a burst', async () => {
  const f = await reloadAudioFixture();
  try {
    f.start(); while (weaponPose(f.game.state, f.actor()).progress < .82) f.game.step();
    f.update(); assert.equal(f.audio.events.length, 0);
    while (f.actor().reload) { f.game.step(); f.update(); }
    assert.equal(f.audio.events.length, 0);
  } finally { f.close(); }
});


test('reload then one or two switches within the same tick cannot sound a canceled source reload', async () => {
  for (const returnToRifle of [false, true]) {
    const f = await reloadAudioFixture();
    try {
      f.game.step([{ actorId: 'player', type: 'reload', at: 1 }, { actorId: 'player', type: 'switch', weapon: 'pistol', at: 2 }, ...(returnToRifle ? [{ actorId: 'player', type: 'switch' as const, weapon: 'rifle' as const, at: 3 }] : [])]);
      assert.equal(f.actor().reload, null); f.update();
      assert.equal(f.audio.events.length, 0); assert.equal(f.sound.reloadAudioState.sourceTimeline, false);
    } finally { f.close(); }
  }
});

test('actual training View separates incoming damage brackets from outgoing enemy impact and source hit animation', async () => {
  const { view, settle } = await viewFixture();
  const game = await Game.create(1, [{ id:'player',team:'amber',position:{x:0,y:0,z:0} },{id:'enemy',team:'blue',position:{x:0,y:0,z:5}}]);
  try {
    await settle();game.step([{actorId:'player',type:'shoot',yaw:0,pitch:0,at:100},{actorId:'enemy',type:'shoot',yaw:Math.PI,pitch:0,at:500}]);
    const hash=game.stateHash;draw(view,game,1000);
    assert.deepEqual(view.info.combatFeedback,{damageActive:true,enemyImpactSubmissions:1});
    assert.equal(view.damageFrame.mesh.parent,view.camera);
    assert.equal(view.impacts.filter((mesh:THREE.Mesh)=>mesh.visible).length,1,'incoming head hit uses screen brackets, never a sphere at the camera');
    assert.equal(view.impacts[0].geometry,view.confirmedGeometry);
    assert.equal(view.characters.character('enemy').selectMotion(game.state,game.state.actors.find(a=>a.id==='enemy'),view.feedback.update(game.state,1000)).clip,'hit');
    assert.equal(view.camera.rotation.x,0);assert.equal(Math.abs(view.camera.rotation.y),0);assert.equal(game.stateHash,hash);
    const opacity=view.damageFrame.material.opacity;draw(view,game,10000);assert.equal(view.damageFrame.material.opacity,opacity,'paused state keeps the same effect age');
    view.render(game.state,game.state.actors.find(a=>a.id==='player'),0,0,10001,1/60,{position:{x:0,y:2,z:-5},yaw:0,pitch:0,fov:80});
    assert.deepEqual(view.info.combatFeedback,{damageActive:false,enemyImpactSubmissions:0});
    assert.equal(view.damageFrame.mesh.visible,false);
    assert.equal(view.impacts[0].geometry,view.impacts[0].userData.ordinaryGeometry,'observer does not inherit local confirmation geometry');
  } finally {game.dispose();view.dispose();}
});

test('actual View damage cue remains outside aim across resize, expires after fatal settlement, and owns disposal', async () => {
  const { view, settle } = await viewFixture();
  const game = await Game.create(1, [{ id:'player',team:'amber',position:{x:0,y:0,z:0} },{id:'enemy',team:'blue',position:{x:0,y:0,z:5}}]);
  let disposed=false;
  try {
    await settle();game.step([{actorId:'enemy',type:'shoot',yaw:Math.PI,pitch:0}]);draw(view,game,0);
    for(const [width,height] of [[360,800],[1600,600]]){
      view.renderer.domElement.clientWidth=width;view.renderer.domElement.clientHeight=height;view.resize();draw(view,game,1);
      view.camera.updateMatrixWorld(true);view.damageFrame.mesh.updateMatrixWorld(true);
      const points=view.damageFrame.geometry.getAttribute('position');
      for(let i=0;i<points.count;i++){const p=new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(view.damageFrame.mesh.matrixWorld).project(view.camera);assert.ok(Math.abs(p.x)>.83&&Math.abs(p.x)<.97);assert.ok(Math.abs(p.y)>.52&&Math.abs(p.y)<.67);}
    }
    for(let i=0;i<30;i++)game.step();game.step([{actorId:'enemy',type:'shoot',yaw:Math.PI,pitch:0}]);assert.equal(game.state.phase,'over');
    draw(view,game,1000);assert.equal(view.weapon.visible,false);assert.equal(view.info.combatFeedback.damageActive,true);
    draw(view,game,1401);assert.equal(view.info.combatFeedback.damageActive,false);
    view.reset();game.nextRound();draw(view,game,1500);assert.deepEqual(view.info.combatFeedback,{damageActive:false,enemyImpactSubmissions:0});
    let geometryDisposed=0,materialDisposed=0,impactDisposed=0;
    view.damageFrame.geometry.addEventListener('dispose',()=>geometryDisposed++);view.damageFrame.material.addEventListener('dispose',()=>materialDisposed++);view.confirmedGeometry.addEventListener('dispose',()=>impactDisposed++);
    view.dispose();disposed=true;assert.deepEqual([geometryDisposed,materialDisposed,impactDisposed],[1,1,1]);assert.equal(view.info.combatFeedback.damageActive,false);
  } finally {game.dispose();if(!disposed)view.dispose();}
});
