import assert from 'node:assert/strict';
import { Game, Navigation, initNavigation, MAP } from '../dist/fps-sim.js';
await initNavigation();
const nav = new Navigation();
const game = await Game.create(1, undefined, { roundTicks: 3 });
try {
  assert.ok(nav.path(MAP.spawns.attack, MAP.site).length > 1);
  for (let i = 0; i < 3; i++) game.step();
  assert.equal(game.state.result.reason, 'timeout');
  assert.equal(game.state.score.blue, 1);
  console.log('Built simulation import, offline navigation and complete round: passed.');
} finally { game.dispose(); nav.dispose(); }
