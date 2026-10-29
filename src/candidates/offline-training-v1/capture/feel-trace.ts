import type { Command, GameState } from '../sim/types.js';
export type MoveObservation = {
  id: string; enteredAfterRenderFrame: number; beforeTick: number; targetTick: number;
  command: Command; resultTick: number; acceptance: 'accepted' | 'not-observed';
  proof: string; position: { x: number; y: number; z: number };
};
/** CPU observations only. Does not claim screen presentation or heard audio. */
export function observeMove(id: string, enteredAfterRenderFrame: number, beforeTick: number, command: Command, state: GameState): MoveObservation {
  if (command.type !== 'move' || !Number.isInteger(enteredAfterRenderFrame) || enteredAfterRenderFrame < 0) throw new Error('Invalid move trace');
  const actor = state.actors.find(a => a.id === command.actorId);
  if (!actor) throw new Error('Trace actor missing');
  const scale = Math.max(1, Math.hypot(command.x, command.z));
  const accepted = state.tick === beforeTick + 1 && actor.hp > 0 && actor.input.x === command.x / scale && actor.input.z === command.z / scale;
  return { id, enteredAfterRenderFrame, beforeTick, targetTick: beforeTick + 1, command: structuredClone(command), resultTick: state.tick,
    acceptance: accepted ? 'accepted' : 'not-observed', proof: 'post-step player movement input equals requested normalized axes; no general command ACK', position: { ...actor.position } };
}
export const FEEL_SCOPE = Object.freeze({
  mode: 'fixed-game-command-replay', simulationHz: 60, recordingFps: 60,
  timing: 'virtual frames; not real-time device latency, rAF timing, compositor presentation or display scanout',
  audio: 'unknown: no audio track recorded', firstVisibleFrame: null,
  visualReview: 'pending: capture every frame including frame 0, hash files and have a non-author inspect first visible change; render submission is not visual evidence',
});
