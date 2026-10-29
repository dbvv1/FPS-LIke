import test from 'node:test';
import assert from 'node:assert/strict';
import { feelCaptureOptions } from '../../src/candidates/offline-training-v1/capture/feel-route.js';
import { prepareReplay } from '../../src/candidates/offline-training-v1/capture/replay.js';
import { FEEL_SCOPE } from '../../src/candidates/offline-training-v1/capture/feel-trace.js';
import { CaptureLifetime } from '../../src/capture/lifetime.js';
import { verifyFrames, type TraceBundle } from '../../tools/feel/verify-frames.js';
const route = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1';
test('feel tape is opt-in, player view only and cannot mix idle capture', () => {
  assert.equal(feelCaptureOptions(route), null);
  assert.equal(feelCaptureOptions(route + '&feelCapture=move-stop')!.camera, undefined);
  for (const suffix of ['&feelCapture=other','&feelCapture=move-stop&qualityCapture=gameplay','&feelCapture=move-stop&feelCapture=move-stop','&feelCapture=move-stop&seed=4']) assert.throws(() => feelCaptureOptions(route+suffix));
});
test('real 5v5 Game command entry/acceptance stays separate from unobserved screen/audio', async () => {
  const lifetime = new CaptureLifetime();
  try {
    const a = await prepareReplay(lifetime, true), b = await prepareReplay(lifetime, true), idle = await prepareReplay(lifetime);
    assert.equal(a.game.stateHash, idle.game.stateHash);
    assert.equal(a.observations.length, 0);
    let previous = { ...a.game.state.actors.find(p => p.id === 'player')!.position };
    for (let f = 1; f <= 120; f++) {
      a.advance(); b.advance(); assert.equal(a.game.stateHash, b.game.stateHash);
      const current = a.game.state.actors.find(p => p.id === 'player')!.position;
      const distance = Math.hypot(current.x-previous.x,current.z-previous.z);
      if (f === 60) assert.ok(distance > .07, 'still moving before release; no wall-stop confound');
      if (f === 61) assert.ok(distance < .0001, 'release, not wall contact, stops motion');
      previous = { ...current };
    }
    assert.deepEqual(a.observations, b.observations);
    assert.deepEqual(a.observations.map(o => [o.id,o.enteredAfterRenderFrame,o.beforeTick,o.resultTick,o.acceptance]), [['move-start',0,120,121,'accepted'],['move-stop',60,180,181,'accepted']]);
    assert.equal(a.commands[120]![0]!.type, 'move');
    assert.equal(a.botIds.length, 9);
    assert.equal(FEEL_SCOPE.firstVisibleFrame, null);
    assert.match(FEEL_SCOPE.audio, /unknown/);
    assert.equal(idle.observations.length, 0);
    lifetime.dispose(); assert.throws(() => a.advance(), /cancelled/);
  } finally { lifetime.dispose(); }
});
test('CPU trace cannot be upgraded to screen measurement without complete PNG sequence', () => {
  assert.throws(() => verifyFrames('.', []), /121 frames/);
});

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
test('synthetic fixtures validate sequence integrity but require independent pixel review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-feel-test-'));
  try {
    const bytes = PNG.sync.write(new PNG({ width: 1280, height: 720 }));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const frames = Array.from({length:121}, (_,frame) => {
      const file = `${frame}.png`; writeFileSync(join(dir,file),bytes);
      return { frame, file, sha256, simulationTick:120+frame, stage:'render-submitted-and-gl-finished; PNG not captured' };
    });
    const result = verifyFrames(dir,frames);
    assert.deepEqual(result.pendingVisualCommands,['move-start','move-stop']);
    assert.equal(result.visual.length,0); assert.equal(result.deviceLatencyMs,null);
    const trace: TraceBundle = { runId:'synthetic-fixture', sourceCommit:'a'.repeat(40),build:'synthetic-build',frames:[] };
    const observations = [0,60].map(entered => ({ id: entered===0 ? 'move-start' : 'move-stop', enteredAfterRenderFrame:entered,beforeTick:120+entered,targetTick:121+entered,resultTick:121+entered,command:{actorId:'player',type:'move' as const,x:0,z:entered===0?1:0},acceptance:'accepted' as const,proof:'synthetic only',position:{x:0,y:0,z:0} }));
    trace.frames = frames.map(f=>({ runId:trace.runId,sourceCommit:trace.sourceCommit,build:trace.build,shot:{ready:true,frame:f.frame,build:trace.build,state:{tick:f.simulationTick},stateHash:'synthetic',feel:{tape:"move-stop",stage:f.stage,simulationHz:60,recordingFps:60,recordingFrame:f.frame,observations:observations.filter(o=>f.frame>o.enteredAfterRenderFrame)} } }));
    const review = { reviewer:'reviewer-B',author:'author-A',commandId:'move-start' as const,firstVisibleFrame:2,note:'Synthetic annotation tests validation only; no real measurement.' };
    assert.equal(verifyFrames(dir,frames,[review]).visual.length,0, 'PNG+annotation without trace stays unknown');
    assert.equal(verifyFrames(dir,frames,[review],trace).visual[0]!.recordingFramesToFeedback,2);
    const failed = structuredClone(trace); failed.frames[1]!.shot.ready=false; assert.throws(()=>verifyFrames(dir,frames,[review],failed), /successful/);
    const mixed = structuredClone(trace); mixed.frames[1]!.shot.feel.tape='idle'; assert.throws(()=>verifyFrames(dir,frames,[review],mixed), /successful/);
    const missing = structuredClone(trace); missing.frames[1]!.shot.feel.observations=[]; assert.throws(()=>verifyFrames(dir,frames,[review],missing), /Missing/);
    const otherRun = structuredClone(trace); otherRun.frames[1]!.runId='another'; assert.throws(()=>verifyFrames(dir,frames,[review],otherRun), /mismatch/);
    const unaccepted = structuredClone(trace); for (const f of unaccepted.frames) for(const o of f.shot.feel.observations) o.acceptance='not-observed';
    assert.equal(verifyFrames(dir,frames,[review],unaccepted).visual.length,0);
    const wrongTick = structuredClone(trace); wrongTick.frames[1]!.shot.feel.observations[0]!.targetTick=122; assert.throws(()=>verifyFrames(dir,frames,[review],wrongTick), /mismatch/);
    assert.throws(()=>verifyFrames(dir,frames,[{...review,reviewer:'author-A'}]), /Non-author/);
    assert.throws(()=>verifyFrames(dir,frames,[{...review,firstVisibleFrame:0}],trace), /Invalid first-visible/);
    assert.throws(()=>verifyFrames(dir,frames,[review,review]), /Duplicate/);
    const bad = structuredClone(frames); bad[1]!.frame=2; assert.throws(()=>verifyFrames(dir,bad), /association/);
    const reused = structuredClone(frames); reused[1]!.file='0.png'; assert.throws(()=>verifyFrames(dir,reused), /Reused/);
    const changed = structuredClone(frames); changed[0]!.sha256='0'.repeat(64); assert.throws(()=>verifyFrames(dir,changed), /hash/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
