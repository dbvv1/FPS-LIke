import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/movement-v2/sim/game.js';
import { integrateMovement } from '../../src/candidates/movement-v2/sim/movement.js';
import { shootingState } from '../../src/candidates/movement-v2/sim/shooting.js';
import { accuracyReticle } from '../../src/candidates/movement-v2/ui/accuracy.js';
import { MOVEMENT } from '../../src/candidates/movement-v2/content/movement.js';
import { WEAPONS } from '../../src/candidates/movement-v2/content/weapons.js';
import { nextRandom } from '../../src/candidates/movement-v2/sim/math.js';
import { SECOND, type Actor, type Command, type Input, type PlayerSpec } from '../../src/candidates/movement-v2/sim/types.js';
const input = (x = 0, z = 0): Input => ({ x, z, walk: false, crouch: false, interact: false });
const specs: PlayerSpec[] = [{ id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } }];
const actor = (g: Game) => g.state.actors[0]!;
const step = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.step(); };
const move = (x: number, z = 0, at = 0): Command => ({ actorId: 'a', type: 'move', x, z, at });
const fire = (at = 0): Command => ({ actorId: 'a', type: 'shoot', yaw: Math.PI, pitch: 0, at });
const near = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (±${tolerance})`);

test('acceleration, release, reverse zero-crossing and speed-cap integration are split invariant', () => {
  for (const start of [{ x: 0, z: 0 }, { x: 4.5, z: 0 }, { x: 2.7, z: -3.6 }]) {
    for (const desired of [input(), input(-1), input(1), input(.6, .8)]) {
      const whole = integrateMovement(start, desired, .31);
      let velocity = start, x = 0, z = 0;
      for (const dt of [.003, .011, .067, .019, .21]) {
        const part = integrateMovement(velocity, desired, dt);
        velocity = part.velocity; x += part.translation.x; z += part.translation.z;
      }
      near(velocity.x, whole.velocity.x); near(velocity.z, whole.velocity.z);
      near(x, whole.translation.x); near(z, whole.translation.z);
      assert.ok(Math.hypot(whole.velocity.x, whole.velocity.z) <= MOVEMENT.runSpeed + 1e-9);
    }
  }
});

test('release coasts, a deliberate opposite key brakes earlier, then accelerates the other way', async () => {
  const released = await Game.create(1, specs), reversed = await Game.create(1, specs);
  try {
    for (const g of [released, reversed]) { g.step([move(1)]); step(g, 8); near(actor(g).velocity.x, 4.5); }
    released.step([move(0)]); reversed.step([move(-1)]);
    assert.ok(actor(released).velocity.x > actor(reversed).velocity.x);
    assert.ok(actor(released).velocity.x > 0, 'release must not snap speed/accuracy to zero');
    step(released, 4); step(reversed, 4);
    assert.ok(actor(released).velocity.x > 2.9); assert.ok(actor(reversed).velocity.x < 0);
    step(released, 12); near(actor(released).velocity.x, 0);
    step(reversed, 12); near(actor(reversed).velocity.x, -4.5);
  } finally { released.dispose(); reversed.dispose(); }
});

test('normalized diagonal run/walk/crouch retain caps without an instant mode-change stop', async () => {
  for (const [mode, cap] of [['run', 4.5], ['walk', 2.3], ['crouch', 1.7]] as const) {
    const g = await Game.create(1, specs);
    try {
      g.step([{ ...move(1, 1), walk: mode === 'walk', crouch: mode === 'crouch' } as Command]); step(g, 12);
      near(Math.hypot(actor(g).velocity.x, actor(g).velocity.z), cap);
      const before = actor(g); g.step([move(0)]);
      assert.ok(Math.hypot(actor(g).velocity.x, actor(g).velocity.z) < cap);
      assert.ok(actor(g).position.x > before.position.x);
    } finally { g.dispose(); }
  }
});

test('collision removes wall-normal velocity and running in place is not moving inaccuracy', async () => {
  const g = await Game.create(1, [{ ...specs[0]!, position: { x: 2, y: 0, z: 0 } }, specs[1]!]);
  try {
    g.step([move(1)]); step(g, 60);
    const blocked = actor(g);
    assert.ok(blocked.position.x > 2.9 && blocked.position.x < 3.1);
    near(blocked.velocity.x, 0, 1e-7);
    near(shootingState(blocked, g.state.time).spread, WEAPONS.rifle.spread, 1e-9);
    g.step([move(1, 1)]); step(g, 4);
    assert.ok(actor(g).velocity.z > .5, 'wall sliding keeps tangential velocity');
    assert.ok(Math.abs(actor(g).velocity.x) < .01);
    g.step([move(-1)]); step(g, 6);
    assert.ok(actor(g).position.x < blocked.position.x - .1, 'no stored wall velocity delays departure');
  } finally { g.dispose(); }
});

test('shot spread samples actual speed at its timestamp, not a key state or a later frame', async () => {
  const still = await Game.create(17, specs), pressed = await Game.create(17, specs), late = await Game.create(17, specs);
  try {
    still.step([fire()]); pressed.step([move(1), fire()]); late.step([move(1), fire(999)]);
    near(still.state.shots[0]!.yaw, pressed.state.shots[0]!.yaw);
    assert.ok(Math.abs(late.state.shots[0]!.yaw - Math.PI) > Math.abs(still.state.shots[0]!.yaw - Math.PI));
    const rng = { random: 17 }, randomYaw = nextRandom(rng) * 2 - 1;
    const expectedSpeed = MOVEMENT.acceleration * 999 / SECOND;
    near(late.state.shots[0]!.yaw, Math.PI + randomYaw * (WEAPONS.rifle.spread + WEAPONS.rifle.movingSpread * expectedSpeed / MOVEMENT.runSpeed));
  } finally { still.dispose(); pressed.dispose(); late.dispose(); }
  const g = await Game.create(17, specs);
  try {
    g.step([move(1)]); step(g, 10);
    const before = actor(g), expected = shootingState(before, g.state.time);
    g.step([move(0), fire()]);
    const rng = { random: 17 };
    near(g.state.shots[0]!.yaw, Math.PI + (nextRandom(rng) * 2 - 1) * expected.spread);
    assert.ok(expected.spread > WEAPONS.rifle.spread * 10);
  } finally { g.dispose(); }
});

test('unrelated subtick commands do not change free movement or sampled shooting accuracy', async () => {
  const a = await Game.create(19, specs), b = await Game.create(19, specs);
  try {
    for (let tick = 0; tick < 40; tick++) {
      const commands: Command[] = tick === 0 ? [move(1)] : tick === 12 ? [move(-1)] : tick === 24 ? [move(0)] : [];
      if (tick % 7 === 0) commands.push(fire(750));
      a.step(commands);
      b.step([...commands, ...[100, 370, 620, 900].map(at => ({ actorId: 'd', type: 'aim' as const, yaw: Math.PI, pitch: 0, at }))]);
      near(actor(a).velocity.x, actor(b).velocity.x, 1e-8);
      // Rapier collision correction is float32 and depends on query segmentation; allow 1 µm.
      near(actor(a).position.x, actor(b).position.x, 1e-6);
      near(shootingState(actor(a), a.state.time).spread, shootingState(actor(b), b.state.time).spread, 1e-9);
    }
    for (let i = 0; i < a.state.shots.length; i++) {
      const left = a.state.shots[i]!, right = b.state.shots[i]!;
      assert.equal(left.time, right.time); near(left.yaw, right.yaw); near(left.pitch, right.pitch);
    }
  } finally { a.dispose(); b.dispose(); }
});

test('learnable full-magazine recoil never resets at shot seven; manual compensation cancels it once', async () => {
  const raw = await Game.create(29, specs), compensated = await Game.create(29, specs);
  try {
    const offsets: number[] = [];
    for (let i = 0; i < 24; i++) {
      const expected = shootingState(actor(raw), raw.state.time);
      const corrected = shootingState(actor(compensated), compensated.state.time);
      offsets.push(expected.recoilPitch);
      raw.step([fire()]); compensated.step([{ actorId: 'a', type: 'shoot', yaw: Math.PI - corrected.recoilYaw, pitch: -corrected.recoilPitch }]);
      near(raw.state.shots.at(-1)!.pitch - compensated.state.shots.at(-1)!.pitch, expected.recoilPitch);
      near(raw.state.shots.at(-1)!.yaw - compensated.state.shots.at(-1)!.yaw, expected.recoilYaw);
      step(raw, 5); step(compensated, 5);
    }
    near(offsets[0]!, 0); assert.ok(offsets[6]! > offsets[5]! && offsets[5]! > 0);
    assert.ok(offsets.slice(6).every(x => x > .02));
    assert.equal(actor(raw).weapons.rifle.ammo, 0);
  } finally { raw.dispose(); compensated.dispose(); }
});

test('recoil and firing spread recover continuously to the original first shot, independent of samples', async () => {
  const g = await Game.create(31, specs);
  try {
    for (let i = 0; i < 5; i++) { g.step([fire()]); if (i < 4) step(g, 5); }
    const a = actor(g), time = a.weapons.rifle.lastShot;
    const start = shootingState(a, time + .16 * SECOND), midway = shootingState(a, time + .30 * SECOND), recovered = shootingState(a, time + SECOND);
    assert.ok(start.recoilIndex > midway.recoilIndex && midway.recoilIndex > recovered.recoilIndex);
    assert.ok(start.spread > midway.spread); near(recovered.recoilPitch, 0); near(recovered.recoilYaw, 0); near(recovered.spread, WEAPONS.rifle.spread);
    const epsilon = .001 * SECOND;
    assert.ok(Math.abs(shootingState(a, time + .3 * SECOND - epsilon).recoilPitch - shootingState(a, time + .3 * SECOND + epsilon).recoilPitch) < .001);
    const before = JSON.stringify(a);
    for (let i = 0; i < 100; i++) shootingState(a, time + i * 1000);
    assert.equal(JSON.stringify(a), before, 'read-only sampling does not advance or reset recovery');
    assert.deepEqual(shootingState(a, time + .30 * SECOND), midway);
  } finally { g.dispose(); }
});

test('HUD uses the same movement/recoil envelope and cannot alter the authoritative state', async () => {
  const g = await Game.create(31, specs);
  try {
    g.step([move(1)]); step(g, 10); g.step([fire()]);
    const a = actor(g), before = JSON.stringify(a), now = g.state.time, accuracy = shootingState(a, now), hud = accuracyReticle(a, now, 900);
    for (const key of ['speed', 'movement', 'spread', 'recoilYaw', 'recoilPitch', 'recoilIndex'] as const) near(hud[key], accuracy[key]);
    assert.ok(hud.gap > 5); near(accuracyReticle(a, now, 1800).gap, hud.gap * 2);
    assert.equal(JSON.stringify(a), before);
    a.input.x = 0; near(accuracyReticle(a, now, 900).gap, hud.gap, 1e-9);
  } finally { g.dispose(); }
});

test('reload/switch retain recovery clocks; death, next round and a new game clear kinetic/weapon state', async () => {
  const g = await Game.create(41, specs, { roundTicks: 300 });
  try {
    g.step([fire()]); step(g, 5); g.step([fire()]);
    g.step([{ actorId: 'a', type: 'reload' }]);
    assert.ok(shootingState(actor(g), g.state.time).recoilIndex > 0, 'reload does not instantly grant first-shot accuracy');
    const clock = actor(g).weapons.rifle.lastShot;
    g.step([{ actorId: 'a', type: 'switch', weapon: 'pistol' }]);
    assert.equal(actor(g).reload, null); assert.equal(actor(g).weapons.rifle.lastShot, clock);
    g.step([{ actorId: 'a', type: 'switch', weapon: 'rifle' }]);
    assert.ok(shootingState(actor(g), g.state.time).recoilIndex > 0, 'switching twice cannot erase recoil');
    g.step([{ actorId: 'a', type: 'reload' }]); step(g, WEAPONS.rifle.reload);
    near(shootingState(actor(g), g.state.time).recoilIndex, 0); assert.equal(actor(g).weapons.rifle.ammo, 24);
    g.step([move(1)]); step(g, 180);
    assert.equal(g.state.phase, 'over'); g.nextRound();
    near(actor(g).velocity.x, 0); near(shootingState(actor(g), g.state.time).recoilIndex, 0);
  } finally { g.dispose(); }
  const death = await Game.create(1, specs);
  try {
    death.step([move(1), fire(), { actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0 }]);
    step(death, 5); death.step([{ actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0 }]);
    const dead = actor(death); assert.equal(dead.hp, 0); near(dead.velocity.x, 0); near(dead.weapons.rifle.recoil, 0);
  } finally { death.dispose(); }
  const fresh = await Game.create(41, specs);
  try { near(actor(fresh).velocity.x, 0); near(shootingState(actor(fresh), 0).recoilIndex, 0); assert.equal(actor(fresh).weapons.rifle.ammo, 24); }
  finally { fresh.dispose(); }
});

test('one cover loop: hidden approach, peek, deliberate brake, compensated burst, retreat reload and re-peek', async () => {
  const g = await Game.create(77, [
    { id: 'a', team: 'amber', position: { x: 2.7, y: 0, z: 6.4 } },
    { id: 'd', team: 'blue', position: { x: 6, y: 0, z: 8.5 } },
  ]);
  const settleBrake = () => { g.step([move(0, -1)]); step(g, 4); g.step([move(0)]); };
  const bodyShot = (): Command => {
    const state = g.state, a = state.actors[0]!, d = state.actors[1]!, accuracy = shootingState(a, state.time);
    return { actorId: 'a', type: 'shoot', yaw: Math.atan2(d.position.x - a.position.x, d.position.z - a.position.z) - accuracy.recoilYaw,
      pitch: Math.atan2(.82 - 1.62, Math.hypot(d.position.x - a.position.x, d.position.z - a.position.z)) - accuracy.recoilPitch };
  };
  try {
    assert.equal(g.observe('a').enemies.length, 0);
    g.step([move(0, 1)]); step(g, 17);
    assert.equal(g.observe('a').enemies.length, 1);
    settleBrake(); near(Math.hypot(actor(g).velocity.x, actor(g).velocity.z), 0);
    near(shootingState(actor(g), g.state.time).spread, WEAPONS.rifle.spread);
    for (let i = 0; i < 3; i++) { g.step([bodyShot()]); if (i < 2) step(g, 5); }
    assert.ok(g.state.shots.every(s => s.hit === 'd' && s.part === 'body')); assert.equal(g.state.actors[1]!.hp, 16);
    g.step([move(0, -1)]); step(g, 17); g.step([move(0)]); step(g, 15);
    assert.equal(g.observe('a').enemies.length, 0); assert.equal(actor(g).weapons.rifle.ammo, 21);
    g.step([{ actorId: 'a', type: 'reload' }]); step(g, WEAPONS.rifle.reload - 2);
    assert.equal(actor(g).weapons.rifle.ammo, 21); assert.ok(actor(g).reload);
    g.step([bodyShot()]); assert.equal(g.state.shots.length, 3, 'last reload tick cannot fire before expiry');
    assert.equal(actor(g).weapons.rifle.ammo, 24); assert.equal(actor(g).reload, null);
    g.step([move(0, 1)]); step(g, 24); settleBrake();
    assert.equal(g.observe('a').enemies.length, 1); near(shootingState(actor(g), g.state.time).recoilIndex, 0);
    g.step([bodyShot()]); assert.equal(g.state.shots.at(-1)!.impact!.killed, true); assert.equal(g.state.result!.reason, 'elimination');
  } finally { g.dispose(); }
});

test('run-to-crouch slows rather than granting instant low-speed accuracy; pistol has its own recovery', async () => {
  const g = await Game.create(7, specs);
  try {
    g.step([move(1)]); step(g, 8);
    g.step([{ actorId: 'a', type: 'move', x: 1, z: 0, crouch: true }]);
    assert.ok(actor(g).velocity.x > MOVEMENT.crouchSpeed && actor(g).velocity.x < MOVEMENT.runSpeed);
    g.step([move(0), { actorId: 'a', type: 'switch', weapon: 'pistol' }]); step(g, 15);
    g.step([fire()]); step(g, 14); g.step([fire()]);
    const a = actor(g), last = a.weapons.pistol.lastShot;
    near(shootingState(a, last).recoilIndex, 2);
    assert.ok(shootingState(a, last + .3 * SECOND).recoilIndex > 0);
    near(shootingState(a, last + SECOND).recoilIndex, 0);
    assert.equal(a.weapons.rifle.recoil, 0, 'weapon recovery is not shared across slots');
  } finally { g.dispose(); }
});

test('unrelated timestamp samples cannot change wall sliding or choose the other side of a cover corner', async () => {
  for (const [position, direction] of [
    [{ x: 3.079, y: 0, z: 0 }, { x: 1, z: 1 }],
    [{ x: 2.8, y: 0, z: 7.6 }, { x: 1, z: -1 }],
  ] as const) {
    const roster: PlayerSpec[] = [{ id: 'a', team: 'amber', position }, { id: 'd', team: 'blue', position: { x: 10, y: 0, z: 14 } }];
    const a = await Game.create(3, roster), b = await Game.create(3, roster);
    try {
      for (let tick = 0; tick < 120; tick++) {
        const commands = tick === 0 ? [move(direction.x, direction.z)] : [];
        a.step(commands);
        b.step([...commands, ...[100, 300, 500, 700, 900].map(at => ({ actorId: 'd', type: 'aim' as const, yaw: Math.PI, pitch: 0, at }))]);
        assert.deepEqual(actor(a).position, actor(b).position);
        assert.deepEqual(actor(a).velocity, actor(b).velocity);
        assert.deepEqual(shootingState(actor(a), a.state.time), shootingState(actor(b), b.state.time));
        assert.deepEqual(a.state.sounds, b.state.sounds, 'query count cannot alter footsteps');
      }
    } finally { a.dispose(); b.dispose(); }
  }
});

test('automatic plant eligibility after coasting is fixed-tick, not unlocked early by aim samples', async () => {
  const roster: PlayerSpec[] = [{ id: 'a', team: 'amber', position: { x: 0, y: 0, z: 10 } }, { id: 'd', team: 'blue', position: { x: 10, y: 0, z: 14 } }];
  const a = await Game.create(1, roster, { plantTicks: 4 }), b = await Game.create(1, roster, { plantTicks: 4 });
  try {
    for (let tick = 0; tick < 12; tick++) {
      const commands: Command[] = tick === 0 ? [move(1), { actorId: 'a', type: 'interact', held: true }] : tick === 1 ? [move(0)] : [];
      a.step(commands); b.step([...commands, ...[100, 300, 500, 700, 900].map(at => ({ actorId: 'd', type: 'aim' as const, yaw: 0, pitch: 0, at }))]);
      assert.deepEqual(a.state.interaction, b.state.interaction);
      assert.deepEqual(a.state.bomb, b.state.bomb);
    }
    assert.equal(a.state.bomb.planted, true);
    assert.equal(a.state.bomb.explodeAt, 8000 + a.rules.bombTicks * 1000);
  } finally { a.dispose(); b.dispose(); }
  const explicit = await Game.create(1, roster, { plantTicks: 1 });
  try {
    explicit.step([{ actorId: 'a', type: 'interact', held: true, at: 321 }]);
    assert.equal(explicit.state.interaction!.since, 321);
    explicit.step(); assert.equal(explicit.state.bomb.explodeAt, 1321 + explicit.rules.bombTicks * 1000);
  } finally { explicit.dispose(); }
});
