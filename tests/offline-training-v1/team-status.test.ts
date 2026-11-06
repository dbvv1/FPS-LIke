import test from 'node:test';
import assert from 'node:assert/strict';
import { squadSpecs as defaultSquadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { TrainingMatch } from '../../src/candidates/offline-training-v1/session/match.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { angles } from '../../src/candidates/offline-training-v1/sim/math.js';
import { eye } from '../../src/candidates/offline-training-v1/sim/physics.js';
import { MouseSensitivity } from '../../src/candidates/offline-training-v1/input/sensitivity.js';
import { Hud } from '../../src/candidates/offline-training-v1/ui/hud.js';
import { matchCopy } from '../../src/candidates/offline-training-v1/ui/match-panel.js';
import { teamStatus } from '../../src/candidates/offline-training-v1/ui/team-status.js';
// @ts-expect-error JavaScript smoke orchestration helper is intentionally browser-independent.
import { assertOfflineReady } from '../../tools/smoke-offline-support.mjs';
import type { MatchSummary } from '../../src/candidates/offline-training-v1/session/match.js';
import type { Actor, PlayerSpec, Rules } from '../../src/candidates/offline-training-v1/sim/types.js';

const PLAYER = 'a5';
// Real squad spawn layout with open sight lines: attackers south of the site,
// defenders north. Only first-round positions are overridden.
function squadSpecs(): PlayerSpec[] {
  return [
    { id: 'a1', team: 'amber', position: { x: 0, y: 0, z: 10 } },
    { id: 'a2', team: 'amber', position: { x: 2, y: 0, z: 10 } },
    { id: 'a3', team: 'amber', position: { x: 4, y: 0, z: 10 } },
    { id: 'a4', team: 'amber', position: { x: 6, y: 0, z: 10 } },
    { id: 'a5', team: 'amber', position: { x: 8, y: 0, z: 10 } },
    { id: 'd1', team: 'blue', position: { x: 0, y: 0, z: 14 } },
    { id: 'd2', team: 'blue', position: { x: 2, y: 0, z: 14 } },
    { id: 'd3', team: 'blue', position: { x: 4, y: 0, z: 14 } },
    { id: 'd4', team: 'blue', position: { x: 6, y: 0, z: 14 } },
    { id: 'd5', team: 'blue', position: { x: 8, y: 0, z: 14 } },
  ];
}
const createSquad = (seed: number, rules: Partial<Rules> = {}) => Game.create(seed, squadSpecs(), rules, { formation: 'squads-v1' });
const actor = (game: Game, id: string): Actor => game.state.actors.find(a => a.id === id)!;

function shootOnce(game: Game, shooterId: string, targetId: string) {
  const state = game.state, shooter = state.actors.find(a => a.id === shooterId)!, target = state.actors.find(a => a.id === targetId)!;
  game.step([{ actorId: shooterId, type: 'shoot', ...angles(eye(shooter), eye(target)), targetId }]);
}
function kill(game: Game, shooterId: string, targetId: string) {
  for (let attempt = 0; attempt < 120 && actor(game, targetId).hp > 0; attempt++) shootOnce(game, shooterId, targetId);
  assert.equal(actor(game, targetId).hp, 0, `${shooterId} must kill ${targetId} with real shot traces`);
}

// Existing DOM test fixture style: a minimal stand-in for the elements the HUD
// reads. It does not parse markup or emulate a browser; assertions target the
// same text nodes the client writes in a real page.
class ElementStub {
  hidden = false;
  textContent = '';
  innerHTML = '';
  value: string | number = '';
  checked = true;
  open = false;
  disabled = false;
  offsetWidth = 0;
  firstChild = { textContent: '' };
  dataset: Record<string, string> = {};
  style = { setProperty(_name: string, _value: string) {}, width: '' };
  classList = { add(_name: string) {}, remove(_name: string) {}, toggle(_name: string, _force?: boolean) {} };
  onclick?: () => void;
  onchange?: () => void;
  addEventListener(_type: string, _listener: unknown) {}
  focus(_options?: unknown) {}
  getClientRects() { return []; }
  querySelector(_selector: string) { return this; }
}
function installDocument() {
  const elements = new Map<string, ElementStub>();
  const element = (id: string) => {
    let node = elements.get(id);
    if (!node) { node = new ElementStub(); elements.set(id, node); }
    return node;
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: element } });
  return {
    element,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else Reflect.deleteProperty(globalThis, 'document');
    },
  };
}
function createHud() {
  return new Hud(() => {}, () => {}, () => {}, () => {}, new MouseSensitivity(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })));
}

