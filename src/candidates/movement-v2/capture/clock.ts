import { HZ } from '../sim/types.js';
export class CaptureClock {
  private ticks = 0;
  readonly dt = 1 / HZ;
  get tick() { return this.ticks; }
  get seconds() { return this.ticks / HZ; }
  get now() { return this.ticks * 1000 / HZ; }
  step() { this.ticks++; }
}
