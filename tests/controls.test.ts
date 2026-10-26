import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../src/input/controls.js';
import type { Actor } from '../src/sim/types.js';
function actorFixture(): Actor { return { id: 'player', team: 'amber', side: 'attack', hp: 100, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, weapon: 'rifle', weapons: { rifle: { ammo: 24, reserve: 72, shots: 0, lastShot: -60000 }, pistol: { ammo: 10, reserve: 30, shots: 0, lastShot: -60000 } }, input: { x: 0, z: 0, crouch: false, walk: false, interact: false }, reload: null, nextShot: 0, nextFootstep: 0, bot: null }; }
function event(type: string, properties: Record<string, unknown> = {}) { return Object.assign(new Event(type, { cancelable: true }), properties); }
class FakeDocument extends EventTarget {
  pointerLockElement: unknown = null; hidden = false;
  exitPointerLock() { this.pointerLockElement = null; this.dispatchEvent(event('pointerlockchange')); }
}
class FakeCanvas extends EventTarget {
  calls = 0;
  constructor(private document: FakeDocument, private rejectRaw = false) { super(); }
  async requestPointerLock(options?: { unadjustedMovement?: boolean }) {
    this.calls++;
    if (options?.unadjustedMovement && this.rejectRaw) throw new DOMException('raw unsupported', 'NotSupportedError');
    this.document.pointerLockElement = this; this.document.dispatchEvent(event('pointerlockchange'));
  }
}
function environment() {
  const document = new FakeDocument(), window = new EventTarget();
  const originals = new Map(['document', 'window'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  return { document, window, restore() { for (const [k, value] of originals) { if (value) Object.defineProperty(globalThis, k, value); else Reflect.deleteProperty(globalThis, k); } } };
}
test('mouse-down records its own view and sub-tick before later mouse movement', async t => {
  const env = environment(), canvas = new FakeCanvas(env.document), actor = actorFixture();
  let now = 0; t.mock.method(performance, 'now', () => now);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, () => {});
  try {
    await controls.lock();
    now = 4; env.document.dispatchEvent(event('mousemove', { movementX: 30, movementY: 0 }));
    now = 7; canvas.dispatchEvent(event('mousedown', { button: 0 }));
    now = 12; env.document.dispatchEvent(event('mousemove', { movementX: 20, movementY: 0 }));
    const commands = controls.commands(actor, 0, 16, 0);
    const shot = commands.find(c => c.type === 'shoot')!;
    assert.equal(shot.type, 'shoot'); if (shot.type !== 'shoot') return;
    assert.equal(shot.at, 437); assert.equal(shot.yaw, 0.06); assert.equal(controls.yaw, 0.1);
  } finally { controls.dispose(); env.restore(); }
});
test('held rifle fires at its cooldown sub-tick using only the view available then', async t => {
  const env = environment(), canvas = new FakeCanvas(env.document), actor = actorFixture();
  let now = -1; t.mock.method(performance, 'now', () => now);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, () => {});
  try {
    await controls.lock(); canvas.dispatchEvent(event('mousedown', { button: 0 }));
    controls.commands(actor, -16, 0, 0); actor.nextShot = 625;
    now = 4; env.document.dispatchEvent(event('mousemove', { movementX: 30, movementY: 0 }));
    now = 14; env.document.dispatchEvent(event('mousemove', { movementX: 20, movementY: 0 }));
    const shot = controls.commands(actor, 0, 16, 0).find(c => c.type === 'shoot')!;
    assert.equal(shot.type, 'shoot'); if (shot.type !== 'shoot') return;
    assert.equal(shot.at, 625); assert.equal(shot.yaw, 0.06);
  } finally { controls.dispose(); env.restore(); }
});
test('pause clears held movement, interaction and queued shots before resume', async () => {
  const env = environment(), canvas = new FakeCanvas(env.document), actor = actorFixture();
  const changes: boolean[] = [], controls = new Controls(canvas as unknown as HTMLCanvasElement, locked => changes.push(locked), () => {});
  try {
    await controls.lock(); env.document.dispatchEvent(event('keydown', { code: 'KeyW', repeat: false })); env.document.dispatchEvent(event('keydown', { code: 'KeyE', repeat: false })); canvas.dispatchEvent(event('mousedown', { button: 0 }));
    controls.pause(); assert.equal(controls.locked, false); assert.equal(controls.shooting, false);
    await controls.lock();
    const commands = controls.commands(actor, 0, performance.now() + 1, 0);
    assert.ok(commands.every(c => c.type !== 'shoot'));
    assert.ok(commands.some(c => c.type === 'move' && c.x === 0 && c.z === 0));
    assert.ok(commands.some(c => c.type === 'interact' && !c.held)); assert.deepEqual(changes, [true, false, true]);
  } finally { controls.dispose(); env.restore(); }
});
test('raw pointer lock has a supported fallback and successful lock clears the error', async () => {
  const env = environment(), canvas = new FakeCanvas(env.document, true), messages: string[] = [];
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, m => messages.push(m));
  try { await controls.lock(); assert.equal(canvas.calls, 2); assert.equal(controls.locked, true); assert.equal(messages.at(-1), ''); }
  finally { controls.dispose(); env.restore(); }
});
test('a canceled pointer-lock request cannot relock after a delayed failure', async () => {
  const env = environment(), canvas = new FakeCanvas(env.document);
  let reject!: (reason: unknown) => void;
  canvas.requestPointerLock = () => { canvas.calls++; return new Promise<void>((_, fail) => { reject = fail; }); };
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, () => {});
  try {
    const pending = controls.lock(); controls.pause(); reject(new DOMException('raw unsupported', 'NotSupportedError')); await pending;
    assert.equal(canvas.calls, 1); assert.equal(controls.locked, false);
  } finally { controls.dispose(); env.restore(); }
});
test('Escape and hidden-tab events clear lock and held controls', async () => {
  const env = environment(), canvas = new FakeCanvas(env.document);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, () => {});
  try {
    await controls.lock(); env.document.dispatchEvent(event('keydown', { code: 'Escape', repeat: false })); assert.equal(controls.locked, false);
    await controls.lock(); env.document.hidden = true; env.document.dispatchEvent(event('visibilitychange')); assert.equal(controls.locked, false);
  } finally { controls.dispose(); env.restore(); }
});
test('a canceled pointer-lock request cannot resume after delayed acquisition', async () => {
  const env = environment(), canvas = new FakeCanvas(env.document), changes: boolean[] = [];
  let acquire!: () => void;
  canvas.requestPointerLock = () => new Promise<void>(resolve => { acquire = () => { env.document.pointerLockElement = canvas; env.document.dispatchEvent(event('pointerlockchange')); resolve(); }; });
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, locked => changes.push(locked), () => {});
  try { const pending = controls.lock(); env.document.dispatchEvent(event('keydown', { code: 'Escape', repeat: false })); acquire(); await pending; assert.equal(controls.locked, false); assert.equal(env.document.pointerLockElement, null); assert.ok(!changes.includes(true)); }
  finally { controls.dispose(); env.restore(); }
});
test('pointer-lock failure keeps the exact browser cause without bypass or retry', async () => {
  const env = environment(), canvas = new FakeCanvas(env.document); let message = '';
  canvas.requestPointerLock = async () => { canvas.calls++; throw new DOMException('document not active', 'WrongDocumentError'); };
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, text => { message=text; });
  try { await controls.lock(); assert.equal(canvas.calls,1); assert.equal(controls.locked,false); assert.match(message,/WrongDocumentError: document not active/); }
  finally { controls.dispose(); env.restore(); }
});
