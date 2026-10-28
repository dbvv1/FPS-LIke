import { freeze } from './freeze.js';
import type { WeaponId } from '../sim/types.js';
type Weapon = {
  magazine: number; reserve: number; damage: number; headMultiplier: number;
  interval: number; reload: number; spread: number; movingSpread: number;
  firingSpread: number; recoveryDelay: number; recoveryRate: number;
  recoil: readonly (readonly [number, number])[];
};
export const WEAPONS = freeze({
  rifle: {
    magazine: 24, reserve: 72, damage: 28, headMultiplier: 3,
    interval: 6, reload: 114, spread: 0.0015, movingSpread: 0.022,
    firingSpread: 0.00065, recoveryDelay: 0.16, recoveryRate: 14,
    // Absolute offsets in radians, interpolated during recovery. Never modulo-wrap.
    // Original learnable climb/right/left pattern, not a copied commercial weapon.
    recoil: [[0, 0], [0.002, 0.006], [-0.003, 0.012], [0.004, 0.018], [-0.006, 0.023], [0.008, 0.027],
      [0.011, 0.031], [0.014, 0.034], [0.016, 0.037], [0.014, 0.039], [0.01, 0.041], [0.005, 0.042],
      [0, 0.043], [-0.005, 0.044], [-0.01, 0.044], [-0.014, 0.043], [-0.016, 0.042], [-0.014, 0.041],
      [-0.01, 0.041], [-0.005, 0.042], [0, 0.043], [0.005, 0.044], [0.01, 0.044], [0.012, 0.043]],
  },
  pistol: {
    magazine: 10, reserve: 30, damage: 24, headMultiplier: 3,
    interval: 15, reload: 84, spread: 0.002, movingSpread: 0.017,
    firingSpread: 0.0005, recoveryDelay: 0.27, recoveryRate: 10,
    recoil: [[0, 0], [-0.003, 0.007], [0.004, 0.012], [-0.005, 0.016], [-0.007, 0.019],
      [-0.004, 0.022], [0, 0.024], [0.004, 0.025], [0.006, 0.026], [0.004, 0.026]],
  },
} satisfies Record<WeaponId, Weapon>);
