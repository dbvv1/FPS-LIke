import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import type { Command, PlayerSpec } from '../src/sim/types.js';
const noop = (): Command[] => [100, 300, 500, 700, 900].map(at => ({ actorId: 'b', type: 'aim', yaw: 0, pitch: 0, at }));
const rosters: Record<'death' | 'reload', PlayerSpec[]> = {
  death: [{ id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'b', team: 'amber', position: { x: 10, y: 0, z: 14 } }, { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 1 } }],
  reload: [{ id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'b', team: 'amber', position: { x: 10, y: 0, z: 14 } }, { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } }],
};
for (const scenario of ['death', 'reload', 'two-movers'] as const) test(`motion checkpoint queries preserve ${scenario} state and exact event times`, async () => {
  const games = await Promise.all([Game.create(1, rosters[scenario === 'death' ? 'death' : 'reload']), Game.create(1, rosters[scenario === 'death' ? 'death' : 'reload'])]);
  try {
    for (let tick = 0; tick < 130; tick++) {
      let commands: Command[] = [];
      if (scenario === 'death') {
        if (tick === 0) commands = [{ actorId: 'a', type: 'move', x: 0, z: 1 }, { actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0, at: 250 }];
        if (tick === 6) commands = [{ actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0, at: 250 }, { actorId: 'd', type: 'move', x: 1, z: 0, at: 500 }, { actorId: 'b', type: 'move', x: -1, z: 0, at: 800 }];
      } else if (scenario === 'reload') {
        if (tick === 0) commands = [{ actorId: 'a', type: 'move', x: 1, z: 0 }, { actorId: 'a', type: 'shoot', yaw: Math.PI, pitch: 0, at: 300 }, { actorId: 'a', type: 'reload', at: 800 }];
        if (tick === 114) commands = [{ actorId: 'a', type: 'shoot', yaw: Math.PI, pitch: 0, at: 799 }, { actorId: 'a', type: 'shoot', yaw: Math.PI, pitch: 0, at: 800 }];
      } else if (tick % 20 === 0) {
        commands = [{ actorId: 'a', type: 'move', x: tick % 40 === 0 ? 1 : -1, z: 0, at: 250 }, { actorId: 'd', type: 'move', x: tick % 40 === 0 ? -1 : 1, z: 0, at: 650 }];
      }
      games[0]!.step(commands);
      games[1]!.step([...commands, ...noop(), { actorId: 'b', type: 'move', x: scenario === 'death' && tick >= 6 ? -1 : 0, z: 0, at: 950 }]);
      assert.deepEqual(games[0]!.state, games[1]!.state, `${scenario} tick ${tick}`);
    }
    const state = games[0]!.state;
    if (scenario === 'death') { assert.equal(state.actors[0]!.hp, 0); assert.deepEqual(state.actors[0]!.velocity, { x: 0, z: 0 }); assert.equal(state.actors[2]!.weapons.rifle.ammo, 22); }
    if (scenario === 'reload') { assert.equal(state.actors[0]!.reload, null); assert.equal(state.actors[0]!.weapons.rifle.ammo, 23); assert.deepEqual(state.shots.map(s => s.time), [300, 114800]); }
  } finally { games.forEach(g => g.dispose()); }
});
