import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Observation } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Bot } from '../../src/candidates/offline-training-v1/sim/bot.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';
import { DIFFICULTIES } from '../../src/candidates/offline-training-v1/content/difficulty.js';
import { SECOND, type Command } from '../../src/candidates/offline-training-v1/sim/types.js';
import { parseArgs, runBatch } from '../../tools/offline-training-v1/sim.js';

await initNavigation();

test('offline Recast paths reach all routes and are stable across consumers', () => {
  const a = new Navigation(), b = new Navigation();
  try {
    for (const route of MAP.routes) {
      let from = MAP.spawns.attack;
      for (const to of route) {
        const path = a.path(from, to);
        assert.ok(path.length > 1); assert.deepEqual(path, b.path(from, to)); from = to;
      }
    }
  } finally { a.dispose(); b.dispose(); }
});

test('bot controller does not fire from hearing-only clues', async () => {
  const nav = new Navigation(), g = await Game.create(1, [{ id: 'a', team: 'amber' }, { id: 'd', team: 'blue' }]);
  const bot = new Bot('a', 'hard', 4, nav);
  try {
    const o = g.observe('a');
    for (let tick = 0; tick < 90; tick++) {
      const hearing: Observation = { ...o, time: tick * 1000, enemies: [], bodyVisibleIds: [], sounds: [{ id: 1, actorId: 'd', position: { x: 8, y: 0, z: -2 }, radius: 40, kind: 'shot', time: 0 }] };
      const commands = bot.commands(hearing);
      assert.ok(!commands.some(c => c.type === 'shoot'));
    }
  } finally { nav.dispose(); g.dispose(); }
});

test('bot loses fire permission immediately when sight disappears; observation hides private fields', async () => {
  const nav = new Navigation(), g = await Game.create(1, [{ id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } }]);
  const bot = new Bot('a', 'hard', 8, nav);
  try {
    let shot = false;
    for (let tick = 0; tick < 30; tick++) {
      const o = g.observe('a');
      assert.equal('hp' in o.enemies[0]!, false); assert.equal('weapons' in o.enemies[0]!, false);
      const commands = bot.commands(o); shot ||= commands.some(c => c.type === 'shoot'); g.step(commands);
      if (shot) break;
    }
    assert.ok(shot);
    const hidden = { ...g.observe('a'), enemies: [], bodyVisibleIds: [] };
    assert.ok(!bot.commands(hidden).some(c => c.type === 'shoot'));
  } finally { nav.dispose(); g.dispose(); }
});

test('seeded bot command tapes reproduce every simulation hash and round transitions reset memory', async () => {
  const nav = new Navigation();
  const specs = [{ id: 'a', team: 'amber' as const }, { id: 'd', team: 'blue' as const }];
  const a = await Game.create(13, specs), b = await Game.create(13, specs);
  const bots = [new Bot('a', 'normal', 22, nav), new Bot('d', 'normal', 33, nav)];
  try {
    for (let round = 0; round < 4; round++) {
      let ticks = 0;
      while (a.observe('a').phase === 'live' && ticks++ < 6000) {
        const commands: Command[] = bots.flatMap(bot => bot.commands(a.observe(bot.id)));
        a.step(commands); b.step(commands); assert.equal(a.stateHash, b.stateHash);
      }
      assert.equal(a.state.phase, 'over'); assert.equal(a.state.round, round + 1);
      if (round < 3) { a.nextRound(); b.nextRound(); }
    }
    assert.equal(a.state.actors[0]!.side, 'defend');
  } finally { nav.dispose(); a.dispose(); b.dispose(); }
});

test('batch CLI validates missing, invalid and unknown arguments', () => {
  for (const args of [['--games'], ['--seed', '-1'], ['--games', '0'], ['--games', 'NaN'], ['--seed', '1.5'], ['--attack', 'god'], ['--other', '3'], ['--weapon', 'rocket']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['--games', '2', '--seed', '0']).seed, 0);
});

test('batch uses both weapons, reports timeouts separately and audits actual fired target visibility', async () => {
  const report = await runBatch(parseArgs(['--games', '12', '--seed', '231']));
  assert.equal(report.exceptions, 0); assert.equal(report.stalls, 0); assert.equal(report.botNoLosShots, 0);
  assert.equal(report.wins.attack + report.wins.defend, 12);
  assert.ok(report.weapons.rifle!.shots > 0); assert.ok(report.weapons.pistol!.shots > 0);
  for (const side of ['attack', 'defend'] as const) {
    const d = report.reactions[side], config = DIFFICULTIES.normal;
    assert.ok(d.min! >= config.reactionSeconds);
    assert.ok(d.max! <= config.reactionSeconds + config.reactionJitterSeconds + 1 / 60);
  }
});
