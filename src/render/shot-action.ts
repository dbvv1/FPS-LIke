import { WEAPONS } from '../content/weapons.js';
import { SUBTICKS, type Actor, type GameState, type Shot } from '../sim/types.js';

/** Accepted rifle shot, shared by rigid/skinned action consumers.
 * Rifle cooldown is shorter than the switch lock, so switching invalidates it.
 * Pistol cooldown can survive Math.max in switch handling; snapshots alone
 * cannot prove its weapon generation, so this selector does not accept pistol. Consumers still own their clip duration and source pre-roll.
 */
export function currentRifleShot(state: GameState, actor: Actor): Shot | undefined {
  if (actor.weapon !== 'rifle') return undefined;
  const last = actor.weapons.rifle.lastShot;
  if (state.phase !== 'live' || actor.hp <= 0 || actor.reload || state.time < last
    || actor.nextShot !== last + WEAPONS.rifle.interval * SUBTICKS) return undefined;
  return [...state.shots].reverse().find(shot => shot.actorId === actor.id
    && shot.weapon === actor.weapon && shot.time === last);
}
