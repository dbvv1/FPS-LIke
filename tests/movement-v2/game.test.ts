import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/movement-v2/sim/game.js';
import { MOVEMENT } from '../../src/candidates/movement-v2/content/movement.js';
import { WEAPONS } from '../../src/candidates/movement-v2/content/weapons.js';
import { SECOND, SUBTICKS, type Command, type PlayerSpec, type Vec3 } from '../../src/candidates/movement-v2/sim/types.js';
import { angles } from '../../src/candidates/movement-v2/sim/math.js';
const players = (a: Vec3 = { x: 0, y: 0, z: 0 }, d: Vec3 = { x: 0, y: 0, z: 5 }): PlayerSpec[] => [{ id: 'a', team: 'amber', position: a }, { id: 'd', team: 'blue', position: d }];
const step = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.step(); };
const shoot = (pitch = 0, at = 0): Command => ({ actorId: 'a', type: 'shoot', yaw: 0, pitch, at });
const bodyAim = Math.atan2(0.82 - 1.62, 5);

test('head and body hits use Rapier hitboxes with different damage', async () => {
  for (const [pitch, expectedHp, part] of [[0, 16, 'head'], [bodyAim, 72, 'body']] as const) {
    const g = await Game.create(1, players());
    try { g.step([shoot(pitch)]); assert.equal(g.state.actors[1]!.hp, expectedHp); assert.equal(g.state.shots[0]!.part, part); }
    finally { g.dispose(); }
  }
});

test('solid cover blocks bullets and perception', async () => {
  const g = await Game.create(1, players({ x: -6, y: 0, z: 0 }, { x: -2, y: 0, z: 0 }));
  try {
    g.step([{ actorId: 'a', type: 'shoot', yaw: Math.PI / 2, pitch: 0 }]);
    assert.equal(g.state.actors[1]!.hp, 100); assert.equal(g.state.shots[0]!.hit, null);
    assert.equal(g.observe('a').enemies.length, 0);
  } finally { g.dispose(); }
});

test('frame-internal shooting captures supplied view before later aim input', async () => {
  const g = await Game.create(10, players());
  try {
    g.step([shoot(0, 250), { actorId: 'a', type: 'aim', yaw: Math.PI, pitch: 0, at: 750 }]);
    assert.equal(g.state.shots[0]!.time, 250); assert.equal(g.state.shots[0]!.hit, 'd');
    assert.equal(g.state.actors[0]!.yaw, Math.PI);
  } finally { g.dispose(); }
});

test('movement is integrated to the shot timestamp, not to the end of the tick', async () => {
  const a = await Game.create(1, players({ x: 0, y: 0, z: 0 }, { x: 0.215, y: 0, z: 5 }));
  const b = await Game.create(1, players({ x: 0, y: 0, z: 0 }, { x: 0.215, y: 0, z: 5 }));
  try {
    const moving: Command = { actorId: 'd', type: 'move', x: -1, z: 0 };
    a.step([moving, shoot(0, 0)]); b.step([moving, shoot(0, 999)]);
    assert.equal(a.state.shots[0]!.hit, null); assert.equal(b.state.shots[0]!.hit, 'd');
  } finally { a.dispose(); b.dispose(); }
});

test('rate limit, empty magazines and exact reload completion conserve ammunition', async () => {
  const g = await Game.create(3, players());
  const miss = { actorId: 'a', type: 'shoot', yaw: Math.PI, pitch: 0 } as const;
  try {
    g.step([miss, miss]); assert.equal(g.state.shots.length, 1);
    for (let i = 1; i < 24; i++) { step(g, 6); g.step([miss]); }
    step(g, 6); g.step([miss]); assert.equal(g.state.shots.length, 24);
    assert.equal(g.state.actors[0]!.weapons.rifle.ammo, 0);
    g.step([{ actorId: 'a', type: 'reload' }]); step(g, 112);
    assert.equal(g.state.actors[0]!.weapons.rifle.ammo, 0);
    g.step(); assert.equal(g.state.actors[0]!.weapons.rifle.ammo, 24);
    assert.equal(g.state.actors[0]!.weapons.rifle.reserve, 48);
  } finally { g.dispose(); }
});

test('switching cancels reload without duplicating ammo; pistol works', async () => {
  const g = await Game.create(2, players());
  try {
    g.step([shoot(bodyAim)]); g.step([{ actorId: 'a', type: 'reload' }]);
    g.step([{ actorId: 'a', type: 'switch', weapon: 'pistol' }]); step(g, 120);
    assert.equal(g.state.actors[0]!.weapons.rifle.ammo, 23);
    assert.equal(g.state.actors[0]!.weapons.rifle.reserve, 72);
    assert.equal(g.state.actors[0]!.reload, null);
    g.step([shoot(bodyAim)]); assert.equal(g.state.shots.at(-1)!.weapon, 'pistol');
    assert.equal(g.state.actors[1]!.hp, 48);
  } finally { g.dispose(); }
});

