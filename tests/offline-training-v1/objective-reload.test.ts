import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Bot } from '../../src/candidates/offline-training-v1/sim/bot.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { angles } from '../../src/candidates/offline-training-v1/sim/math.js';
import { eye } from '../../src/candidates/offline-training-v1/sim/physics.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';
import { SUBTICKS, type Command } from '../../src/candidates/offline-training-v1/sim/types.js';

await initNavigation();
function advanceUntil(game: Game, ready: () => boolean, commands: () => Command[] = () => []) {
  for (let ticks = 0; !ready() && ticks < 5000; ticks++) {
    assert.equal(game.state.phase, 'live', 'setup must not silently continue after a round ends');
    game.step(commands());
  }
  assert.ok(ready(), 'bounded real-command sequence must reach its condition');
}
function spendRifle(game: Game, id: string, targetId: string, ammo: number) {
  advanceUntil(game, () => game.observe(id).self.weapons.rifle.ammo === ammo,
    () => [{ actorId: id, type: 'shoot', yaw: 0, pitch: 1.4, targetId }]);
}
function exhaustRifle(game: Game, id: string, targetId: string) {
  while (game.observe(id).self.weapons.rifle.reserve > 0) {
    spendRifle(game, id, targetId, 0);
    game.step([{ actorId: id, type: 'reload' }]);
    advanceUntil(game, () => !game.observe(id).self.reload);
  }
  spendRifle(game, id, targetId, 0);
}
async function withDefender(ground: boolean, ammo: number, action: (game: Game, bot: Bot) => void, exhausted = false) {
  const nav = new Navigation();
  const game = await Game.create(1, [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 10 } },
    { id: 'd', team: 'blue', bot: 'normal', position: { x: 1.3, y: 0, z: 10 } },
  ], {}, { formation: 'squads-v1', ...(ground ? { movement: 'ground-v1' as const } : {}) });
  try {
    assert.deepEqual([game.rules.plantTicks, game.rules.defuseTicks, game.rules.bombTicks], [180, 300, 1500]);
    if (exhausted) exhaustRifle(game, 'd', 'a');
    else spendRifle(game, 'd', 'a', ammo);
    game.step([{ actorId: 'a', type: 'interact', held: true }]);
    advanceUntil(game, () => game.state.bomb.planted);
    game.step([{ actorId: 'd', type: 'switch', weapon: 'pistol' }]);
    advanceUntil(game, () => game.observe('a').self.hp === 0, () => [{
      actorId: 'd', type: 'shoot', targetId: 'a',
      ...angles(eye(game.observe('d').self), eye(game.observe('a').self)),
    }]);
    game.step([{ actorId: 'd', type: 'switch', weapon: 'rifle' }]);
    advanceUntil(game, () => game.state.time >= game.state.bomb.explodeAt! - 305 * SUBTICKS);
    assert.equal(game.observe('d').self.weapons.rifle.ammo, ammo);
    assert.equal(game.observe('d').self.weapons.rifle.reserve, exhausted ? 0 : 72);
    assert.deepEqual(game.observe('d').enemies, []);
    action(game, new Bot('d', 'normal', 10, nav, 'rifle', 0));
  } finally { game.dispose(); nav.dispose(); }
}

for (const ground of [false, true]) for (const ammo of [0, 1, 4]) {
  test(`reached defuse beats optional top-up: ammo ${ammo}, ground ${ground}`, async () => {
    await withDefender(ground, ammo, (game, bot) => {
      const start = game.state.time;
      while (game.state.phase === 'live' && game.state.time - start < 400 * SUBTICKS) {
        const commands = bot.commands(game.observe('d'));
        assert.ok(!commands.some(c => c.type === 'reload'), 'safe objective must not request a fresh top-up');
        game.step(commands);
      }
      assert.equal(game.state.result?.reason, 'defuse');
      assert.equal(game.state.result?.time, start + 300 * SUBTICKS);
      assert.equal(game.state.bomb.explodeAt! - game.state.result!.time, 5 * SUBTICKS);
      assert.equal(game.observe('d').self.weapons.rifle.ammo, ammo, 'interaction does not refill ammunition');
    });
  });
}

