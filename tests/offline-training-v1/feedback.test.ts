import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../../src/candidates/offline-training-v1/sim/game.js';
import {type Command,type PlayerSpec} from '../../src/candidates/offline-training-v1/sim/types.js';
import {Feedback,RESULT_HOLD_MS} from '../../src/candidates/offline-training-v1/render/feedback.js';
import {localShotResult,weaponParts,weaponPose,weaponPartPosition,weaponMesh} from '../../src/candidates/offline-training-v1/render/weapon.js';
import {Soundscape} from '../../src/candidates/offline-training-v1/render/audio.js';
const duel:PlayerSpec[]=[{id:'a',team:'amber',position:{x:0,y:0,z:0}},{id:'d',team:'blue',position:{x:0,y:0,z:5}}];
test('v1 command-tape hashes remain byte-compatible after adding presentation facts',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/shot-feedback-v1.json',import.meta.url),'utf8'));
 for(const c of fixture.cases){const game=await Game.create(fixture.seed,c.specs);try{for(let frame=0;frame<c.hashes.length;frame++){if(game.state.phase==='live')game.step(c.commands[frame]??[]);assert.equal(game.stateHash,c.hashes[frame],`${c.name} frame${frame}`);}}finally{game.dispose();}}
});
test('one authoritative trace records exact shooting eye, world/range endpoint, and death at settlement',async()=>{
 const world=await Game.create(1),game=await Game.create(1,duel);
 try{
  const a=world.state.actors.find(a=>a.side==='attack')!;world.step([{actorId:a.id,type:'shoot',yaw:0,pitch:0,at:250}]);
  const impact=world.state.shots[0]!.impact!;assert.deepEqual(impact.origin,{x:0,y:1.62,z:-14});assert.equal(impact.kind,'world');assert.ok(Math.abs(impact.end.z+6.6)<.001);assert.equal(impact.killed,false);
  for(let i=0;i<30;i++)world.step();world.step([{actorId:a.id,type:'shoot',yaw:0,pitch:1.4}]);const sky=world.state.shots.at(-1)!.impact!;assert.equal(sky.kind,'range');assert.ok(Math.abs(Math.hypot(sky.end.x-sky.origin.x,sky.end.y-sky.origin.y,sky.end.z-sky.origin.z)-100)<1e-8);
  game.step([{actorId:'a',type:'shoot',yaw:0,pitch:0,at:500}]);const first=game.state.shots[0]!;assert.equal(first.impact!.kind,'actor');assert.equal(first.impact!.killed,false);
  for(let i=0;i<30;i++)game.step();game.step([{actorId:'a',type:'shoot',yaw:0,pitch:0,at:999}]);const s=game.state;assert.equal(s.shots.at(-1)!.impact!.killed,true);assert.equal(s.actors.find(a=>a.id==='d')!.hp,0);
  assert.equal(localShotResult(s,s.actors[0]!,s.shots[0])!.kind,'head','earlier nonlethal shot cannot acquire death credit later');
 }finally{world.dispose();game.dispose();}
});
test('death presentation expires without advancing simulation, extending life, or replaying old events',async()=>{
 const game=await Game.create(1,duel),feedback=new Feedback();
 try{game.step([{actorId:'a',type:'shoot',yaw:0,pitch:0}]);for(let i=0;i<30;i++)game.step();game.step([{actorId:'a',type:'shoot',yaw:0,pitch:0}]);const s=game.state,d=s.actors[1]!,before=JSON.stringify(s);
 feedback.update(s,1000);assert.equal(feedback.actor(d).visible,true);feedback.update(s,1300);assert.ok(feedback.actor(d).fall>.5);feedback.update(s,1000+RESULT_HOLD_MS);assert.equal(feedback.actor(d).visible,false);assert.equal(JSON.stringify(s),before);assert.equal(s.phase,'over');assert.equal(d.hp,0);
 feedback.reset();const old={...s,shots:s.shots.map(({impact,...shot})=>shot)};assert.equal(feedback.update(old,2000).length,0,'old snapshots do not invent impact data');
 }finally{game.dispose();}
});
test('muting immediately stops existing voices and unmuting does not replay them',async()=>{
 let starts=0,stops=0;class Context {state='running';sampleRate=48000;destination={};createBuffer(_c:number,n:number){return {length:n,copyToChannel(){}};}createBufferSource(){return {buffer:null,onended:null,connect(){return this;},disconnect(){},start(){starts++;},stop(){stops++;}};}createGain(){return {gain:{value:0},connect(){return this;},disconnect(){}};}createStereoPanner(){return {pan:{value:0},connect(){return this;},disconnect(){}};}close(){return Promise.resolve();}}
 const prior=globalThis.AudioContext;globalThis.AudioContext=Context as unknown as typeof AudioContext;const game=await Game.create(1),sound=new Soundscape();try{await sound.unlock();const s=game.state,a=s.actors[0]!;s.sounds=[{id:0,actorId:a.id,position:a.position,kind:'shot',radius:40,time:0}];s.soundSequence=1;sound.update(s,a,0,[]);assert.equal(starts,1);sound.enabled=false;assert.equal(stops,1);sound.enabled=true;sound.update(s,a,0,[]);assert.equal(starts,1);}finally{sound.dispose();game.dispose();globalThis.AudioContext=prior;}
});
test('full magazine travel stays inside the first-person frame and support hand follows its grip',async()=>{
 const THREE=await import('three'),game=await Game.create(1);try{const s=game.state,a=s.actors[0]!;a.reload={weapon:'rifle',end:114000};s.time=114000*.45;const pose=weaponPose(s,a),parts=weaponParts('rifle'),mag=parts.find(p=>p.role==='magazine')!,hand=parts.find(p=>p.role==='support')!,m=weaponPartPosition(mag,pose),h=weaponPartPosition(hand,pose);assert.ok(Math.hypot(m[0]-h[0],m[1]-h[1],m[2]-h[2])<.08);
 const camera=new THREE.PerspectiveCamera(80,1365/900,.05,100);camera.updateProjectionMatrix();camera.updateMatrixWorld();for(const vertex of weaponMesh(mag).vertices){const v=new THREE.Vector3(...vertex).add(new THREE.Vector3(...m)).applyEuler(new THREE.Euler(pose.pitch,0,pose.roll,'ZYX')).add(new THREE.Vector3(pose.x,pose.y,pose.z)).project(camera);assert.ok(Math.abs(v.x)<.95&&Math.abs(v.y)<.95,'magazine must not disappear below frame');}
 }finally{game.dispose();}
});
