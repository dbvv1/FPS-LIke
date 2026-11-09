import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Feedback, RESULT_HOLD_MS } from '../../src/candidates/offline-training-v1/render/feedback.js';
import { localShotResult, weaponPose } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { TrainingMatch, type MatchSummary } from '../../src/candidates/offline-training-v1/session/match.js';
import { SECOND, type Command, type GameState, type PlayerSpec } from '../../src/candidates/offline-training-v1/sim/types.js';

// One command tape driven only through Game.step / Game.nextRound. Positions are
// round-one spawn overrides accepted by Game itself; no Actor, Shot or result is
// written by the test. The player advances 0.75 m, stops, fires rifle wall/body/
// friendly/sky shots, starts a reload, has a shoot rejected by that reload,
// switches pistol to interrupt it, fires pistol, switches back and kills.
const SEED = 13;
const ROUND_TICKS = 180;
const TAPE_LENGTH = 84;
const PLAYER = 'player';
const STOP = { x: 0, z: 0.75 };
const SPECS: PlayerSpec[] = [
  { id: PLAYER, team: 'amber', position: { x: 0, y: 0, z: 0 } },
  { id: 'ally', team: 'amber', position: { x: 2.5, y: 0, z: 0 } },
  { id: 'enemy', team: 'blue', position: { x: 0, y: 0, z: 5 } },
];
const EYE = 1.62, BODY = 0.82;
const aimAt = (to: { x: number; y: number; z: number }) => ({
  yaw: Math.atan2(to.x - STOP.x, to.z - STOP.z),
  pitch: Math.atan2(to.y - EYE, Math.hypot(to.x - STOP.x, to.z - STOP.z)),
});
const PLAYER_BODY_AIM = aimAt({ x: 0, y: BODY, z: 5 });
const ALLY_BODY_AIM = aimAt({ x: 2.5, y: BODY, z: 0 });

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type BareCommand = DistributiveOmit<Command, 'actorId' | 'at'>;

function buildTape() {
  const tape: Command[][] = Array.from({ length: TAPE_LENGTH }, () => []);
  const put = (tick: number, command: BareCommand) => { tape[tick] = [{ actorId: PLAYER, at: 0, ...command } as Command]; };
  for (let tick = 0; tick < 10; tick++) put(tick, { type: 'move', x: 0, z: 1 });
  put(10, { type: 'move', x: 0, z: 0 });
  put(11, { type: 'move', x: 0, z: 0 });
  put(12, { type: 'shoot', yaw: -Math.PI / 2, pitch: 0 }); // real wall
  put(18, { type: 'shoot', ...PLAYER_BODY_AIM }); // enemy body
  put(24, { type: 'shoot', ...ALLY_BODY_AIM }); // friendly body
  put(30, { type: 'shoot', yaw: 0, pitch: 1 }); // sky miss
  put(36, { type: 'reload' });
  put(37, { type: 'shoot', ...PLAYER_BODY_AIM }); // rejected by reload
  put(44, { type: 'switch', weapon: 'pistol' }); // interrupts reload
  put(57, { type: 'shoot', ...PLAYER_BODY_AIM });
  put(70, { type: 'switch', weapon: 'rifle' });
  put(83, { type: 'shoot', yaw: 0, pitch: 0 }); // head, kill, settle
  return tape;
}

type FactShot = {
  actorId: string; time: number; weapon: string; hit: string | null; part: string | null;
  damage: number; impactKind: 'actor' | 'world' | 'range' | null; killed: boolean | null;
  origin: { x: number; y: number; z: number } | null; end: { x: number; y: number; z: number } | null;
};
type FactEvent = { key: string; shotTime: number; age: number; kind: string | null };
type FactActor = { id: string; hp: number; weapon: string; ammo: number; reloadEnd: number | null; position: { x: number; y: number; z: number } };
type Fact = {
  tick: number; time: number; round: number; phase: string; hash: string;
  actors: FactActor[];
  shots: FactShot[];
  results: (string | null)[];
  pose: { kick: number; flash: number; progress: number; lower: number; magazine: number; bolt: number; grasp: number };
  feedback: FactEvent[];
};
type TailSample = { wall: number; events: number; killVisible: boolean; actorVisible: boolean };
type Run = {
  hz: number;
  facts: Map<number, Fact>;
  liveSnapshot: GameState | null;
  overWall: number;
  overState: GameState;
  overEvents: FactEvent[];
  summary: MatchSummary;
  canAdvance: boolean;
  tail: TailSample[];
  resetEvents: number;
  round2Events: number;
  round2: { tick: number; time: number; state: GameState; summary: MatchSummary };
};

