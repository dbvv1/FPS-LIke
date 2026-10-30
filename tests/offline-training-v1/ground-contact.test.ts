import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Game} from '../../src/candidates/offline-training-v1/sim/game.js';
import {Physics} from '../../src/candidates/offline-training-v1/sim/physics.js';
import type {Actor,Command,Vec3} from '../../src/candidates/offline-training-v1/sim/types.js';
import {measureGroundStances} from '../../tools/measure-ground-stances.js';
const specs=(position:Vec3)=>[{id:'p',team:'amber' as const,position},{id:'d',team:'blue' as const,position:{x:8,y:0,z:14}}];
const player=(g:Game)=>g.state.actors.find(a=>a.id==='p')!;
async function fixture(crouch=false){const g=await Game.create(1,specs({x:0,y:0,z:-12}));const a=player(g);g.dispose();a.input.crouch=crouch;const p=new Physics([a]);return {a,p,world:(p as unknown as {world:RAPIER.World}).world};}
test('three legal spawn points reach every stance target in forward and diagonal real movement',async()=>{
 const result=await measureGroundStances();
 for(const r of result.results){const expected=r.stance==='run'?4.5:r.stance==='walk'?2.3:1.7;assert.ok(Math.abs(r.rows[59]!.speed-expected)<.02,JSON.stringify({spawn:r.spawn,stance:r.stance,direction:r.direction,speed:r.rows[59]!.speed}));
  assert.ok(r.distanceAt60>expected*.8);for(const row of r.rows)assert.ok(row.speed<expected+.025);
 }
});
test('ground separation retains both standing and crouching low autostep, ledge exit and high-step obstruction',async()=>{
 for(const crouch of [false,true])for(const height of [.2,.4]){
  const {a,p,world}=await fixture(crouch);world.createCollider(RAPIER.ColliderDesc.cuboid(1,height/2,.5).setTranslation(0,height/2,-10));world.step();let maxY=0;
  try{for(let i=0;i<170;i++){p.move(a,{x:0,y:-.002,z:.025},true);maxY=Math.max(maxY,a.position.y);}
   if(height===.2){assert.ok(maxY>.19);assert.ok(a.position.z>-9);assert.ok(a.position.y<.005);}
   else{assert.ok(a.position.z<-10.5);assert.ok(maxY<.02);}
  }finally{p.dispose();}
 }
});
test('upward motion remains real and airborne downward motion lands before grounded travel',async()=>{
 for(const crouch of [false,true]){const {a,p}=await fixture(crouch);
  try{p.move(a,{x:0,y:1,z:0},true);assert.ok(a.position.y>.99);const ys=[];
   for(let i=0;i<150;i++){p.move(a,{x:.01,y:-.01,z:0},true);ys.push(a.position.y);}
   assert.ok(ys[0]!<1&&ys[0]!>.9);assert.ok(ys[49]!<.6&&ys[49]!>.4);assert.ok(a.position.y<.005);assert.ok(a.position.x>1.45);
  }finally{p.dispose();}
 }
});
test('wall sliding uses real displacement and cannot store hidden speed when turning away',async()=>{
 const g=await Game.create(1,specs({x:12,y:0,z:-12}),{}, {movement:'ground-v1'});
 try{for(let i=0;i<120;i++)g.step(i===0?[{actorId:'p',type:'move',x:1,z:0}]:[]);assert.ok(Math.abs(player(g).velocity!.x)<.01);assert.ok(player(g).position.x<12.71);
 for(let i=0;i<60;i++){g.step(i===0?[{actorId:'p',type:'move',x:1,z:1}]:[]);assert.ok(player(g).position.x<12.71);assert.ok(Math.hypot(player(g).velocity!.x,player(g).velocity!.z)<4.6);}
 const z=player(g).position.z;assert.ok(z>-11);g.step([{actorId:'p',type:'move',x:-1,z:0}]);assert.ok(player(g).velocity!.x<0&&player(g).velocity!.x>-.43);
 }finally{g.dispose();}
});
test('stance, stop and turning tape reproduces every snapshot and hash without cached support state',async()=>{
 const a=await Game.create(7,specs({x:0,y:0,z:-16}),{}, {movement:'ground-v1'}),b=await Game.create(7,specs({x:0,y:0,z:-16}),{}, {movement:'ground-v1'});
 try{for(let tick=0;tick<180;tick++){
  const commands:Command[]=tick===0?[{actorId:'p',type:'move',x:0,z:1}]:tick===40?[{actorId:'p',type:'move',x:0,z:1,walk:true}]:tick===70?[{actorId:'p',type:'move',x:0,z:1,crouch:true}]:tick===100?[{actorId:'p',type:'move',x:1,z:-1,crouch:true}]:tick===140?[{actorId:'p',type:'move',x:0,z:0}]:[];
  a.step(commands);b.step(commands);assert.deepEqual(a.state,b.state);assert.equal(a.stateHash,b.stateHash);const snapshot=a.state;snapshot.actors.find(x=>x.id==='p')!.position.x=999;assert.equal(a.stateHash,b.stateHash);
 }
 }finally{a.dispose();b.dispose();}
});
test('shared controller never transfers one actors grounded result to an airborne actor',async()=>{
 const g=await Game.create(1,specs({x:0,y:0,z:-12}));const actors=g.state.actors;g.dispose();const a=actors.find(x=>x.id==='p')!,b=actors.find(x=>x.id==='d')!;const p=new Physics(actors);
 try{p.move(b,{x:0,y:.8,z:0},true);for(let i=0;i<30;i++){p.move(a,{x:.01,y:-.002,z:0},true);p.move(b,{x:-.01,y:-.01,z:0},true);}assert.ok(a.position.y<.005);assert.ok(b.position.y>.49&&b.position.y<.51);assert.ok(a.position.x>.29);assert.ok(b.position.x<7.71);
 }finally{p.dispose();}
});
