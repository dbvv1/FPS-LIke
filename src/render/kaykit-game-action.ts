import { WEAPONS } from '../content/weapons.js';
import { SECOND, SUBTICKS, type GameState } from '../sim/types.js';
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


/** Fixed Knight source windows: the first quarter of Shoot raises the arms.
 * Aiming's final pose matches Shoot at 8/30 s; neither is a general rig default.
 */
export const KAYKIT_NATIVE_WINDOWS = { aimHold: 1, fireStart: .25 } as const;

/** Explicit stationary rifle candidate. Existing reload-only callers are unchanged.
 * Uses accepted shot facts, not attempted input or wall time. No locomotion,
 * crouch, interaction, pistol, aim-direction/IK or View activation is implied.
 */
export function syncKayKitNativeAction(character: KayKitSkinnedCharacter, state: GameState, actorId: string): void {
  if (character.disposed) return;
  const reset = () => { if (character.currentAction !== null) character.stop(); };
  const actor = state.actors.find(a => a.id === actorId);
  if (state.phase !== 'live' || !actor || actor.hp <= 0 || actor.weapon !== 'rifle'
    || actor.input.x !== 0 || actor.input.z !== 0 || actor.input.crouch || actor.input.interact
    || state.interaction?.actorId === actorId) { reset(); return; }
  const sample = (action: KayKitAction, phase: number) => {
    if (!Number.isFinite(phase) || phase < 0 || phase > 1 || !character.sample(action, phase)) reset();
  };
  if (actor.reload) {
    if (actor.reload.weapon !== actor.weapon) { reset(); return; }
    const duration = WEAPONS.rifle.reload * SUBTICKS;
    const phase = (state.time - (actor.reload.end - duration)) / duration;
    if (phase >= 1) { reset(); return; }
    sample('native-reload-two-hand', phase);
    return;
  }
  const last = actor.weapons.rifle.lastShot;
  const duration = character.duration('native-fire-two-hand');
  // Switching changes nextShot even before its lockout expires. Requiring the
  // shot's original cooldown rejects old rifle shots after switch-away/back.
  const accepted = actor.nextShot === last + WEAPONS.rifle.interval * SUBTICKS
    && state.shots.some(s => s.actorId === actorId && s.weapon === 'rifle' && s.time === last);
  const elapsed = state.time - last;
  if (accepted && duration !== null && elapsed >= 0 && elapsed < duration * (1 - KAYKIT_NATIVE_WINDOWS.fireStart) * SECOND) {
    // Preserve source playback speed, omit only the raise-to-aim pre-roll.
    sample('native-fire-two-hand', KAYKIT_NATIVE_WINDOWS.fireStart + elapsed / (duration * SECOND)); return;
  }
  // Explicit held source pose, not an aim solve or a claim of weapon contact.
  sample('native-aim-two-hand', KAYKIT_NATIVE_WINDOWS.aimHold);
}

/** Candidate body chain: stationary native actions or the fixed forward run.
 * The caller keeps the last adjacent simulation pair during pause/render repeats.
 * Run is witnessed by actual displacement, never a held movement key alone.
 * Its phase uses authoritative game time; stride speed/foot contact are unverified.
 */
export function syncKayKitRifleAction(character: KayKitSkinnedCharacter,
  state: GameState, actorId: string, previous?: GameState): void {
  if (character.disposed) return;
  const actor = state.actors.find(a => a.id === actorId);
  if (!actor || (actor.input.x === 0 && actor.input.z === 0)) {
    syncKayKitNativeAction(character, state, actorId); return;
  }
  const reset = () => { if (character.currentAction !== null) character.stop(); };
  const before = previous?.actors.find(a => a.id === actorId);
  const fireDuration = character.duration('native-fire-two-hand');
  if (!previous || !before || previous.seed !== state.seed || previous.round !== state.round
    || previous.phase !== 'live' || state.phase !== 'live' || before.team !== actor.team || before.side !== actor.side
    || before.hp <= 0 || actor.hp <= 0 || before.weapon !== 'rifle' || actor.weapon !== 'rifle'
    || before.reload || actor.reload || actor.input.walk || actor.input.crouch || actor.input.interact
    || state.interaction?.actorId === actorId || previous.interaction?.actorId === actorId
    || !Number.isSafeInteger(state.tick) || !Number.isSafeInteger(previous.tick)
    || state.tick !== previous.tick + 1 || state.time !== state.tick * SUBTICKS
    || previous.time !== previous.tick * SUBTICKS || state.time < 0 || fireDuration === null) { reset(); return; }
  const last = actor.weapons.rifle.lastShot;
  if (state.shots.some(s => s.actorId === actorId && s.weapon === 'rifle' && s.time === last)
    && state.time >= last && state.time - last < fireDuration * (1 - KAYKIT_NATIVE_WINDOWS.fireStart) * SECOND) {
    reset(); return; // No running-fire layer in this source contract.
  }
  const dx = actor.position.x - before.position.x, dz = actor.position.z - before.position.z;
  const forwardX = Math.sin(actor.yaw), forwardZ = Math.cos(actor.yaw);
  const distance = Math.hypot(dx, dz), inputLength = Math.hypot(actor.input.x, actor.input.z);
  // Input is world-space in Game; compare it to the actor's current facing.
  // Rapier's ground/collision correction can move a stationary body slightly.
  // Use Game's existing 1 mm footstep displacement floor, with 1 mm lateral
  // allowance for that correction, not a permissive strafe blend cone.
  const movedForward = Number.isFinite(distance) && dx * forwardX + dz * forwardZ > .001
    && Math.abs(dx * forwardZ - dz * forwardX) <= .001;
  const requestedForward = Number.isFinite(inputLength) && inputLength > 0
    && actor.input.x * forwardX + actor.input.z * forwardZ > 0
    && Math.abs(actor.input.x * forwardZ - actor.input.z * forwardX) <= inputLength * 1e-5;
  if (!movedForward || !requestedForward
    || !character.sampleLoop('run-rifle', state.time / SECOND)) reset();
}
