import { WEAPONS } from '../content/weapons.js';
import { SUBTICKS, type GameState } from '../sim/types.js';
import type { KayKitAction, KayKitSkinnedCharacter } from './kaykit-skinned-character.js';

/** Candidate-only adapter. No loaders, sim writes, scene registration or default activation.
 * Only the two verified source reload clips are available; all other states restore rest.
 * Caller supplies authoritative snapshots, including while paused (no wall-clock advance).
 */
export function syncKayKitGameAction(character: KayKitSkinnedCharacter, state: GameState, actorId: string): void {
  if (character.disposed) return;
  const actor = state.actors.find(a => a.id === actorId);
  const reload = actor?.reload;
  if (state.phase !== 'live' || !actor || actor.hp <= 0 || !reload || reload.weapon !== actor.weapon) {
    if (character.currentAction !== null) character.stop();
    return;
  }
  const duration = WEAPONS[reload.weapon].reload * SUBTICKS;
  const progress = (state.time - (reload.end - duration)) / duration;
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) {
    if (character.currentAction !== null) character.stop();
    return;
  }
  const action: KayKitAction = reload.weapon === 'rifle' ? 'reload-two-hand' : 'reload-one-hand';
  character.sample(action, progress);
}
