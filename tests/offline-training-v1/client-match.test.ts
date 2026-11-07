import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../../src/candidates/offline-training-v1/frame-budget.js';
import { trainingFeelEnabled } from '../../src/candidate-route.js';
import { interpolateState } from '../../src/candidates/offline-training-v1/render/interpolation.js';
import { squadsRequested, squadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { TrainingMatch, completeMatchRequested } from '../../src/candidates/offline-training-v1/session/match.js';
import { MatchPanel } from '../../src/candidates/offline-training-v1/ui/match-panel.js';
import { Hud } from '../../src/candidates/offline-training-v1/ui/hud.js';
import { MouseSensitivity } from '../../src/candidates/offline-training-v1/input/sensitivity.js';

const source = stripTypeScriptTypes(readFileSync(new URL('../../src/candidates/offline-training-v1/client.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

for (const playerTeam of ['amber', 'blue'] as const) {
  test(`actual ${playerTeam} client, Hud and MatchPanel finish six rounds and clear practice on new match's first frame`, async () => {
    let clock = 0, raf!: (now: number) => void, locks = 0;
    const created: Game[] = [], errors: unknown[] = [], elements = new Map<string, Element>();
    class Element extends EventTarget {
      hidden = false; textContent = ''; innerHTML = ''; value = 'normal'; checked = true;
      open = false; disabled = false; offsetWidth = 0; firstChild = { textContent: '' };
      dataset = {}; children: Element[] = []; style = { setProperty() {}, width: '' };
      classList = { add() {}, remove() {}, toggle() {} };
      onclick!: () => void;
      querySelector(selector: string) { return node(selector.slice(1)); }
      setAttribute() {} after() {}
      append(element: Element) { this.children.push(element); }
      replaceChildren() { this.children = []; }
      getContext() { return null; }
      focus() { document.activeElement = this; }
      getClientRects() { return [1]; }
      contains() { return true; }
      matches() { return this.disabled; }
      showModal() { this.open = true; }
      close() { this.open = false; }
    }
    const node = (id: string): Element => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id)!;
    };
    const document = {
      hidden: false, activeElement: null as Element | null, hasFocus: () => true,
      querySelector: () => node('stage'), createElement: () => new Element(), getElementById: node,
    };
    node('fatal').hidden = true;
    const window = Object.assign(new EventTarget(), {
      location: { search: '?match=complete-v1' },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    }) as any;
    const descriptors = new Map(['document', 'HTMLElement'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: Element });
    class View { backend = 'canvas2d-cpu'; info = {}; render() {} reset() {} resize() {} dispose() {} }
    class Controls {
      locked = false; yaw = 0; pitch = 0;
      constructor(_canvas: unknown, private changed: (locked: boolean) => void) {}
      async lock() { this.locked = true; locks++; this.changed(true); }
      pause() { this.locked = false; this.changed(false); }
      reset() {} discardBefore() {} commands() { return []; } dispose() {}
    }
    class Soundscape { enabled = true; async unlock() {} update() {} reset() {} dispose() {} }
    const deps = {
      frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS, trainingFeelEnabled,
      interpolateState, squadsRequested, squadSpecs, squadBots,
      Game: { async create() {
        const game = await Game.create(1, [{ id: 'player', team: playerTeam }, { id: 'bot', team: playerTeam === 'amber' ? 'blue' : 'amber' }], { roundTicks: 1 });
        created.push(game); return game;
      } },
      Bot: class { commands() { return []; } }, initNavigation: async () => {}, Navigation: class { dispose() {} },
      Controls, MouseSensitivity, View, CanvasView: View, Soundscape, RESULT_HOLD_MS: 700,
      Hud, TrainingMatch, completeMatchRequested, MatchPanel, document, window,
      performance: { now: () => clock }, requestAnimationFrame: (callback: (now: number) => void) => { raf = callback; return 1; },
      cancelAnimationFrame() {}, console: { error: (error: unknown) => errors.push(error) },
    };
    try {
      await new AsyncFunction(...Object.keys(deps), source)(...Object.values(deps));
      node('start').onclick(); await new Promise(resolve => setImmediate(resolve));
      for (let round = 1; round <= 6; round++) {
        clock += 20; raf(clock); clock += 20; raf(clock);
        assert.equal(created[0]!.state.round, round);
        assert.equal(created[0]!.state.phase, 'over');
        const summary = window.fpsClient.state().match;
        assert.equal(summary.rounds.length, round); assert.equal(summary.complete, round === 6);
        if (round < 6) assert.doesNotMatch(node('match-description').textContent, /下一场练习/);
        else assert.match(node('match-description').textContent, /3 回合进攻超时落败/);
        clock += 701; raf(clock); assert.equal(node('menu').open, true);
        if (round < 6) { node('next').onclick(); await new Promise(resolve => setImmediate(resolve)); }
      }
      const completed = window.fpsClient.state().match;
      assert.deepEqual([completed.wins, completed.losses], [3, 3]);
      assert.doesNotMatch(node('menu-description').textContent, /下一场练习/, 'practice appears only in the existing match paragraph');
      const lockCount = locks;
      node('next').onclick(); await new Promise(resolve => setImmediate(resolve));
      assert.equal(created.length, 2); assert.equal(locks, lockCount, 'new match returns to deployment instead of silently relocking');
      assert.equal(created[1]!.state.round, 1); assert.deepEqual(created[1]!.state.score, { amber: 0, blue: 0 });
      assert.equal(window.fpsClient.state().match.rounds.length, 0);
      // The existing panel refreshes on RAF, not synchronously inside restart().
      assert.match(node('match-description').textContent, /下一场练习/);
      clock += 20; raf(clock);
      assert.doesNotMatch(node('match-description').textContent, /下一场练习/);
      assert.equal(node('match-rounds').children.length, 0);
      assert.deepEqual(errors, []);
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      for (const game of created) game.dispose();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
