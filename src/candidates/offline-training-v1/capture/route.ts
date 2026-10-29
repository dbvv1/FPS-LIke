export type ObserverCamera = { position: { x: number; y: number; z: number }; yaw: number; pitch: number; fov: number };
export const CAMERAS = {
  'wall-lamp-observer': { position: { x: -6, y: 1.62, z: -17.6 }, yaw: -.14, pitch: .12, fov: 80 },
  'low-cover-observer': { position: { x: 0, y: 1.02, z: 15.5 }, yaw: Math.PI, pitch: -.02, fov: 80 },
} satisfies Record<string, ObserverCamera>;
export type CameraName = keyof typeof CAMERAS;
export function artCaptureOptions(search: string) {
  const p = new URLSearchParams(search), names = p.getAll('artCapture');
  if (!names.length) return null;
  if (names.length !== 1 || !Object.hasOwn(CAMERAS, names[0]!)) throw new Error('Unknown or duplicate artCapture observer');
  for (const [key, value] of Object.entries({ gameplay: 'offline-training-v1', match: 'complete-v1', squads: 'offline-v1', environment: 'courtyard-v1' })) {
    if (p.getAll(key).length !== 1 || p.get(key) !== value) throw new Error(`artCapture requires ${key}=${value}`);
  }
  if (p.has('shot') || p.has('contentSet') || p.getAll('art').length > 1 || (p.has('art') && p.get('art') !== 'standards-v1')) throw new Error('Unsupported artCapture combination');
  const name = names[0] as CameraName;
  return { name, camera: structuredClone(CAMERAS[name]), art: p.has('art') };
}
