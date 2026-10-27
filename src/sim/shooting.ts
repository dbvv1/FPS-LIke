import { MOVEMENT } from '../content/movement.js';
import { WEAPONS } from '../content/weapons.js';
import { SECOND, type Actor } from './types.js';

/** The one read-only source for the next shot, bot compensation and accuracy HUD.
 * Recovery is sampled from the last shot's timestamp, never accumulated per render/logic frame.
 */
export function shootingState(actor: Actor, time: number) {
  const weapon = WEAPONS[actor.weapon], mag = actor.weapons[actor.weapon];
  const recoverySeconds = Math.max(0, (time - mag.lastShot) / SECOND - weapon.recoveryDelay);
  const recoilIndex = Math.max(0, mag.recoil - recoverySeconds * weapon.recoveryRate);
  const index = Math.min(weapon.recoil.length - 1, recoilIndex);
  const lower = Math.floor(index), blend = index - lower;
  const a = weapon.recoil[lower]!, b = weapon.recoil[Math.min(lower + 1, weapon.recoil.length - 1)]!;
  const recoilYaw = a[0] + (b[0] - a[0]) * blend, recoilPitch = a[1] + (b[1] - a[1]) * blend;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const movement = Math.min(1, speed / MOVEMENT.runSpeed);
  const spread = weapon.spread + weapon.movingSpread * movement + weapon.firingSpread * Math.min(index, 8);
  return { speed, movement, spread, recoilIndex, recoilYaw, recoilPitch };
}
