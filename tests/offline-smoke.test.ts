import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
// @ts-expect-error JavaScript orchestration helpers are intentionally browser-independent.
import { OFFLINE_QUERY, assertOfflineReady, assertMatchReset, browserExitReceipt, portClosed, finishOfflineRound, finishOfflineMatch, verifyRestartPlayable } from '../tools/smoke-offline-support.mjs';
function fixture() {
  const actors = [{ id: 'player', team: 'amber', weapons: { pistol: { ammo: 10 } } }, ...Array.from({length:9}, (_,i)=>({ id:`bot-${i}`, team:i<4?'amber':'blue' }))];
  return { state: { ready: true, squads: { version:'offline-v1', formation:'squads-v1', botIds:actors.slice(1).map(a=>a.id) }, environment:{id:'courtyard-v1',active:true}, match:{complete:false,rounds:[]} }, snapshot:{actors,tick:0,round:1,score:{amber:0,blue:0}}, hud:{progress:'1 / 6 回合',goal:'掩护携带信标的队友推进 · 队友携带信标',teamStatus:'己方 5/5 · 敌方 5/5',teamStatusHidden:false,title:'回合 1 / 6'} };
}
test('offline smoke accepts complete runtime evidence, not missing or inactive candidates',()=>{
  const f=fixture(); assertOfflineReady(f.state,f.snapshot,f.hud); assertMatchReset(f.state,f.snapshot);
  for(const mutate of [(v:any)=>delete v.state.squads,(v:any)=>v.state.squads.botIds.pop(),(v:any)=>v.state.environment.active=false,(v:any)=>delete v.state.match,(v:any)=>v.hud.progress='回合 1',(v:any)=>v.snapshot.actors.pop()]){
    const bad=fixture();mutate(bad);assert.throws(()=>assertOfflineReady(bad.state,bad.snapshot,bad.hud));
  }
  // Survivors now live in #team-status. A goal that still carries the old
  // "存活 5:5" suffix, a missing census, or a hidden census must fail the gate.
  for (const mutate of [(v:any)=>{v.hud.goal+=' · 存活 5:5';},(v:any)=>delete v.hud.teamStatus,(v:any)=>v.hud.teamStatus='己方 4/5 · 敌方 5/5',(v:any)=>v.hud.teamStatusHidden=true]) {
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