test('teamStatus reports stable team totals from real Game state and leaks no actor detail', async () => {
  const game = await createSquad(101);
  try {
    const state = game.state;
    assert.deepEqual(teamStatus(state, PLAYER), { allies: { alive: 5, total: 5 }, enemies: { alive: 5, total: 5 } });
    assert.equal(teamStatus(state, 'missing'), null);
    const status = teamStatus(state, PLAYER)!;
    assert.deepEqual(Object.keys(status).sort(), ['allies', 'enemies']);
    for (const side of [status.allies, status.enemies]) assert.deepEqual(Object.keys(side).sort(), ['alive', 'total']);
    const serialized = JSON.stringify(status);
    for (const forbidden of ['position', 'hp', 'weapon', 'yaw', 'pitch', 'input', 'goal', 'id']) assert.equal(serialized.includes(forbidden), false);

    const dead = structuredClone(state);
    dead.actors.find(a => a.id === 'a2')!.hp = 0;
    assert.deepEqual(teamStatus(dead, PLAYER), { allies: { alive: 4, total: 5 }, enemies: { alive: 5, total: 5 } });

    const wiped = structuredClone(state);
    for (const member of wiped.actors.filter(a => a.team === 'blue')) member.hp = 0;
    assert.deepEqual(teamStatus(wiped, PLAYER), { allies: { alive: 5, total: 5 }, enemies: { alive: 0, total: 5 } });
    assert.equal('alive' in wiped.actors[0]!, false, 'the census must not add an Actor.alive field');

    const settled = structuredClone(wiped);
    settled.phase = 'over';
    settled.result = { winner: 'attack', team: 'amber', reason: 'elimination', time: 1 };
    settled.score.amber = 9;
    assert.deepEqual(teamStatus(settled, PLAYER), teamStatus(wiped, PLAYER), 'counts must not infer a winner from score or result');

    const before = JSON.stringify(state);
    teamStatus(state, PLAYER);
    assert.equal(JSON.stringify(state), before, 'reading the census must not mutate simulation state');
  } finally { game.dispose(); }
});

test('HUD shows 5v5 survivors in the existing topbar and updates natural and same-step deaths', async () => {
  const game = await createSquad(102), dom = installDocument(), hud = createHud();
  try {
    let state = game.state, player = state.actors.find(a => a.id === PLAYER)!;
    hud.update(state, player, 0);
    const status = dom.element('team-status');
    assert.equal(status.hidden, false);
    assert.equal(status.textContent, '己方 5/5 · 敌方 5/5');
    assert.match(dom.element('round').textContent, /离线 5v5/);
    assert.match(dom.element('goal').textContent, /掩护携带信标的队友推进/);
    assert.match(dom.element('goal').textContent, /队友携带信标/);
    assert.doesNotMatch(dom.element('goal').textContent, /存活/);
    assert.ok(dom.element('hud').innerHTML.includes('id="team-status"'));
    assert.ok(dom.element('hud').innerHTML.includes('<div class="score">'));
    assert.doesNotMatch(dom.element('hud').innerHTML, /存活/);

    kill(game, 'd1', 'a2');
    state = game.state; player = state.actors.find(a => a.id === PLAYER)!;
    hud.update(state, player, 0);
    assert.equal(status.textContent, '己方 4/5 · 敌方 5/5');

    // Two prepared targets die from two different shooters in one simulation step.
    shootOnce(game, 'd3', 'a3');
    shootOnce(game, 'a5', 'd2');
    state = game.state;
    assert.equal(state.actors.find(a => a.id === 'a3')!.hp, 16);
    assert.equal(state.actors.find(a => a.id === 'd2')!.hp, 16);
    const d2 = state.actors.find(a => a.id === 'd2')!, a3 = state.actors.find(a => a.id === 'a3')!;
    const a4 = state.actors.find(a => a.id === 'a4')!, d2Target = state.actors.find(a => a.id === 'd2')!;
    game.step([
      { actorId: 'd2', type: 'shoot', ...angles(eye(d2), eye(a3)), targetId: 'a3' },
      { actorId: 'a4', type: 'shoot', ...angles(eye(a4), eye(d2Target)), targetId: 'd2' },
    ]);
    state = game.state;
    assert.equal(state.actors.find(a => a.id === 'a3')!.hp, 0);
    assert.equal(state.actors.find(a => a.id === 'd2')!.hp, 0);
    assert.equal(state.phase, 'live');
    player = state.actors.find(a => a.id === PLAYER)!;
    hud.update(state, player, 0);
    assert.equal(status.textContent, '己方 3/5 · 敌方 4/5');
    assert.doesNotMatch(dom.element('goal').textContent, /存活/);
  } finally { game.dispose(); dom.restore(); }
});

