import { Game } from '../sim/game.js';
import { Navigation, initNavigation } from '../sim/navigation.js';
import { squadSpecs, squadBots } from '../session/squads.js';
import type { Command } from '../sim/types.js';
import { observeMove, type MoveObservation } from './feel-trace.js';
import { CaptureLifetime } from '../../../capture/lifetime.js';
export const REPLAY = Object.freeze({ seed: 1, difficulty: 'easy' as const, ticks: 120, hz: 60, playerInput: 'idle-zero-move' });
/** Same creation, normal rules and nine Bot command producers as the offline client.
 * Only its wall-clock/input-device driver is replaced. No state assignments. */
export async function prepareReplay(lifetime: CaptureLifetime, feel = false) {
  await initNavigation(); lifetime.assertActive();
  const nav = lifetime.own(new Navigation());
  const game = lifetime.own(await Game.create(REPLAY.seed, squadSpecs(REPLAY.difficulty), {}, { formation: 'squads-v1' }));
  const bots = squadBots(REPLAY.difficulty, REPLAY.seed, nav);
  const commands: Command[][] = [];
  const observations: MoveObservation[] = [];
  let renderFrame = 0;
  const advance = () => {
    lifetime.assertActive();
    const beforeTick = game.state.tick;
    const beforePosition = { ...game.state.actors.find(a => a.id === 'player')!.position };
    const phase = beforeTick - REPLAY.ticks;
    const player: Command = { actorId: 'player', type: 'move', x: 0, z: feel && phase >= 0 && phase < 60 ? 1 : 0 };
    const input: Command[] = [player, ...bots.flatMap(b => b.commands(game.observe(b.id)))];
    commands.push(structuredClone(input)); game.step(input);
    if (feel && phase >= 0) {
      const afterPosition = game.state.actors.find(a => a.id === 'player')!.position;
      if (phase === 59 && Math.hypot(afterPosition.x-beforePosition.x, afterPosition.z-beforePosition.z) < 0.05) throw new Error('Feel tape blocked before stop: cannot measure release feedback');
      if (phase === 0 || phase === 60) observations.push(observeMove(phase === 0 ? 'move-start' : 'move-stop', renderFrame, beforeTick, player, game.state));
      renderFrame++;
    }
  };
  for (let tick = 0; tick < REPLAY.ticks; tick++) advance();
  return { game, commands, observations, advance, botIds: squadSpecs(REPLAY.difficulty).filter(s => s.bot).map(s => s.id) };
}
