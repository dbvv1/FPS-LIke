import { freeze } from './freeze.js';
import type { Difficulty } from '../sim/types.js';
// Difficulty changes information processing and aim, never health or damage.
type DifficultySettings = { reactionSeconds: number; reactionJitterSeconds: number; aimError: number; recoilControl: number; headAim: boolean };
export const DIFFICULTIES = freeze({
  easy: { reactionSeconds: 0.65, reactionJitterSeconds: 0.1, aimError: 0.075, recoilControl: 0.15, headAim: false },
  normal: { reactionSeconds: 0.3, reactionJitterSeconds: 0.06, aimError: 0.018, recoilControl: 0.65, headAim: false },
  hard: { reactionSeconds: 0.12, reactionJitterSeconds: 0.02, aimError: 0.004, recoilControl: 1, headAim: true },
} satisfies Record<Difficulty, DifficultySettings>);
