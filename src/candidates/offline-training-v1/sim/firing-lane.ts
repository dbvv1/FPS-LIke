import { WEAPONS } from '../content/weapons.js';
import { MAP } from '../content/map.js';
import type { Observation } from './game.js';
import { direction } from './math.js';
import { movementPenalty } from './movement.js';
import { eye, FLOOR, SHOT_RANGE } from './physics.js';
import type { Vec3 } from './types.js';

const axes = ['x', 'y', 'z'] as const;
function boxEntry(origin: Vec3, ray: Vec3, low: Vec3, high: Vec3, limit: number) {
  let near = 0, far = limit;
  for (const axis of axes) {
    if (low[axis] > high[axis]) return null;
    if (Math.abs(ray[axis]) < 1e-9) {
      if (origin[axis] < low[axis] || origin[axis] > high[axis]) return null;
    } else {
      const a = (low[axis] - origin[axis]) / ray[axis], b = (high[axis] - origin[axis]) / ray[axis];
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return null;
    }
  }
  return near;
}

// Squad observations already expose friendly positions. Use only those facts,
// never hidden enemies or the simulation RNG. Standing bounds intentionally
// cover a crouched ally too: their stance is not in this observation contract.
export function friendlyInFiringLane(o: Observation, yaw: number, pitch: number) {
  if (!o.allies?.length) return false;
  const observedEye = eye(o.self), ray = direction(yaw, pitch), weapon = WEAPONS[o.self.weapon];
  // The preceding stop requests standing. A crouched actor may stand, or stay
  // crouched if blocked, so neither possible shot origin may expose an ally.
  const origins = o.self.input.crouch ? [observedEye, { ...observedEye, y: o.self.position.y + 1.62 }] : [observedEye];
  // Bot emits stop before shoot. Legacy motion therefore has no move spread;
  // ground-v1 retains velocity, whose current public penalty is conservative
  // for that stop. Yaw and pitch can each deviate by spread, not one cone axis.
  const spread = weapon.spread + weapon.movingSpread * (o.self.velocity ? movementPenalty(o.self.velocity) : 0);
  return origins.some(origin => o.allies!.some(ally => {
    if (ally.id === o.self.id || ally.hp <= 0) return false;
    const low = { x: ally.position.x - .28, y: ally.position.y, z: ally.position.z - .28 };
    const high = { x: ally.position.x + .28, y: ally.position.y + 1.84, z: ally.position.z + .28 };
    const nearest = Math.hypot(...axes.map(axis => Math.max(low[axis] - origin[axis], 0, origin[axis] - high[axis])));
    if (nearest >= SHOT_RANGE) return false;
    const farthest = Math.hypot(...axes.map(axis => Math.max(Math.abs(low[axis] - origin[axis]), Math.abs(high[axis] - origin[axis]))));
    const limit = Math.min(SHOT_RANGE, farthest);
    // A missed enemy does not stop a bullet. Bound both angular deviations at
    // this ally's distance, rather than inflating every nearby box at 100 m.
    const padding = .02 + 2 * limit * spread;
    const expandedLow = { x: low.x - padding, y: low.y - padding, z: low.z - padding };
    const expandedHigh = { x: high.x + padding, y: high.y + padding, z: high.z + padding };
    const entry = boxEntry(origin, ray, expandedLow, expandedHigh, limit);
    if (entry === null) return false;
    // Only a wall's eroded interior proves every spread ray is stopped before
    // the ally. A center-ray wall hit alone does not protect its exposed edge.
    return ![FLOOR, ...MAP.walls].some(wall => {
      const innerLow = { x: wall.center.x - wall.half.x + padding, y: wall.center.y - wall.half.y + padding, z: wall.center.z - wall.half.z + padding };
      const innerHigh = { x: wall.center.x + wall.half.x - padding, y: wall.center.y + wall.half.y - padding, z: wall.center.z + wall.half.z - padding };
      const wallEntry = boxEntry(origin, ray, innerLow, innerHigh, entry);
      return wallEntry !== null && wallEntry < entry;
    });
  }));
}