function makeFact(game: Game, state: GameState, events: { shot: { actorId: string; time: number }; age: number }[]): Fact {
  const player = state.actors.find(a => a.id === PLAYER)!;
  const pose = weaponPose(state, player);
  const shotOf = (actorId: string, time: number) => state.shots.find(s => s.actorId === actorId && s.time === time);
  return {
    tick: state.tick, time: state.time, round: state.round, phase: state.phase, hash: game.stateHash,
    actors: state.actors.map(a => ({ id: a.id, hp: a.hp, weapon: a.weapon, ammo: a.weapons[a.weapon].ammo, reloadEnd: a.reload?.end ?? null, position: { ...a.position } })).sort((a, b) => a.id < b.id ? -1 : 1),
    shots: state.shots.map(s => ({
      actorId: s.actorId, time: s.time, weapon: s.weapon, hit: s.hit, part: s.part, damage: s.damage,
      impactKind: s.impact?.kind ?? null, killed: s.impact?.killed ?? null,
      origin: s.impact ? { ...s.impact.origin } : null, end: s.impact ? { ...s.impact.end } : null,
    })),
    results: state.shots.filter(s => s.actorId === PLAYER).map(s => localShotResult(state, player, s)?.kind ?? null),
    pose: { kick: pose.kick, flash: pose.flash, progress: pose.progress, lower: pose.lower, magazine: pose.magazine, bolt: pose.bolt, grasp: pose.grasp },
    feedback: events.map(e => ({ key: `${e.shot.actorId}@${e.shot.time}`, shotTime: e.shot.time, age: e.age, kind: shotOf(e.shot.actorId, e.shot.time)?.impact?.kind ?? null })).sort((a, b) => a.shotTime - b.shotTime || a.key.localeCompare(b.key)),
  };
}

const playerOf = (fact: Fact) => fact.actors.find(a => a.id === PLAYER)!;
const enemyOf = (fact: Fact) => fact.actors.find(a => a.id === 'enemy')!;
const allyOf = (fact: Fact) => fact.actors.find(a => a.id === 'ally')!;
const lengthOf = (shot: FactShot) => shot.origin && shot.end ? Math.hypot(shot.end.x - shot.origin.x, shot.end.y - shot.origin.y, shot.end.z - shot.origin.z) : NaN;

