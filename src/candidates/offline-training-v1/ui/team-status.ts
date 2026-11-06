import type { GameState, Team } from '../sim/types.js';

/** Aggregate survivors for one team. Only counts cross the HUD boundary. */
export type TeamAlive = { alive: number; total: number };
export type TeamStatus = { allies: TeamAlive; enemies: TeamAlive };

/**
 * Stable team census for the local player. Death stays the simulation's
 * existing `hp > 0` definition, so no parallel actor state is introduced.
 * Returns null when the observer is not part of this state.
 */
export function teamStatus(state: GameState, playerId: string): TeamStatus | null {
  const player = state.actors.find(actor => actor.id === playerId);
  if (!player) return null;
  const tally = (team: Team): TeamAlive => {
    let alive = 0, total = 0;
    for (const actor of state.actors) {
      if (actor.team !== team) continue;
      total++;
      if (actor.hp > 0) alive++;
    }
    return { alive, total };
  };
  return { allies: tally(player.team), enemies: tally(player.team === 'amber' ? 'blue' : 'amber') };
}