test('fixed recoil and complete replay state hashes repeat for a seed and command tape', async () => {
  const a = await Game.create(923, players()), b = await Game.create(923, players());
  try {
    for (let tick = 0; tick < 120; tick++) {
      const commands: Command[] = tick % 7 === 0 ? [{ actorId: 'a', type: 'shoot', yaw: Math.PI, pitch: 0, at: tick % 999 }] : [];
      a.step(commands); b.step(commands); assert.equal(a.stateHash, b.stateHash);
    }
    assert.deepEqual(a.state.shots, b.state.shots);
    assert.ok(new Set(a.state.shots.map(s => s.pitch)).size > 2);
  } finally { a.dispose(); b.dispose(); }
});

test('different seed changes spread; movement increases spread', async () => {
  const traces: number[] = [];
  for (const [seed, moving] of [[1, false], [2, false], [1, true]] as const) {
    const g = await Game.create(seed, players());
    try { g.step(moving ? [{ actorId: 'a', type: 'move', x: 1, z: 0 }] : []); step(g, 8); g.step([shoot()]); traces.push(g.state.shots[0]!.yaw); }
    finally { g.dispose(); }
  }
  assert.notEqual(traces[0], traces[1]); assert.ok(Math.abs(traces[2]!) > Math.abs(traces[0]!));
});

test('Rapier character controller stops at walls; diagonal speed is normalized', async () => {
  const g = await Game.create(1, players({ x: 2, y: 0, z: 0 }, { x: 9, y: 0, z: 10 }));
  try {
    g.step([{ actorId: 'a', type: 'move', x: 1, z: 0 }]); step(g, 120);
    assert.ok(g.state.actors[0]!.position.x < 3.1); assert.ok(g.state.actors[0]!.position.x > 2.9);
  } finally { g.dispose(); }
  const d = await Game.create(1, players());
  try { d.step([{ actorId: 'a', type: 'move', x: 1, z: 1 }]); const p = d.state.actors[0]!.position; assert.ok(Math.abs(Math.hypot(p.x, p.z) - 0.5 * MOVEMENT.acceleration / (60 * 60)) < 0.001); }
  finally { d.dispose(); }
});

test('crouch changes head height and quiet movement creates no footsteps', async () => {
  const g = await Game.create(1, players());
  try {
    g.step([{ actorId: 'd', type: 'move', x: 0, z: 0, crouch: true }, shoot()]);
    assert.equal(g.state.shots[0]!.hit, null);
    g.step([{ actorId: 'a', type: 'move', x: 1, z: 0, walk: true }]); step(g, 10);
    assert.equal(g.state.sounds.filter(s => s.kind === 'step').length, 0);
    g.step([{ actorId: 'a', type: 'move', x: 1, z: 0 }]);
    assert.ok(g.state.sounds.some(s => s.kind === 'step'));
  } finally { g.dispose(); }
});

test('invalid command batch is rejected atomically, including unknown and missing inputs', async () => {
  const g = await Game.create(1, players());
  try {
    for (const command of [null, { actorId: 'missing', type: 'reload' }, { actorId: 'a', type: 'move', x: NaN, z: 0 }, { actorId: 'a', type: 'shoot', yaw: 0, pitch: Infinity }, { actorId: 'a', type: 'reload', at: 1000 }, { actorId: 'a', type: 'switch', weapon: 'toString' }, { actorId: 'a', type: 'interact' }]) {
      const before = g.stateHash;
      assert.throws(() => g.step([shoot(), command as Command])); assert.equal(g.stateHash, before);
    }
    const clone = g.state; clone.actors[0]!.hp = 0; assert.equal(g.state.actors[0]!.hp, 100);
  } finally { g.dispose(); }
});

test('invalid seed, roster and rule configurations fail before a simulation starts', async () => {
  await assert.rejects(Game.create(-1)); await assert.rejects(Game.create(NaN));
  await assert.rejects(Game.create(1, [{ id: 'a', team: 'amber' }]));
  await assert.rejects(Game.create(1, players(), { roundTicks: 0 }));
  await assert.rejects(Game.create(1, players({ x: 100, y: 0, z: 0 })));
});

