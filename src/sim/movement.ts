import { MOVEMENT } from '../content/movement.js';
import type { Input, PlanarVelocity } from './types.js';

/** Integrate constant acceleration exactly, including reaching the target and reversing.
 * Input selects a target velocity; it never writes position. Physics.move owns collision motion.
 */
export function integrateMovement(initial: PlanarVelocity, input: Input, seconds: number) {
  const speed = input.crouch ? MOVEMENT.crouchSpeed : input.walk ? MOVEMENT.walkSpeed : MOVEMENT.runSpeed;
  const target = { x: input.x * speed, z: input.z * speed };
  let velocity = { ...initial }, remaining = seconds;
  const translation = { x: 0, y: -0.12 * seconds, z: 0 };
  while (remaining > 1e-12) {
    const dx = target.x - velocity.x, dz = target.z - velocity.z, distance = Math.hypot(dx, dz);
    if (distance < 1e-10) {
      velocity = { ...target };
      translation.x += target.x * remaining; translation.z += target.z * remaining;
      break;
    }
    const targetLength = Math.hypot(target.x, target.z), dot = velocity.x * target.x + velocity.z * target.z;
    const reversing = targetLength > 0 && dot < -1e-10;
    const rate = targetLength === 0 ? MOVEMENT.releaseBrake : reversing ? MOVEMENT.reverseBrake : MOVEMENT.acceleration;
    const ax = dx / distance * rate, az = dz / distance * rate;
    let duration = Math.min(remaining, distance / rate);
    // Once the component opposing the desired direction reaches zero, use normal acceleration.
    if (reversing) duration = Math.min(duration, -dot / (ax * target.x + az * target.z));
    translation.x += velocity.x * duration + 0.5 * ax * duration * duration;
    translation.z += velocity.z * duration + 0.5 * az * duration * duration;
    velocity = { x: velocity.x + ax * duration, z: velocity.z + az * duration };
    remaining -= duration;
  }
  if (Math.hypot(velocity.x - target.x, velocity.z - target.z) < 1e-10) velocity = { ...target };
  return { velocity, translation };
}
