import { SECOND, type Actor, type GameState, type Shot } from '../sim/types.js';
export const RESULT_HOLD_MS = 700;
export type ShotEffect = { shot: Shot; born: number; age: number };
// Presentation only: elapsed time finishes a visible hit/death after simulation
// stops. No collision, damage, result or command is delayed by this clock.
export class Feedback {
  private round = 0;
  private count = 0;
  private endedAt: number | null = null;
  private events: ShotEffect[] = [];
  update(state: GameState, now: number) {
    if (state.round !== this.round) { this.reset(); this.round = state.round; }
    if (state.phase === 'over') this.endedAt ??= now;
    else this.endedAt = null;
    for (const shot of state.shots.slice(this.count)) {
      if (!shot.impact) continue; // Legacy snapshot: never invent a ray endpoint.
      const age=Math.max(0,(state.time-shot.time)/SECOND*1000);
      this.events.push({shot,born:now-age,age});
    }
    this.count=state.shots.length;
    // Live/paused worlds share the simulation clock with the muzzle flash.
    // Only the settled round gets a bounded real-time presentation tail.
    for(const event of this.events)event.age=Math.max(0,(state.time-event.shot.time)/SECOND*1000)+(this.endedAt===null?0:now-this.endedAt);
    this.events=this.events.filter(e=>e.age<RESULT_HOLD_MS);
    return this.events;
  }
  actor(actor: Actor) {
    const event=[...this.events].reverse().find(e=>e.shot.hit===actor.id);
    const death=event?.shot.impact?.killed ? Math.min(1,event.age/600) : 0;
    const flinch=event&&!event.shot.impact?.killed ? Math.sin(Math.min(1,event.age/180)*Math.PI)*.075 : 0;
    return {visible:actor.hp>0||!!event?.shot.impact?.killed,fall:death*Math.PI*.47,flinch};
  }
  reset(){this.round=0;this.count=0;this.endedAt=null;this.events=[];}
}
