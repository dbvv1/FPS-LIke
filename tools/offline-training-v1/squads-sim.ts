import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { squadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import { TrainingMatch } from '../../src/candidates/offline-training-v1/session/match.js';
import { squadPlan } from '../../src/candidates/offline-training-v1/sim/squads.js';
import { SECOND } from '../../src/candidates/offline-training-v1/sim/types.js';

// CPU evidence for the actual offline roster: the human slot deliberately has
// no commands, rather than quietly replacing the player with a tenth bot.
export async function runSquadMatch(seed: number) {
  await initNavigation();
  const nav = new Navigation();
  const game = await Game.create(seed, squadSpecs('normal'), {}, { formation: 'squads-v1' });
  const bots = squadBots('normal', seed, nav), match = new TrainingMatch();
  const activity = Object.fromEntries(bots.map(bot => [bot.id, { commands: 0, movingTicks: 0, shots: 0, distance: 0 }]));
  const rounds: { round: number; side: string; ticks: number; reason: string; winner: string; hash: string; shots: number; friendlyHits: number; noLosShots: number; finalActors: unknown[]; bomb: unknown }[] = [];
  try {
    for (let round = 1; round <= 6; round++) {
      const initialTick = game.state.tick;
      let previous = game.state;
      while (previous.phase === 'live' && previous.tick - initialTick < 6000) {
        const commands = bots.flatMap(bot => {
          const commands = bot.commands(game.observe(bot.id));
          activity[bot.id]!.commands += commands.length;
          return commands;
        });
        game.step(commands);
        const current = game.state;
        for (const actor of current.actors) {
          const a = activity[actor.id]; if (!a) continue;
          const old = previous.actors.find(v => v.id === actor.id)!;
          const distance = Math.hypot(actor.position.x - old.position.x, actor.position.z - old.position.z);
          a.distance += distance; if (distance > .001) a.movingTicks++;
        }
        previous = current;
      }
      const state = game.state, player = state.actors.find(a => a.id === 'player')!;
      if (!state.result) throw new Error(`Seed ${seed} round ${round} stalled after 6000 ticks`);
      match.observe(state, player);
      for (const shot of state.shots) if (activity[shot.actorId]) activity[shot.actorId]!.shots++;
      rounds.push({ finalActors: state.actors.map(a=>({id:a.id,hp:a.hp,position:a.position,planFromFreshStage0:a.bot?squadPlan(game.observe(a.id),Number(a.id.split('-')[1])-1):null,nearestLiveAlly:Math.min(...state.actors.filter(b=>b.id!==a.id&&b.team===a.team&&b.hp>0).map(b=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z))),objectivePath:state.bomb.carrier===a.id?nav.path(a.position, {x:0,y:0,z:10}):undefined})), bomb:state.bomb, round, side: player.side, ticks: state.tick - initialTick, reason: state.result.reason, winner: state.result.team, hash: game.stateHash, shots: state.shots.length,
        noLosShots: state.shots.filter(s => !s.targetId || !s.targetVisible).length,
        friendlyHits: state.shots.filter(s => s.hit && state.actors.find(a => a.id === s.hit)?.team === state.actors.find(a => a.id === s.actorId)?.team).length });
      if (round < 6) game.nextRound();
    }
    return { seed, formation: game.options, playerInput: 'idle' as const, botCount: bots.length, complete: match.summary.complete, score: game.state.score, rounds, activity,
      seconds: rounds.map(r => r.ticks * 1000 / SECOND), noLosShots: rounds.reduce((n, r) => n + r.noLosShots, 0), finalHash: game.stateHash };
  } finally { game.dispose(); nav.dispose(); }
}

if (process.argv[1]?.endsWith('/squads-sim.ts')) {
  const args = process.argv.slice(2), seedAt = args.indexOf('--seed'), seedsAt = args.indexOf('--seeds');
  const seed = seedAt < 0 ? 1 : Number(args[seedAt + 1]), count = seedsAt < 0 ? 3 : Number(args[seedsAt + 1]);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(count) || count < 1 || count > 100) throw new Error('Use --seed <uint32> --seeds <1..100> [--replay]');
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await runSquadMatch((seed + i) >>> 0);
    let replayEqual: boolean | null = null;
    if (args.includes('--replay')) replayEqual = JSON.stringify(result) === JSON.stringify(await runSquadMatch((seed + i) >>> 0));
    results.push({ ...result, replayEqual });
    console.error(`seed=${result.seed} complete=${result.complete} noLosShots=${result.noLosShots} replayEqual=${replayEqual}`);
  }
  console.log(JSON.stringify({ mode: 'CPU simulation; no browser/GPU/play acceptance', results }, null, 2));
  if (results.some(r => !r.complete || r.noLosShots || r.replayEqual === false)) process.exitCode = 1;
}