async function sampleSession(hz: number): Promise<Run> {
  const game = await Game.create(SEED, SPECS, { roundTicks: ROUND_TICKS });
  const feedback = new Feedback();
  const match = new TrainingMatch();
  const tape = buildTape();
  const facts = new Map<number, Fact>();
  let liveSnapshot: GameState | null = null;
  let frame = 0;
  const wallAt = (index: number) => index * 1000 / hz;

  const advanceRound = (commands: (tick: number) => readonly Command[], limit: number) => {
    let overWall = 0;
    for (;;) {
      const wall = wallAt(frame);
      for (;;) {
        const state = game.state;
        if (state.phase !== 'live' || state.tick >= limit || (state.tick + 1) * 1000 > wall * 60) break;
        game.step(commands(state.tick));
        const after = game.state;
        const events = feedback.update(after, wall);
        facts.set(after.tick, makeFact(game, after, events));
        if (after.tick === 13) liveSnapshot = after;
      }
      const settled = game.state;
      if (settled.phase !== 'live') { overWall = wall; break; }
      feedback.update(settled, wall);
      if (++frame > 1_000_000) throw new Error('sampler did not settle');
    }
    return overWall;
  };

  const overWall = advanceRound(tick => tape[tick] ?? [], TAPE_LENGTH);
  const overState = game.state;
  const overPlayer = overState.actors.find(a => a.id === PLAYER)!;
  const overEvents = feedback.update(overState, overWall).map(e => ({ key: `${e.shot.actorId}@${e.shot.time}`, shotTime: e.shot.time, age: e.age, kind: e.shot.impact?.kind ?? null }));
  match.observe(overState, overPlayer);
  const summary = match.summary;
  const canAdvance = match.canAdvance(overState);
  // The same settled Shot observed repeatedly must not create a second event or
  // a second round record.
  assert.equal(feedback.update(overState, overWall).length, overEvents.length);
  assert.equal(feedback.update(overState, overWall).length, overEvents.length);
  match.observe(overState, overPlayer);
  assert.equal(match.summary.rounds.length, 1);

  // Display-clock tail: only the 700 ms post-settlement window may grow.
  const tail: TailSample[] = [];
  frame++;
  while (wallAt(frame) <= overWall + RESULT_HOLD_MS + 100) {
    const wall = wallAt(frame);
    const events = feedback.update(overState, wall);
    tail.push({ wall, events: events.length, killVisible: events.some(e => !!e.shot.impact?.killed), actorVisible: feedback.actor(overState.actors.find(a => a.id === 'enemy')!).visible });
    frame++;
  }

  // Reset before nextRound mirrors client view.reset(); old shot ids must not
  // survive into the new round's presentation state.
  feedback.reset();
  game.nextRound();
  const round2Start = game.state;
  const resetEvents = feedback.update(round2Start, overWall + RESULT_HOLD_MS + 200).length;
  assert.equal(round2Start.round, 2);

  // Round two submits no command at all, so only the authoritative timeout may
  // end it. This is the zero-shot round.
  let steps = 0;
  while (game.state.phase === 'live') { game.step([]); if (++steps > 10_000) throw new Error('zero-shot round did not settle'); }
  const round2State = game.state;
  const round2Player = round2State.actors.find(a => a.id === PLAYER)!;
  match.observe(round2State, round2Player);
  match.observe(round2State, round2Player);
  const round2Summary = match.summary;
  const round2Events = feedback.update(round2State, overWall + RESULT_HOLD_MS + 1000).length;
  game.dispose();
  return {
    hz, facts, liveSnapshot, overWall, overState, overEvents, summary, canAdvance, tail, resetEvents, round2Events,
    round2: { tick: round2State.tick, time: round2State.time, state: round2State, summary: round2Summary },
  };
}

let canonical: Promise<Run> | undefined;
const canonicalRun = () => canonical ??= sampleSession(60);
const nodeFact = (run: Run, tick: number) => ({ before: run.facts.get(tick) ?? null, after: run.facts.get(tick + 1)! });

