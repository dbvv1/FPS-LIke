import type { Actor, Command } from '../sim/types.js';
type Action = Command extends infer C ? C extends Command ? Omit<C, 'actorId' | 'at'> : never : never;
type Trigger = { type: 'trigger'; held: boolean };
type Queued = { time: number; action: Action | Trigger };
export class Controls {
  yaw = 0; pitch = 0; locked = false; shooting = false;
  private held = new Set<string>();
  private queue: Queued[] = [];
  private triggerHeld = false;
  private requestPending = false;
  private lockGeneration = 0;
  private abort = new AbortController();
  constructor(private canvas: HTMLCanvasElement, private changed: (locked: boolean) => void, private error: (message: string) => void, private sensitivity: () => number = () => 1) {
    const signal = this.abort.signal;
    document.addEventListener('pointerlockchange', () => {
      // A lock can arrive after blur/Escape canceled its asynchronous request.
      if (document.pointerLockElement === canvas && !this.requestPending && !this.locked) { document.exitPointerLock(); return; }
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.clear();
      else { this.requestPending = false; this.error(''); }
      this.changed(this.locked);
    }, { signal });
    document.addEventListener('pointerlockerror', () => { if (this.requestPending && !this.locked) this.error('未能锁定鼠标。请再点一次“进入靶场”；若浏览器不支持，请使用桌面 Chromium。'); }, { signal });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      const scale = 0.002 * this.sensitivity();
      this.yaw += e.movementX * scale; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * scale));
      this.add({ type: 'aim', yaw: this.yaw, pitch: this.pitch });
      if (this.moving) this.move();
    }, { signal });
    document.addEventListener('keydown', e => {
      if (e.code === 'Escape' && (this.locked || this.requestPending)) { this.pause(); return; }
      if (!this.locked || e.repeat) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyE', 'KeyR', 'Digit1', 'Digit2', 'Space'].includes(e.code)) e.preventDefault();
      this.held.add(e.code);
      if (e.code === 'KeyR') this.add({ type: 'reload' });
      else if (e.code === 'Digit1' || e.code === 'Digit2') this.add({ type: 'switch', weapon: e.code === 'Digit1' ? 'rifle' : 'pistol' });
      else { this.move(); if (e.code === 'KeyE') this.add({ type: 'interact', held: true }); }
    }, { signal });
    document.addEventListener('keyup', e => {
      if (!this.locked) return;
      this.held.delete(e.code); this.move();
      if (e.code === 'KeyE') this.add({ type: 'interact', held: false });
    }, { signal });
    canvas.addEventListener('mousedown', e => {
      if (!this.locked || e.button !== 0) return;
      this.shooting = true;
      this.add({ type: 'trigger', held: true });
      this.add({ type: 'shoot', yaw: this.yaw, pitch: this.pitch });
    }, { signal });
    document.addEventListener('mouseup', e => {
      if (e.button !== 0 || !this.shooting) return;
      this.shooting = false; this.add({ type: 'trigger', held: false });
    }, { signal });
    canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
    window.addEventListener('blur', () => this.pause(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, { signal });
  }
  private get moving() { return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(k => this.held.has(k)); }
  private add(action: Action | Trigger) { this.queue.push({ time: performance.now(), action }); }
  private move() {
    const forward = Number(this.held.has('KeyW')) - Number(this.held.has('KeyS'));
    const right = Number(this.held.has('KeyD')) - Number(this.held.has('KeyA'));
    this.add({ type: 'move', x: Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right, z: Math.cos(this.yaw) * forward - Math.sin(this.yaw) * right, walk: this.held.has('ShiftLeft') || this.held.has('ShiftRight'), crouch: this.held.has('ControlLeft') || this.held.has('ControlRight') });
  }
  async lock() {
    if (this.locked) return;
    this.clear();
    this.requestPending = true; const generation = ++this.lockGeneration;
    try { await this.canvas.requestPointerLock({ unadjustedMovement: true }); }
    catch (error) {
      if (generation !== this.lockGeneration) return;
      if (error instanceof DOMException && error.name === 'NotSupportedError') {
        try { await this.canvas.requestPointerLock(); } catch (fallbackError) { this.error(`鼠标锁定失败（${fallbackError instanceof Error ? fallbackError.name + ': ' + fallbackError.message : String(fallbackError)}）。请将游戏窗口置于前台后再点击进入。`); }
      } else this.error(`鼠标锁定失败（${error instanceof Error ? error.name + ': ' + error.message : String(error)}）。请将游戏窗口置于前台后再点击进入。`);
    }
  }
  commands(actor: Actor, start: number, end: number, simTime: number): Command[] {
    const result: Command[] = [];
    const at = (time: number) => Math.max(0, Math.min(999, Math.floor((time - start) / (end - start) * 1000)));
    const due = Math.max(0, actor.nextShot - simTime);
    if (this.locked && actor.weapon === 'rifle' && due < 1000) {
      const shotTime = start + (end - start) * due / 1000;
      let held = this.triggerHeld, yaw = actor.yaw, pitch = actor.pitch, pressedAtDue = false;
      // Replay trigger edges at the shot's time, not the latest DOM state. A
      // release received before a catch-up tick must not erase an earlier shot.
      for (const q of this.queue) {
        if (q.time > shotTime) break;
        if (q.action.type === 'trigger') held = q.action.held;
        else if (q.action.type === 'aim') { yaw = q.action.yaw; pitch = q.action.pitch; }
        else if (q.action.type === 'shoot' && at(q.time) === due) pressedAtDue = true;
      }
      if (held && !pressedAtDue) result.push({ actorId: actor.id, type: 'shoot', yaw, pitch, at: due });
    }
    let consumed = 0;
    for (const q of this.queue) {
      if (q.time > end) break;
      if (q.action.type === 'trigger') this.triggerHeld = q.action.held;
      else result.push({ ...q.action, actorId: actor.id, at: at(q.time) });
      consumed++;
    }
    this.queue.splice(0, consumed);
    return result;
  }
  clear() {
    this.held.clear(); this.shooting = false; this.triggerHeld = false; this.queue = [];
    this.add({ type: 'move', x: 0, z: 0 }); this.add({ type: 'interact', held: false });
  }
  reset(actor: Actor) { this.yaw = actor.yaw; this.pitch = actor.pitch; this.clear(); }
  pause() { this.requestPending = false; this.lockGeneration++; this.clear(); if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  dispose() { this.pause(); this.abort.abort(); }
}
