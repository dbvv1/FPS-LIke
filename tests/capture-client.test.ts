import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { CaptureLifetime } from '../src/capture/lifetime.js';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/capture/client.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function fixture(stage: 'game' | 'fonts' | 'ready' | 'failure') {
  let resolve!: () => void; const gate = new Promise<void>(r => { resolve = r; });
  const events: string[] = [], window = new EventTarget() as EventTarget & { __shot?: { ready: boolean; error?: string }; __shotNext?: () => boolean };
  const canvas = new EventTarget(); Object.assign(canvas, { clientWidth: 1280, clientHeight: 720, width: 1280, height: 720 });
  const document = { querySelector: () => canvas, getElementById: () => ({ inert: false, setAttribute() {} }), fonts: { ready: stage === 'fonts' ? gate : Promise.resolve() }, getAnimations: () => [] };
  const gl = { isContextLost: () => false, finish: () => events.push('finish') };
  class View { renderer = { getContext: () => gl, getPixelRatio: () => 1 }; backend = 'three-webgl2'; render() { events.push('render'); } dispose() { events.push('view.dispose'); } }
  class Hud { setBusy() {} menu() {} update() {} }
  const session = { metadata: { frame: 0 }, async prepare(render: Function) { render({}, {}, 0, 0); }, next: () => false };
  const deps = { View, Hud, MouseSensitivity: class {}, CaptureLifetime, parseCaptureConfig: () => ({ shot: 'gameplay' }), CAPTURE_SIZE: { width: 1280, height: 720 }, captureCamera: () => ({}),
    rendererEvidence: () => ({ renderer: 'unknown', rendererClass: 'unknown' }),
    CaptureSession: { async create(_config: unknown, scope: CaptureLifetime) {
      scope.own({ dispose: () => events.push('nav.dispose') });
      if (stage === 'game') await gate;
      if (stage === 'failure') { scope.dispose(); throw new Error('Game initialization failed'); }
      scope.own({ dispose: () => events.push('game.dispose') }); return session;
    } }, window, document, location: { search: '?shot=gameplay' }, setTimeout };
  const done = new AsyncFunction(...Object.keys(deps), source)(...Object.values(deps));
  const hide = (persisted = false) => { const event = new Event('pagehide'); Object.defineProperty(event, 'persisted', { value: persisted }); window.dispatchEvent(event); };
  return { events, window, done, hide, resolve, settle: () => new Promise<void>(r => setImmediate(r)) };
}
for (const stage of ['game', 'fonts'] as const) test(`capture pagehide during ${stage} releases pending resources without publishing a stale ready state`, async () => {
  const f = fixture(stage); await f.settle(); f.hide(); f.resolve(); await f.done;
  assert.equal(f.window.__shot?.ready, false); assert.equal(f.window.__shotNext, undefined); assert.ok(!f.events.includes('render'));
  for (const resource of ['view', 'nav', 'game']) assert.equal(f.events.filter(e => e === `${resource}.dispose`).length, 1);
});
test('capture exit revokes stepping; persisted pagehide preserves the frozen frame without scheduling', async () => {
  const f = fixture('ready'); await f.done; assert.equal(f.window.__shot?.ready, true);
  f.hide(true); assert.equal(f.window.__shot?.ready, true); assert.ok(f.window.__shotNext);
  f.hide(); f.hide(); assert.equal(f.window.__shotNext, undefined); assert.equal(f.window.__shot?.ready, false);
  for (const resource of ['view', 'nav', 'game']) assert.equal(f.events.filter(e => e === `${resource}.dispose`).length, 1);
});
test('initialization failure remains an error even when the resource scope already disposed itself', async () => {
  const f = fixture('failure'); await assert.rejects(f.done, /Game initialization failed/);
  assert.equal(f.window.__shot?.ready, false); assert.match(f.window.__shot?.error ?? '', /Game initialization failed/); assert.equal(f.window.__shotNext, undefined);
});
