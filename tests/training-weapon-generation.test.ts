import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type GameOptions } from '../src/candidates/offline-training-v1/sim/game.js';
import type { Command, GameState, PlayerSpec } from '../src/candidates/offline-training-v1/sim/types.js';

// Optional read-only switch generation. It exists so presentation consumers can
// tell "this weapon never left my hand" from "it was switched away and back".
const generation = { weaponPresentation: 'generation-v1' } as const;
const duel: PlayerSpec[] = [
  { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } },
  { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } },
];
const switchTo = (weapon: 'rifle' | 'pistol', at?: number): Command => ({ actorId: 'a', type: 'switch', weapon, ...(at === undefined ? {} : { at }) });
const shoot = (at?: number): Command => ({ actorId: 'a', type: 'shoot', yaw: 0, pitch: 0, ...(at === undefined ? {} : { at }) });
const actorOf = (state: GameState, id = 'a') => state.actors.find(actor => actor.id === id)!;
// Remove only the new presentation facts, leaving every gameplay field intact.
function stripGeneration(state: GameState): GameState {
  return {
    ...state,
    actors: state.actors.map(({ weaponGeneration: _weaponGeneration, ...actor }) => actor),
    shots: state.shots.map(({ weaponGeneration: _weaponGeneration, ...shot }) => shot),
  };
}

test('weaponPresentation is one opt-in value; disabled snapshots carry no new fields', async () => {
  const legacy = await Game.create(1, duel);
  try {
    assert.deepEqual(legacy.options, {});
    for (const actor of legacy.state.actors) assert.equal(Object.hasOwn(actor, 'weaponGeneration'), false);
    legacy.step([shoot()]);
    assert.equal(Object.hasOwn(legacy.state.shots[0]!, 'weaponGeneration'), false);
  } finally { legacy.dispose(); }

  const enabled = await Game.create(1, duel, {}, generation);
  try {
    assert.deepEqual(enabled.options, generation);
    for (const actor of enabled.state.actors) {
      assert.ok(Number.isSafeInteger(actor.weaponGeneration));
      assert.equal(actor.weaponGeneration, 0);
    }
    enabled.step([shoot()]);
    assert.equal(enabled.state.shots[0]!.weaponGeneration, 0);
  } finally { enabled.dispose(); }

  await assert.rejects(
    Game.create(1, duel, {}, { weaponPresentation: 'generation-v2' } as unknown as GameOptions),
    /weapon presentation version/,
  );
  await assert.rejects(
    Game.create(1, duel, {}, { weaponPresentation: 'generation-v1', movement: 'ground-v2' } as unknown as GameOptions),
    /movement version/,
  );
});

test('only a living actor switching to the other weapon increments its generation', async () => {
  const game = await Game.create(1, duel, {}, generation);
  try {
    assert.equal(actorOf(game.state).weaponGeneration, 0);
    game.step([switchTo('rifle')]);
    assert.equal(actorOf(game.state).weaponGeneration, 0, 'same-weapon request is not a switch');
    game.step([switchTo('pistol')]);
    assert.equal(actorOf(game.state).weaponGeneration, 1);
    game.step([switchTo('pistol')]);
    assert.equal(actorOf(game.state).weaponGeneration, 1, 'repeated same-weapon request is not a switch');
    game.step([switchTo('rifle')]);
    assert.equal(actorOf(game.state).weaponGeneration, 2);
    assert.equal(actorOf(game.state).weapon, 'rifle');
  } finally { game.dispose(); }
});

