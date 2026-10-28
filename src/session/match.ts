import type { Actor, GameState, RoundResult, Side } from '../sim/types.js';

export const MATCH_ROUNDS = 6;
export type MatchRound = { round: number; side: Side; won: boolean; reason: RoundResult['reason']; shots: number; hits: number; headHits: number };
export type MatchSummary = { rounds: MatchRound[]; complete: boolean; wins: number; losses: number; shots: number; hits: number; headHits: number; objectiveWins: number };

// Presentation/session policy only. Game remains the sole authority for each round.
export class TrainingMatch {
  private rounds: MatchRound[] = [];
  observe(state: GameState, player: Actor) {
    if (state.phase !== 'over' || !state.result || state.round !== this.rounds.length + 1 || state.round > MATCH_ROUNDS) return;
    const shots = state.shots.filter(shot => shot.actorId === player.id);
    const hits = shots.filter(shot => shot.hit && state.actors.some(a => a.id === shot.hit && a.team !== player.team));
    this.rounds.push({ round: state.round, side: player.side, won: state.result.team === player.team, reason: state.result.reason,
      shots: shots.length, hits: hits.length, headHits: hits.filter(shot => shot.part === 'head').length });
  }
  get summary(): MatchSummary {
    const rounds = this.rounds.map(round => ({ ...round }));
    const wins = rounds.filter(r => r.won).length;
    return { rounds, complete: rounds.length === MATCH_ROUNDS, wins, losses: rounds.length - wins,
      shots: rounds.reduce((sum, r) => sum + r.shots, 0), hits: rounds.reduce((sum, r) => sum + r.hits, 0),
      headHits: rounds.reduce((sum, r) => sum + r.headHits, 0),
      objectiveWins: rounds.filter(r => r.won && (r.reason === 'explosion' || r.reason === 'defuse')).length };
  }
  canAdvance(state: GameState) { return state.phase === 'over' && !this.summary.complete && state.round === this.rounds.length; }
  reset() { this.rounds = []; }
}

export function completeMatchRequested(search: string) {
  const values = new URLSearchParams(search).getAll('match');
  if (!values.length) return false;
  if (values.length !== 1 || values[0] !== 'complete-v1') throw new Error('Unknown match candidate; use ?match=complete-v1');
  return true;
}