test('timeout settles once, freezes the round, then resets and swaps sides', async () => {
  const g = await Game.create(1, players(), { roundTicks: 3, swapEvery: 1 });
  try {
    step(g, 3); assert.equal(g.state.result?.reason, 'timeout'); assert.equal(g.state.score.blue, 1);
    const h = g.stateHash; g.step([shoot()]); assert.equal(g.stateHash, h);
    g.nextRound(); assert.equal(g.state.round, 2); assert.equal(g.state.actors[0]!.side, 'defend');
    assert.equal(g.state.actors[0]!.hp, 100); assert.equal(g.state.actors[0]!.weapons.rifle.ammo, WEAPONS.rifle.magazine);
    step(g, 3); assert.equal(g.state.score.amber, 1);
  } finally { g.dispose(); }
});

test('plant requires carrier at site, uninterrupted hold, then explosion wins', async () => {
  const g = await Game.create(1, players({ x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 14 }), { plantTicks: 3, bombTicks: 5 });
  try {
    g.step([{ actorId: 'a', type: 'interact', held: true }]);
    g.step([{ actorId: 'a', type: 'interact', held: false }]); step(g, 3);
    assert.equal(g.state.bomb.planted, false);
    g.step([{ actorId: 'a', type: 'interact', held: true }]); step(g, 2);
    assert.equal(g.state.bomb.planted, true); step(g, 5);
    assert.equal(g.state.result?.reason, 'explosion'); assert.equal(g.state.result?.winner, 'attack');
  } finally { g.dispose(); }
});

test('defender cannot plant and a carrier cannot plant away from the site', async () => {
  const g = await Game.create(1, players(), { plantTicks: 1 });
  try { g.step([{ actorId: 'a', type: 'interact', held: true }, { actorId: 'd', type: 'interact', held: true }]); step(g, 5); assert.equal(g.state.bomb.planted, false); }
  finally { g.dispose(); }
});

test('movement cancels plant progress rather than pausing it', async () => {
  const g = await Game.create(1, players({ x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 14 }), { plantTicks: 4 });
  try {
    g.step([{ actorId: 'a', type: 'interact', held: true }]); step(g, 1);
    g.step([{ actorId: 'a', type: 'move', x: 1, z: 0 }]);
    g.step([{ actorId: 'a', type: 'move', x: 0, z: 0 }]); step(g, 1);
    assert.equal(g.state.bomb.planted, false);
    assert.equal(g.state.interaction, null, 'coasting cannot resume planting');
    step(g, 1); assert.equal(g.state.actors[0]!.velocity.x, 0);
    step(g, 3); assert.equal(g.state.bomb.planted, false, 'old interaction progress was discarded');
    step(g, 1); assert.equal(g.state.bomb.planted, true);
  } finally { g.dispose(); }
});

test('plant completing exactly at timeout takes precedence; defuse wins an exact fuse tie', async () => {
  const g = await Game.create(1, players({ x: 0, y: 0, z: 10 }, { x: 1, y: 0, z: 10 }), { roundTicks: 3, plantTicks: 3, bombTicks: 4, defuseTicks: 4 });
  try {
    g.step([{ actorId: 'a', type: 'interact', held: true }]); step(g, 2);
    assert.equal(g.state.bomb.planted, true); assert.equal(g.state.phase, 'live');
    g.step([{ actorId: 'd', type: 'interact', held: true }]); step(g, 3);
    assert.equal(g.state.result?.reason, 'defuse'); assert.equal(g.state.result?.time, 7 * SUBTICKS);
  } finally { g.dispose(); }
});

test('post-plant attacker elimination does not award a defender win', async () => {
  const g = await Game.create(1, players({ x: 0, y: 0, z: 10 }, { x: 1, y: 0, z: 10 }), { plantTicks: 1, bombTicks: 20 });
  try {
    g.step([{ actorId: 'a', type: 'interact', held: true }]);
    g.step([{ actorId: 'd', type: 'shoot', yaw: -Math.PI / 2, pitch: 0 }]); step(g, 6);
    g.step([{ actorId: 'd', type: 'shoot', yaw: -Math.PI / 2, pitch: -0.006 }]);
    assert.equal(g.state.actors[0]!.hp, 0); assert.equal(g.state.phase, 'live');
    step(g, 20); assert.equal(g.state.result?.reason, 'explosion');
  } finally { g.dispose(); }
});

