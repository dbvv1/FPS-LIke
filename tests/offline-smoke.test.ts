import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
// @ts-expect-error JavaScript orchestration helpers are intentionally browser-independent.
import { OFFLINE_QUERY, assertOfflineReady, assertMatchReset, browserExitReceipt, portClosed, finishOfflineRound } from '../tools/smoke-offline-support.mjs';
function fixture() {
  const actors = [{ id: 'player', team: 'amber', weapons: { pistol: { ammo: 10 } } }, ...Array.from({length:9}, (_,i)=>({ id:`bot-${i}`, team:i<4?'amber':'blue' }))];
  return { state: { ready: true, squads: { version:'offline-v1', formation:'squads-v1', botIds:actors.slice(1).map(a=>a.id) }, environment:{id:'courtyard-v1',active:true}, match:{complete:false,rounds:[]} }, snapshot:{actors,tick:0,round:1,score:{amber:0,blue:0}}, hud:{progress:'1 / 6 回合',goal:'存活 5:5',title:'回合 1 / 6'} };
}
test('offline smoke accepts complete runtime evidence, not missing or inactive candidates',()=>{
  const f=fixture(); assertOfflineReady(f.state,f.snapshot,f.hud); assertMatchReset(f.state,f.snapshot);
  for(const mutate of [(v:any)=>delete v.state.squads,(v:any)=>v.state.squads.botIds.pop(),(v:any)=>v.state.environment.active=false,(v:any)=>delete v.state.match,(v:any)=>v.hud.progress='回合 1',(v:any)=>v.snapshot.actors.pop()]){
    const bad=fixture();mutate(bad);assert.throws(()=>assertOfflineReady(bad.state,bad.snapshot,bad.hud));
  }
  const bad=fixture();bad.snapshot.score.amber=1;assert.throws(()=>assertMatchReset(bad.state,bad.snapshot));
});
test('owned browser exit is required and abnormal or absent exits fail',()=>{
  assert.equal(browserExitReceipt('[pid=42][out] x\n[pid=42] <process did exit: exitCode=0, signal=null>').pid,42);
  for(const log of ['', '[pid=42] launched', '[pid=42] launched\n[pid=43] <process did exit: exitCode=0, signal=null>', '[pid=42] <process did exit: exitCode=1, signal=null>'])assert.throws(()=>browserExitReceipt(log));
});
test('preview closure probe distinguishes listening and truly closed ports',async()=>{
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  try {assert.equal(await portClosed(address.port),false);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  assert.equal(await portClosed(address.port),true);
});
test('natural round workflow only uses page input and read-only waits, preserves next-round record',async()=>{
  const actions:string[]=[];let reads=0;
  const page={locator:(s:string)=>({click:async()=>{actions.push(s);}}),keyboard:{press:async(k:string)=>{actions.push(k);}},waitForFunction:async(_f:unknown,_a:unknown,o:any)=>{if(o)assert.equal(o.timeout,120000);},evaluate:async()=>++reads===1?{state:{match:{rounds:[{round:1}]}},snapshot:{round:1,result:{reason:'timeout'}}}:1};
  const report={offlineCoverage:{completedRounds:[]},stages:[]};await finishOfflineRound(page,report);
  assert.deepEqual(actions,['#start','#next','Escape']);assert.equal(report.offlineCoverage.completedRounds.length,1);
  reads=0;page.evaluate=async()=>{throw Error('missing page state');};await assert.rejects(finishOfflineRound(page,report),/missing page state/);
});
test('natural round timeout fails without claiming completed rounds or advancing UI',async()=>{
  const actions:string[]=[];const report={offlineCoverage:{completedRounds:[]},stages:[]};
  const page={locator:(s:string)=>({click:async()=>{actions.push(s);}}),waitForFunction:async(_f:unknown,_a:unknown,o:any)=>{if(o)throw Error('120s timeout');}};
  await assert.rejects(finishOfflineRound(page,report),/120s timeout/);
  assert.deepEqual(actions,['#start']);assert.deepEqual(report.offlineCoverage.completedRounds,[]);assert.deepEqual(report.stages,[]);
});
test('standalone command is exact-entry only and bypasses old-entry capture',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.scripts['smoke:offline-training'],'node tools/smoke-backlog.mjs --offline-training');
  assert.equal(OFFLINE_QUERY,'?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1');
  const runner=readFileSync(new URL('../tools/smoke-backlog.mjs',import.meta.url),'utf8');
  assert.match(runner,/offline \? \[\['offline-training', OFFLINE_QUERY\]\]/);assert.match(runner,/if \(!offline\) \{/);
});
