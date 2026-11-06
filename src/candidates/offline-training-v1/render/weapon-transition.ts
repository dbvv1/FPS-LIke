import { SUBTICKS, type Actor, type GameState, type WeaponId } from '../sim/types.js';
import type { weaponPose } from './weapon.js';

type Pose = ReturnType<typeof weaponPose>;
export type WeaponFrame = { weapon: WeaponId; pose: Pose; drop: number; phase: 'ready' | 'lower' | 'raise'; progress: number };
export const WEAPON_DROP = 1.6;
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export const readyWeapon = (actor: Actor, pose: Pose): WeaponFrame => ({ weapon: actor.weapon, pose, drop: 0, phase: 'ready', progress: 1 });

// Presentation of the already selected weapon, not a source clip or a new
// gameplay clock. Generation identifies observed switch-away/back histories.
// The snapshot has no switch timestamp: start at the first observed change,
// and finish no later than the existing firing gate. Never replay missed swaps.
export class WeaponTransition {
  private observed: { id: string; round: number; time: number; weapon: WeaponId; generation: number | undefined } | null = null;
  private last: WeaponFrame | null = null;
  private transition: { from: WeaponFrame; start: number; end: number } | null = null;
  sample(state: GameState, actor: Actor, pose: Pose): WeaponFrame {
    const previous = this.observed;
    if (previous && (previous.id !== actor.id || previous.round !== state.round || state.time < previous.time || (actor.weaponGeneration !== undefined && previous.generation !== undefined && actor.weaponGeneration < previous.generation))) this.reset();
    const observed = this.observed;
    const changed = observed && (observed.weapon !== actor.weapon || (observed.generation !== undefined && actor.weaponGeneration !== undefined && observed.generation !== actor.weaponGeneration));
    if (changed) {
      // nextShot can also have advanced because the new gun already fired
      // between renders. Its real shot wins; do not hide it behind a late swap.
      const fired = state.shots.some(shot => shot.actorId === actor.id && shot.weapon === actor.weapon && shot.weaponGeneration === actor.weaponGeneration && shot.time >= observed.time && shot.time <= state.time);
      const budget = Math.min(12 * SUBTICKS, Math.max(0, actor.nextShot - state.time));
      this.transition = this.last && budget > 0 && !fired ? { from: { ...this.last, pose: { ...this.last.pose, kick: 0, flash: 0 } }, start: state.time, end: state.time + budget } : null;
    }
    this.observed = { id: actor.id, round: state.round, time: state.time, weapon: actor.weapon, generation: actor.weaponGeneration };
    if (actor.hp <= 0 || state.phase !== 'live' || (this.transition && state.time >= this.transition.end)) this.transition = null;
    const transition = this.transition;
    if (!transition) return this.last = readyWeapon(actor, pose);
    const progress = Math.max(0, Math.min(1, (state.time - transition.start) / (transition.end - transition.start)));
    // Keep outgoing parts together, including an interrupted magazine/hand
    // pose, then exchange models below the viewport. The offset is outside
    // the arm solver so it cannot stretch camera-anchored sleeves.
    if (progress < .5) return this.last = { ...transition.from, drop: transition.from.drop + (1 - transition.from.drop) * smooth(progress * 2), phase: 'lower', progress };
    return this.last = { weapon: actor.weapon, pose: { ...pose, kick: 0, flash: 0 }, drop: 1 - smooth((progress - .5) * 2), phase: 'raise', progress };
  }
  reset() { this.observed = null; this.last = null; this.transition = null; }
}
