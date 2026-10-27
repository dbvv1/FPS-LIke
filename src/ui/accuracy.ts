import { shootingState } from '../sim/shooting.js';
import type { Actor } from '../sim/types.js';

/** Symmetric, conservative next-shot envelope around the unchanged input-aim dot.
 * The 5 px minimum keeps the marks legible; this is not a hit guarantee/target assist.
 * Both existing renderers use an 80 degree vertical field of view.
 */
export function accuracyReticle(actor: Actor, time: number, viewportHeight: number) {
  const accuracy = shootingState(actor, time);
  const envelope = accuracy.spread + Math.max(Math.abs(accuracy.recoilYaw), Math.abs(accuracy.recoilPitch));
  const focalLength = Math.max(1, viewportHeight) / (2 * Math.tan(40 * Math.PI / 180));
  return { ...accuracy, gap: Math.max(5, Math.tan(envelope) * focalLength) };
}
