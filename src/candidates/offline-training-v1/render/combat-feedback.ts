import type { Actor, GameState } from '../sim/types.js';
import type { ShotEffect } from './feedback.js';

export const DAMAGE_CUE_MS = 400;
export const DAMAGE_CUE_COLOR = 0xe56d55;
// Four symmetric corner brackets, in normalized screen coordinates. They report
// damage, never a hidden shooter's bearing. The central aiming area stays clear.
export const DAMAGE_RECTS: readonly (readonly [number, number, number, number])[] = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [
  [x * .9, y * .65, .12, .012] as const,
  [x * .954, y * .59, .012, .12] as const,
]));
export function damageCue(effects: readonly ShotEffect[], player: Actor): number {
  let strength = 0;
  for (const event of effects) {
    if (event.shot.impact?.kind !== 'actor' || event.shot.hit !== player.id || !(event.shot.damage > 0) || !Number.isFinite(event.age) || event.age < 0) continue;
    strength = Math.max(strength, Math.max(0, 1 - event.age / DAMAGE_CUE_MS));
  }
  return strength;
}
export type ImpactKind = 'ordinary' | 'enemy-body' | 'enemy-head' | 'enemy-kill' | 'friendly';
export function impactAppearance(state: GameState, player: Actor | null, event: ShotEffect) {
  const shot = event.shot, target = state.actors.find(actor => actor.id === shot.hit);
  let kind: ImpactKind = 'ordinary';
  if (player && shot.actorId === player.id && shot.impact?.kind === 'actor' && shot.damage > 0 && target) {
    kind = target.team === player.team ? 'friendly' : shot.impact.killed ? 'enemy-kill' : shot.part === 'head' ? 'enemy-head' : 'enemy-body';
  }
  const enemy = kind.startsWith('enemy-');
  return { kind, enemy, color: kind === 'friendly' ? 0xe56d55 : kind === 'enemy-body' ? 0xb7f3df : enemy ? 0xffcd7e : 0xe6c49a };
}