test('one real firefight tape drives movement, rifle/pistol impacts, reload interruption, settlement and the next round', async () => {
  const run = await canonicalRun();
  const tape = buildTape();
  assert.equal(run.overWall, 1400);
  assert.equal(run.overState.phase, 'over');
  assert.equal(run.overState.time, 83000, 'round stops on the decisive sub-tick');
  assert.deepEqual(run.overState.result, { winner: 'attack', team: 'amber', reason: 'elimination', time: 83000 });

  const start = nodeFact(run, 0).after;
  assert.equal(start.tick, 1);
  assert.equal(playerOf(start).hp, 100);
  const stop = nodeFact(run, 10).after;
  assert.equal(stop.tick, 11);
  assert.ok(Math.abs(playerOf(start).position.z - 0.075) < 2e-4, 'first move tick advances 4.5 m/s by 1/60 s');
  assert.ok(Math.abs(playerOf(stop).position.z - 0.75) < 3e-4, 'ten move ticks advance 0.75 m');
  assert.deepEqual(playerOf(nodeFact(run, 11).after).position, playerOf(stop).position, 'stopped move command holds position');

  const wall = nodeFact(run, 12).after;
  const wallShot = wall.shots.at(-1)!;
  assert.equal(wall.shots.length, 1);
  assert.deepEqual([wallShot.impactKind, wallShot.hit, wallShot.damage, wallShot.killed], ['world', null, 0, false]);
  assert.equal(wall.results.at(-1), 'miss');
  assert.ok(Math.abs(wallShot.origin!.y - 1.62) < 1e-9 && Math.abs(wallShot.origin!.z - 0.75) < 3e-4, 'ray starts at the shooting eye');
  assert.ok(Math.abs(wallShot.end!.x + 3.4) < 1e-6, 'wall impact stops on the left divider face');
  assert.ok(Math.abs(lengthOf(wallShot) - 3.4) < 1e-3);
  assert.ok(wall.pose.kick > .5 && wall.pose.flash > 0);
  assert.ok(wall.feedback.some(e => e.key === `${PLAYER}@12000` && Math.abs(e.age - 1000 / SECOND * 1000) < 1e-9));

  const body = nodeFact(run, 18).after;
  const bodyShot = body.shots.at(-1)!;
  assert.deepEqual([bodyShot.impactKind, bodyShot.hit, bodyShot.part, bodyShot.damage, bodyShot.killed], ['actor', 'enemy', 'body', 28, false]);
  assert.equal(body.results.at(-1), 'body');
  assert.equal(enemyOf(body).hp, 72);
  assert.ok(body.pose.kick > .5 && body.pose.flash > 0);
  assert.ok(bodyShot.end!.z > 4.6 && bodyShot.end!.z < 5, 'body capsule stops the ray at its near surface');

  const friendly = nodeFact(run, 24).after;
  const friendlyShot = friendly.shots.at(-1)!;
  assert.deepEqual([friendlyShot.impactKind, friendlyShot.hit, friendlyShot.part, friendlyShot.damage, friendlyShot.killed], ['actor', 'ally', 'body', 28, false]);
  assert.equal(friendly.results.at(-1), 'friendly');
  assert.equal(allyOf(friendly).hp, 72);
  assert.ok(friendly.pose.kick > .5 && friendly.pose.flash > 0);
  assert.ok(friendlyShot.end!.x > 2 && friendlyShot.end!.x < 2.5, 'the teammate body is a real trace hit, not a scripted marker');

  const miss = nodeFact(run, 30).after;
  const missShot = miss.shots.at(-1)!;
  assert.deepEqual([missShot.impactKind, missShot.hit], ['range', null]);
  assert.equal(miss.results.at(-1), 'miss');
  assert.ok(Math.abs(lengthOf(missShot) - 100) < 1e-6);
  assert.ok(miss.pose.kick > .5 && miss.pose.flash > 0);

  const reload = nodeFact(run, 36).after;
  assert.equal(playerOf(reload).reloadEnd, 36 * 1000 + 114 * 1000);
  assert.equal(playerOf(reload).ammo, 20);
  const rejected = nodeFact(run, 37);
  assert.equal(rejected.after.shots.length, rejected.before!.shots.length, 'shoot while reloading produces no Shot');
  assert.equal(playerOf(rejected.after).reloadEnd, 150000);
  assert.equal(rejected.after.round, 1);

  const switched = nodeFact(run, 44).after;
  assert.equal(playerOf(switched).weapon, 'pistol');
  assert.equal(playerOf(switched).reloadEnd, null, 'switch is the real reload interruption');
  assert.equal(playerOf(switched).ammo, 10);

  const pistol = nodeFact(run, 57).after;
  const pistolShot = pistol.shots.at(-1)!;
  assert.deepEqual([pistolShot.weapon, pistolShot.impactKind, pistolShot.hit, pistolShot.part, pistolShot.damage, pistolShot.killed], ['pistol', 'actor', 'enemy', 'body', 24, false]);
  assert.equal(pistol.results.at(-1), 'body');
  assert.equal(enemyOf(pistol).hp, 48);
  assert.ok(pistol.pose.kick > .5 && pistol.pose.flash > 0);
  assert.ok(pistolShot.end!.z > 4.6 && pistolShot.end!.z < 5);

  const back = nodeFact(run, 70).after;
  assert.equal(playerOf(back).weapon, 'rifle');
  assert.equal(playerOf(back).ammo, 20);

  const kill = nodeFact(run, 83).after;
  const killShot = kill.shots.at(-1)!;
  assert.deepEqual([killShot.impactKind, killShot.hit, killShot.part, killShot.damage, killShot.killed], ['actor', 'enemy', 'head', 84, true]);
  assert.equal(kill.results.at(-1), 'kill');
  assert.equal(enemyOf(kill).hp, 0);
  assert.equal(kill.phase, 'over');
  assert.equal(kill.feedback.find(e => e.key === `${PLAYER}@83000`)!.age, 0);
  for (const [fact, time] of [[body, 18000], [friendly, 24000], [miss, 30000], [pistol, 57000]] as const) {
    const event = fact.feedback.find(e => e.key === `${PLAYER}@${time}`);
    assert.ok(event && Math.abs(event.age - 1000 / SECOND * 1000) < 1e-9, `feedback age at ${time}`);
  }
  assert.equal(switched.pose.kick, 0);
  assert.equal(back.pose.kick, 0);
  assert.equal(kill.pose.kick, 0);
  assert.equal(kill.pose.flash, 0);

  // Every firing node is a formal Game.step command with an explicit sub-tick.
  for (const tick of [0, 10, 12, 18, 24, 30, 36, 37, 44, 57, 70, 83]) {
    const command = tape[tick]![0]!;
    assert.equal(command.actorId, PLAYER);
    assert.equal(command.at, 0);
  }
  assert.equal(run.summary.rounds.length, 1);
  assert.equal(run.canAdvance, true);
  assert.equal(run.round2.tick, 264, 'zero-shot round ends only at its tick-180 timeout');
  assert.equal(run.round2.time, 264000);
  assert.equal(run.round2.state.result!.reason, 'timeout');
  assert.equal(run.resetEvents, 0);
  assert.equal(run.round2Events, 0);
});

