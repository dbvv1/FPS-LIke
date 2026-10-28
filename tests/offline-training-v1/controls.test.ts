import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../../src/candidates/offline-training-v1/input/controls.js';
import type { Actor } from '../../src/candidates/offline-training-v1/sim/types.js';
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
test('saved sensitivity scales yaw/pitch once, preserves shot sampling, and UI input never reaches gameplay',async t=>{
 const env=environment(),canvas=new FakeCanvas(env.document),actor=actorFixture();let gain=.5,now=0;t.mock.method(performance,'now',()=>now);
 const controls=new Controls(canvas as unknown as HTMLCanvasElement,()=>{},()=>{},()=>gain);
 try{
  // Slider arrows/clicks/mouse motion while unlocked do not aim, shoot or move.
  env.document.dispatchEvent(event('mousemove',{movementX:100,movementY:50}));env.document.dispatchEvent(event('keydown',{code:'ArrowRight',repeat:false}));canvas.dispatchEvent(event('mousedown',{button:0}));assert.equal(controls.yaw,0);assert.equal(controls.shooting,false);
  await controls.lock();now=4;env.document.dispatchEvent(event('mousemove',{movementX:100,movementY:50}));now=7;canvas.dispatchEvent(event('mousedown',{button:0}));now=12;env.document.dispatchEvent(event('mousemove',{movementX:50,movementY:0}));
  const shot=controls.commands(actor,0,16,0).find(c=>c.type==='shoot')!;assert.equal(shot.type,'shoot');if(shot.type!=='shoot')return;assert.equal(shot.yaw,.1);assert.equal(shot.pitch,-.05);assert.equal(shot.at,437);assert.ok(Math.abs(controls.yaw-.15)<1e-12);
  controls.pause();gain=2;env.document.dispatchEvent(event('mousemove',{movementX:100,movementY:50}));assert.ok(Math.abs(controls.yaw-.15)<1e-12);await controls.lock();now=20;env.document.dispatchEvent(event('mousemove',{movementX:100,movementY:50}));assert.ok(Math.abs(controls.yaw-.55)<1e-12);assert.equal(controls.pitch,-.25);assert.equal(controls.shooting,false);
 }finally{controls.dispose();env.restore();}
});

type TimedInput = { time: number; type: string; fields?: Record<string, unknown> };
async function runTimedInput(frameMs: number, inputs: TimedInput[], setNow: (time: number) => void, until = 260) {
  // Initialize Rapier before exposing the fake DOM; this is the real simulation,
  // not an ammunition counter copied into the controls fixture.
  const { Game } = await import('../../src/candidates/offline-training-v1/sim/game.js');
  const game = await Game.create(1), env = environment(), canvas = new FakeCanvas(env.document);
  setNow(0);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, () => {}, () => {});
  try {
    await controls.lock();
    let next = 0, start = 0;
    for (let frame = frameMs; frame <= until + frameMs; frame += frameMs) {
      while (next < inputs.length && inputs[next]!.time <= frame) {
        const input = inputs[next++]!; setNow(input.time);
        if (input.type === 'resume') await controls.lock();
        else (input.type === 'mousedown' ? canvas : env.document).dispatchEvent(event(input.type, input.fields));
      }
      setNow(frame);
      while (frame >= start + 1000 / 60) {
        const state = game.state;
        game.step(controls.commands(state.actors[0]!, start, start + 1000 / 60, state.time)); start += 1000 / 60;
      }
    }
    return game.state;
  } finally { controls.dispose(); env.restore(); game.dispose(); }
}
const press = (time: number): TimedInput => ({ time, type: 'mousedown', fields: { button: 0 } });
const release = (time: number): TimedInput => ({ time, type: 'mouseup', fields: { button: 0 } });
const key = (time: number, code: string): TimedInput => ({ time, type: 'keydown', fields: { code, repeat: false } });

test('a held rifle keeps its legal tail shot across render rates without firing after an early release', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  for (const releasedAt of [109, 110, 120, 130]) {
    let expected;
    for (const frameMs of [1000 / 60, 1000 / 30, 50]) {
      const state = await runTimedInput(frameMs, [press(10), release(releasedAt)], value => { now = value; });
      const shots = state.shots.map(shot => ({ time: shot.time, yaw: shot.yaw, pitch: shot.pitch, weapon: shot.weapon }));
      assert.deepEqual(shots.map(shot => shot.time), releasedAt <= 110 ? [600] : [600, 6600]);
      expected ??= shots;
      assert.deepEqual(shots, expected, `same input at ${1000 / frameMs} fps`);
      assert.equal(state.actors[0]!.weapons.rifle.ammo, 24 - shots.length);
    }
  }
});

test('release then re-press in one catch-up frame preserves the previous burst and the new aim', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const inputs = [press(10), { time: 106, type: 'mousemove', fields: { movementX: 20, movementY: 0 } }, release(120), press(125), { time: 190, type: 'mousemove', fields: { movementX: 30, movementY: 0 } }, release(225)];
  let expected;
  for (const frameMs of [1000 / 60, 1000 / 30, 50]) {
    const state = await runTimedInput(frameMs, inputs, value => { now = value; });
    assert.deepEqual(state.shots.map(shot => shot.time), [600, 6600, 12600]);
    expected ??= state.shots;
    assert.deepEqual(state.shots, expected);
  }
});

test('trigger history obeys reload, switch lock and semi-automatic fire at every render rate', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const inputs = [press(10), key(70, 'KeyR'), release(120), key(130, 'Digit2'), press(140), release(145), press(340), key(480, 'Digit1'), release(800)];
  let expected;
  for (const frameMs of [1000 / 60, 1000 / 30, 50]) {
    const state = await runTimedInput(frameMs, inputs, value => { now = value; }, 850);
    assert.deepEqual(state.shots.map(shot => shot.weapon), ['rifle', 'pistol', 'rifle', 'rifle']);
    assert.equal(state.actors[0]!.reload, null);
    expected ??= state.shots;
    assert.deepEqual(state.shots, expected);
  }
});

test('pause drops historical trigger edges rather than replaying them after resume', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const state = await runTimedInput(50, [press(10), release(120), key(125, 'Escape'), { time: 160, type: 'resume' }], value => { now = value; });
  assert.deepEqual(state.shots.map(shot => shot.time), [600]);
});