test('same-tick commands count each real switch in at order and shots keep their commit generation', async () => {
  const game = await Game.create(1, duel, {}, generation);
  try {
    game.step([
      { actorId: 'a', type: 'shoot', yaw: 0, pitch: 0, at: 0 },
      { actorId: 'a', type: 'switch', weapon: 'pistol', at: 1 },
      { actorId: 'a', type: 'switch', weapon: 'rifle', at: 2 },
    ]);
    const state = game.state, actor = actorOf(state);
    assert.equal(actor.weapon, 'rifle');
    assert.equal(actor.weaponGeneration, 2);
    assert.equal(state.shots.length, 1);
    assert.equal(state.shots[0]!.time, 0);
    assert.equal(state.shots[0]!.weaponGeneration, 0, 'the shot records the generation at commit time');
  } finally { game.dispose(); }

  const two = await Game.create(1, duel, {}, generation);
  try {
    two.step([
      { actorId: 'a', type: 'switch', weapon: 'pistol', at: 3 },
      { actorId: 'a', type: 'switch', weapon: 'pistol', at: 7 },
    ]);
    assert.equal(actorOf(two.state).weaponGeneration, 1);
  } finally { two.dispose(); }

  // Array order is not execution order: the existing step sort applies first.
  const sorted = await Game.create(1, duel, {}, generation);
  try {
    sorted.step([
      { actorId: 'a', type: 'switch', weapon: 'rifle', at: 2 },
      { actorId: 'a', type: 'switch', weapon: 'pistol', at: 1 },
    ]);
    assert.equal(actorOf(sorted.state).weapon, 'rifle');
    assert.equal(actorOf(sorted.state).weaponGeneration, 2);
  } finally { sorted.dispose(); }
});

test('generation is presentation-only: three seeds keep per-tick hash and stripped state identical', async () => {
  const script = (tick: number): Command[] => {
    const commands: Command[] = [];
    if (tick % 11 === 0) commands.push({ actorId: 'a', type: 'move', x: tick % 22 === 0 ? 1 : -1, z: 0.2 });
    if (tick % 7 === 2) commands.push({ actorId: 'a', type: 'aim', yaw: 0.01 * (tick % 5), pitch: 0 });
    if (tick % 5 === 0) commands.push({ actorId: 'a', type: 'shoot', yaw: 0.003 * (tick % 4), pitch: 0 });
    if (tick % 13 === 4) commands.push({ actorId: 'a', type: 'switch', weapon: tick % 26 === 4 ? 'pistol' : 'rifle' });
    if (tick % 23 === 9) commands.push({ actorId: 'a', type: 'reload' });
    if (tick % 17 === 11) commands.push({ actorId: 'a', type: 'interact', held: tick % 34 === 11 });
    return commands;
  };
  for (const seed of [1, 7, 923]) {
    const legacy = await Game.create(seed, duel), enabled = await Game.create(seed, duel, {}, generation);
    try {
      let sawActorGeneration = false, sawShotGeneration = false;
      for (let tick = 0; tick < 240; tick++) {
        const commands = script(tick);
        legacy.step(commands);
        enabled.step(commands);
        const legacyState = legacy.state, enabledState = enabled.state;
        assert.equal(legacy.stateHash, enabled.stateHash, `seed ${seed} tick ${tick} hash`);
        assert.deepEqual(stripGeneration(enabledState), legacyState, `seed ${seed} tick ${tick} state`);
        // The new fields really are present, not merely hash-neutral.
        assert.notDeepEqual(enabledState, legacyState, `seed ${seed} tick ${tick} generation fields`);
        if (enabledState.phase !== 'live') break;
        if (enabledState.actors.some(actor => (actor.weaponGeneration ?? 0) > 0)) sawActorGeneration = true;
        if (enabledState.shots.some(shot => shot.weaponGeneration !== undefined)) sawShotGeneration = true;
      }
      assert.equal(sawActorGeneration, true, `seed ${seed} observed switched actors`);
      assert.equal(sawShotGeneration, true, `seed ${seed} observed generated shots`);
    } finally { legacy.dispose(); enabled.dispose(); }
  }
});

test('stateHash keeps formation/movement option semantics and excludes the presentation option', async () => {
  const options = [
    { formation: 'squads-v1' },
    { movement: 'ground-v1' },
    { formation: 'squads-v1', movement: 'ground-v1' },
  ] as const;
  for (const option of options) {
    const plain = await Game.create(3, duel, {}, option);
    const enabled = await Game.create(3, duel, {}, { ...option, weaponPresentation: 'generation-v1' });
    try {
      for (let tick = 0; tick < 60; tick++) {
        const commands = tick % 4 === 0 ? [shoot()] : tick % 9 === 1 ? [switchTo('pistol')] : [];
        plain.step(commands);
        enabled.step(commands);
        assert.equal(plain.stateHash, enabled.stateHash, `${JSON.stringify(option)} tick ${tick}`);
        assert.deepEqual(stripGeneration(enabled.state), plain.state);
      }
    } finally { plain.dispose(); enabled.dispose(); }
  }
});

