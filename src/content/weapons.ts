import { freeze } from './freeze.js';
import type { WeaponId } from '../sim/types.js';
type Weapon = {
  magazine: number; reserve: number; damage: number; headMultiplier: number;
  interval: number; reload: number; spread: number; movingSpread: number;
  recoil: readonly (readonly [number, number])[];
};
export const WEAPONS = freeze({
  rifle: {
    magazine: 24, reserve: 72, damage: 28, headMultiplier: 3,
    interval: 6, reload: 114, spread: 0.0015, movingSpread: 0.022,
    recoil: [[0, 0], [0.002, 0.006], [-0.003, 0.012], [0.004, 0.018], [-0.006, 0.023], [0.008, 0.027]],
  },
  pistol: {
    magazine: 10, reserve: 30, damage: 24, headMultiplier: 3,
    interval: 15, reload: 84, spread: 0.002, movingSpread: 0.017,
    recoil: [[0, 0], [-0.003, 0.007], [0.004, 0.012], [-0.005, 0.016]],
  },
} satisfies Record<WeaponId, Weapon>);
