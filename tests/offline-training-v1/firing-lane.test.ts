import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Bot } from '../../src/candidates/offline-training-v1/sim/bot.js';
import { friendlyInFiringLane } from '../../src/candidates/offline-training-v1/sim/firing-lane.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { runSquadMatch } from '../../tools/offline-training-v1/squads-sim.js';
import { squadSpecs } from '../../src/candidates/offline-training-v1/session/squads.js';
import { createHash } from 'node:crypto';
import type { Command, PlayerSpec } from '../../src/candidates/offline-training-v1/sim/types.js';
const specs:PlayerSpec[]=[{id:'shooter',team:'amber',position:{x:0,y:0,z:0}},{id:'ally',team:'amber',position:{x:0,y:0,z:2}},{id:'enemy',team:'blue',position:{x:0,y:0,z:5}}];
await initNavigation();

test('real squad bot holds fire on an intervening teammate and resumes when the same teammate clears the line',async()=>{
 for(const difficulty of ['easy','normal','hard'] as const)for(const weapon of ['rifle','pistol'] as const){
  const game=await Game.create(1,specs,{}, {formation:'squads-v1'}),nav=new Navigation(),bot=new Bot('shooter',difficulty,8,nav,weapon,0);
  try{
   for(let tick=0;tick<90;tick++)game.step(bot.commands(game.observe('shooter')));
   assert.equal(game.state.shots.length,0,difficulty);assert.equal(game.state.actors.find(a=>a.id==='ally')!.hp,100);
   for(let tick=0;tick<180&&game.state.phase==='live';tick++)game.step([{actorId:'ally',type:'move',x:1,z:0},...bot.commands(game.observe('shooter'))]);
   assert.ok(game.state.shots.length>0,difficulty);assert.equal(game.state.shots.some(shot=>shot.hit==='ally'),false);
   assert.ok(game.state.shots.every(shot=>shot.targetId==='enemy'&&shot.targetVisible));assert.equal(game.state.actors.find(a=>a.id==='ally')!.hp,100);
  }finally{game.dispose();nav.dispose();}
 }
});

test('friendly safety uses only living forward allies, handles vertical separation, and does not invent a legacy observation',async()=>{
 const game=await Game.create(1,specs,{}, {formation:'squads-v1'});
 try{
  const o=game.observe('shooter'),before=JSON.stringify(o);assert.equal(friendlyInFiringLane(o,0,0,5),true);assert.equal(JSON.stringify(o),before);
  assert.equal(friendlyInFiringLane({...o,allies:undefined},0,0,5),false);
  for(const position of [{x:0,y:0,z:-2},{x:0,y:0,z:7},{x:2,y:0,z:2},{x:0,y:5,z:2}]){
   assert.equal(friendlyInFiringLane({...o,allies:[{id:'ally',position,hp:100,bot:null}]},0,0,5),false,JSON.stringify(position));
  }
  assert.equal(friendlyInFiringLane({...o,allies:o.allies!.map(a=>({...a,hp:0}))},0,0,5),false);
  assert.equal(friendlyInFiringLane({...o,allies:[{...o.allies!.find(a=>a.id==='ally')!,position:{x:0,y:0,z:2}}]},0,Math.PI/2,5),false);
 }finally{game.dispose();}
});

test('ground velocity widens the conservative lane without consuming random state or assuming an ally stance',async()=>{
 const game=await Game.create(1,specs,{}, {formation:'squads-v1',movement:'ground-v1'});
 try{
  const o=game.observe('shooter'),ally=o.allies!.find(a=>a.id==='ally')!;
  const edge={...o,allies:[{...ally,position:{x:.5,y:0,z:3}}]};
  assert.equal(friendlyInFiringLane(edge,0,0,5),false);
  assert.equal(friendlyInFiringLane({...edge,self:{...edge.self,velocity:{x:4.5,z:0}}},0,0,5),true);
  const hash=game.stateHash;for(let i=0;i<100;i++)friendlyInFiringLane(o,0,0,5);assert.equal(game.stateHash,hash);
  game.step([{actorId:'ally',type:'move',x:0,z:0,crouch:true}]);
  assert.equal(friendlyInFiringLane(game.observe('shooter'),0,0,5),true,'unknown crouch is conservatively enclosed, not leaked into the observation');
  assert.equal('crouch' in game.observe('shooter').allies!.find(a=>a.id==='ally')!,false);
 }finally{game.dispose();}
});

