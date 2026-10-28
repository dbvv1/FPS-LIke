import { Game } from '../src/candidates/movement-v2/sim/game.js';
import { Bot } from '../src/candidates/movement-v2/sim/bot.js';
import { initNavigation, Navigation } from '../src/candidates/movement-v2/sim/navigation.js';
import { SECOND, type Difficulty, type WeaponId } from '../src/candidates/movement-v2/sim/types.js';
export function parseArgs(args: string[]) {
  const options = { games: 200, seed: 1, attack: 'normal' as Difficulty, defend: 'normal' as Difficulty, weapon: 'mixed' as 'mixed' | WeaponId };
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]?.replace(/^--/, ''), value = args[i + 1];
    if (!name || value === undefined || !['games', 'seed', 'attack', 'defend', 'weapon'].includes(name)) throw new Error('Usage: --games <1..10000> --seed <uint32> --attack <easy|normal|hard> --defend <easy|normal|hard>');
    if (name === 'games' || name === 'seed') {
      const n = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < (name === 'games' ? 1 : 0) || n > (name === 'games' ? 10000 : 0xffffffff)) throw new Error(`Invalid ${name}`);
      options[name] = n;
    } else if (name === 'weapon') {
      if (!['mixed', 'rifle', 'pistol'].includes(value)) throw new Error('Invalid weapon');
      options.weapon = value as typeof options.weapon;
    } else {
      if (!['easy', 'normal', 'hard'].includes(value)) throw new Error('Invalid difficulty');
      options[name as 'attack' | 'defend'] = value as Difficulty;
    }
  }
  return options;
}
export async function runBatch(options: ReturnType<typeof parseArgs>) {
  await initNavigation();
  const nav = new Navigation();
  const totals = { games: options.games, seed: options.seed, attackDifficulty: options.attack, defendDifficulty: options.defend, loadout: options.weapon, wins: { attack: 0, defend: 0 }, reasons: {} as Record<string, number>, exceptions: 0, stalls: 0, botNoLosShots: 0, durationSeconds: [] as number[], stateHashes: [] as string[], reactions: { attack: [] as number[], defend: [] as number[] }, weapons: Object.fromEntries(['rifle', 'pistol'].map(w => [w, { shots: 0, hits: 0, headshots: 0, kills: 0, killSeconds: [] as number[] }])) as Record<WeaponId, { shots: number; hits: number; headshots: number; kills: number; killSeconds: number[] }> };
  try {
    for (let i = 0; i < options.games; i++) {
      const seed = (options.seed + i) >>> 0;
      const game = await Game.create(seed, [{ id: 'a', team: 'amber', bot: options.attack }, { id: 'd', team: 'blue', bot: options.defend }]);
      try {
        const weapon = options.weapon === 'mixed' ? i % 2 ? 'pistol' : 'rifle' : options.weapon;
        const bots = [new Bot('a', options.attack, seed ^ 0x9e3779b9, nav, weapon), new Bot('d', options.defend, seed ^ 0x85ebca6b, nav, weapon)];
        let ticks = 0;
        while (game.observe('a').phase === 'live' && ticks++ < 6000) game.step(bots.flatMap(b => b.commands(game.observe(b.id))));
        const state = game.state;
        if (!state.result) { totals.stalls++; continue; }
        totals.wins[state.result.winner]++;
        totals.reasons[state.result.reason] = (totals.reasons[state.result.reason] ?? 0) + 1;
        totals.durationSeconds.push(state.result.time / SECOND);
        totals.stateHashes.push(game.stateHash);
        totals.reactions.attack.push(...bots[0]!.reactions); totals.reactions.defend.push(...bots[1]!.reactions);
        const hp = new Map(state.actors.map(a => [a.id, 100]));
        const firstDamage = new Map<string, number>();
        for (const shot of state.shots) {
          const w = totals.weapons[shot.weapon]; w.shots++;
          if (!shot.targetId || !shot.targetVisible) totals.botNoLosShots++;
          if (shot.hit) {
            w.hits++; if (shot.part === 'head') w.headshots++;
            if (!firstDamage.has(shot.hit)) firstDamage.set(shot.hit, shot.time);
            const remaining = hp.get(shot.hit)! - shot.damage;
            hp.set(shot.hit, remaining);
            if (remaining <= 0) { w.kills++; w.killSeconds.push((shot.time - firstDamage.get(shot.hit)!) / SECOND); }
          }
        }
      } catch (error) { totals.exceptions++; console.error(`Game seed ${seed} failed:`, error); }
      finally { game.dispose(); }
    }
  } finally { nav.dispose(); }
  const distribution = (v: number[]) => {
    const a = [...v].sort((x, y) => x - y);
    return { count: a.length, min: a[0] ?? null, median: a[Math.floor(a.length / 2)] ?? null, p95: a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] ?? null, max: a.at(-1) ?? null, mean: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null };
  };
  return { ...totals, attackerWinRate: totals.wins.attack / options.games, durationSeconds: distribution(totals.durationSeconds), reactions: { attack: distribution(totals.reactions.attack), defend: distribution(totals.reactions.defend) }, weapons: Object.fromEntries(Object.entries(totals.weapons).map(([id, w]) => [id, { ...w, hitRate: w.shots ? w.hits / w.shots : null, headshotRate: w.hits ? w.headshots / w.hits : null, killSeconds: distribution(w.killSeconds) }])) };
}
if (process.argv[1]?.endsWith('/sim-movement-v2.ts')) {
  try {
    const result = await runBatch(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    if (result.exceptions || result.stalls || result.botNoLosShots) process.exitCode = 1;
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
