import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseCaptureConfig, WARMUP_FRAMES } from '../src/capture/config.js';
import { isCaptureRequest } from '../src/capture/route.js';
import { CaptureClock } from '../src/capture/clock.js';
import { CaptureLifetime } from '../src/capture/lifetime.js';
import { captureCamera, CAMERAS } from '../src/capture/cameras.js';
import { captureCommands } from '../src/capture/input.js';
import { classifyRenderer, rendererEvidence } from '../src/capture/renderer.js';
import { CaptureSession } from '../src/capture/session.js';
import { Game } from '../src/sim/game.js';
import { Bot } from '../src/sim/bot.js';
import { initNavigation, Navigation } from '../src/sim/navigation.js';

const config = (query = '') => parseCaptureConfig(`?shot=gameplay${query}`)!;
test('capture is explicit; missing parameters have bounded defaults and normal URL stays normal', () => {
  for (const search of ['', '?seed=5&t=2&frames=3', '?input=advance-fire']) {
    assert.equal(isCaptureRequest(search), false); assert.equal(parseCaptureConfig(search), null);
  }
  assert.equal(isCaptureRequest('?shot='), true);
  assert.deepEqual(config(), { shot: 'gameplay', seed: 1, requestedTime: 10, startTick: 600, frames: 1, input: 'idle' });
  assert.equal(config('&t=.025').startTick, 2);
  assert.equal(config('&seed=0&t=0&frames=3600').seed, 0);
  assert.equal(config('&seed=4294967295').seed, 0xffffffff);
});
test('unknown/empty/prototype camera and malformed or duplicate capture parameters fail closed', () => {
  for (const query of ['?shot=', '?shot=nope', '?shot=__proto__', '?shot=toString', '?shot=gameplay&shot=cross-lane',
    ...['seed=-1', 'seed=1.5', 'seed=4294967296', 'seed=', 'seed=NaN', 'seed=1&seed=2', 't=-1', 't=Infinity', 't=NaN', 't=121', 't=', 'frames=0', 'frames=1.2', 'frames=3601', 'input=unknown', 'input='].map(q => `?shot=gameplay&${q}`)]) {
    assert.throws(() => parseCaptureConfig(query), Error, query);
  }
});
test('clock uses integer steps and never consults real time', () => {
  const clock = new CaptureClock(); for (let i = 0; i < 6000; i++) clock.step();
  assert.equal(clock.now, 100_000); assert.equal(clock.seconds, 100); assert.equal(clock.dt, 1 / 60);
});
test('renderer raw string survives and software/unknown never becomes GPU by exclusion', () => {
  for (const name of ['ANGLE (Google, Vulkan SwiftShader)', 'llvmpipe (LLVM 18)', 'Mesa softpipe', 'lavapipe', 'NVIDIA software fallback', 'Microsoft Basic Render Driver']) assert.equal(classifyRenderer(name), 'software', name);
  for (const name of ['', 'WebKit WebGL', 'ANGLE', 'Mesa', 'virgl (Intel)', 'VMware NVIDIA virtual adapter']) assert.equal(classifyRenderer(name), 'unknown', name);
  for (const name of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5070, OpenGL)', 'Mesa Intel(R) UHD Graphics', 'AMD Radeon RX 6800', 'Apple M2']) assert.equal(classifyRenderer(name), 'gpu', name);
  const raw = 'ANGLE (NVIDIA, GeForce RTX 5070 /PCIe/SSE2, OpenGL 4.6)';
  const gl = { isContextLost: () => false, getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1, UNMASKED_VENDOR_WEBGL: 2 }), VERSION: 3,
    getParameter: (key: number) => ({ 1: raw, 2: 'NVIDIA', 3: 'WebGL 2.0' })[key] };
  const evidence = rendererEvidence(gl as unknown as WebGL2RenderingContext);
  assert.equal(evidence.renderer, raw); assert.equal(evidence.rendererClass, 'gpu');
});
test('lifetime releases in reverse order exactly once and disposes late asynchronous results', async () => {
  const scope = new CaptureLifetime(), released: string[] = [];
  scope.own({ dispose: () => released.push('view') }); scope.own({ dispose: () => released.push('nav') });
  let resolve!: (v: { dispose(): void }) => void;
  const pending = new Promise<{ dispose(): void }>(r => { resolve = r; });
  scope.dispose(); scope.dispose();
  resolve({ dispose: () => released.push('late-game') });
  assert.throws(() => scope.own({ dispose: () => released.push('late-sync') }), /cancelled/);
  await assert.rejects(async () => scope.own(await pending), /cancelled/);
  assert.deepEqual(released, ['nav', 'view', 'late-sync', 'late-game']);
});
test('capture boot is lazy and player orchestration remains untouched by capture authority', () => {
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  assert.match(read('boot.ts'), /isCaptureRequest\(location.search\) \? import\('\.\/capture\/client.js'\) : import\('\.\/client.js'\)/);
  assert.doesNotMatch(read('capture/route.ts'), /^import /m);
  assert.doesNotMatch(read('client.ts'), /__shot|capture|Capture/);
  assert.doesNotMatch(read('capture/client.ts'), /new Controls|new Soundscape|requestAnimationFrame\(/);
  assert.doesNotMatch(read('capture/session.ts'), /performance\.now|Date\.now|Math\.random|requestAnimationFrame\(/);
});
test('every named camera is presentation-only; player camera exactly follows actual eye and aim', async () => {
  const game = await Game.create();
  try {
    const state = game.state, actor = state.actors[0]!, before = structuredClone(state);
    actor.yaw = .2; actor.pitch = .1; // detached snapshot, never a game override
    const pose = captureCamera('gameplay', actor);
    assert.deepEqual(pose.position, { ...actor.position, y: 1.62 }); assert.equal(pose.yaw, .2); assert.equal(pose.pitch, .1); assert.equal(pose.weapon, true);
    for (const name of Object.keys(CAMERAS) as (keyof typeof CAMERAS)[]) {
      const saved = structuredClone(actor); captureCamera(name, actor); assert.deepEqual(actor, saved);
    }
    assert.deepEqual(game.state, before);
  } finally { game.dispose(); }
});
test('fixed-step capture equals live rules/roster/bot given the same input tape and survives slow scheduling', async () => {
  const options = config('&t=5.5&frames=3&input=advance-fire');
  const first = await CaptureSession.create(options), second = await CaptureSession.create(options);
  await initNavigation(); const nav = new Navigation();
  const live = await Game.create(1, [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue', bot: 'easy' }]);
  const bot = new Bot('bot', 'easy', 0x85ebca6a, nav);
  const frames: { now: number; dt: number; tick: number }[] = [];
  try {
    await first.prepare((state, _actor, now, dt) => { frames.push({ now, dt, tick: state.tick }); });
    await second.prepare(() => {}, () => new Promise(resolve => setTimeout(resolve, 1)));
    for (let tick = 0; tick < options.startTick; tick++) live.step([...captureCommands('advance-fire', tick), ...bot.commands(live.observe('bot'))]);
    assert.deepEqual(first.snapshot, live.state); assert.deepEqual(first.snapshot, second.snapshot);
    assert.deepEqual(first.metadata, second.metadata);
    assert.equal(frames.length, 1 + options.startTick + WARMUP_FRAMES);
    assert.ok(frames.slice(-WARMUP_FRAMES).every(frame => frame.now === 5500 && frame.dt === 0));
    assert.equal(first.metadata.frame, 0); assert.equal(first.metadata.complete, false);
    const frozen = first.metadata; await new Promise(resolve => setTimeout(resolve, 20)); assert.deepEqual(first.metadata, frozen);
    assert.equal(first.next(() => {}, 0), true); assert.equal(first.metadata.frame, 1); assert.equal(first.metadata.virtualTick, options.startTick + 1);
    assert.throws(() => first.next(() => {}, 0), /Stale/);
    assert.equal(first.next(() => {}, 1), true); assert.equal(first.metadata.complete, true);
    const last = first.metadata; assert.equal(first.next(() => {}, 2), false); assert.deepEqual(first.metadata, last);
    await assert.rejects(first.prepare(() => {}), /already prepared/);
  } finally { first.dispose(); second.dispose(); live.dispose(); nav.dispose(); }
});
test('cancel during capture pre-roll does not publish or continue stepping', async () => {
  const scope = new CaptureLifetime(), session = await CaptureSession.create(config('&t=2'), scope);
  let frames = 0;
  await assert.rejects(session.prepare(() => { frames++; }, async () => scope.dispose()), /cancelled/);
  assert.equal(frames, 31);
  assert.throws(() => session.next(() => {}), /cancelled/);
  session.dispose();
});
