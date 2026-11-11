import { createCaptureCanvas, captureOutput } from '../../../capture/output.js';
import { qualityCaptureOptions, CAPTURE_SIZE } from './quality-route.js';
import { prepareReplay, REPLAY } from './replay.js';
import { eye } from '../sim/physics.js';
import { View } from '../render/scene.js';
import { Hud } from '../ui/hud.js';
import { MatchPanel } from '../ui/match-panel.js';
import { TrainingMatch } from '../session/match.js';
import { MouseSensitivity } from '../input/sensitivity.js';
import { CaptureLifetime } from '../../../capture/lifetime.js';
import { rendererEvidence } from '../../../capture/renderer.js';
const options = qualityCaptureOptions(location.search);
if (!options) throw new Error('Missing qualityCapture');
let canvas: HTMLCanvasElement | undefined;
const lifetime = new CaptureLifetime();
let status: Record<string, unknown> = { ready: false, backend: null, image: { ...CAPTURE_SIZE, dpr: 1 }, name: options.name, mode: 'offline-quality-capture', build: import.meta.url };
Object.defineProperty(window, '__shot', { get: () => structuredClone(status) });
const abort = (reason: string) => { status = { ...status, pngDataUrl: undefined, ready: false, error: reason }; lifetime.dispose(); };
const onHide = () => abort('pagehide');
const onContextLost = () => abort('WebGL context lost');
window.addEventListener('pagehide', onHide, { once: true });
lifetime.own({ dispose() {
  window.removeEventListener('pagehide', onHide);
  canvas?.removeEventListener('webglcontextlost', onContextLost);
} });
try {
  canvas = createCaptureCanvas(document);
  canvas.addEventListener('webglcontextlost', onContextLost);
  // The production HUD and gun, not a screenshot-only substitute. No device handlers.
  const noop = () => {};
  const hud = new Hud(noop, noop, noop, noop, new MouseSensitivity(() => ({ getItem: () => null, setItem: noop, removeItem: noop })));
  const match = new TrainingMatch(), panel = new MatchPanel();
  hud.menu(false);
  document.getElementById('hud')!.hidden = !!options.camera;
  document.getElementById('menu')!.hidden = true;
  document.getElementById('render-mode')!.hidden = true;
  const view = lifetime.own(new View(canvas, CAPTURE_SIZE));
  view.resize();
  const replay = await prepareReplay(lifetime);
  const deadline = performance.now() + 15000;
  while (true) {
    lifetime.assertActive();
    const info = view.info;
    // Older Views expose none of these consumers. Once any is present, require
    // the complete training set so a missing receipt cannot pass as ready.
    const trainingKeys = ['characters', 'rifleSource', 'hitSource'] as const;
    const training = trainingKeys.some(key => key in info);
    const resources: [string, { state?: string } | undefined][] = [
      ['art', info.art], ...(info.materials ? [['materials', info.materials] as [string, { state?: string }]] : []),
      ...(training ? trainingKeys.map(key => [key, info[key]] as [string, { state?: string } | undefined]) : []),
    ];
    for (const [name, resource] of resources) {
      if (!resource || (resource.state !== 'ready' && resource.state !== 'loading')) {
        throw new Error(`Capture resource ${name} unavailable: ${resource?.state ?? 'missing state'}`);
      }
    }
    if (resources.every(([, resource]) => resource!.state === 'ready')) break;
    if (performance.now() > deadline) throw new Error('Capture resources unavailable: readiness timeout');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  let frame = 0;
  const animationStarts = new WeakMap<Animation, number>();
  const render = (dt: number) => {
    lifetime.assertActive();
    const state = replay.game.state, player = state.actors.find(a => a.id === 'player')!;
    const hash = replay.game.stateHash, t = state.tick / REPLAY.hz;
    view.render(state, player, player.yaw, player.pitch, t * 1000, dt, options.camera);
    match.observe(state, player); hud.update(state, player, t * 1000); panel.update(state, player, match.summary);
    // CSS feedback uses the same virtual clock, never elapsed browser time.
    for (const animation of document.getAnimations()) {
      if (!animationStarts.has(animation)) animationStarts.set(animation, t * 1000);
      animation.pause(); animation.currentTime = t * 1000 - animationStarts.get(animation)!;
    }
    const gl = view.renderer.getContext(); gl.finish();
    if (hash !== replay.game.stateHash) throw new Error('Render changed simulation');
    const evidence = rendererEvidence(gl as WebGL2RenderingContext);
    status = { ...status, ready: true, name: options.name, camera: options.camera ?? { position: eye(player), yaw: player.yaw, pitch: player.pitch, fov: 80 }, cameraKind: options.camera ? 'observer' : 'player', observer: options.camera ?? null,
      actualPlayerPose: { position: player.position, yaw: player.yaw, pitch: player.pitch, crouch: player.input.crouch, hp: player.hp },
      scope: options.camera ? 'fixed observer; player reachability not established; HUD and weapon omitted' : 'actual player eye, production weapon; DOM HUD excluded from PNG; idle replay, not feel evidence',
      firstPersonWeapon: !options.camera && player.hp > 0, hud: 'not-captured',
      ...captureOutput(canvas!, gl as WebGL2RenderingContext),
      replay: REPLAY, botIds: replay.botIds, commands: replay.commands, state, stateHash: hash, match: match.summary,
      t, frame, hz: REPLAY.hz, warmFrames: 12, art: true,
      qualityParameters: { maxSamples: gl.getParameter((gl as WebGL2RenderingContext).MAX_SAMPLES), samples: gl.getParameter(gl.SAMPLES), maxAnisotropy: view.renderer.capabilities.getMaxAnisotropy(), compressedTextureFormatsSupported: Array.from(gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS) as Uint32Array), actualTextureFormats:'not-observed', lighting:view.info.lighting, toneMapping: view.renderer.toneMapping, exposure: view.renderer.toneMappingExposure, outputColorSpace: view.renderer.outputColorSpace, shadowEnabled: view.renderer.shadowMap.enabled, shadowType: view.renderer.shadowMap.type },
      renderInfo: { ...view.info, render: { ...view.renderer.info.render }, memory: { ...view.renderer.info.memory } },
      renderer: evidence.unmasked ? evidence.renderer : '', rendererEvidence: evidence };
  };
  for (let warm = 0; warm < 12; warm++) render(0);
  Object.defineProperty(window, '__shotNext', { value: () => {
    try {
      lifetime.assertActive();
      if (replay.game.state.phase === 'over') throw new Error('Replay round ended; no implicit next round');
      status = { ...status, ready: false }; replay.advance(); frame++; render(1 / REPLAY.hz);
      return structuredClone(status);
    } catch (error) { abort(error instanceof Error ? error.message : String(error)); throw error; }
  } });
} catch (error) { abort(error instanceof Error ? error.message : String(error)); throw error; }
