import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
// @ts-expect-error JavaScript orchestration helpers are intentionally browser-independent.
import { OFFLINE_QUERY, assertOfflineReady, assertMatchReset, browserExitReceipt, portClosed, finishOfflineRound, finishOfflineMatch, verifyRestartPlayable } from '../tools/smoke-offline-support.mjs';
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
  assert.equal(pkg.scripts['smoke:offline-training'],'node --import tsx tools/smoke-backlog.mjs --offline-training');
  assert.equal(OFFLINE_QUERY,'?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1');
  const runner=readFileSync(new URL('../tools/smoke-backlog.mjs',import.meta.url),'utf8');
  assert.match(runner,/offline \? \[\['offline-training', OFFLINE_QUERY\]\]/);assert.match(runner,/if \(!offline\) \{/);
});

function completeMatchFixture() {
  const reads = Array.from({length:6}, (_, i) => {
    const n=i+1, side=n<=3?'attack':'defend';
    return { state:{match:{rounds:Array.from({length:n},(_,j)=>({round:j+1,side:j<3?'attack':'defend'})),wins:n,losses:0,complete:n===6}},
      snapshot:{round:n,phase:'over',result:{reason:'timeout'},score:{amber:n,blue:0},actors:[{id:'player',side}]},
      hud:{title:n===3?'半场结束 · 交换攻守':n===6?'整场胜利':'进攻阶段',description:'最终比分',next:n===3?'交换攻守 · 第 4 回合':n===6?'再打一场':'下一回合',recap:Array.from({length:n},()=> '回合记录')} };
  });
  const reset=fixture();return [...reads,{state:{...reset.state,running:false},snapshot:reset.snapshot}];
}
test('complete match runner observes six natural rounds, halftime, final UI restart',async()=>{
  const actions:string[]=[], waits:any[]=[];const reads:any[]=completeMatchFixture();
  const page={locator:(s:string)=>({click:async()=>{actions.push(s);},waitFor:async()=>{}}),
    waitForFunction:async(_f:unknown,arg:unknown,options:any)=>{waits.push({arg,options});},evaluate:async()=>reads.shift()};
  const report:any={offlineCoverage:{fullMatchPlaythrough:false,completedRounds:[]},stages:[]};
  await finishOfflineMatch(page,report);
  assert.deepEqual(actions,['#start',...Array(6).fill('#next')]);
  assert.equal(report.offlineCoverage.completedRounds.length,6);assert.equal(report.offlineCoverage.fullMatchPlaythrough,false);assert.equal(report.offlineCoverage.endRestartReset,true);
  assert.deepEqual(report.offlineCoverage.sideSwitch,{before:'attack',after:'defend'});
  assert.equal(report.offlineCoverage.endRestart.snapshot.tick,0);
  assert.equal(waits.filter(w=>w.options?.timeout===180000).length,6);
});
test('complete match runner rejects wrong halftime side and preserves partial timeout scope',async()=>{
  for(const mode of ['side','timeout','reset']) {
    const actions:string[]=[];const reads:any[]=completeMatchFixture();let rounds=0;
    if(mode==='side')reads[3].snapshot.actors[0].side='attack';
    if(mode==='reset')reads[6].snapshot.score.amber=6;
    const page={locator:(s:string)=>({click:async()=>{actions.push(s);},waitFor:async()=>{}}),
      waitForFunction:async(_f:unknown,_a:unknown,o:any)=>{if(o&&++rounds===3&&mode==='timeout')throw Error('natural-round timeout');},evaluate:async()=>reads.shift()};
    const report:any={offlineCoverage:{fullMatchPlaythrough:false,completedRounds:[]},stages:[]};
    await assert.rejects(finishOfflineMatch(page,report));
    assert.equal(report.offlineCoverage.fullMatchPlaythrough,false);assert.deepEqual(report.stages,[]);
    if(mode==='timeout') {assert.equal(report.offlineCoverage.completedRounds.length,2);assert.equal(report.offlineCoverage.pendingRound,3);assert.deepEqual(actions,['#start','#next','#next']);}
  }
});

test('new-match UI start must advance, then Escape must freeze before full coverage is claimed',async()=>{
  for (const drifting of [false,true]) {
    const actions:string[]=[];let reads=0;
    const page={locator:(s:string)=>({click:async()=>{actions.push(s);}}),keyboard:{press:async(k:string)=>{actions.push(k);}},
      waitForFunction:async()=>{},waitForTimeout:async(ms:number)=>{assert.equal(ms,200);},
      evaluate:async()=>++reads===1?{state:{running:true,match:{rounds:[]}},snapshot:{round:1,tick:4}}:reads===2?5:drifting?6:5};
    const report:any={offlineCoverage:{fullMatchPlaythrough:false},stages:[]};
    if(drifting) {await assert.rejects(verifyRestartPlayable(page,report));assert.equal(report.offlineCoverage.fullMatchPlaythrough,false);}
    else {await verifyRestartPlayable(page,report);assert.equal(report.offlineCoverage.fullMatchPlaythrough,true);assert.equal(report.offlineCoverage.restartedPlay.pausedTick,5);}
    assert.deepEqual(actions,['#start','Escape']);
  }
});

