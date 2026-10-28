import type { Camera } from 'three';
import type { Vec3 } from '../sim/types.js';
// Simulation/CPU: +X is right, yaw 0 faces +Z. Three camera: right +X, forward -Z.
// Reflect world Z at the presentation boundary, never the simulation or its inputs.
export const toThree = ({ x, y, z }: Vec3): [number, number, number] => [x, y, -z];
export function cameraPose(camera: Camera, position: Vec3, yaw: number, pitch: number) {
  camera.position.set(...toThree(position));
  camera.rotation.set(pitch, -yaw, 0, 'YXZ');
}
// Actor meshes are authored facing local +Z; first-person weapon meshes stay camera-local.
export const actorFacing = (yaw: number) => Math.PI - yaw;
