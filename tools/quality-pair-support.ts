import assert from 'node:assert/strict';
import { CAMERAS, CAPTURE_SIZE } from '../src/capture/cameras.js';
import { REPLAY } from '../src/candidates/offline-training-v1/capture/replay.js';
export const QUALITY_SHOTS = ['gameplay', 'courtyard-gap', 'cross-lane'] as const;
export function qualityPairQuery(shot: string, variant: string) {
  assert.ok(QUALITY_SHOTS.includes(shot as typeof QUALITY_SHOTS[number]), 'Unknown camera');
  assert.ok(variant === 'default' || variant === 'materials', 'Unknown variant');
  const p = new URLSearchParams({ gameplay: 'offline-training-v1', match: 'complete-v1', squads: 'offline-v1', environment: 'courtyard-v1', art: 'standards-v1', lighting: 'courtyard-light-v1', qualityCapture: shot });
  if (variant === 'materials') p.set('materials', 'ai-courtyard-full-v1');
  return `?${p}`;
}
// Metadata comes from the existing browser interface, and is validated before use.
export function validateQualityShot(meta: any, shot: string, variant: string) {
  assert.equal(meta.ready, true); assert.equal(meta.error, undefined); assert.equal(meta.name, shot);
  assert.equal(meta.backend, 'webgl2'); assert.equal(meta.frame, 0); assert.equal(meta.t, 2);
  assert.equal(meta.state.tick, 120); assert.equal(meta.warmFrames, 12); assert.equal(meta.hz, 60);
  assert.deepEqual(meta.replay, REPLAY); assert.equal(meta.botIds.length, 9);
  assert.deepEqual(meta.viewport, { ...CAPTURE_SIZE, pixelRatio: 1, bufferWidth: 1280, bufferHeight: 720 });
  assert.equal(meta.renderInfo.art.state, 'ready'); assert.equal(meta.renderInfo.art.active, true);
  assert.equal(meta.renderInfo.lighting.id, 'courtyard-light-v1');
  assert.equal(meta.rendererEvidence.rendererClass, 'software'); assert.equal(meta.rendererEvidence.unmasked, true);
  assert.ok(meta.renderer.length > 0);
  if (variant === 'materials') { assert.equal(meta.renderInfo.materials.id, 'ai-courtyard-full-v1'); assert.equal(meta.renderInfo.materials.state, 'ready'); }
  else assert.equal(meta.renderInfo.materials, undefined);
  const preset = CAMERAS[shot as keyof typeof CAMERAS];
  assert.ok(preset, 'Unknown camera');
  if (preset.kind === 'fixed') assert.deepEqual(meta.camera, preset);
  else { assert.equal(meta.cameraKind, 'player'); assert.equal(meta.camera.fov, 80); }
  assert.match(meta.pngDataUrl, /^data:image\/png;base64,/);
}
export function comparableQualityShot(meta: any) {
  return { state: meta.state, stateHash: meta.stateHash, commands: meta.commands, camera: meta.camera, replay: meta.replay, renderer: meta.renderer, rendererEvidence: meta.rendererEvidence, viewport: meta.viewport, actualPlayerPose: meta.actualPlayerPose };
}