test('HUD keeps the zero enemy count after a planted round loses all attackers without settlement', async () => {
  const game = await createSquad(103, { plantTicks: 1 }), dom = installDocument(), hud = createHud();
  try {
    const carrier = game.state.bomb.carrier!;
    game.step([{ actorId: carrier, type: 'interact', held: true }]);
    assert.equal(game.state.bomb.planted, true);
    for (const [index, target] of ['a1', 'a2', 'a3', 'a4', 'a5'].entries()) kill(game, `d${index + 1}`, target);

    const state = game.state;
    assert.equal(state.phase, 'live', 'planted round must remain live while defenders survive');
    assert.equal(state.result, null);
    assert.equal(state.score.amber, 0);
    assert.equal(state.score.blue, 0);
    assert.deepEqual(teamStatus(state, 'd1'), { allies: { alive: 5, total: 5 }, enemies: { alive: 0, total: 5 } });

    hud.update(state, state.actors.find(a => a.id === 'd1')!, 0);
    assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 0/5');
    assert.equal(game.state.phase, 'live', 'HUD rendering must not settle the round');
    assert.equal(game.state.result, null);
    assert.match(dom.element('goal').textContent, /信标已安放/);
    assert.doesNotMatch(dom.element('goal').textContent, /存活/);
  } finally { game.dispose(); dom.restore(); }
});

test('HUD stays team-bound across the round-three side swap, including a mixed-side counterexample', async () => {
  const game = await createSquad(104, { roundTicks: 1 }), dom = installDocument(), hud = createHud();
  try {
    for (let round = 1; round <= 3; round++) {
      let state = game.state;
      assert.equal(state.round, round);
      assert.equal(state.actors.find(a => a.id === PLAYER)!.side, 'attack');
      game.step();
      state = game.state;
      assert.equal(state.phase, 'over');
      hud.update(state, state.actors.find(a => a.id === PLAYER)!, 0);
      assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5');
      if (round < 3) game.nextRound();
    }
    game.nextRound();
    const state = game.state, player = state.actors.find(a => a.id === PLAYER)!;
    assert.equal(state.round, 4);
    assert.equal(player.team, 'amber');
    assert.equal(player.side, 'defend', 'amber must hold the defending side after the swap');
    assert.deepEqual(state.score, { amber: 0, blue: 3 });
    hud.update(state, player, 0);
    assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5');
    // Score labels stay attached to teams, not to the current side.
    assert.equal(dom.element('score-a').textContent, '0');
    assert.equal(dom.element('score-d').textContent, '3');
    assert.match(dom.element('round').textContent, /回合 04/);
    assert.doesNotMatch(dom.element('goal').textContent, /存活/);

    // Counterexample: a side-based census would show 6 defenders and 4 attackers
    // after these mixed-side deviations; team grouping must still show 5 v 5.
    const mixed = structuredClone(state);
    mixed.actors.find(a => a.id === 'a2')!.side = 'attack';
    mixed.actors.find(a => a.id === 'd1')!.side = 'defend';
    mixed.actors.find(a => a.id === 'd2')!.side = 'defend';
    const mixedPlayer = mixed.actors.find(a => a.id === PLAYER)!;
    assert.equal(mixedPlayer.side, 'defend');
    assert.equal(mixed.actors.filter(a => a.side === mixedPlayer.side).length, 6);
    assert.deepEqual(teamStatus(mixed, PLAYER), { allies: { alive: 5, total: 5 }, enemies: { alive: 5, total: 5 } });
    hud.update(mixed, mixedPlayer, 0);
    assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5');
  } finally { game.dispose(); dom.restore(); }
});