test('reached plant starts before optional top-up at the default round deadline', async () => {
  const nav = new Navigation();
  const game = await Game.create(1, [
    { id: 'a', team: 'amber', bot: 'normal', position: { x: 0, y: 0, z: 10 } },
    { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 6 } },
  ], {}, { formation: 'squads-v1', movement: 'ground-v1' });
  try {
    spendRifle(game, 'a', 'd', 1);
    advanceUntil(game, () => game.state.time >= game.state.roundEndsAt - 185 * SUBTICKS);
    assert.deepEqual(game.observe('a').enemies, [], 'real FOV leaves no visible threat');
    const bot = new Bot('a', 'normal', 10, nav, 'rifle', 0), start = game.state.time;
    advanceUntil(game, () => game.state.bomb.planted, () => bot.commands(game.observe('a')));
    assert.equal(game.state.time, start + 180 * SUBTICKS);
    assert.equal(game.state.roundEndsAt - game.state.time, 5 * SUBTICKS);
    assert.equal(game.observe('a').self.weapons.rifle.ammo, 1);
  } finally { game.dispose(); nav.dispose(); }
});

test('objective preference does not cancel an already-started legal reload', async () => {
  await withDefender(true, 1, (game, bot) => {
    const start = game.state.time;
    game.step([{ actorId: 'd', type: 'reload' }]);
    const reload = game.observe('d').self.reload;
    assert.ok(reload);
    const commands = bot.commands(game.observe('d'));
    assert.ok(!commands.some(c => c.type === 'switch' || c.type === 'reload'));
    game.step(commands);
    assert.deepEqual(game.observe('d').self.reload, reload);
    assert.equal(game.state.interaction, null, 'Game still rejects interaction while reloading');
    while (game.state.phase === 'live' && game.state.time - start < 400 * SUBTICKS) game.step(bot.commands(game.observe('d')));
    assert.equal(game.state.result?.reason, 'explosion', 'an existing reload still consumes its normal time');
    assert.equal(game.observe('d').self.weapons.rifle.ammo, 24);
  });
});

test('visible combat still reloads and releases objective interaction', async () => {
  const nav = new Navigation();
  const game = await Game.create(1, [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 10 } },
    { id: 'd', team: 'blue', bot: 'normal', position: { x: 1.3, y: 0, z: 10 } },
  ], {}, { formation: 'squads-v1' });
  try {
    spendRifle(game, 'd', 'a', 0);
    game.step([{ actorId: 'a', type: 'interact', held: true }]);
    advanceUntil(game, () => game.state.bomb.planted);
    game.step([{ actorId: 'd', type: 'aim', ...angles(eye(game.observe('d').self), eye(game.observe('a').self)) }]);
    assert.equal(game.observe('d').enemies.length, 1);
    const commands = new Bot('d', 'normal', 10, nav, 'rifle', 0).commands(game.observe('d'));
    assert.ok(commands.some(c => c.type === 'reload'));
    assert.ok(commands.some(c => c.type === 'interact' && !c.held));
    game.step(commands);
    assert.ok(game.observe('d').self.reload);
    assert.equal(game.state.interaction, null);
  } finally { game.dispose(); nav.dispose(); }
});

// Boundary cases use default objective timers and only public Game commands.
for (const ground of [false, true]) {
  test(`reached defuse beats backup switching at the exact deadline: ground ${ground}`, async () => {
    await withDefender(ground, 0, (game, bot) => {
      advanceUntil(game, () => game.state.time === game.state.bomb.explodeAt! - 300 * SUBTICKS);
      const start = game.state.time;
      const first = bot.commands(game.observe('d'));
      assert.ok(first.some(c => c.type === 'interact' && c.held));
      assert.ok(!first.some(c => c.type === 'switch'));
      game.step(first);
      assert.equal(game.state.interaction?.since, start);
      advanceUntil(game, () => game.state.phase === 'over', () => bot.commands(game.observe('d')));
      assert.equal(game.state.result?.reason, 'defuse');
      assert.equal(game.state.result?.time, game.state.bomb.explodeAt);
      assert.equal(game.observe('d').self.weapon, 'rifle');
      assert.equal(game.observe('d').self.weapons.rifle.ammo, 0);
    }, true);
  });

  test(`reached plant beats backup switching at the exact deadline: ground ${ground}`, async () => {
    const nav = new Navigation();
    const game = await Game.create(1, [
      { id: 'a', team: 'amber', bot: 'normal', position: { x: 0, y: 0, z: 10 } },
      { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 6 } },
    ], {}, { formation: 'squads-v1', ...(ground ? { movement: 'ground-v1' as const } : {}) });
    try {
      exhaustRifle(game, 'a', 'd');
      advanceUntil(game, () => game.state.time === game.state.roundEndsAt - 180 * SUBTICKS);
      assert.deepEqual(game.observe('a').enemies, []);
      const bot = new Bot('a', 'normal', 10, nav, 'rifle', 0);
      const first = bot.commands(game.observe('a'));
      assert.ok(first.some(c => c.type === 'interact' && c.held));
      assert.ok(!first.some(c => c.type === 'switch'));
      game.step(first);
      advanceUntil(game, () => game.state.bomb.planted, () => bot.commands(game.observe('a')));
      assert.equal(game.state.time, game.state.roundEndsAt);
      assert.equal(game.state.phase, 'live');
      assert.equal(game.observe('a').self.weapon, 'rifle');
    } finally { game.dispose(); nav.dispose(); }
  });
}

