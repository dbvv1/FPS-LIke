import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../../src/candidates/offline-training-v1/sim/game.js';
import {Bot} from '../../src/candidates/offline-training-v1/sim/bot.js';
import {Navigation,initNavigation} from '../../src/candidates/offline-training-v1/sim/navigation.js';
import {angles} from '../../src/candidates/offline-training-v1/sim/math.js';
import {eye} from '../../src/candidates/offline-training-v1/sim/physics.js';
import {squadPlan} from '../../src/candidates/offline-training-v1/sim/squads.js';
import {SUBTICKS, type Command} from '../../src/candidates/offline-training-v1/sim/types.js';
await initNavigation();
async function kill(game:Game,shooterId:string,targetId:string){
 for(let i=0;i<90&&game.state.actors.find(a=>a.id===targetId)!.hp>0;i++){
  const state=game.state,shooter=state.actors.find(a=>a.id===shooterId)!,target=state.actors.find(a=>a.id===targetId)!;
  game.step([{actorId:shooterId,type:'shoot',...angles(eye(shooter),eye(target)),targetId}]);
 }
 assert.equal(game.state.actors.find(a=>a.id===targetId)!.hp,0,'real shot trace must kill target');
 assert.ok(game.state.shots.some(s=>s.actorId===shooterId&&s.hit===targetId&&s.damage>0));
}

test('controlled short plant: real carrier death drops bomb, surviving squad bot retrieves and plants',async()=>{
 const nav=new Navigation(),g=await Game.create(21,[
  {id:'a-1',team:'amber',bot:'normal',position:{x:0,y:0,z:10}},
  {id:'a-2',team:'amber',bot:'hard',position:{x:-2,y:0,z:10}},
  {id:'d-1',team:'blue',position:{x:0,y:0,z:6}},
  {id:'d-2',team:'blue',position:{x:-10,y:0,z:-14}},
 ],{plantTicks:10},{formation:'squads-v1'});
 try{
  assert.equal(g.state.bomb.carrier,'a-1');await kill(g,'d-1','a-1');
  assert.equal(g.state.bomb.carrier,null);assert.equal(squadPlan(g.observe('a-2'),1).role,'recover');
  const successor=new Bot('a-2','hard',7,nav,'rifle',1);let picked=false;
  for(let tick=0;tick<1800&&g.state.phase==='live'&&!g.state.bomb.planted;tick++){
   g.step(successor.commands(g.observe('a-2')));picked ||= g.state.bomb.carrier==='a-2';
  }
  assert.ok(picked,'live physics must perform pickup, not just planner intent');
  assert.equal(g.state.bomb.planted,true,'replacement carrier must actually plant');
 }finally{g.dispose();nav.dispose();}
});

test('controlled short plant/defuse: real selected-defuser death transfers objective to another Bot',async()=>{
 const nav=new Navigation(),g=await Game.create(31,[
  {id:'a',team:'amber',bot:'normal',position:{x:0,y:0,z:10}},
  {id:'d-1',team:'blue',bot:'hard',position:{x:0,y:0,z:8}},
  {id:'d-2',team:'blue',bot:'hard',position:{x:3,y:0,z:7}},
  {id:'d-3',team:'blue',bot:'hard',position:{x:7,y:0,z:6}},
 ],{plantTicks:10,defuseTicks:15},{formation:'squads-v1'});
 try{
  const planter=new Bot('a','normal',8,nav,'rifle',0);
  for(let tick=0;tick<100&&!g.state.bomb.planted;tick++)g.step(planter.commands(g.observe('a')));
  assert.equal(g.state.bomb.planted,true);
  assert.equal(squadPlan(g.observe('d-1'),0).role,'defuse');
  await kill(g,'a','d-1');assert.equal(squadPlan(g.observe('d-2'),1).role,'defuse');
  const defenders=[new Bot('d-2','hard',3,nav,'rifle',1),new Bot('d-3','hard',4,nav,'rifle',2)];
  let successorInteraction=false;
  for(let tick=0;tick<1800&&g.state.phase==='live';tick++){
   const commands=defenders.flatMap(b=>b.commands(g.observe(b.id)));
   assert.ok(commands.filter(c=>c.type==='interact'&&c.held).length<=1,'cover must not compete for interaction');
   g.step(commands);successorInteraction ||= g.state.interaction?.actorId==='d-2';
  }
  assert.ok(successorInteraction);assert.equal(g.state.result?.reason,'defuse');assert.equal(g.state.result?.team,'blue');
 }finally{g.dispose();nav.dispose();}
});

