import test from 'node:test';
import assert from 'node:assert/strict';
import { artCaptureOptions } from '../../src/candidates/offline-training-v1/capture/route.js';
import { prepareReplay, REPLAY } from '../../src/candidates/offline-training-v1/capture/replay.js';
import { CaptureLifetime } from '../../src/capture/lifetime.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { squadSpecs } from '../../src/candidates/offline-training-v1/session/squads.js';
const prefix = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1';
test('art observer is explicit and strict; normal entry remains absent', () => {
 assert.equal(artCaptureOptions(prefix), null);
 for (const name of ['wall-lamp-observer','low-cover-observer']) {
  const base = artCaptureOptions(prefix+'&artCapture='+name)!;
  const art = artCaptureOptions(prefix+'&art=standards-v1&artCapture='+name)!;
  assert.deepEqual(base.camera, art.camera); assert.equal(base.art,false); assert.equal(art.art,true);
 }
 for (const suffix of ['&artCapture=unknown','&artCapture=wall-lamp-observer&artCapture=wall-lamp-observer','&artCapture=low-cover-observer&shot=foo','&artCapture=low-cover-observer&contentSet=foo','&artCapture=low-cover-observer&art=x']) assert.throws(()=>artCaptureOptions(prefix+suffix));
 assert.throws(()=>artCaptureOptions('?artCapture=low-cover-observer'));
});
test('real default easy squads replay repeats and recorded commands reproduce exact state', async () => {
 const lifetime = new CaptureLifetime();
 try {
  const a = await prepareReplay(lifetime), b = await prepareReplay(lifetime);
  assert.equal(a.game.stateHash,b.game.stateHash); assert.deepEqual(a.commands,b.commands);
  assert.equal(a.game.state.tick,120); assert.equal(a.botIds.length,9);
  const replay = lifetime.own(await Game.create(REPLAY.seed,squadSpecs(REPLAY.difficulty),{},{formation:'squads-v1'}));
  for(const commands of a.commands) replay.step(commands);
  assert.equal(a.game.stateHash,replay.stateHash);
  const copy=a.game.state;copy.actors[0]!.hp=999;
  assert.notDeepEqual(copy,a.game.state);
  console.log('observer CPU fixture',JSON.stringify({hash:a.game.stateHash,tick:a.game.state.tick,phase:a.game.state.phase,alive:a.game.state.actors.filter(a=>a.hp>0).map(a=>a.id)}));
 } finally { lifetime.dispose(); }
});
test('cancelled startup cannot create a replay or retain late resources',async()=>{
 const lifetime=new CaptureLifetime();lifetime.dispose();
 await assert.rejects(prepareReplay(lifetime),/cancelled/);
 let disposed=false;assert.throws(()=>lifetime.own({dispose(){disposed=true;}}));assert.equal(disposed,true);
});