test('player friendly fire and the authoritative trace remain unchanged',async()=>{
 const game=await Game.create(1,specs,{}, {formation:'squads-v1'});
 try{
  game.step([{actorId:'shooter',type:'shoot',yaw:0,pitch:0}]);
  assert.equal(game.state.shots[0]!.hit,'ally');assert.equal(game.state.shots[0]!.damage,84);assert.equal(game.state.actors.find(a=>a.id==='ally')!.hp,16);
  assert.equal(game.state.actors.find(a=>a.id==='enemy')!.hp,100);
 }finally{game.dispose();}
});

test('the existing eight-seed full-match matrix holds friendly fire and replays every accepted command without controllers',async()=>{
 for(const seed of [1,7,19,31,73,127,257,509]){
  const tape:{round:number;commands:Command[];hash:string}[]=[];
  let lastRound=0,shotsSeen=0,kills=0,teamKills=0,heldInteract=0;
  const result=await runSquadMatch(seed,false,record=>{
   if(record.round!==lastRound){lastRound=record.round;shotsSeen=0;}
   for(const shot of record.state.shots.slice(shotsSeen))if(shot.impact?.killed){
    kills++;if(record.state.actors.find(a=>a.id===shot.actorId)!.team===record.state.actors.find(a=>a.id===shot.hit)!.team)teamKills++;
   }
   shotsSeen=record.state.shots.length;heldInteract+=record.commands.filter(c=>c.type==='interact'&&c.held).length;
   tape.push({round:record.round,commands:record.commands,hash:record.stateHash});
  });
  assert.equal(result.complete,true);assert.equal(result.rounds.length,6);assert.equal(result.noLosShots,0);
  assert.equal(result.rounds.reduce((sum,r)=>sum+r.friendlyHits,0),0,`seed ${seed} friendly impacts`);assert.equal(teamKills,0);
  const replay=await Game.create(seed,squadSpecs('normal'),{}, {formation:'squads-v1'});
  try{
   for(const step of tape){if(replay.state.round!==step.round){assert.equal(replay.state.phase,'over');replay.nextRound();}replay.step(step.commands);assert.equal(replay.stateHash,step.hash,`seed ${seed} tick ${replay.state.tick}`);}
   assert.equal(replay.stateHash,result.finalHash);assert.equal(tape.length,result.rounds.reduce((sum,r)=>sum+r.ticks,0));
  }finally{replay.dispose();}
  console.log(JSON.stringify({firingLane:'CPU actual squad commands and replay; no player/visual acceptance',seed,steps:tape.length,kills,teamKills,heldInteract,score:result.score,rounds:result.rounds.map(r=>({ticks:r.ticks,reason:r.reason,shots:r.shots})),tape:createHash('sha256').update(JSON.stringify(tape)).digest('hex')}));
 }
});

test('received observer cannot mutate actual commands or the full-match result; ground movement also holds allies',async()=>{
 const plain=await runSquadMatch(1);let calls=0;
 const observed=await runSquadMatch(1,false,record=>{calls++;record.commands.length=0;record.state.actors[0]!.hp=0;record.state.bomb.planted=true;record.state.shots.length=0;record.stateHash='edited';});
 assert.deepEqual(observed,plain);assert.equal(calls,plain.rounds.reduce((sum,r)=>sum+r.ticks,0));
 const ground=await runSquadMatch(1,true);assert.equal(ground.complete,true);assert.equal(ground.noLosShots,0);assert.equal(ground.rounds.reduce((sum,r)=>sum+r.friendlyHits,0),0);
});
