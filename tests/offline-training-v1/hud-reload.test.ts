import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { type GameState, type WeaponId } from '../../src/candidates/offline-training-v1/sim/types.js';
import { MouseSensitivity } from '../../src/candidates/offline-training-v1/input/sensitivity.js';
import { Hud } from '../../src/candidates/offline-training-v1/ui/hud.js';

// Only DOM storage is substituted. The constructor/update, weapon pose and Game
// are production code; no browser, input event or authoritative state is injected.
function mountHud() {
  const nodes = new Map<string, ReturnType<typeof makeNode>>();
  function makeNode() {
    const classes = new Set<string>();
    return {
      innerHTML: '', textContent: '', hidden: false, value: 0, dataset: {},
      style: { setProperty() {} }, offsetWidth: 0,
      classList: {
        add(name: string) { classes.add(name); },
        remove(name: string) { classes.delete(name); },
        toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
        contains(name: string) { return classes.has(name); },
      },
      addEventListener() {},
      querySelector(selector: string) { return node(selector.slice(1)); },
    };
  }
  function node(id: string): ReturnType<typeof makeNode> {
    if (!nodes.has(id)) nodes.set(id, makeNode());
    return nodes.get(id)!;
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: node } });
  const sensitivity = new MouseSensitivity(() => ({ getItem: () => null, setItem() {}, removeItem() {} }));
  const hud = new Hud(() => {}, () => {}, () => {}, () => {}, sensitivity);
  return {
    update(state: GameState, wall = 0) {
      const before = JSON.stringify(state);
      hud.update(state, state.actors.find(a => a.id === 'player')!, wall);
      assert.equal(JSON.stringify(state), before, 'HUD must not rewrite the terminal snapshot');
      return {
        text: node('reload').textContent,
        hidden: node('reload-progress').hidden,
        progress: node('reload-progress').value,
        reloading: node('crosshair').classList.contains('reloading'),
      };
    },
    dispose() {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else Reflect.deleteProperty(globalThis, 'document');
    },
  };
}

const cleared = { text: '', hidden: true, progress: 0, reloading: false };

for (const weapon of ['rifle', 'pistol'] as const satisfies readonly WeaponId[]) {
  test(`training HUD clears ${weapon} reload only after real timeout, then restores next-round reload`, async t => {
    const game = await Game.create(1, [{ id: 'player', team: 'amber' }, { id: 'enemy', team: 'blue' }]);
    const hud = mountHud();
    try {
      // Keep the ordinary 70-second round. Only commands create ammunition use
      // and reload; timeout is settled by Game, not by editing a fixture result.
      while (game.state.tick < game.rules.roundTicks - 30) game.step();
      if (weapon === 'pistol') {
        game.step([{ actorId: 'player', type: 'switch', weapon }]);
        for (let i = 0; i < 12; i++) game.step();
      }
      game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 1.4 }]);
      game.step([{ actorId: 'player', type: 'reload' }]);
      const live = game.state;
      assert.equal(live.phase, 'live');
      assert.ok(live.actors.find(a => a.id === 'player')!.reload);
      const active = hud.update(live);
      assert.match(active.text, /退出弹匣.*s/);
      assert.equal(active.hidden, false);
      assert.equal(active.reloading, true);
      assert.ok(active.progress > 0);
      assert.deepEqual(hud.update(live, 10_000), active, 'pause keeps the active phase unchanged');

      while (game.state.phase === 'live') game.step();
      const ended = game.state;
      assert.equal(ended.result?.reason, 'timeout');
      assert.ok(ended.actors.find(a => a.id === 'player')!.reload, 'the frozen reload really remains');
      const hash = game.stateHash;
      const terminal = hud.update(ended);
      t.diagnostic(JSON.stringify({ weapon, tick: ended.tick, time: ended.time, phase: ended.phase, hash, active, terminal }));
      assert.deepEqual(terminal, cleared);
      assert.deepEqual(hud.update(ended, 20_000), cleared, 'wall time cannot revive a terminal cue');
      game.step();
      assert.equal(game.stateHash, hash, 'terminal simulation stays frozen');

      game.nextRound();
      assert.deepEqual(hud.update(game.state), cleared, 'next round clears without a HUD reset');
      game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 1.4 }]);
      game.step([{ actorId: 'player', type: 'reload' }]);
      assert.equal(hud.update(game.state).reloading, true, 'new live reload is not suppressed');
      game.step([{ actorId: 'player', type: 'switch', weapon: 'pistol' }]);
      assert.deepEqual(hud.update(game.state), cleared, 'ordinary switch cancellation is preserved');
    } finally { hud.dispose(); game.dispose(); }
  });
}

test('a real death during reload clears the cue while the team round is still live', async () => {
  const game = await Game.create(1, [
    { id: 'player', team: 'amber', position: { x: 0, y: 0, z: 0 } },
    { id: 'ally', team: 'amber', position: { x: 2.5, y: 0, z: 0 } },
    { id: 'enemy', team: 'blue', position: { x: 0, y: 0, z: 5 } },
  ]);
  const hud = mountHud();
  try {
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 1.4 }]);
    game.step([{ actorId: 'player', type: 'reload' }]);
    assert.equal(hud.update(game.state).reloading, true);
    game.step([{ actorId: 'enemy', type: 'shoot', yaw: Math.PI, pitch: 0 }]);
    for (let i = 0; i < 30; i++) game.step();
    game.step([{ actorId: 'enemy', type: 'shoot', yaw: Math.PI, pitch: 0 }]);
    assert.equal(game.state.actors.find(a => a.id === 'player')!.hp, 0);
    assert.equal(game.state.phase, 'live');
    assert.deepEqual(hud.update(game.state), cleared);
  } finally { hud.dispose(); game.dispose(); }
});