test('stateHash treats explicit undefined formation/movement options like the default', async () => {
  // GameOptions permits `formation: undefined` / `movement: undefined`. The v1
  // hash only serialized options when formation or movement was truthy, so a
  // key holding undefined must stay out of the hash exactly like `{}`.
  const plain = await Game.create(3, duel);
  const undefinedFormation = await Game.create(3, duel, {}, { formation: undefined });
  const undefinedMovement = await Game.create(3, duel, {}, { movement: undefined });
  const enabledWithUndefined = await Game.create(3, duel, {}, { formation: undefined, weaponPresentation: 'generation-v1' });
  const games = [plain, undefinedFormation, undefinedMovement, enabledWithUndefined];
  try {
    for (let tick = 0; tick < 60; tick++) {
      const commands = tick % 4 === 0 ? [shoot()] : tick % 9 === 1 ? [switchTo('pistol')] : [];
      for (const game of games) game.step(commands);
      assert.equal(undefinedFormation.stateHash, plain.stateHash, `formation undefined tick ${tick}`);
      assert.equal(undefinedMovement.stateHash, plain.stateHash, `movement undefined tick ${tick}`);
      assert.equal(enabledWithUndefined.stateHash, plain.stateHash, `presentation-only tick ${tick}`);
    }
  } finally { for (const game of games) game.dispose(); }
});

test('rejected shots create no shot record and therefore no generation', async () => {
  const game = await Game.create(1, duel, {}, generation);
  try {
    game.step([shoot(), shoot()]);
    assert.equal(game.state.shots.length, 1, 'same-tick cooldown rejects the second shot');
    assert.equal(game.state.shots[0]!.weaponGeneration, 0);

    game.step([shoot()]);
    assert.equal(game.state.shots.length, 1, 'cooldown rejection');

    game.step([switchTo('pistol')]);
    assert.equal(actorOf(game.state).weaponGeneration, 1);
    game.step([shoot()]);
    assert.equal(game.state.shots.length, 1, 'switch cooldown rejection');

    for (let tick = 0; tick < 13; tick++) game.step();
    game.step([shoot()]);
    assert.equal(game.state.shots.length, 2);
    assert.equal(game.state.shots[1]!.weapon, 'pistol');
    assert.equal(game.state.shots[1]!.weaponGeneration, 1);
  } finally { game.dispose(); }
});

test('dead actors and settled rounds never advance a generation', async () => {
  const specs: PlayerSpec[] = [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } },
    { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } },
    { id: 'e', team: 'blue', position: { x: 6, y: 0, z: 5 } },
  ];
  const live = await Game.create(1, specs, {}, generation);
  try {
    live.step([{ actorId: 'a', type: 'shoot', yaw: 0, pitch: 0 }]);
    for (let tick = 0; tick < 6; tick++) live.step();
    live.step([{ actorId: 'a', type: 'shoot', yaw: 0, pitch: 0 }]);
    assert.equal(live.state.phase, 'live');
    const dead = actorOf(live.state, 'd');
    assert.equal(dead.hp, 0);
    assert.equal(dead.weaponGeneration, 0);
    live.step([{ actorId: 'd', type: 'switch', weapon: 'pistol' }]);
    assert.equal(actorOf(live.state, 'd').weapon, 'rifle');
    assert.equal(actorOf(live.state, 'd').weaponGeneration, 0);
  } finally { live.dispose(); }

  const settled = await Game.create(1, duel, { roundTicks: 1 }, generation);
  try {
    settled.step();
    assert.equal(settled.state.phase, 'over');
    settled.step([switchTo('pistol')]);
    assert.equal(actorOf(settled.state).weapon, 'rifle');
    assert.equal(actorOf(settled.state).weaponGeneration, 0);
  } finally { settled.dispose(); }
});

test('the next round starts every actor at generation 0 and drops old fire facts', async () => {
  const game = await Game.create(1, duel, { roundTicks: 2 }, generation);
  try {
    game.step([switchTo('pistol')]);
    assert.equal(actorOf(game.state).weaponGeneration, 1);
    game.step();
    assert.equal(game.state.phase, 'over');
    game.nextRound();
    const state = game.state;
    assert.equal(state.round, 2);
    assert.deepEqual(state.actors.map(actor => actor.weaponGeneration), [0, 0]);
    assert.equal(actorOf(state).weapon, 'rifle');
    assert.equal(state.shots.length, 0);
  } finally { game.dispose(); }
});
