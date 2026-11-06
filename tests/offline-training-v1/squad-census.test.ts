import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game, type Observation } from '../../src/candidates/offline-training-v1/sim/game.js';
import { squadSpecs } from '../../src/candidates/offline-training-v1/session/squads.js';
import { squadPlan } from '../../src/candidates/offline-training-v1/sim/squads.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';
import type { Actor, Command, GameState } from '../../src/candidates/offline-training-v1/sim/types.js';
import { runSquadMatch } from '../../tools/offline-training-v1/squads-sim.js';

// The census matrix is fixed by the task: eight seeds, the original idle player
// slot, normal difficulty, default movement, and the full six-round match.
const SEEDS = [1, 7, 19, 31, 73, 127, 257, 509];

type RecordedTick = { round: number; tick: number; commands: Command[]; state: GameState; stateHash: string };

type CensusSummary = {
  steps: number; tape: string; drops: number; pickups: number; sameStepTakeovers: number; heldInteract: number;
  kills: number; teamKills: number; roleChanges: number; recoverAssignments: number; recoverTicks: number;
  defuseTicks: number; coverTicks: number; carrierStallMax: number; dropStallMax: number;
};

// Values are the deterministic report of this exact matrix. The first test
// asserts every field below; per-round winners/ticks/survivors in
// docs/verification/squad-census.md stay report values.
const EXPECTED: Record<number, CensusSummary> = {
  1: { steps: 3038, tape: '9850291633588eb89a9c34d3ef4a74e16251a5941488432b3907ed29f9591985', drops: 6, pickups: 3, sameStepTakeovers: 1, heldInteract: 0, kills: 53, teamKills: 36, roleChanges: 24, recoverAssignments: 6, recoverTicks: 641, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 364 },
  7: { steps: 1783, tape: 'b49904c1d36411533e722caee06a45fbe222833efb756d2c0b834354ce7b2fb5', drops: 6, pickups: 1, sameStepTakeovers: 0, heldInteract: 0, kills: 49, teamKills: 37, roleChanges: 20, recoverAssignments: 6, recoverTicks: 591, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 255 },
  19: { steps: 2265, tape: '9b86707e3bb10d871725801076a415e99e5452e5af8e4c09843e917e78fdc85d', drops: 6, pickups: 2, sameStepTakeovers: 2, heldInteract: 0, kills: 51, teamKills: 34, roleChanges: 24, recoverAssignments: 6, recoverTicks: 474, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 368 },
  31: { steps: 2023, tape: '2b29a73e287185d34c5e05bdaafde3f27b712b72b2034256ccedaf30a3131bcd', drops: 5, pickups: 2, sameStepTakeovers: 2, heldInteract: 0, kills: 49, teamKills: 32, roleChanges: 22, recoverAssignments: 5, recoverTicks: 507, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 184 },
  73: { steps: 2562, tape: 'd017449371b27f35c66cfa1a93b607942d4bd4848458017840bc90e7607fd132', drops: 6, pickups: 2, sameStepTakeovers: 0, heldInteract: 0, kills: 52, teamKills: 36, roleChanges: 21, recoverAssignments: 6, recoverTicks: 502, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 340 },
  127: { steps: 1869, tape: '8f0cb9cb65958005de6507841940ef462400c85c611f05e544c881b81732d8e9', drops: 6, pickups: 1, sameStepTakeovers: 1, heldInteract: 0, kills: 50, teamKills: 40, roleChanges: 22, recoverAssignments: 6, recoverTicks: 486, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 280 },
  257: { steps: 1673, tape: '0c9a143e94a44853e6edf36d786d59ecc8724c586750eb299d81fa32d5e116d6', drops: 6, pickups: 1, sameStepTakeovers: 3, heldInteract: 0, kills: 50, teamKills: 31, roleChanges: 25, recoverAssignments: 6, recoverTicks: 416, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 178 },
  509: { steps: 2264, tape: '717b7f66d49867a4c5cdbe8904d27f0c2e238070e4cb9e08e70b5e39cc63119b', drops: 6, pickups: 1, sameStepTakeovers: 2, heldInteract: 0, kills: 51, teamKills: 36, roleChanges: 24, recoverAssignments: 6, recoverTicks: 605, defuseTicks: 0, coverTicks: 0, carrierStallMax: 122, dropStallMax: 569 },
};

