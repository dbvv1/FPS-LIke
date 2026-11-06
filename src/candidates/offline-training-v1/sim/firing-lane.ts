import { WEAPONS } from '../content/weapons.js';
import type { Observation } from './game.js';
import { direction } from './math.js';
import { movementPenalty } from './movement.js';
import { eye } from './physics.js';

// Squad observations already expose friendly positions. Use only those facts,
// never hidden enemies or the simulation RNG. Standing bounds intentionally
// cover a crouched ally too: their stance is not in this observation contract.
export function friendlyInFiringLane(o: Observation, yaw: number, pitch: number, targetDistance: number) {
  if (!o.allies?.length || targetDistance <= 0) return false;
  const origin = eye(o.self), ray = direction(yaw, pitch), weapon = WEAPONS[o.self.weapon];
  // Bot emits stop before shoot. Legacy motion therefore has no move spread;
  // ground-v1 retains velocity, whose current public penalty is conservative
  // for that stop. Yaw and pitch can each deviate by spread, not one cone axis.
  const spread = weapon.spread + weapon.movingSpread * (o.self.velocity ? movementPenalty(o.self.velocity) : 0);
  const padding = .02 + targetDistance * Math.tan(2 * spread);
  return o.allies.some(ally => {
    if (ally.id === o.self.id || ally.hp <= 0) return false;
    let near = 0, far = targetDistance;
    for (const axis of ['x', 'y', 'z'] as const) {
      const low = ally.position[axis] + (axis === 'y' ? 0 : -.28) - padding;
      const high = ally.position[axis] + (axis === 'y' ? 1.84 : .28) + padding;
      if (Math.abs(ray[axis]) < 1e-9) {
        if (origin[axis] < low || origin[axis] > high) return false;
      } else {
        const a = (low - origin[axis]) / ray[axis], b = (high - origin[axis]) / ray[axis];
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
    }
    return near <= far;
  });
}
