import type { Vec3 } from './types.js';
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const flatDistance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export const direction = (yaw: number, pitch: number): Vec3 => ({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) });
export function angles(from: Vec3, to: Vec3) {
  return { yaw: Math.atan2(to.x - from.x, to.z - from.z), pitch: Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z)) };
}
export function nextRandom(state: { random: number }): number {
  let x = state.random;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.random = x >>> 0;
  return state.random / 4294967296;
}
export function hash(value: unknown): string {
  let h = 2166136261;
  const s = JSON.stringify(value);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
