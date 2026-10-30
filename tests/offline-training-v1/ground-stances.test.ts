import test from 'node:test';
import assert from 'node:assert/strict';
import {groundMovement,MOVEMENT,type Velocity} from '../../src/candidates/offline-training-v1/sim/movement.js';
import {Game} from '../../src/candidates/offline-training-v1/sim/game.js';
const idle={x:0,z:0,walk:false,crouch:false,interact:false};
const speed=(v:Velocity)=>Math.hypot(v.x,v.z);
test('all stance and analog targets accelerate without a friction dead zone or diagonal boost',()=>{
 for(const [stance,target] of [['run',4.5],['walk',2.3],['crouch',1.7]] as const)for(const amount of [1e-6,.009,.01,.5,1])for(const diagonal of [false,true]){
  const input={...idle,x:diagonal?amount/Math.SQRT2:0,z:diagonal?amount/Math.SQRT2:amount,walk:stance==='walk',crouch:stance==='crouch'};let v={x:0,z:0},previous=0;
  for(let i=0;i<180;i++){v=groundMovement(v,input,1/60).velocity;assert.ok(speed(v)>=previous-1e-12);assert.ok(speed(v)<=target*amount+1e-10);previous=speed(v);}
  assert.ok(Math.abs(speed(v)-target*amount)<1e-10);
 }
});
test('standing run and released friction retain old trajectories exactly',()=>{
 function old(v:Velocity,input:typeof idle){const s=speed(v),r=Math.max(0,s-Math.max(s,MOVEMENT.stopSpeed)*MOVEMENT.friction/60);const out=s?{x:v.x*r/s,z:v.z*r/s}:{x:0,z:0};const n=Math.hypot(input.x,input.z);if(n){const w=(input.crouch?1.7:input.walk?2.3:4.5)*Math.min(1,n),x=input.x/n,z=input.z/n,a=Math.min(Math.max(0,w-out.x*x-out.z*z),MOVEMENT.acceleration*(1/60)*w);out.x+=x*a;out.z+=z*a;}return out;}
 for(const start of [{x:0,z:0},{x:0,z:1.7},{x:0,z:4.5}])for(const input of [idle,{...idle,z:1},{...idle,z:-1}]){let a=start,b=start;for(let i=0;i<90;i++){a=groundMovement(a,input,1/60).velocity;b=old(b,input);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-12);}}
});
test('stance switches preserve momentum, reverse brakes and released crouch stops',()=>{
 let v={x:0,z:4.5};const crouch={...idle,z:1,crouch:true};v=groundMovement(v,crouch,1/60).velocity;assert.ok(v.z>1.7&&v.z<4.5);
 for(let i=0;i<120;i++)v=groundMovement(v,crouch,1/60).velocity;assert.equal(v.z,1.7);
 const reversed=groundMovement(v,{...crouch,z:-1},1/60).velocity;assert.ok(reversed.z>0&&reversed.z<v.z);
 for(let i=0;i<120;i++)v=groundMovement(v,{...idle,z:1},1/60).velocity;assert.equal(v.z,4.5);
 v={x:0,z:1.7};for(let i=0;i<10;i++)v=groundMovement(v,idle,1/60).velocity;assert.equal(speed(v),0);
});
test('real crouch input reaches speed on original spawn and next round clears motion',async()=>{
 const g=await Game.create(1,[{id:'p',team:'amber',position:{x:0,y:0,z:-16}},{id:'d',team:'blue',position:{x:8,y:0,z:14}}],{roundTicks:90},{movement:'ground-v1'});
 try{for(let i=0;i<60;i++)g.step(i===0?[{actorId:'p',type:'move',x:0,z:1,crouch:true}]:[]);const p=g.state.actors.find(a=>a.id==='p')!;assert.ok(speed(p.velocity!)>1.68);assert.ok(p.position.z>-15);
 while(g.state.phase==='live')g.step();g.nextRound();const fresh=g.state.actors.find(a=>a.id==='p')!;assert.deepEqual(fresh.velocity,{x:0,z:0});assert.equal(fresh.input.crouch,false);
 }finally{g.dispose();}
});
test('actual crouching death cannot carry velocity into a restarted round',async()=>{
 const g=await Game.create(1,[{id:'p',team:'amber',position:{x:0,y:0,z:-12}},{id:'d',team:'blue',position:{x:0,y:0,z:-8}}],{}, {movement:'ground-v1'});
 try{g.step([{actorId:'p',type:'move',x:0,z:1,crouch:true}]);
 for(let i=0;i<120&&g.state.phase==='live';i++){const p=g.state.actors.find(a=>a.id==='p')!,d=g.state.actors.find(a=>a.id==='d')!;const dx=p.position.x-d.position.x,dz=p.position.z-d.position.z;g.step([{actorId:'d',type:'shoot',yaw:Math.atan2(dx,dz),pitch:Math.atan2(p.position.y+1.02-d.position.y-1.62,Math.hypot(dx,dz))}]);}
 assert.equal(g.state.actors.find(a=>a.id==='p')!.hp,0);const dead=g.state.actors.find(a=>a.id==='p')!.position;g.step([{actorId:'p',type:'move',x:1,z:1}]);assert.deepEqual(g.state.actors.find(a=>a.id==='p')!.position,dead);
 g.nextRound();const fresh=g.state.actors.find(a=>a.id==='p')!;assert.equal(fresh.hp,100);assert.deepEqual(fresh.velocity,{x:0,z:0});assert.equal(fresh.input.crouch,false);
 }finally{g.dispose();}
});
test('crouch release retains real-speed defuse gate until physical rest',async()=>{
 const g=await Game.create(1,[{id:'p',team:'amber',position:{x:0,y:0,z:10}},{id:'d',team:'blue',position:{x:1,y:0,z:10}}],{plantTicks:1,defuseTicks:60},{movement:'ground-v1'});
 try{g.step([{actorId:'p',type:'interact',held:true}]);assert.equal(g.state.bomb.planted,true);
 g.step([{actorId:'d',type:'move',x:0,z:1,crouch:true}]);for(let i=0;i<20;i++)g.step();
 g.step([{actorId:'d',type:'move',x:0,z:0,crouch:true},{actorId:'d',type:'interact',held:true}]);assert.ok(speed(g.state.actors.find(a=>a.id==='d')!.velocity!)>.01);assert.equal(g.state.interaction,null);
 for(let i=0;i<20;i++)g.step();const current=()=>g.state;assert.equal(current().interaction?.actorId,'d');
 }finally{g.dispose();}
});