test('safe objective does not restore the preferred weapon or override explicit cancellation', async () => {
  await withDefender(false, 1, (game, bot) => {
    game.step([{ actorId: 'd', type: 'switch', weapon: 'pistol' }]);
    const start = game.state.time, since = () => game.state.interaction?.since;
    game.step(bot.commands(game.observe('d')));
    assert.equal(game.observe('d').self.weapon, 'pistol');
    assert.equal(since(), start);
    game.step([{ actorId: 'd', type: 'interact', held: false }]);
    assert.equal(game.state.interaction, null);
    game.step(bot.commands(game.observe('d')));
    assert.equal(since(), start + 2 * SUBTICKS, 'release resets rather than preserves elapsed progress');
    game.step([{ actorId: 'd', type: 'switch', weapon: 'rifle' }]);
    assert.equal(game.state.interaction, null, 'Game still cancels a requested switch');
    game.step(bot.commands(game.observe('d')));
    assert.equal(since(), start + 4 * SUBTICKS);
    game.step([{ actorId: 'd', type: 'move', x: 1, z: 0 }]);
    assert.equal(game.state.interaction, null, 'Game still cancels movement');
    advanceUntil(game, () => game.state.phase === 'over', () => bot.commands(game.observe('d')));
    assert.equal(game.state.result?.reason, 'explosion', 'objective policy must not bypass lost time or award an impossible completion');
  });
});

test('a visible threat still selects the supplied backup and cancels an active objective', async () => {
  const nav = new Navigation();
  const game = await Game.create(1, [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 10 } },
    { id: 'd', team: 'blue', bot: 'normal', position: { x: 1.3, y: 0, z: 10 } },
  ], {}, { formation: 'squads-v1' });
  try {
    exhaustRifle(game, 'd', 'a');
    game.step([{ actorId: 'a', type: 'interact', held: true }]);
    advanceUntil(game, () => game.state.bomb.planted);
    game.step([{ actorId: 'd', type: 'interact', held: true }]);
    assert.equal(game.state.interaction?.actorId, 'd');
    game.step([{ actorId: 'd', type: 'aim', ...angles(eye(game.observe('d').self), eye(game.observe('a').self)) }]);
    assert.equal(game.observe('d').enemies.length, 1);
    const bot = new Bot('d', 'normal', 10, nav, 'rifle', 0);
    assert.deepEqual(bot.commands(game.observe('d')), [{ actorId: 'd', type: 'switch', weapon: 'pistol' }]);
    game.step(bot.commands(game.observe('d')));
    assert.equal(game.state.interaction, null);
    assert.ok(bot.commands(game.observe('d')).some(c => c.type === 'interact' && !c.held));
  } finally { game.dispose(); nav.dispose(); }
});


test('non-objective switch preserves the route, clue and random early-return boundary', async () => {
  const nav = new Navigation(), game = await Game.create();
  try {
    const observation = game.observe('amber-1');
    observation.self.position = { ...MAP.routes[0]![0]! };
    observation.sounds = [{ id: 10, actorId: 'blue-1', kind: 'shot', position: { x: 1, y: 0, z: 0 }, radius: 40, time: observation.time }];
    const bot = new Bot('amber-1', 'normal', 10, nav, 'pistol', 0);
    const commands = bot.commands(observation);
    assert.deepEqual(commands, [{ actorId: 'amber-1', type: 'switch', weapon: 'pistol' }]);
    // Controller memory is inspected only to guard the legacy early-return
    // boundary. No observation or running Game state is altered by the bot.
    const memory = JSON.parse(JSON.stringify(bot));
    assert.equal(memory.routeIndex, 0, 'squadPlan may inspect the reached waypoint but switching cannot consume it');
    assert.equal(memory.lastSound, -1);
    assert.equal(memory.lastClue, null);
    bot.commands(observation);
    assert.deepEqual(JSON.parse(JSON.stringify(bot)), memory, 'switching cannot consume random state or subsequent controller history');
  } finally { game.dispose(); nav.dispose(); }
});
