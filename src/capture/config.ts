import { CAMERAS, type CameraName } from './cameras.js';
import { HZ } from '../sim/types.js';
export const INPUT_NAMES = ['idle', 'advance-fire'] as const;
export type InputName = typeof INPUT_NAMES[number];
export type CaptureConfig = Readonly<{ shot: CameraName; seed: number; requestedTime: number; startTick: number; frames: number; input: InputName }>;
export const WARMUP_FRAMES = 12;
export function parseCaptureConfig(search: string): CaptureConfig | null {
  const query = new URLSearchParams(search);
  if (!query.has('shot')) return null; // Stray seed/t/frames never turn a live game into a harness.
  // Character assets load asynchronously; reject rather than publish an unstable frame.
  if (query.has('contentSet')) throw new Error('Character content capture is not supported; use the live contentSet entry');
  for (const key of ['shot', 'seed', 't', 'frames', 'input']) {
    if (query.getAll(key).length > 1) throw new Error(`Duplicate capture parameter: ${key}`);
  }
  const shot = query.get('shot')!;
  if (!Object.hasOwn(CAMERAS, shot)) throw new Error(`Unknown shot '${shot}'; choose ${Object.keys(CAMERAS).join(', ')}`);
  function integer(key: string, fallback: number, min: number, max: number) {
    const raw = query.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer in [${min}, ${max}]`);
    return value;
  }
  const rawTime = query.get('t') ?? '10', requestedTime = Number(rawTime);
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(rawTime) || !Number.isFinite(requestedTime) || requestedTime < 0 || requestedTime > 120) throw new Error('t must be finite seconds in [0, 120]');
  const input = query.get('input') ?? 'idle';
  if (!INPUT_NAMES.includes(input as InputName)) throw new Error(`Unknown input '${input}'; choose ${INPUT_NAMES.join(', ')}`);
  return Object.freeze({ shot: shot as CameraName, seed: integer('seed', 1, 0, 0xffffffff), requestedTime,
    startTick: Math.round(requestedTime * HZ), frames: integer('frames', 1, 1, 3600), input: input as InputName });
}