test('a covering bot cannot restart an active defuse and turn a timely win into an explosion',async()=>{
 const nav=new Navigation();
 async function run(){
  const g=await Game.create(1,[
   {id:'a',team:'amber',position:{x:0,y:0,z:10}},
   {id:'d1',team:'blue',bot:'normal',position:{x:1.3,y:0,z:10}},
   {id:'d2',team:'blue',bot:'normal',position:{x:-.5,y:0,z:11.5}},
  ],{},{formation:'squads-v1'});
  try{
   assert.deepEqual([g.rules.plantTicks,g.rules.defuseTicks,g.rules.bombTicks],[180,300,1500]);
   g.step([{actorId:'a',type:'interact',held:true}]);
   while(!g.state.bomb.planted)g.step();
   await kill(g,'d1','a');
   while(g.state.time<g.state.bomb.explodeAt!-305*SUBTICKS)g.step();
   const start=g.state.time,position=g.observe('d1').self.position;
   const bots=[new Bot('d1','normal',10,nav,'rifle',0),new Bot('d2','normal',20,nav,'rifle',2)];
   const hashes:string[]=[];
   let closerCover=false;
   while(g.state.phase==='live'&&g.state.time-start<400*SUBTICKS){
    const observations=bots.map(b=>g.observe(b.id));
    assert.ok(observations.every(o=>o.enemies.length===0&&o.self.hp===100));
    const before=structuredClone(observations),commands=bots.flatMap((b,i)=>b.commands(observations[i]!));
    assert.deepEqual(observations,before,'planning does not mutate team observations');
    g.step(commands);hashes.push(g.stateHash);
    const state=g.state,cover=g.observe('d2').self;
    closerCover ||= Math.hypot(cover.position.x-state.bomb.position.x,cover.position.z-state.bomb.position.z)<1.3;
    assert.deepEqual(g.observe('d1').self.position,position,'active defuser stays in place');
    if(state.phase==='live'){
     assert.deepEqual(state.interaction,{actorId:'d1',kind:'defuse',since:start});
     assert.deepEqual(g.observe('d2').alliedInteraction,{actorId:'d1',kind:'defuse'});
    }
   }
   assert.ok(closerCover,'the original nearest-bot selection would change owners');
   assert.equal(hashes.length,300,'default uninterrupted five-second defuse');
   assert.deepEqual(g.state.result,{winner:'defend',team:'blue',reason:'defuse',time:start+300*SUBTICKS});
   assert.equal(g.state.bomb.explodeAt!-g.state.result!.time,5*SUBTICKS);
   return hashes;
  }finally{g.dispose();}
 }
 try{assert.deepEqual(await run(),await run(),'same seed and controllers repeat every tick');}
 finally{nav.dispose();}
});

for(const interruption of ['release','move','reload','switch','death'] as const)test(`active defuse ownership is released by the real Game after ${interruption}`,async()=>{
 const g=await Game.create(3,[
  {id:'a',team:'amber',position:{x:0,y:0,z:10}},
  {id:'d1',team:'blue',bot:'normal',position:{x:1.3,y:0,z:10}},
  {id:'d2',team:'blue',bot:'normal',position:{x:-.8,y:0,z:10}},
 ],{},{formation:'squads-v1'});
 try{
  g.step([{actorId:'a',type:'interact',held:true}]);while(!g.state.bomb.planted)g.step();
  g.step([{actorId:'d1',type:'shoot',yaw:0,pitch:1.4,targetId:'a'}]);
  assert.equal(g.state.shots.filter(s=>s.actorId==='d1').length,1,'bot-marked actor really spends a round before reload');
  g.step([{actorId:'d1',type:'interact',held:true}]);
  assert.equal(g.state.interaction?.actorId,'d1');
  assert.equal(squadPlan(g.observe('d2'),2).role,'cover','nearer teammate preserves the incumbent');
  assert.equal(g.observe('a').alliedInteraction,null,'opponent receives no ownership or timing');
  const detached=g.observe('d2');detached.alliedInteraction!.actorId='changed-copy';
  assert.equal(g.observe('d2').alliedInteraction?.actorId,'d1');
  if(interruption==='death')await kill(g,'a','d1');
  else{
   const commands:Record<Exclude<typeof interruption,'death'>,Command>={
    release:{actorId:'d1',type:'interact',held:false},move:{actorId:'d1',type:'move',x:1,z:0},
    reload:{actorId:'d1',type:'reload'},switch:{actorId:'d1',type:'switch',weapon:'pistol'},
   };
   g.step([commands[interruption]]);
  }
  assert.equal(g.state.interaction,null);
  assert.equal(g.observe('d2').alliedInteraction,null);
  assert.equal(squadPlan(g.observe('d2'),2).role,'defuse','nearest surviving bot resumes responsibility');
 }finally{g.dispose();}
});

test('bots preserve a human defuser, and missing or inapplicable ownership uses the original nearest selection',async()=>{
 const g=await Game.create(3,[
  {id:'a',team:'amber',position:{x:0,y:0,z:10}},
  {id:'human',team:'blue',position:{x:1.3,y:0,z:10}},
  {id:'bot',team:'blue',bot:'normal',position:{x:-.8,y:0,z:10}},
 ],{},{formation:'squads-v1'});
 try{
  g.step([{actorId:'a',type:'interact',held:true}]);
  assert.deepEqual(g.observe('a').alliedInteraction,{actorId:'a',kind:'plant'});
  assert.equal(g.observe('bot').alliedInteraction,null,'enemy plant ownership is not shared');
  while(!g.state.bomb.planted)g.step();
  g.step([{actorId:'human',type:'interact',held:true}]);
  const o=g.observe('bot');assert.equal(squadPlan(o,2).role,'cover');
  for(const value of [null,{actorId:'absent',kind:'defuse' as const},{actorId:'human',kind:'plant' as const}]){
   const altered={...o,alliedInteraction:value};assert.equal(squadPlan(altered,2).role,'defuse');
  }
  delete o.alliedInteraction;assert.equal(squadPlan(o,2).role,'defuse');
  g.step([{actorId:'human',type:'interact',held:false}]);
  assert.equal(squadPlan(g.observe('bot'),2).role,'defuse');
 }finally{g.dispose();}
 const legacy=await Game.create();
 try{assert.equal(Object.hasOwn(legacy.observe('amber-1'),'alliedInteraction'),false);}
 finally{legacy.dispose();}
});