test('pre-plant elimination wins; six actors are supported without team hard-coding', async () => {
  const specs: PlayerSpec[] = [{ id: 'a1', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'a2', team: 'amber', position: { x: 1, y: 0, z: 0 } }, { id: 'a3', team: 'amber', position: { x: 2, y: 0, z: 0 } }, { id: 'd1', team: 'blue', position: { x: 0, y: 0, z: 5 } }, { id: 'd2', team: 'blue', position: { x: 1, y: 0, z: 5 } }, { id: 'd3', team: 'blue', position: { x: 2, y: 0, z: 5 } }];
  const g = await Game.create(1, specs);
  try {
    for (const id of ['a1', 'a2', 'a3']) g.step([{ actorId: id, type: 'shoot', yaw: 0, pitch: 0 }]);
    step(g, 10);
    for (const id of ['a1', 'a2', 'a3']) g.step([{ actorId: id, type: 'shoot', yaw: -0.002, pitch: -0.006 }]);
    assert.equal(g.state.result?.reason, 'elimination'); assert.equal(g.state.result?.winner, 'attack');
    assert.equal(g.state.actors.length, 6);
  } finally { g.dispose(); }
});

test('dead carrier drops bomb for a surviving attacker to pick up', async () => {
  const g = await Game.create(1, [...players(), { id: 'b', team: 'amber', position: { x: 0.7, y: 0, z: 0 } }]);
  try {
    g.step([{ actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0 }]); step(g, 6);
    g.step([{ actorId: 'd', type: 'shoot', yaw: Math.PI - 0.002, pitch: -0.006 }]);
    assert.equal(g.state.actors.find(a => a.id === 'a')!.hp, 0);
    assert.equal(g.state.bomb.carrier, 'b'); assert.equal(g.state.phase, 'live');
  } finally { g.dispose(); }
});

test('observations hide unseen enemies and unplanted enemy carrier position', async () => {
  const g = await Game.create(1, players({ x: -6, y: 0, z: 0 }, { x: -2, y: 0, z: 0 }));
  try {
    const o = g.observe('d'); assert.equal(o.enemies.length, 0); assert.equal(o.bomb.carrier, null);
    assert.notDeepEqual(o.bomb.position, g.state.bomb.position);
    g.step([{ actorId: 'a', type: 'shoot', yaw: 0, pitch: 0 }]);
    const clue = g.observe('d').sounds.find(s => s.kind === 'shot'); assert.ok(clue);
    const p = { ...clue.position }; g.step([{ actorId: 'a', type: 'move', x: -1, z: 0 }]); step(g, 10);
    assert.deepEqual(g.observe('d').sounds.find(s => s.id === clue.id)!.position, p);
  } finally { g.dispose(); }
});

test('dispose is repeatable and use-after-dispose is rejected', async () => {
  const g = await Game.create(); g.dispose(); g.dispose(); assert.throws(() => g.step()); assert.throws(() => g.observe('amber-1'));
});

test('self is excluded; a friendly actor physically blocks and takes the shot', async () => {
  const g = await Game.create(1, [...players(), { id: 'b', team: 'amber', position: { x: 0, y: 0, z: 2 } }]);
  try {
    g.step([shoot()]);
    assert.equal(g.state.shots[0]!.hit, 'b');
    assert.equal(g.state.actors.find(a => a.id === 'a')!.hp, 100);
    assert.equal(g.state.actors.find(a => a.id === 'b')!.hp, 16);
    assert.equal(g.state.actors.find(a => a.id === 'd')!.hp, 100);
    assert.equal(g.state.phase, 'live');
  } finally { g.dispose(); }
});

test('spawn inside cover and incomplete coordinates are rejected', async () => {
  await assert.rejects(Game.create(1, players({ x: -4, y: 0, z: 0 })));
  await assert.rejects(Game.create(1, players({ x: 0, y: 0 } as Vec3)));
});

test('a later teammate cannot steal and reset an uninterrupted defuse', async () => {
  const g = await Game.create(1, [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 10 } },
    { id: 'd1', team: 'blue', position: { x: 1, y: 0, z: 10 } },
    { id: 'd2', team: 'blue', position: { x: -1, y: 0, z: 10 } },
  ], { plantTicks: 1, defuseTicks: 4, bombTicks: 5 });
  try {
    g.step([{ actorId: 'a', type: 'interact', held: true }]);
    g.step([{ actorId: 'd2', type: 'interact', held: true }]); g.step();
    g.step([{ actorId: 'd1', type: 'interact', held: true }]);
    assert.equal(g.state.interaction?.actorId, 'd2'); assert.equal(g.state.interaction?.since, 1000);
    g.step(); assert.equal(g.state.result?.reason, 'defuse'); assert.equal(g.state.result?.time, 5000);
  } finally { g.dispose(); }
});

