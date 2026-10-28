import { eye } from '../sim/physics.js';
import type { Actor, Vec3 } from '../sim/types.js';

export type CaptureCamera = Readonly<{ position: Vec3; yaw: number; pitch: number; fov: number; weapon: boolean }>;
export const CAPTURE_SIZE = Object.freeze({ width: 1280, height: 720 });
// All coordinates use simulation axes (+Z forward). Keep the current 80° vertical
// FOV: a future CS2-aligned framing pass must not silently rewrite this baseline.
export const CAMERAS = Object.freeze({
  gameplay: { kind: 'player', purpose: 'Normal first-person view, real actor eye/aim and weapon', fov: 80 },
  'courtyard-gap': { kind: 'fixed', purpose: 'Maximum-gap view: near ground, divider faces, site and far wall together',
    position: { x: 2.6, y: 1.62, z: 6.4 }, yaw: -0.28, pitch: -0.04, fov: 80, weapon: false },
  'cross-lane': { kind: 'fixed', purpose: 'Oblique contrast check: outer wall, cover and long material boundaries',
    position: { x: -7.5, y: 1.62, z: -9.5 }, yaw: 0.32, pitch: -0.03, fov: 80, weapon: false },
} as const);
export type CameraName = keyof typeof CAMERAS;
export function captureCamera(name: CameraName, player: Actor): CaptureCamera {
  const preset = CAMERAS[name];
  return preset.kind === 'player'
    ? { position: eye(player), yaw: player.yaw, pitch: player.pitch, fov: preset.fov, weapon: true }
    : { position: { ...preset.position }, yaw: preset.yaw, pitch: preset.pitch, fov: preset.fov, weapon: preset.weapon };
}