test('home and current full-materials promotion route require complete-match coverage', async () => {
  // @ts-expect-error Browser-independent orchestration helpers.
  const { smokeEntry, REVIEWED_QUERY, FULL_MATERIALS_QUERY } = await import('../tools/smoke-offline-support.mjs');
  for (const query of [undefined, '', '?', REVIEWED_QUERY, FULL_MATERIALS_QUERY]) {
    const entry = smokeEntry(query);
    assert.equal(entry.offline, true); assert.equal(entry.lit, true); assert.equal(entry.artStandards, true);
    assert.equal(entry.fullMaterials, query === FULL_MATERIALS_QUERY);
  }
  const { reviewedTrainingSearch, resolveHomeSearch } = await import('../src/default-route.js');
  assert.equal(REVIEWED_QUERY, reviewedTrainingSearch);
  assert.equal(smokeEntry().effective, resolveHomeSearch(''));
  for (const query of ['?gameplay=movement-v2', '?gameplay=movement-v2&contentSet=characters-v1']) {
    assert.equal(smokeEntry(query).effective, resolveHomeSearch(query));
    assert.equal(smokeEntry(query).offline, true);
  }
  assert.equal(smokeEntry('?gameplay=legacy-v1').offline, false);
  for (const query of [null, 'materials=x', '?smoke=ground-v1', '?foo=bar', '?materials=ai-courtyard-full-v1', '?gameplay=movement-v2&foo=bar', OFFLINE_QUERY + '&testHook=end', OFFLINE_QUERY + '&match=complete-v1'])
    assert.throws(() => smokeEntry(query));
});

test('frame summary covers all six rounds and rejects missing or invalid measurements', async () => {
  // @ts-expect-error Browser-independent orchestration helpers.
  const { summarizeMatchFrames } = await import('../tools/smoke-offline-support.mjs');
  const samples = Array.from({length:6}, (_,i) => ({startMs:5*i*(i+1),endMs:5*(i+1)*(i+2),ms: 10*(i+1),round:i+1,active:true}));
  const summary = summarizeMatchFrames([...samples, {startMs:210,endMs:710,ms:500,round:1,active:false}]);
  assert.equal(summary.startMs,0); assert.equal(summary.endMs,710); assert.equal(summary.observedSpanMs,710);
  assert.equal(summary.active.count,6); assert.equal(summary.active.meanMs,35);
  assert.equal(summary.active.medianMs,30); assert.equal(summary.active.p95Ms,60);
  assert.equal(summary.active.over50Ms,1); assert.equal(summary.all.maxMs,500);
  assert.equal(summary.rounds.every((r:any)=>r.count===1),true);
  for(const input of [undefined, [], samples.slice(1), [...samples,{ms:NaN,round:1,active:true}],
    [...samples,{ms:-1,round:1,active:true}], [...samples,{ms:1,round:7,active:true}], [...samples,{ms:1,round:1}]])
    assert.throws(()=>summarizeMatchFrames(input));
  for (const mutate of [(s:any)=>delete s.startMs, (s:any)=>s.endMs=Infinity,
    (s:any)=>{s.startMs+=1;s.ms-=1;}, (s:any)=>s.ms+=1]) {
    const bad=samples.map(s=>({...s})); mutate(bad[1]); assert.throws(()=>summarizeMatchFrames(bad));
  }
  const partial=summarizeMatchFrames(samples.slice(0,2),false);
  assert.equal(partial.rounds[2].count,0); assert.match(partial.scope,/partial observation only/);
  assert.doesNotMatch(partial.scope,/across six natural rounds/);
});

test('read-only frame observer preserves raw intervals but excludes pause, hidden and round boundaries', async () => {
  // @ts-expect-error Browser-injected observer is also executed against a minimal CPU host.
  const { installFrameObserver } = await import('../tools/smoke-offline-support.mjs');
  const { runInNewContext } = await import('node:vm');
  let callback:(now:number)=>void = ()=>{}, cancelled=0;
  const state={running:true}, snapshot={round:1,phase:'live'}, document={hidden:false};
  const window:any={fpsClient:{state:()=>state,snapshot:()=>snapshot}};
  runInNewContext(`(${installFrameObserver.toString()})()`, {window,document,
    requestAnimationFrame:(cb:any)=>{callback=cb;return 19;},cancelAnimationFrame:(id:number)=>{cancelled=id;}});
  callback(0); callback(16); state.running=false; callback(32);
  state.running=true; callback(48); callback(64); snapshot.round=2; callback(80);
  callback(96); document.hidden=true; callback(112); document.hidden=false; callback(128); callback(144);
  snapshot.phase='over'; callback(160);
  const samples=window.fpsSmokeFrames.stop();
  assert.equal(cancelled,19); assert.equal(samples.length,10);
  assert.deepEqual(Array.from(samples,(s:any)=>s.active),[true,false,false,true,false,true,false,false,true,false]);
  assert.equal(samples.every((s:any)=>s.ms===16 && s.endMs-s.startMs===16),true);
  assert.equal(samples[0].startMs,0); assert.equal(samples.at(-1).endMs,160);
  assert.equal(samples[6].visible,false); assert.equal(samples[1].running,false);
  assert.deepEqual(state,{running:true}); assert.deepEqual(snapshot,{round:2,phase:'over'});
});