test('a different teammate starts fresh progress after the current defuser releases', async () => {
  const g = await Game.create(1, [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 10 } },
    { id: 'd1', team: 'blue', position: { x: 1, y: 0, z: 10 } },
    { id: 'd2', team: 'blue', position: { x: -1, y: 0, z: 10 } },
  ], { plantTicks: 1, defuseTicks: 4, bombTicks: 20 });
  try {
    g.step([{ actorId: 'a', type: 'interact', held: true }]);
    g.step([{ actorId: 'd2', type: 'interact', held: true }]);
    g.step([{ actorId: 'd1', type: 'interact', held: true }, { actorId: 'd2', type: 'interact', held: false }]);
    assert.equal(g.state.interaction?.actorId, 'd1'); assert.equal(g.state.interaction?.since, 2000);
    step(g, 2); assert.equal(g.state.phase, 'live');
    g.step(); assert.equal(g.state.result?.time, 6000);
  } finally { g.dispose(); }
});

test('rules and public weapon/map/difficulty content are frozen against runtime mutation', async () => {
  const { MAP } = await import('../../src/candidates/movement-v2/content/map.js');
  const { DIFFICULTIES } = await import('../../src/candidates/movement-v2/content/difficulty.js');
  const { DEFAULT_RULES } = await import('../../src/candidates/movement-v2/sim/game.js');
  const g = await Game.create(1);
  try {
    const before = g.stateHash;
    assert.equal(Reflect.set(g, 'rules', { roundTicks: 1 }), false);
    assert.equal(Reflect.set(g.rules, 'roundTicks', 1), false);
    assert.equal(Reflect.set(DEFAULT_RULES, 'roundTicks', 1), false);
    assert.equal(Reflect.set(WEAPONS.rifle, 'damage', 1000), false);
    assert.equal(Reflect.set(WEAPONS.rifle.recoil[0]!, '0', 99), false);
    assert.equal(Reflect.set(MAP.site, 'x', 1000), false);
    assert.equal(Reflect.set(MAP.walls[0]!.center, 'x', 1000), false);
    assert.equal(Reflect.set(DIFFICULTIES.hard, 'reactionSeconds', 0), false);
    assert.equal(g.stateHash, before);
  } finally { g.dispose(); }
});

test('snapshot exposes a correct round deadline through nonzero-time side swaps', async () => {
  const g = await Game.create(1, undefined, { roundTicks: 3, swapEvery: 1 });
  try {
    assert.equal(g.state.roundEndsAt, 3000); step(g, 3); g.nextRound();
    assert.equal(g.state.time, 3000); assert.equal(g.state.roundEndsAt, 6000);
    step(g, 2); assert.equal(g.state.phase, 'live'); g.step();
    assert.equal(g.state.result?.time, 6000);
  } finally { g.dispose(); }
});

test('same-frame bot shots discard a target killed by an earlier command without spending ammo', async () => {
  const g = await Game.create(1, [
    { id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } },
    { id: 'd1', team: 'blue', bot: 'hard', position: { x: -1, y: 0, z: 5 } },
    { id: 'd2', team: 'blue', bot: 'hard', position: { x: 1, y: 0, z: 5 } },
    { id: 'd3', team: 'blue', bot: 'hard', position: { x: 2, y: 0, z: 5 } },
    { id: 'a2', team: 'amber', position: { x: 9, y: 0, z: 0 } },
  ]);
  try {
    const commands: Command[] = g.state.actors.filter(a => a.team === 'blue').map(a => ({ actorId: a.id, type: 'shoot', ...angles({ ...a.position, y: 1.62 }, { x: 0, y: 1.62, z: 0 }), targetId: 'a' }));
    g.step(commands);
    assert.equal(g.state.actors.find(a => a.id === 'a')!.hp, 0);
    assert.equal(g.state.shots.length, 2);
    assert.equal(g.state.actors.find(a => a.id === 'd3')!.weapons.rifle.ammo, 24);
    assert.ok(g.state.shots.every(s => s.targetVisible));
  } finally { g.dispose(); }
});

test('a bot does not execute a queued shot through newly unavailable visibility', async () => {
  const g = await Game.create(1, [
    { id: 'a', team: 'amber', bot: 'hard', position: { x: -6, y: 0, z: 0 } },
    { id: 'd', team: 'blue', position: { x: -2, y: 0, z: 0 } },
  ]);
  try {
    g.step([{ actorId: 'a', type: 'shoot', yaw: Math.PI / 2, pitch: 0, targetId: 'd' }]);
    assert.equal(g.state.shots.length, 0); assert.equal(g.state.actors[0]!.weapons.rifle.ammo, 24);
  } finally { g.dispose(); }
});
