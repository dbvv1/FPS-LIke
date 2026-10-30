import test from 'node:test';
import assert from 'node:assert/strict';
import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../../src/candidates/offline-training-v1/frame-budget.js';
test('sustained visible 483 ms frames advance bounded fixed steps instead of permanent tick zero', () => {
 let last = 0, start = 0, ticks = 0;
 for (let i=1;i<=20;i++) {
  const now=i*483, budget=frameBudget(now,last,start,true);
  assert.equal(budget.pause,false); assert.equal(budget.dropped,true);
  start=budget.start; let steps=0;
  while(now>=start+TICK_MS && steps<MAX_CATCHUP_STEPS) { start+=TICK_MS; steps++; ticks++; }
  assert.ok(steps>=14 && steps<=15); assert.ok(now-start<TICK_MS+1e-8); last=now;
 }
 assert.ok(ticks>=280);
});
test('fast frame schedule does not rebase timestamps; visibility and large jumps still pause', () => {
 assert.deepEqual(frameBudget(16,0,0,true),{pause:false,start:0,dropped:false});
 assert.deepEqual(frameBudget(33,16,TICK_MS,true),{pause:false,start:TICK_MS,dropped:false});
 for(const [now,last,focused] of [[16,0,false],[2000,0,true],[-1,0,true],[NaN,0,true]] as const) assert.equal(frameBudget(now,last,0,focused).pause,true);
 // Resume establishes a fresh clock rather than replaying paused wall time.
 assert.deepEqual(frameBudget(10016,10000,10000,true),{pause:false,start:10000,dropped:false});
});

test('resume establishes rAF-domain origin even when event wall clock is later; safety remains', () => {
 assert.deepEqual(resumeFrameBudget(6521.5,6861.7,6581.2,true),{pause:false,start:6521.5,dropped:false});
 assert.equal(resumeFrameBudget(6521.5,6861.7,6581.2,false).pause,true);
 assert.equal(resumeFrameBudget(6521.5,8581.2,6581.2,true).pause,true);
 assert.equal(resumeFrameBudget(6521.5,6500,6581.2,true).pause,true);
 assert.equal(frameBudget(6500,6521.5,6521.5,true).pause,true,'subsequent rAF reversal still pauses');
});
