import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { contentSetDiagnostics, CONTENT_SOURCE } from '../src/render/content-set-assets.js';

// Execute the actual client's read-only reporting hunk with controlled View
// status. This proves routing into debug-state, not browser/GPU asset adoption.
const source = stripTypeScriptTypes(readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function fixture(search: string, webgl = true) {
  let frame!: (now: number) => void, status = 'loading', error: string | null = null, presented = false;
  const window = Object.assign(new EventTarget(), { location: { search } }) as EventTarget & { location: { search: string }; fpsClient?: { state(): Record<string, unknown> } };
  const canvas = new EventTarget(), elements = new Map<string, { hidden: boolean; textContent: string }>();
  const document = { querySelector: () => canvas, createElement: () => ({ getContext: () => webgl ? { getExtension: () => ({ loseContext() {} }) } : null }),
    getElementById: (id: string) => { if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '' }); return elements.get(id)!; } };
  const player = { id: 'player', position: { x: 0, y: 0, z: 0 }, hp: 100, weapon: 'rifle', weapons: { rifle: { ammo: 24 } }, reload: null, input: {} };
  const state = { actors: [player], phase: 'live', tick: 0, round: 1, time: 0, score: { amber: 0, blue: 0 }, result: null };
  class View {
    backend = 'three-webgl2';
    get info() { return { ...(search ? { contentSet: { status, error, active: status === 'ready' && presented } } : {}), memory: { geometries: 0, textures: 0 }, calls: 0 }; }
    render() { presented = status === 'ready'; } dispose() {} resize() {} reset() {}
  }
  class CanvasView extends View { backend = 'canvas2d-cpu'; }
  class Controls { yaw = 0; pitch = 0; locked = false; reset() {} pause() {} dispose() {} }
  class Hud { difficulty = 'normal'; setBusy() {} menu() {} message() {} update() {} }
  class Soundscape { update() {} dispose() {} }
  const deps = { contentSetDiagnostics, Game: { create: async () => ({ state, observe: () => ({ sounds: [] }), dispose() {} }) }, Bot: class {}, initNavigation: async () => {}, Navigation: class {},
    Controls, MouseSensitivity: class {}, View, CanvasView, Soundscape, RESULT_HOLD_MS: 700, Hud, window, document,
    performance: { now: () => 0 }, requestAnimationFrame: (callback: (now: number) => void) => { frame = callback; return 1; }, cancelAnimationFrame() {},
    console: { error: (error: unknown) => { throw error; } } };
  await new AsyncFunction(...Object.keys(deps), source)(...Object.values(deps));
  return { window, set(next: string, failure: string | null = null) { status = next; error = failure; presented = false; }, report() { frame(0); return JSON.parse(elements.get('debug-state')!.textContent); } };
}

test('actual client diagnostic shows candidate loading/ready/fallback with fixed source and real error, absent for default', async () => {
  const normal = await fixture(''); assert.equal(normal.report().contentSet, undefined); assert.equal(normal.window.fpsClient!.state().contentSet, undefined);
  const candidate = await fixture('?contentSet=characters-v1');
  for (const status of ['loading', 'ready', 'fallback']) {
    const error = status === 'fallback' ? 'Content fp-arms-rx24: source integrity mismatch' : null;
    candidate.set(status, error);
    assert.equal((candidate.window.fpsClient!.state().contentSet as { active: boolean }).active, false, 'before render, loaded assets are not active');
    const report = candidate.report().contentSet;
    assert.equal(report.status, status); assert.equal(report.error, error); assert.equal(report.active, status === 'ready');
    assert.equal(report.sourceCommit, CONTENT_SOURCE); assert.equal(report.assets.length, 2);
    assert.deepEqual(candidate.window.fpsClient!.state().contentSet, report);
  }
  candidate.window.location.search = '';
  assert.equal(candidate.report().contentSet, undefined); assert.equal(candidate.window.fpsClient!.state().contentSet, undefined);
  const cpu = await fixture('?contentSet=characters-v1', false), report = cpu.report().contentSet;
  assert.equal(report.status, 'fallback'); assert.equal(report.active, false); assert.match(report.error, /WebGL2/);
});
