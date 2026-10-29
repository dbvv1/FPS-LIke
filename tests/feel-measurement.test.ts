import test from 'node:test';
import assert from 'node:assert/strict';
import { measure } from '../tools/measure-feel.js';
test('CPU feel replay is reproducible and separates default from opt-in movement',async()=>{
 const a=await measure(),b=await measure(); assert.deepEqual(a,b);
 assert.equal(a.results.length,9);
 assert.equal(a.recoveryProbes.length,6);
 for(const mode of ['default','offline-training-v1']) assert.deepEqual(a.recoveryProbes.filter(p=>p.mode===mode).map(p=>p.patternShotsAfterProbe),[11,1]);
 for(const r of a.results){assert.equal(r.rows.length,300); if(r.scenario==='burst-reload'){assert.equal(r.summary.shotCount,10);assert.ok(r.summary.shotIntervals.every(n=>n===0.1));assert.ok(Math.abs(r.summary.reloadSeconds!-1.9)<1e-9);}}
 const release=a.results.filter(r=>r.scenario==='release');
 assert.equal(release[0]!.summary.stopDistance,0);
 assert.ok(release[1]!.summary.stopDistance!>0.5);
 assert.equal(release[2]!.summary.stopDistance,0);
});
