import type { Input } from './types.js';
// Source-style order: ground friction, then acceleration along wish direction.
// World units are provisionally metres; parameters are a project calibration, not a CS2 measurement.
export const MOVEMENT = Object.freeze({ runSpeed: 4.5, walkSpeed: 2.3, crouchSpeed: 1.7, friction: 5.2, stopSpeed: 80 * 0.0254, acceleration: 5.5, accurateRatio: 0.34 });
export type Velocity = { x: number; z: number };
export function groundMovement(initial: Velocity, input: Input, dt: number) {
  const speed = Math.hypot(initial.x, initial.z);
  const remaining = Math.max(0, speed - Math.max(speed, MOVEMENT.stopSpeed) * MOVEMENT.friction * dt);
  const velocity = speed > 0 ? { x: initial.x * remaining / speed, z: initial.z * remaining / speed } : { x: 0, z: 0 };
  const length = Math.hypot(input.x, input.z);
  if (length > 0) {
    const x = input.x / length, z = input.z / length;
    const wishSpeed = (input.crouch ? MOVEMENT.crouchSpeed : input.walk ? MOVEMENT.walkSpeed : MOVEMENT.runSpeed) * Math.min(1, length);
    const add = Math.min(Math.max(0, wishSpeed - (velocity.x * x + velocity.z * z)), MOVEMENT.acceleration * dt * wishSpeed);
    velocity.x += x * add; velocity.z += z * add;
  }
  return { velocity, translation: { x: velocity.x * dt, y: -0.12 * dt, z: velocity.z * dt } };
}
export function movementPenalty(velocity: Velocity) {
  return Math.max(0, Math.min(1, (Math.hypot(velocity.x, velocity.z) / MOVEMENT.runSpeed - MOVEMENT.accurateRatio) / (1 - MOVEMENT.accurateRatio)));
}
