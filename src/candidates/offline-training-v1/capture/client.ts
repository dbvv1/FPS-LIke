import { artCaptureOptions } from './route.js';
import { prepareReplay, REPLAY } from './replay.js';
import { View } from '../render/scene.js';
import { CaptureLifetime } from '../../../capture/lifetime.js';
import { rendererEvidence } from '../../../capture/renderer.js';
const options = artCaptureOptions(location.search);
if (!options) throw new Error('Missing artCapture');
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Missing stage');
const lifetime = new CaptureLifetime();
let status: Record<string, unknown> = { ready: false, mode: 'offline-art-observer', build: import.meta.url };
// Read-only snapshots: no state injector, no clock advance, no device input.
Object.defineProperty(window, '__offlineArtCapture', { configurable: true, get: () => structuredClone(status) });
const abort = (reason: string) => { status = { ...status, ready: false, error: reason }; lifetime.dispose(); };
const onHide = () => abort('pagehide');
const onResize = () => abort('viewport changed; reload at fixed viewport');
const onContextLost = () => abort('WebGL context lost');
window.addEventListener('pagehide', onHide, { once: true });
window.addEventListener('resize', onResize);
canvas.addEventListener('webglcontextlost', onContextLost);
lifetime.own({ dispose() {
  window.removeEventListener('pagehide', onHide); window.removeEventListener('resize', onResize);
  canvas.removeEventListener('webglcontextlost', onContextLost);
} });
try {
  if (innerWidth !== 1365 || innerHeight !== 900 || devicePixelRatio !== 1) throw new Error('artCapture requires viewport 1365x900 and DPR 1');
  for (const id of ['hud', 'menu', 'render-mode']) {
    const element = document.getElementById(id);
    if (element instanceof HTMLDialogElement) element.close();
    if (element) element.hidden = true;
  }
  const view = lifetime.own(new View(canvas));
  view.resize();
  const replay = await prepareReplay(lifetime);
  if (options.art) {
    const deadline = performance.now() + 15000;
    while (view.info.art?.state !== 'ready') {
      lifetime.assertActive();
      if (view.info.art?.state === 'fallback' || performance.now() > deadline) throw new Error('Art assets unavailable: comparison not ready');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  lifetime.assertActive();
  const state = replay.game.state, player = state.actors.find(a => a.id === 'player')!;
  const before = replay.game.stateHash;
  const timeSeconds = state.tick / REPLAY.hz;
  for (let frame = 0; frame < 12; frame++) view.render(state, player, player.yaw, player.pitch, timeSeconds * 1000, 0, options.camera);
  const gl = view.renderer.getContext(); gl.finish();
  if (before !== replay.game.stateHash) throw new Error('Render changed simulation');
  status = { ...status, ready: true, name: options.name, observer: options.camera,
    actualPlayerPose: { position: player.position, yaw: player.yaw, pitch: player.pitch, crouch: player.input.crouch, hp: player.hp },
    scope: 'static material and occlusion only; not player reachability, feel, or guaranteed enemy/ally co-visibility',
    firstPersonWeapon: false, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    replay: REPLAY, botIds: replay.botIds, commands: replay.commands, state, stateHash: before,
    t: timeSeconds, warmFrames: 12, art: options.art, renderInfo: view.info, renderer: rendererEvidence(gl as WebGL2RenderingContext) };
} catch (error) { abort(error instanceof Error ? error.message : String(error)); throw error; }
