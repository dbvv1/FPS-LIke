import type { GameState } from '../sim/types.js';
/** Presentation only: events/timers remain current. Never write into authoritative snapshots. */
export function interpolateState(previous: GameState | null, current: GameState, alpha: number): GameState {
  if (!previous || previous.round !== current.round || previous.phase !== current.phase || previous.tick + 1 !== current.tick) return current;
  const t = Math.max(0, Math.min(1, alpha));
  const actors = current.actors.map(actor => {
    const old = previous.actors.find(a => a.id === actor.id);
    if (!old || old.hp <= 0 || actor.hp <= 0 || Math.hypot(old.position.x - actor.position.x, old.position.z - actor.position.z) > 1) return actor;
    const position = { x: old.position.x + (actor.position.x - old.position.x) * t, y: old.position.y + (actor.position.y - old.position.y) * t, z: old.position.z + (actor.position.z - old.position.z) * t };
    const delta = Math.atan2(Math.sin(actor.yaw - old.yaw), Math.cos(actor.yaw - old.yaw));
    return { ...actor, position, yaw: old.yaw + delta * t };
  });
  const carrier = current.bomb.carrier && actors.find(a => a.id === current.bomb.carrier);
  return { ...current, actors, bomb: carrier ? { ...current.bomb, position: { ...carrier.position } } : current.bomb };
}
