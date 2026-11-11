import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { hash } from '../src/sim/math.js';
import { currentWeaponShot } from '../src/render/shot-action.js';
import type { GameState } from '../src/sim/types.js';

function select(state: GameState) { return currentWeaponShot(state, state.actors[0]!); }
async function pistol() {
  const game = await Game.create(17), actorId = game.state.actors[0]!.id;
  game.step([{ actorId, type: 'switch', weapon: 'pistol' }]);
  for (let i = 0; i < 12; i++) game.step();
  game.step([{ actorId, type: 'shoot', yaw: Math.PI / 2, pitch: 0 }]);
  return { game, actorId };
}

test('pistol action facts preserve accepted shots, no-op switches and same-subtick command order', async () => {
  const { game, actorId } = await pistol();
  try {
    const fired = game.state;
    assert.equal(select(fired)?.weaponActionActive, true);
    game.step([{ actorId, type: 'switch', weapon: 'pistol' }]);
    assert.ok(select(game.state), 'same weapon is not a switch');
    const before = game.state.actors[0]!.nextShot;
    game.step([
      { actorId, type: 'switch', weapon: 'rifle' },
      { actorId, type: 'switch', weapon: 'pistol' },
      { actorId, type: 'shoot', yaw: Math.PI / 2, pitch: 0 },
    ]);
    assert.equal(game.state.actors[0]!.nextShot, before, 'long cooldown is unchanged');
    assert.equal(game.state.shots.length, 1, 'blocked trigger does not create an action');
    assert.equal(select(game.state), undefined);
    assert.equal(game.state.shots[0]!.weaponActionActive, false);
    assert.equal(select(fired)?.weaponActionActive, true, 'earlier snapshots retain their historical action');
    for (let i = 0; i < 15; i++) game.step();
    game.step([{ actorId, type: 'shoot', yaw: Math.PI / 2, pitch: 0 }]);
    assert.ok(select(game.state));
    assert.equal(game.state.shots[0]!.weaponActionActive, false, 'new shot never reactivates old events');
    const snapshot = game.state;
    const state = { ...snapshot, shots: snapshot.shots.map(({ impact: _impact, weaponActionActive: _action, ...shot }) => shot) };
    assert.equal(game.stateHash, hash({ state, rules: game.rules }), 'presentation facts do not change replay hash');
    game.step([{ actorId, type: 'reload' }]);
    assert.equal(select(game.state), undefined);
  } finally { game.dispose(); }
});

test('missing legacy pistol facts fail closed; death, end, future and missing shots cannot animate', async () => {
  const { game } = await pistol();
  try {
    for (const mutate of [
      (s: GameState) => { delete s.shots[0]!.weaponActionActive; },
      (s: GameState) => { s.shots = []; },
      (s: GameState) => { s.actors[0]!.hp = 0; },
      (s: GameState) => { s.phase = 'over'; },
      (s: GameState) => { s.time = s.shots[0]!.time - 1; },
    ]) { const state = game.state; mutate(state); assert.equal(select(state), undefined); }
  } finally { game.dispose(); }
});


test('accepted fire then switch at the same sub-tick cancels only the switching actor', async () => {
  const game = await Game.create(17), [a, b] = game.state.actors;
  try {
    game.step([
      { actorId: a!.id, type: 'shoot', yaw: Math.PI / 2, pitch: 0, at: 500 },
      { actorId: b!.id, type: 'shoot', yaw: Math.PI / 2, pitch: 0, at: 500 },
      { actorId: a!.id, type: 'switch', weapon: 'pistol', at: 500 },
      { actorId: a!.id, type: 'switch', weapon: 'rifle', at: 500 },
    ]);
    const state = game.state;
    assert.equal(state.shots.length, 2);
    assert.equal(state.shots[0]!.weaponActionActive, false);
    assert.equal(state.shots[1]!.weaponActionActive, true);
    assert.equal(select(state), undefined);
    assert.ok(currentWeaponShot(state, state.actors[1]!));
    assert.equal(state.sounds.filter(sound => sound.kind === 'shot').length, 2, 'audio facts are retained');
    assert.ok(state.shots.every(shot => shot.impact), 'impact facts are retained');
  } finally { game.dispose(); }
});
