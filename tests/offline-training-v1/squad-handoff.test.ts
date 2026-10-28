import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../../src/candidates/offline-training-v1/sim/game.js';
import {Bot} from '../../src/candidates/offline-training-v1/sim/bot.js';
import {Navigation,initNavigation} from '../../src/candidates/offline-training-v1/sim/navigation.js';
import {angles} from '../../src/candidates/offline-training-v1/sim/math.js';
import {eye} from '../../src/candidates/offline-training-v1/sim/physics.js';
import {squadPlan} from '../../src/candidates/offline-training-v1/sim/squads.js';
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
