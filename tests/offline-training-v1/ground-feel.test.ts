import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { groundMovement, movementPenalty } from '../../src/candidates/offline-training-v1/sim/movement.js';
import { interpolateState } from '../../src/candidates/offline-training-v1/render/interpolation.js';
import { trainingFeelEnabled } from '../../src/candidate-route.js';
import { measure } from '../../tools/measure-feel.js';
import { squadSpecs } from '../../src/candidates/offline-training-v1/session/squads.js';
const input = {x:0,z:0,walk:false,crouch:false,interact:false};
test('ground motion is exact opt-in, friction slide and reverse decelerate naturally',()=>{
 assert.equal(trainingFeelEnabled('?gameplay=offline-training-v1&feel=ground-v1'),true);
 for(const q of ['', '?feel=ground-v1', '?gameplay=offline-training-v1&feel=ground-v1&feel=ground-v1']) assert.equal(trainingFeelEnabled(q),false);
 const coast=groundMovement({x:0,z:4.5},input,1/60),reverse=groundMovement({x:0,z:4.5},{...input,z:-1},1/60);
 assert.ok(coast.velocity.z>0 && reverse.velocity.z>0 && reverse.velocity.z<coast.velocity.z);
 assert.equal(movementPenalty({x:0,z:1.53}),0);assert.equal(movementPenalty({x:0,z:4.5}),1);
});
test('same original input tape measures slide vs counter-stop and preserves all old measurements',async()=>{
 const a=await measure(true),b=await measure(true);assert.deepEqual(a,b);
 const before=JSON.parse((await import('node:fs')).readFileSync('docs/quality/feel/baseline.json','utf8'));
 assert.deepEqual(a.results.slice(0,9),before.results);
 const release=a.results.find(r=>r.mode==='ground-v1'&&r.scenario==='release')!;
 const reverse=a.results.find(r=>r.mode==='ground-v1'&&r.scenario==='reverse')!;
 assert.ok(Math.abs(release.summary.stopOrReverseSeconds!-.35)<1e-9);
 assert.ok(reverse.summary.stopOrReverseSeconds!<release.summary.stopOrReverseSeconds!);
 assert.ok(release.rows[59]!.velocity.z>4.49); // not a wall stop
 assert.ok(release.summary.stopDistance!>.6);
});
test('render interpolation is presentation-only, resets at boundaries, and cannot modify replay hashes',async()=>{
 const g=await Game.create(1,undefined,{}, {movement:'ground-v1'});
 try {const old=g.state;g.step([{actorId:'amber-1',type:'move',x:0,z:1}]);const current=g.state, hash=g.stateHash;
 const half=interpolateState(old,current,.5),p=current.actors[0]!,o=old.actors[0]!;
 assert.equal(half.actors[0]!.position.z,(o.position.z+p.position.z)/2);
 assert.equal(half.shots,current.shots);assert.equal(g.stateHash,hash);
 assert.equal(interpolateState({...old,round:99},current,.5),current);
 assert.equal(interpolateState({...old,phase:'over'},current,.5),current);
 assert.deepEqual(interpolateState(old,current,2).actors[0]!.position,p.position);
 assert.deepEqual(interpolateState(old,current,-1).actors[0]!.position,o.position);
 // Render repeatedly at 144Hz between ticks; no simulation tick or RNG advancement.
 for(let i=0;i<144;i++)interpolateState(old,current,(i%3)/3);
 assert.equal(g.stateHash,hash);
 }finally{g.dispose();}
});
test('all ten actors share acceleration path and collision cannot bank speed',async()=>{
 const g=await Game.create(1,squadSpecs('easy'),{}, {formation:'squads-v1',movement:'ground-v1'});
 try {
 g.step(g.state.actors.map(a=>({actorId:a.id,type:'move' as const,x:0,z:a.side==='attack'?1:-1})));
 for(const a of g.state.actors){assert.ok(a.velocity);assert.ok(Math.hypot(a.velocity.x,a.velocity.z)<1);}
 for(let t=0;t<300;t++)g.step(g.state.actors.map(a=>({actorId:a.id,type:'move' as const,x:0,z:-1})));
 for(const a of g.state.actors)assert.ok(Math.hypot(a.velocity!.x,a.velocity!.z)<4.6);
 }finally{g.dispose();}
});
test('sliding actors cannot plant until physically stopped',async()=>{
 const g=await Game.create(1,[{id:'a',team:'amber',position:{x:0,y:0,z:10}},{id:'d',team:'blue',position:{x:10,y:0,z:14}}],{plantTicks:60},{movement:'ground-v1'});
 try {g.step([{actorId:'a',type:'move',x:1,z:0}]);for(let i=0;i<10;i++)g.step();
 g.step([{actorId:'a',type:'move',x:0,z:0},{actorId:'a',type:'interact',held:true}]);const sliding=g.state;assert.equal(sliding.interaction,null);
 for(let i=0;i<40;i++)g.step();assert.equal(g.state.interaction?.actorId,'a');
 }finally{g.dispose();}
});
