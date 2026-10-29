import { Game } from '../sim/game.js';
import { Navigation, initNavigation } from '../sim/navigation.js';
import { squadSpecs, squadBots } from '../session/squads.js';
import type { Command } from '../sim/types.js';
import { CaptureLifetime } from '../../../capture/lifetime.js';
export const REPLAY = Object.freeze({ seed: 1, difficulty: 'easy' as const, ticks: 120, hz: 60, playerInput: 'idle-zero-move' });
/** Same creation, normal rules and nine Bot command producers as the offline client.
 * Only its wall-clock/input-device driver is replaced. No state assignments. */
export async function prepareReplay(lifetime: CaptureLifetime) {
  await initNavigation(); lifetime.assertActive();
  const nav = lifetime.own(new Navigation());
  const game = lifetime.own(await Game.create(REPLAY.seed, squadSpecs(REPLAY.difficulty), {}, { formation: 'squads-v1' }));
  const bots = squadBots(REPLAY.difficulty, REPLAY.seed, nav);
  const commands: Command[][] = [];
  const advance = () => {
    lifetime.assertActive();
    const input: Command[] = [{ actorId: 'player', type: 'move', x: 0, z: 0 }, ...bots.flatMap(b => b.commands(game.observe(b.id)))];
    commands.push(structuredClone(input)); game.step(input);
  };
  for (let tick = 0; tick < REPLAY.ticks; tick++) advance();
  return { game, commands, advance, botIds: squadSpecs(REPLAY.difficulty).filter(s => s.bot).map(s => s.id) };
}