test('shot-time impact decides feedback; hit/team decides summary without later HP or HUD copy', async () => {
  const run = await canonicalRun();
  const state = run.overState, player = state.actors.find(a => a.id === PLAYER)!;
  const shots = state.shots.filter(s => s.actorId === PLAYER);
  assert.equal(shots.length, 6, 'the rejected shot never exists as a Shot');
  for (const shot of shots) assert.equal(shot.hit !== null, shot.impact!.kind === 'actor', `impact/hit disagree at ${shot.time}`);
  const enemyHits = shots.filter(s => s.impact!.kind === 'actor' && state.actors.find(a => a.id === s.hit)!.team !== player.team);
  const friendlyHits = shots.filter(s => s.impact!.kind === 'actor' && state.actors.find(a => a.id === s.hit)!.team === player.team);
  assert.equal(enemyHits.length, 3, 'two body hits and one head kill');
  assert.equal(friendlyHits.length, 1);
  assert.deepEqual([run.summary.shots, run.summary.hits, run.summary.headHits], [6, 3, 1]);
  assert.deepEqual([run.summary.wins, run.summary.losses, run.summary.objectiveWins], [1, 0, 0], 'round one only is observed at this point');

  // Late HP cannot re-label older shots: the enemy is now dead, yet the body
  // and friendly shots keep their shot-time results.
  const body = shots.find(s => s.hit === 'enemy' && s.part === 'body' && s.weapon === 'rifle')!;
  const friendly = shots.find(s => s.hit === 'ally')!;
  const kill = shots.find(s => s.impact!.killed)!;
  assert.equal(localShotResult(state, player, body)!.kind, 'body');
  assert.equal(localShotResult(state, player, friendly)!.kind, 'friendly');
  assert.equal(localShotResult(state, player, kill)!.kind, 'kill');

  // Same Shot observed repeatedly: one event, one round record, stable result.
  const feedback = new Feedback();
  const first = feedback.update(state, 2000);
  const second = feedback.update(state, 2000);
  assert.equal(second.length, first.length);
  for (const event of first) assert.equal(second.filter(e => e.shot.actorId === event.shot.actorId && e.shot.time === event.shot.time).length, 1);
  const repeated = localShotResult(state, player, body)!;
  assert.equal(repeated.shot, body);
  assert.equal(repeated.kind, 'body');

  // Zero-shot round contributes nothing to hits and keeps the time-out result.
  assert.equal(run.round2.state.shots.length, 0);
  assert.deepEqual(run.round2.summary.rounds[1], { round: 2, side: 'attack', won: false, reason: 'timeout', shots: 0, hits: 0, headHits: 0 });
  assert.deepEqual([run.round2.summary.shots, run.round2.summary.hits, run.round2.summary.headHits], [6, 3, 1]);
  assert.deepEqual([run.round2.summary.wins, run.round2.summary.losses], [1, 1], 'the zero-shot timeout is the second observed round');
});