test('HUD tracks the six-round finish and a clean restart without touching game hash or menus', async () => {
  const game = await createSquad(105, { roundTicks: 1 }), dom = installDocument(), hud = createHud();
  try {
    for (let round = 1; round <= 6; round++) {
      assert.equal(game.state.round, round);
      game.step();
      const state = game.state, player = state.actors.find(a => a.id === PLAYER)!;
      assert.equal(state.phase, 'over');
      const hash = game.stateHash;
      hud.update(state, player, 0);
      assert.equal(game.stateHash, hash, 'HUD rendering must not change the replay hash');
      assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5');
      assert.doesNotMatch(dom.element('goal').textContent, /存活/);
      if (round < 6) game.nextRound();
    }
    const final = game.state;
    assert.equal(final.round, 6);
    assert.deepEqual(final.score, { amber: 3, blue: 3 });
    hud.update(final, final.actors.find(a => a.id === PLAYER)!, 0);
    assert.equal(dom.element('round').textContent, '回合 06 · 离线 5v5');
    assert.equal(dom.element('score-a').textContent, '3');
    assert.equal(dom.element('score-d').textContent, '3');

    const menu = dom.element('menu').innerHTML;
    for (const id of ['menu-title', 'start', 'next', 'restart', 'difficulty', 'aim-settings-host']) assert.ok(menu.includes(`id="${id}"`), `menu must keep #${id}`);
    const hudMarkup = dom.element('hud').innerHTML;
    for (const id of ['score-a', 'round', 'team-status', 'score-d', 'goal', 'weapon', 'ammo']) assert.ok(hudMarkup.includes(`id="${id}"`), `topbar must keep #${id}`);

    const restarted = await createSquad(106, { roundTicks: 1 });
    try {
      hud.reset();
      const state = restarted.state, player = state.actors.find(a => a.id === PLAYER)!;
      hud.update(state, player, 0);
      assert.equal(dom.element('round').textContent, '回合 01 · 离线 5v5');
      assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5');
      assert.equal(dom.element('score-a').textContent, '0');
      assert.equal(dom.element('score-d').textContent, '0');
      assert.equal(state.phase, 'live');
    } finally { restarted.dispose(); }
  } finally { game.dispose(); dom.restore(); }
});

test('HUD leaves non-5v5 head counts on the old path', async () => {
  const game = await Game.create(107), dom = installDocument(), hud = createHud();
  try {
    const state = game.state, player = state.actors[0]!;
    assert.equal(state.actors.length, 2);
    hud.update(state, player, 0);
    assert.equal(dom.element('team-status').hidden, true);
    assert.equal(dom.element('team-status').textContent, '');
    assert.doesNotMatch(dom.element('round').textContent, /5v5/);
    assert.doesNotMatch(dom.element('goal').textContent, /存活/);
  } finally { game.dispose(); dom.restore(); }
});

