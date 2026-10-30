import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from './frame-budget.js';
import { trainingFeelEnabled } from '../../candidate-route.js';
import { interpolateState } from './render/interpolation.js';
import { squadsRequested, squadSpecs, squadBots } from './session/squads.js';
import { Game } from './sim/game.js';
import { Bot } from './sim/bot.js';
import { initNavigation, Navigation } from './sim/navigation.js';
import { Controls } from './input/controls.js';
import { MouseSensitivity } from './input/sensitivity.js';
import { View } from './render/scene.js';
import { CanvasView } from './render/canvas.js';
import { Soundscape } from './render/audio.js';
import { RESULT_HOLD_MS } from './render/feedback.js';
import { Hud } from './ui/hud.js';
import type { GameState } from './sim/types.js';
import { TrainingMatch, completeMatchRequested } from './session/match.js';
import { MatchPanel } from './ui/match-panel.js';
// Fixed, built-in smoke tape; never accepts external commands or mutates simulation state.
const smokeParams = new URLSearchParams(window.location?.search ?? '');
const smokeEnabled = smokeParams.getAll('smoke').length === 1 && smokeParams.get('smoke') === 'ground-v1' && smokeParams.getAll('gameplay').length === 1 && smokeParams.get('gameplay') === 'offline-training-v1';
let smokePass = 0, smokeSteps = 0, smokeComplete = false;
const smokeRuns: { ticks: number; hash: string }[] = [];
const feelEnabled = trainingFeelEnabled(window.location?.search ?? '');
let previousState: GameState | null = null;
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
let game: Game, nav: Navigation, bot: Bot, bots: Bot[] = [], view: View | CanvasView, controls: Controls;
let ready = false, running = false, restarting = false, frameId = 0, simStart = 0, lastFrame = performance.now();
let resumeWall: number | null = null;
let startupCancelled = false;
const startupCancellation = new Error('Scene startup cancelled by navigation');
let resultRevealAt: number | null = null;
let squads = false;
let match: TrainingMatch | null = null, matchPanel: MatchPanel | null = null;
const sound = new Soundscape();
const sensitivity = new MouseSensitivity(() => window.localStorage);
const hud = new Hud(() => void resume(), () => next(), () => void restart(), enabled => { sound.enabled = enabled; if (enabled) void sound.unlock().catch(() => hud.message('当前浏览器未启用音频，画面与操作仍可继续。')); }, sensitivity);
hud.setBusy(true);
function player(state = game.state) { return state.actors.find(a => a.id === 'player')!; }
function fail(error: unknown) {
  running = false; controls?.pause();
  hud.menu(false); // Release the modal so the existing fatal message remains accessible.
  const target = document.getElementById('fatal')!;
  target.hidden = false; target.textContent = `场景运行失败：${error instanceof Error ? error.message : String(error)}。请重新加载，或使用支持 Canvas2D / WebGL2 的桌面浏览器。`;
  console.error(error);
}
async function resume() {
  if (!ready || restarting || game.state.phase === 'over') return;
  if (smokeEnabled && smokeComplete) return;
  if (smokeEnabled) { previousState = null; running = true; simStart = performance.now(); hud.menu(false); return; }
  hud.message('');
  // Keep pointer lock in the gesture; audio permission must not delay/revive a start.
  void sound.unlock().catch(() => hud.message('音频未启用，画面与操作可以继续。'));
  await controls.lock();
}
function next() {
  if (!ready || restarting || game.state.phase !== 'over') return;
  if (match?.summary.complete) { void restart(); return; }
  if (match && !match.canAdvance(game.state)) return;
  resultRevealAt = null; previousState = null; game.nextRound(); controls.reset(player()); sound.reset(); view.reset(); hud.reset();
  hud.menu(true, game.state, player()); hud.update(game.state, player(), performance.now()); void resume();
}
async function restart() {
  if (!ready || restarting) return;
  restarting = true; running = false; resultRevealAt = null; controls.pause(); hud.setBusy(true);
  try {
    const replacement = await Game.create(1, squads ? squadSpecs(hud.difficulty) : [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue', bot: hud.difficulty }], {}, { ...(squads ? { formation: 'squads-v1' as const } : {}), ...(feelEnabled ? { movement: 'ground-v1' as const } : {}) });
    if (startupCancelled) { replacement.dispose(); return; }
    game.dispose(); game = replacement; previousState = null; match?.reset(); if (squads) bots = squadBots(hud.difficulty, 1, nav); else bot = new Bot('bot', hud.difficulty, 0x85ebca6a, nav);
    controls.reset(player()); view.reset(); sound.reset(); hud.reset(); hud.menu(true, game.state, player());
  } catch (error) { if (!startupCancelled) fail(error); }
  finally { restarting = false; if (!startupCancelled) hud.setBusy(false); }
}
function frame(now: number) {
  const previousFrame = lastFrame;
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  try {
    if (ready) {
      const tickMs = TICK_MS;
      if (running) {
        if (!smokeEnabled) {
          const foreground = !document.hidden && document.hasFocus() && controls.locked;
          const resuming = resumeWall !== null;
          const budget = resuming
            ? resumeFrameBudget(now, performance.now(), resumeWall!, foreground)
            : frameBudget(now, previousFrame, simStart, foreground);
          resumeWall = null;
          if (budget.pause) {
            running = false; previousState = null; controls.pause();
            hud.menu(true, game.state, player());
            hud.message('游戏已暂停：窗口失焦或发生长时间停顿。点击继续重新锁定鼠标。');
          } else if (resuming) {
            simStart = budget.start;
          } else if (budget.dropped) {
            controls.discardBefore(budget.start);
            simStart = budget.start;
          }
        }
        // Explicit smoke retains its own one-step tape. Normal foreground play
        // uses wall time, bounded catch-up and no retained stale input bursts.
        const targetTime = smokeEnabled ? simStart + tickMs : now;
        let steps = 0;
        while (running && targetTime >= simStart + tickMs && steps++ < (smokeEnabled ? 1 : MAX_CATCHUP_STEPS)) {
          const actor = player();
          if (feelEnabled) previousState = game.state;
          game.step([...(smokeEnabled ? [{ actorId: actor.id, type: 'move' as const, x: 0, z: smokeSteps < 60 ? -1 : smokeSteps >= 90 && smokeSteps < 114 ? 1 : 0 }] : controls.commands(actor, simStart, simStart + tickMs, game.state.time)), ...(squads ? bots.flatMap(b => b.commands(game.observe(b.id))) : bot.commands(game.observe('bot')))]); simStart += tickMs;
          if (smokeEnabled && ++smokeSteps === 144) {
            running = false;
            smokeRuns.push({ ticks: game.state.tick, hash: game.stateHash });
            if (smokePass === 0) {
              const oldGame = game;
              void restart().then(() => { if (!startupCancelled && game !== oldGame) { smokePass = 1; smokeSteps = 0; void resume(); } });
            } else { smokeComplete = true; hud.menu(true, game.state, player()); }
          }
          if (game.state.phase === 'over') {
            // The authoritative result is already settled. Leave its visible
            // reaction unobscured briefly; no gameplay or collision is extended.
            match?.observe(game.state, player());
            running = false; resultRevealAt = now + RESULT_HOLD_MS; controls.pause(); hud.menu(false);
          }
        }
      }
      const state = game.state, actor = player(state);
      if (resultRevealAt !== null && now >= resultRevealAt) { resultRevealAt = null; hud.menu(true, state, actor); }
      const visual = feelEnabled && running ? interpolateState(previousState, state, smokeEnabled ? 0.5 : (now - simStart) / tickMs) : state;
      view.render(visual, visual.actors.find(a => a.id === actor.id)!, controls.yaw, controls.pitch, now, dt); hud.update(state, actor, now);
      if (match) matchPanel!.update(state, actor, match.summary);
      sound.update(state, actor, controls.yaw, game.observe(actor.id).sounds.map(s => s.id));
      document.getElementById('debug-state')!.textContent = JSON.stringify({ backend: view.backend, running, locked: controls.locked, tick: state.tick, round: state.round, phase: state.phase, time: state.time, yaw: controls.yaw, pitch: controls.pitch, player: { position: actor.position, hp: actor.hp, weapon: actor.weapon, ammo: actor.weapons[actor.weapon].ammo, reload: actor.reload, input: actor.input }, score: state.score, result: state.result }, null, 2);
    }
  } catch (error) { fail(error); return; }
  frameId = requestAnimationFrame(frame);
}
// Install teardown before asynchronous navigation/game initialization.
// A departed page must not later create a world or resume the disposed client.
window.addEventListener('pagehide', event => {
  running = false; cancelAnimationFrame(frameId); controls?.pause();
  if (!event.persisted) {
    startupCancelled = true; ready = false;
    controls?.dispose(); view?.dispose(); game?.dispose(); nav?.dispose(); sound.dispose();
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted && ready) { lastFrame = performance.now(); simStart = lastFrame; hud.menu(true, game.state, player()); frameId = requestAnimationFrame(frame); }
});
try {
  squads = squadsRequested(window.location?.search ?? '');
  if (completeMatchRequested(window.location?.search ?? '')) { match = new TrainingMatch(); matchPanel = new MatchPanel(); }
  const probe = document.createElement('canvas');
  const webgl = probe.getContext('webgl2');
  if (webgl) { webgl.getExtension('WEBGL_lose_context')?.loseContext(); view = new View(canvas); }
  else view = new CanvasView(canvas);
  document.getElementById('render-mode')!.hidden = view.backend !== 'canvas2d-cpu';
  await initNavigation(); if (startupCancelled) throw startupCancellation;
  nav = new Navigation();
  game = await Game.create(1, squads ? squadSpecs(hud.difficulty) : [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue', bot: hud.difficulty }], {}, { ...(squads ? { formation: 'squads-v1' as const } : {}), ...(feelEnabled ? { movement: 'ground-v1' as const } : {}) });
  if (startupCancelled) { game.dispose(); throw startupCancellation; }
  if (squads) bots = squadBots(hud.difficulty, 1, nav); else bot = new Bot('bot', hud.difficulty, 0x85ebca6a, nav);
  controls = new Controls(canvas, locked => {
    // A delayed pointer-lock acquisition must not resume behind a new settings draft.
    if (locked && sensitivity.dirty) { controls.pause(); hud.message('灵敏度尚未应用，请先保存或取消修改。'); return; }
    previousState = null; running = locked && game.state.phase === 'live';
    resumeWall = running ? performance.now() : null;
    hud.menu(!running && resultRevealAt === null, game.state, player());
  }, text => hud.message(text), () => sensitivity.value);
  controls.reset(player());
  document.getElementById('pause-button')!.onclick = () => { resultRevealAt = null; controls.pause(); hud.menu(true, game.state, player()); };
  window.addEventListener('resize', () => view.resize());
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context lost; reload the page to recover')); });
  ready = true; hud.setBusy(false); hud.menu(true, game.state, player());
  if (view.backend === 'canvas2d-cpu') hud.message('此浏览器未启用 WebGL2，已使用 CPU 场景。操作和对局规则相同，3D 画面仍需另验。');
  // Read-only observability for smoke tests; no command injection or simulation mutation.
  Object.defineProperty(window, 'fpsClient', { value: Object.freeze({
    snapshot: (): GameState => game.state,
    state: () => ({ ...(smokeEnabled ? { smoke: { version: 'ground-v1', pass: smokePass, steps: smokeSteps, complete: smokeComplete, runs: smokeRuns.map(run => ({ ...run })) } } : {}), ...(squads ? { squads: { version: 'offline-v1', formation: game.options.formation, botIds: bots.map(b=>b.id) } } : {}), ...(match ? { match: match.summary } : {}), ready, running, locked: controls.locked, backend: view.backend, yaw: controls.yaw, pitch: controls.pitch, ...view.info }),
  }) });
  if (smokeEnabled) void resume();
  frameId = requestAnimationFrame(frame);
} catch (error) { if (!startupCancelled) fail(error); }