test('30/60/120 Hz display sampling leaves fixed-tick gameplay and feedback facts identical', async () => {
  const runs = [await sampleSession(30), await canonicalRun(), await sampleSession(120)];
  const base = runs[1]!;
  for (const run of runs) {
    assert.equal(run.overWall, base.overWall, `${run.hz} Hz settlement wall`);
    assert.deepEqual([...run.facts.keys()].sort((a, b) => a - b), [...base.facts.keys()].sort((a, b) => a - b), `${run.hz} Hz captured ticks`);
    for (const tick of base.facts.keys()) assert.deepEqual(run.facts.get(tick), base.facts.get(tick), `${run.hz} Hz tick ${tick}`);
    assert.deepEqual(run.summary, base.summary);
    assert.deepEqual(run.round2.state, base.round2.state);
    assert.deepEqual(run.round2.summary, base.round2.summary);
    const removed = run.tail.find(sample => !sample.killVisible)!;
    const lastVisible = [...run.tail].reverse().find(sample => sample.killVisible)!;
    assert.equal(removed.wall, base.overWall + RESULT_HOLD_MS, `${run.hz} Hz tail removal`);
    assert.ok(removed.wall - lastVisible.wall <= 1000 / run.hz + 1e-9, `${run.hz} Hz tail sample step`);
  }
  // Live/paused feedback age is the simulation delta even when the render clock
  // is ahead of the tick it serves; only the settled tail adds wall time.
  for (const run of runs) for (const fact of run.facts.values()) {
    if (fact.phase !== 'live' && fact.tick !== 84) continue;
    for (const event of fact.feedback) assert.ok(Math.abs(event.age - (fact.time - event.shotTime) / SECOND * 1000) < 1e-9, `${run.hz} Hz tick ${fact.tick} age`);
  }
});

test('Feedback live-state age freezes; settled events expire and reset clears events', async () => {
  const run = await canonicalRun();
  const lastVisible = [...run.tail].reverse().find(sample => sample.killVisible)!;
  const removed = run.tail.find(sample => !sample.killVisible)!;
  assert.equal(removed.wall, 1400 + RESULT_HOLD_MS);
  assert.ok(lastVisible.wall < removed.wall && removed.wall - lastVisible.wall <= 1000 / run.hz + 1e-9);
  assert.equal(removed.events, 0);
  assert.equal(removed.actorVisible, false);
  assert.equal(run.overEvents.find(event => event.kind === 'actor' && event.age === 0)!.key, `${PLAYER}@83000`);

  // Pause: simulation state and simulation time are frozen, while the render
  // clock advances eight seconds; shot age must stay put.
  const paused = run.liveSnapshot!;
  const feedback = new Feedback();
  const before = feedback.update(paused, 1000).map(e => e.age);
  const after = feedback.update(paused, 9000).map(e => e.age);
  assert.ok(before.length > 0);
  assert.deepEqual(after, before);
  assert.ok(weaponPose(paused, paused.actors.find(a => a.id === PLAYER)!).kick > 0);

  // Reset + nextRound: the presentation has no event at all in round two.
  assert.equal(run.resetEvents, 0);
  assert.equal(run.round2.state.round, 2);
  assert.equal(run.round2.state.shots.length, 0);
});
