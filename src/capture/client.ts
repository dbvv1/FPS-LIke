import { View } from '../render/scene.js';
import { Hud } from '../ui/hud.js';
import { MouseSensitivity } from '../input/sensitivity.js';
import { parseCaptureConfig } from './config.js';
import { CAPTURE_SIZE, captureCamera } from './cameras.js';
import { CaptureSession, type CapturePresentation } from './session.js';
import { CaptureLifetime } from './lifetime.js';
import { rendererEvidence } from './renderer.js';

// This module is dynamically imported only for an explicit ?shot=. It never
// constructs Controls, unlocks audio, requests pointer lock or schedules rAF.
const host = window as unknown as { __shot?: Record<string, unknown>; __shotNext?: (frame?: number) => boolean };
const lifetime = new CaptureLifetime();
let session: CaptureSession | undefined;
let departed = false;
const stop = (reason = 'Capture cancelled') => { delete host.__shotNext; host.__shot = { ready: false, error: reason }; lifetime.dispose(); };
window.addEventListener('pagehide', event => { if (!event.persisted) { departed = true; stop(); } });
try {
  host.__shot = { ready: false };
  const config = parseCaptureConfig(location.search);
  if (!config) throw new Error('Capture requires an explicit shot');
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
  // Do not silently substitute Canvas2D for lighting/material evidence.
  const view = lifetime.own(new View(canvas));
  const gl = view.renderer.getContext() as WebGL2RenderingContext;
  const evidence = rendererEvidence(gl);
  const hud = new Hud(() => {}, () => {}, () => {}, () => {}, new MouseSensitivity(() => ({ getItem: () => null, setItem() {}, removeItem() {} })));
  hud.setBusy(true); hud.menu(false);
  document.getElementById('pause-button')!.setAttribute('disabled', '');
  document.getElementById('hud')!.inert = true;
  const animationStarts = new WeakMap<Animation, number>();
  const render: CapturePresentation = (state, actor, now, dt) => {
    view.render(state, actor, actor.yaw, actor.pitch, now, dt, captureCamera(config.shot, actor));
    hud.update(state, actor, now);
    // HUD CSS feedback (hurt flash) uses the SAME virtual presentation clock.
    for (const animation of document.getAnimations()) {
      if (!animationStarts.has(animation)) animationStarts.set(animation, now);
      animation.pause(); animation.currentTime = now - animationStarts.get(animation)!;
    }
  };
  const publish = () => {
    lifetime.assertActive();
    if (gl.isContextLost()) throw new Error('WebGL2 context lost');
    gl.finish(); // The frame is complete before the screenshot consumer is signaled.
    host.__shot = Object.freeze({ ready: true, ...session!.metadata, ...evidence, backend: view.backend,
      viewport: { width: canvas.clientWidth, height: canvas.clientHeight, pixelRatio: view.renderer.getPixelRatio(),
        bufferWidth: canvas.width, bufferHeight: canvas.height }, expectedViewport: CAPTURE_SIZE, audio: 'not-captured' });
  };
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop('WebGL2 context lost; reload to recapture'); });
  window.addEventListener('resize', () => stop('Capture viewport changed; reload at the intended resolution'));
  session = await CaptureSession.create(config, lifetime);
  lifetime.assertActive();
  await document.fonts.ready;
  lifetime.assertActive();
  await session.prepare(render, () => new Promise(resolve => setTimeout(resolve, 0)));
  lifetime.assertActive(); publish();
  host.__shotNext = (frame?: number) => {
    lifetime.assertActive();
    // Reject duplicate acknowledgments without mutating the frozen frame.
    if (frame !== undefined && frame !== session!.metadata.frame) throw new Error('Stale frame acknowledgment');
    try {
      const advanced = session!.next(render, frame);
      if (advanced) publish();
      return advanced;
    } catch (error) { stop(String(error)); throw error; }
  };
} catch (error) {
  if (!departed) {
    delete host.__shotNext; host.__shot = { ready: false, error: String(error) };
    lifetime.dispose(); throw error;
  }
}
