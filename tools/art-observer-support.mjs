import assert from 'node:assert/strict';
export const OBSERVERS = ['wall-lamp-observer', 'low-cover-observer'];
export function assertObserver(meta, name, art) {
  assert.equal(meta.ready, true); assert.equal(meta.mode, 'offline-art-observer'); assert.equal(meta.name, name);
  assert.equal(meta.art, art); assert.equal(meta.firstPersonWeapon, false);
  assert.equal(meta.renderer.rendererClass, 'gpu'); assert.equal(meta.renderer.unmasked, true);
  assert.equal(meta.replay.seed, 1); assert.equal(meta.replay.difficulty, 'easy'); assert.equal(meta.replay.ticks, 120);
  assert.equal(meta.state.tick, 120); assert.equal(meta.stateHash, '4a118389'); assert.equal(meta.commands.length, 120);
  assert.equal(new Set(meta.botIds).size, 9); assert.equal(meta.state.actors.length, 10);
  assert.deepEqual(meta.viewport, { width: 1365, height: 900, dpr: 1 });
  assert.equal(meta.renderInfo.environment.id, 'courtyard-v1'); assert.equal(meta.renderInfo.environment.active, true);
  if (art) { assert.equal(meta.renderInfo.art.state, 'ready'); assert.equal(meta.renderInfo.art.active, true); assert.equal(meta.renderInfo.art.pieces, 3); }
  else assert.equal(meta.renderInfo.art, undefined);
}
export function comparable(meta) {
  return { state: meta.state, stateHash: meta.stateHash, commands: meta.commands, observer: meta.observer,
    actualPlayerPose: meta.actualPlayerPose, renderer: meta.renderer, t: meta.t, viewport: meta.viewport };
}
/** Cleanup errors must not prevent remaining cleanup or the final receipt. */
export async function finishCleanup(actions) {
  const errors=[];
  for (const [name, action] of actions) { try { await action(); } catch (error) { errors.push(`${name}: ${String(error)}`); } }
  return errors;
}
