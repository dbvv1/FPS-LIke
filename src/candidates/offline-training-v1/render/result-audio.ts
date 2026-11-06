import type { Actor, GameState } from '../sim/types.js';

export type ResultAudioPolicy = 'baseline' | 'result-cues-v1';
export type ResultCue = 'round-win' | 'round-loss';

/** An explicit listening candidate. Duplicated or unknown values keep baseline. */
export function resultAudioPolicyFromSearch(search: string): ResultAudioPolicy {
  const values = new URLSearchParams(search).getAll('matchAudio');
  return values.length === 1 && values[0] === 'result-cues-v1' ? 'result-cues-v1' : 'baseline';
}

/** The settled team result is authoritative; side, score and HUD text are not. */
export function settledResultCue(state: GameState, player: Actor): { key: string; cue: ResultCue } | null {
  if (state.phase !== 'over' || !state.result) return null;
  return {
    key: `${state.round}:${state.result.time}:${state.result.team}:${state.result.reason}`,
    cue: state.result.team === player.team ? 'round-win' : 'round-loss',
  };
}

// Original CC0-1.0 source bytes. Vite copies these WAVs without synthesis or gain edits.
export const resultCueUrls: Record<ResultCue, string> = {
  'round-win': new URL('../../../../asset-pipeline/match-cues/round-win.wav', import.meta.url).href,
  'round-loss': new URL('../../../../asset-pipeline/match-cues/round-loss.wav', import.meta.url).href,
};