const flatDistance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// squadPlan is public and only reads side/bomb/friendly positions/slot. Rebuild
// the same Observation shape the bot saw, from the observer snapshot.
function roleAt(state: GameState, actor: Actor) {
  const allies = state.actors.filter(a => a.team === actor.team).map(a => ({ id: a.id, position: a.position, hp: a.hp, bot: a.bot }));
  const observation: Observation = {
    time: state.time, round: state.round, phase: state.phase, self: actor,
    allies, enemies: [], bodyVisibleIds: [], sounds: [],
    bomb: { planted: state.bomb.planted, position: state.bomb.position, carrier: actor.side === 'attack' ? state.bomb.carrier : null },
  };
  return squadPlan(observation, Number(actor.id.split('-')[1]) - 1).role;
}

function carrierAt(state: GameState) { return state.bomb.planted ? null : state.bomb.carrier; }

function distanceToSite(state: GameState, carrier: string) {
  const actor = state.actors.find(a => a.id === carrier);
  return actor ? flatDistance(actor.position, MAP.site) : Infinity;
}

function summarize(records: RecordedTick[]): CensusSummary {
  const tape = createHash('sha256').update(JSON.stringify(records.map(r => r.commands))).digest('hex');
  // drops counts observable no-carrier ticks: a carrier death that a nearby
  // teammate picks up in the same step leaves no null-carrier tick and shows up
  // as sameStepTakeovers instead (the sim has no voluntary handoff command).
  let drops = 0, pickups = 0, sameStepTakeovers = 0, heldInteract = 0;
  let roleChanges = 0, recoverAssignments = 0, recoverTicks = 0, defuseTicks = 0, coverTicks = 0;
  // Roles carry across rounds: only the first lifetime record has no previous
  // role, and round 2-6 opening ticks compare against the prior round's last
  // live role (side switches make those changes count).
  const previousRole = new Map<string, string>();
  for (const record of records) {
    for (const command of record.commands) if (command.type === 'interact' && command.held) heldInteract++;
    for (const actor of record.state.actors) {
      if (!actor.bot || actor.hp <= 0) continue;
      const role = roleAt(record.state, actor);
      const before = previousRole.get(actor.id);
      if (before !== undefined && before !== role) {
        roleChanges++;
        if (role === 'recover') recoverAssignments++;
      }
      previousRole.set(actor.id, role);
      if (role === 'recover') recoverTicks++;
      if (role === 'defuse') defuseTicks++;
      if (role === 'cover') coverTicks++;
    }
  }

  const byRound = new Map<number, RecordedTick[]>();
  for (const record of records) {
    const list = byRound.get(record.round) ?? [];
    list.push(record);
    byRound.set(record.round, list);
  }

  let carrierStallMax = 0, dropStallMax = 0;
  for (const list of byRound.values()) {
    let carrier: string | null | undefined;
    let minDistance = Infinity, streak = 0;
    for (const record of list) {
      const current = carrierAt(record.state);
      if (carrier === undefined) {
        carrier = current;
        if (current) minDistance = distanceToSite(record.state, current);
        continue;
      }
      if (current !== carrier) {
        if (!record.state.bomb.planted) {
          if (carrier === null && current !== null) pickups++;
          else if (carrier !== null && current === null) drops++;
          else if (carrier !== null && current !== null) sameStepTakeovers++;
        }
        carrier = current;
        if (current) { minDistance = distanceToSite(record.state, current); streak = 0; }
      } else if (current) {
        const distance = distanceToSite(record.state, current);
        if (distance < minDistance - 0.05) { minDistance = distance; streak = 0; } else streak++;
        if (streak > carrierStallMax) carrierStallMax = streak;
      }
    }
    // Drop stall counts the no-carrier ticks strictly after the drop tick, until
    // the next carrier or round end (this is the per-round maximum reported later).
    for (let i = 1; i < list.length; i++) {
      const previous = carrierAt(list[i - 1]!.state), current = carrierAt(list[i]!.state);
      if (previous === null || current !== null) continue;
      let count = 0;
      for (let j = i + 1; j < list.length; j++) {
        if (carrierAt(list[j]!.state) !== null) break;
        count++;
      }
      if (count > dropStallMax) dropStallMax = count;
    }
  }

  let kills = 0, teamKills = 0;
  for (const list of byRound.values()) {
    const state = list[list.length - 1]!.state;
    for (const shot of state.shots) {
      if (!shot.impact?.killed || !shot.hit) continue;
      kills++;
      const shooterTeam = state.actors.find(a => a.id === shot.actorId)?.team;
      const victimTeam = state.actors.find(a => a.id === shot.hit)?.team;
      if (shooterTeam === victimTeam) teamKills++;
    }
  }

  return { steps: records.length, tape, drops, pickups, sameStepTakeovers, heldInteract, kills, teamKills, roleChanges, recoverAssignments, recoverTicks, defuseTicks, coverTicks, carrierStallMax, dropStallMax };
}

