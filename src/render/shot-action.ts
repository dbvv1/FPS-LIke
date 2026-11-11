import { WEAPONS } from '../content/weapons.js';
import { SUBTICKS, type Actor, type GameState, type Shot } from '../sim/types.js';

/** Snapshot-only presentation selection. New Game shots explicitly record whether
 * an accepted switch cancelled their action, including two switches between
 * rendered frames. Missing facts are only provable for the short rifle cooldown;
 * legacy pistol snapshots fail closed rather than inventing switch history.
 */
export function currentWeaponShot(state: GameState, actor: Actor): Shot | undefined {
  const last = actor.weapons[actor.weapon].lastShot;
  if (state.phase !== 'live' || actor.hp <= 0 || actor.reload || state.time < last) return undefined;
  const shot = [...state.shots].reverse().find(shot => shot.actorId === actor.id
    && shot.weapon === actor.weapon && shot.time === last);
  if (!shot || shot.weaponActionActive === false) return undefined;
  if (shot.weaponActionActive === true) return shot;
  return actor.weapon === 'rifle' && actor.nextShot === last + WEAPONS.rifle.interval * SUBTICKS ? shot : undefined;
}

/** Keep the Knight rifle-only contract; no pistol animation is implied. */
export function currentRifleShot(state: GameState, actor: Actor): Shot | undefined {
  return actor.weapon === 'rifle' ? currentWeaponShot(state, actor) : undefined;
}
