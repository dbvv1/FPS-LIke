import { Game } from '../sim/game.js';
import { Bot } from '../sim/bot.js';
import { initNavigation, Navigation } from '../sim/navigation.js';
import { SECOND, type Actor, type GameState } from '../sim/types.js';
import { CaptureClock } from './clock.js';
import { captureCommands } from './input.js';
import { captureCamera } from './cameras.js';
import { WARMUP_FRAMES, type CaptureConfig } from './config.js';
import { CaptureLifetime } from './lifetime.js';
export type CapturePresentation = (state: GameState, actor: Actor, now: number, dt: number) => void;
export class CaptureSession {
  readonly clock = new CaptureClock();
  private frame = 0;
  private prepared = false;
  private constructor(readonly config: CaptureConfig, private game: Game, private bot: Bot, private lifetime: CaptureLifetime) {}
  static async create(config: CaptureConfig, lifetime = new CaptureLifetime()) {
    try {
      await initNavigation(); lifetime.assertActive();
      const nav = lifetime.own(new Navigation());
      // Match the live client's initial roster, default difficulty, rules and spawn.
      const game = lifetime.own(await Game.create(config.seed, [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue', bot: 'easy' }]));
      const bot = new Bot('bot', 'easy', (0x85ebca6a ^ (config.seed - 1)) >>> 0, nav);
      return new CaptureSession(config, game, bot, lifetime);
    } catch (error) { lifetime.dispose(); throw error; }
  }
  get snapshot() { return this.game.state; }
  get metadata() {
    const state = this.game.state, actor = state.actors.find(a => a.id === 'player')!;
    return { shot: this.config.shot, seed: this.config.seed, input: this.config.input, requestedTime: this.config.requestedTime,
      t: this.clock.seconds, virtualTick: this.clock.tick, fixedDt: this.clock.dt, frame: this.frame, frames: this.config.frames,
      complete: this.frame === this.config.frames - 1, warmupFrames: WARMUP_FRAMES, stateHash: this.game.stateHash,
      simTick: state.tick, simTime: state.time / SECOND, phase: state.phase, camera: captureCamera(this.config.shot, actor) };
  }
  private present(render: CapturePresentation, dt: number) {
    this.lifetime.assertActive();
    const state = this.game.state; render(state, state.actors.find(a => a.id === 'player')!, this.clock.now, dt);
  }
  private step(render: CapturePresentation) {
    this.lifetime.assertActive();
    this.game.step([...captureCommands(this.config.input, this.clock.tick), ...this.bot.commands(this.game.observe('bot'))]);
    this.clock.step(); this.present(render, this.clock.dt);
  }
  async prepare(render: CapturePresentation, yieldTask: () => Promise<void> = async () => {}) {
    if (this.prepared) throw new Error('Capture already prepared');
    this.prepared = true;
    this.present(render, 0);
    while (this.clock.tick < this.config.startTick) {
      this.step(render);
      // Scheduling yields never advance the virtual clock; no rAF is involved.
      if (this.clock.tick % 30 === 0) { await yieldTask(); this.lifetime.assertActive(); }
    }
    // Converge renderer history at an identical state, NOT twelve extra sim ticks.
    for (let i = 0; i < WARMUP_FRAMES; i++) this.present(render, 0);
  }
  next(render: CapturePresentation, expectedFrame = this.frame) {
    this.lifetime.assertActive();
    if (!this.prepared) throw new Error('Capture is not prepared');
    if (expectedFrame !== this.frame) throw new Error('Stale frame acknowledgment');
    if (this.frame >= this.config.frames - 1) return false;
    this.step(render); this.frame++; return true;
  }
  dispose() { this.lifetime.dispose(); }
}