async function replay(seed: number, records: RecordedTick[]) {
  const game = await Game.create(seed, squadSpecs('normal'), {}, { formation: 'squads-v1' });
  let mismatch: unknown = null, steps = 0, i = 0;
  try {
    while (i < records.length) {
      const round = records[i]!.round;
      // Round boundaries are replayed through the original Game.nextRound();
      // no bot controller runs on this side.
      if (game.state.round !== round) {
        if (game.state.phase !== 'over') { mismatch = { reason: 'round-boundary-not-over', round, tick: game.state.tick }; break; }
        game.nextRound();
      }
      while (i < records.length && records[i]!.round === round) {
        const rec = records[i]!;
        game.step(rec.commands);
        steps++;
        if (game.stateHash !== rec.stateHash || game.state.tick !== rec.tick) {
          mismatch = { round, tick: rec.tick, expectedHash: rec.stateHash, actualHash: game.stateHash, actualTick: game.state.tick, stepIndex: i };
          break;
        }
        i++;
      }
      if (mismatch) break;
    }
    return { mismatch, steps, finalHash: game.stateHash, finalRound: game.state.round, phase: game.state.phase };
  } finally { game.dispose(); }
}

test('eight-seed census: detached observer records replay every tick without controllers', async () => {
  for (const seed of SEEDS) {
    const records: RecordedTick[] = [];
    let observed = 0;
    const result = await runSquadMatch(seed, false, record => {
      observed++;
      // Keep our own copy first, then prove the provided objects are detached by
      // destroying them. A shared reference would corrupt the running match.
      records.push({ round: record.round, tick: record.tick, commands: structuredClone(record.commands), state: structuredClone(record.state), stateHash: record.stateHash });
      record.state.actors.length = 0;
      record.state.shots.length = 0;
      record.state.bomb.carrier = 'tampered-by-observer';
      record.commands.length = 0;
    });
    assert.equal(result.complete, true, `seed ${seed} must complete six rounds`);
    assert.equal(observed, records.length);
    assert.equal(records.length, result.rounds.reduce((sum, round) => sum + round.ticks, 0), `seed ${seed} must expose one record per step`);
    assert.deepEqual([...new Set(records.map(r => r.round))], [1, 2, 3, 4, 5, 6]);

    const replayed = await replay(seed, records);
    assert.deepEqual(replayed.mismatch, null, `seed ${seed} replay diverged: ${JSON.stringify(replayed.mismatch)}`);
    assert.equal(replayed.steps, records.length);
    assert.equal(replayed.finalRound, 6);
    assert.equal(replayed.finalHash, result.finalHash, `seed ${seed} replay final hash`);

    const summary = summarize(records);
    const reasons = [...new Set(result.rounds.map(r => r.reason))].map(reason => `${reason}:${result.rounds.filter(r => r.reason === reason).length}`).join(',');
    console.log(`census seed=${seed} rounds=${result.rounds.length} steps=${summary.steps} reasons=${reasons} tape=${summary.tape} drops=${summary.drops} pickups=${summary.pickups} sameStepTakeovers=${summary.sameStepTakeovers} heldInteract=${summary.heldInteract} kills=${summary.kills} teamKills=${summary.teamKills} roleChanges=${summary.roleChanges} recoverAssignments=${summary.recoverAssignments} recoverTicks=${summary.recoverTicks} defuseTicks=${summary.defuseTicks} coverTicks=${summary.coverTicks} carrierStallMax=${summary.carrierStallMax} dropStallMax=${summary.dropStallMax}`);
    for (const [field, expected] of Object.entries(EXPECTED[seed]!)) {
      assert.equal((summary as unknown as Record<string, unknown>)[field], expected, `seed ${seed} ${field}`);
    }
  }
});

test('observer dependency is optional and invalid seeds stay rejected', async () => {
  // Without the optional observer the legacy return value is unchanged.
  const legacy = await runSquadMatch(1);
  const observed = await runSquadMatch(1, false, () => {});
  assert.deepEqual(observed, legacy);

  await assert.rejects(runSquadMatch(-1), /seed must be a uint32/);
  await assert.rejects(runSquadMatch(0x1_0000_0000), /seed must be a uint32/);
});

test('CLI entry rejects an invalid seed instead of silently doing nothing', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'tools/offline-training-v1/squads-sim.ts', '--seed', 'nope'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Use --seed <uint32> --seeds <1\.\.100>/);
});