test('real HUD survivor text satisfies the offline smoke contract instead of a drifting fixture', async () => {
  // The real offline route names the observer "player"; keep the squad layout.
  const specs = squadSpecs().map(spec => spec.id === PLAYER ? { ...spec, id: 'player' } : spec);
  const game = await Game.create(108, specs, {}, { formation: 'squads-v1' }), dom = installDocument(), hud = createHud();
  try {
    const state = game.state, player = state.actors.find(a => a.id === 'player')!;
    hud.update(state, player, 0);
    const summary: MatchSummary = { rounds: [], complete: false, wins: 0, losses: 0, shots: 0, hits: 0, headHits: 0, objectiveWins: 0 };
    const copy = matchCopy(state, player, summary);
    const actors = state.actors.map(({ id, team }) => ({ id, team }));
    assertOfflineReady(
      { ready: true, squads: { version: 'offline-v1', formation: 'squads-v1', botIds: actors.filter(a => a.id !== 'player').map(a => a.id) },
        environment: { id: 'courtyard-v1', active: true }, match: { complete: false, rounds: [] } },
      { actors, tick: 0, round: 1, score: { amber: 0, blue: 0 } },
      { progress: copy.progress, goal: dom.element('goal').textContent,
        teamStatus: dom.element('team-status').textContent, teamStatusHidden: dom.element('team-status').hidden,
        title: copy.title },
    );
  } finally { game.dispose(); dom.restore(); }
});


test('integrated HUD follows nine real bots through six natural rounds and a fresh match', async () => {
  await initNavigation();
  const nav = new Navigation(), dom = installDocument(), hud = createHud();
  const game = await Game.create(1, defaultSquadSpecs('normal'), {}, { formation: 'squads-v1', weaponPresentation: 'generation-v1' });
  const bots = squadBots('normal', 1, nav), match = new TrainingMatch();
  const rounds: { round: number; ticks: number; side: string; census: string }[] = [];
  const update = (current: Game) => {
    const state = current.state, player = state.actors.find(a => a.id === 'player')!;
    const before = current.stateHash;
    hud.update(state, player, state.tick * 1000 / 60);
    const own = state.actors.filter(a => a.team === player.team && a.hp > 0).length;
    const other = state.actors.filter(a => a.team !== player.team && a.hp > 0).length;
    assert.equal(dom.element('team-status').hidden, false);
    assert.equal(dom.element('team-status').textContent, `己方 ${own}/5 · 敌方 ${other}/5`);
    assert.doesNotMatch(dom.element('goal').textContent, /存活/);
    assert.equal(current.stateHash, before);
    return player;
  };
  try {
    for (let round = 1; round <= 6; round++) {
      update(game); assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5');
      const start = game.state.tick;
      for (let tick = 0; game.state.phase === 'live' && tick < 6000; tick++) {
        game.step(bots.flatMap(bot => bot.commands(game.observe(bot.id)))); update(game);
      }
      const state = game.state, player = update(game);
      assert.equal(state.phase, 'over'); assert.equal(state.result?.reason, 'elimination');
      assert.equal(player.side, round <= 3 ? 'attack' : 'defend');
      match.observe(state, player); assert.equal(match.summary.rounds.length, round);
      rounds.push({ round, ticks: state.tick - start, side: player.side, census: dom.element('team-status').textContent });
      if (round < 6) { game.nextRound(); hud.reset(); }
    }
    assert.equal(match.summary.complete, true); assert.deepEqual(game.state.score, { amber: 1, blue: 5 });
    const replacement = await Game.create(1, defaultSquadSpecs('normal'), {}, { formation: 'squads-v1', weaponPresentation: 'generation-v1' });
    try { hud.reset(); update(replacement); assert.equal(dom.element('team-status').textContent, '己方 5/5 · 敌方 5/5'); assert.equal(dom.element('score-a').textContent, '0'); assert.equal(dom.element('score-d').textContent, '0'); }
    finally { replacement.dispose(); }
    console.log(JSON.stringify({ evidence: 'Actual Game, nine bots and HUD; DOM substitute, no browser/layout acceptance', rounds }));
  } finally { game.dispose(); nav.dispose(); dom.restore(); }
});
