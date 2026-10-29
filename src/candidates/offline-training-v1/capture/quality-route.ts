import { CAMERAS, CAPTURE_SIZE, type CameraName } from '../../../capture/cameras.js';
export { CAPTURE_SIZE };
/** Explicit current offline route, never the legacy 1v1 shot client. */
export function qualityCaptureOptions(search: string) {
  const p = new URLSearchParams(search), names = p.getAll('qualityCapture');
  if (!names.length) return null;
  if (names.length !== 1 || !Object.hasOwn(CAMERAS, names[0]!)) throw new Error('Unknown or duplicate qualityCapture camera');
  for (const [key, value] of Object.entries({ gameplay: 'offline-training-v1', match: 'complete-v1', squads: 'offline-v1', environment: 'courtyard-v1', art: 'standards-v1' })) {
    if (p.getAll(key).length !== 1 || p.get(key) !== value) throw new Error(`qualityCapture requires ${key}=${value}`);
  }
  for (const key of ['shot', 'artCapture', 'contentSet', 'seed', 't', 'frames', 'input', 'feel', 'smoke']) if (p.has(key)) throw new Error(`qualityCapture has a fixed replay; unsupported ${key}`);
  const name = names[0] as CameraName, preset = CAMERAS[name];
  return { name, camera: preset.kind === 'player' ? undefined : structuredClone(preset), viewport: CAPTURE_SIZE };
}
