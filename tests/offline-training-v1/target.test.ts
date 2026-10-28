import test from 'node:test';
import assert from 'node:assert/strict';
import { targetSource, targetVertices, targetTriangles, targetColor } from '../../src/candidates/offline-training-v1/render/target.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Physics } from '../../src/candidates/offline-training-v1/sim/physics.js';
test('source head stays centered inside the existing head volume; primary head/chest shots use real physics',async()=>{
 const game=await Game.create(12,[{id:'a',team:'amber',position:{x:0,y:0,z:-16}},{id:'b',team:'blue',position:{x:0,y:0,z:-14}}]);
 const actors=game.state.actors,physics=new Physics(actors);
 assert.deepEqual(targetSource.aimForward,[0,0,1]);assert.deepEqual(targetSource.weaponForward,[0,0,1]);
 try{
  for(const i of targetSource.head){const [x,y,z]=targetSource.vertices[i]!;assert.ok(Math.hypot(x!,y!-1.62,z!)<.22);}
  assert.ok(targetTriangles.length>400);assert.ok(targetTriangles.every(f=>f.indices.every(i=>i>=0&&i<targetSource.vertices.length)));
  const player=actors[0]!,target=actors[1]!;
  for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
   player.position={x:target.position.x-Math.sin(yaw)*2,y:0,z:target.position.z-Math.cos(yaw)*2};physics.sync(player);
   assert.equal(physics.trace(player,actors,yaw,0)?.part,'head');
   assert.equal(physics.trace(player,actors,yaw,Math.atan2(-.62,2))?.part,'body');
  }
  const before=JSON.stringify(game.state);for(const angle of[0,.15,1.2])assert.ok(targetVertices(target,angle).flat().every(Number.isFinite));assert.equal(JSON.stringify(game.state),before);
 }finally{physics.dispose();game.dispose();}
});

test('shared armor palette preserves source geometry and weapon/cloth detail',()=>{
 const before=JSON.stringify(targetSource);
 const helmet=targetTriangles.filter(t=>t.region==='helmet'),carrier=targetTriangles.filter(t=>t.region==='carrier');
 assert.ok(helmet.length>20&&carrier.length>20);
 assert.ok(helmet.every(t=>t.indices.every(i=>targetSource.head.includes(i))));
 assert.ok(carrier.every(t=>t.indices.every(i=>targetSource.torso.includes(i))));
 for(const triangle of targetTriangles.filter(t=>t.part==='weapon')){
  assert.equal(triangle.region,'detail');assert.equal(targetColor(triangle.color,false,triangle.region),triangle.color);
 }
 for(const region of ['helmet','carrier','detail'] as const){
  assert.equal(targetColor(0x1f6eb3,false,region),0x1f6eb3,'visor is not painted over');
  assert.equal(targetColor(0x211d1e,false,region),0x211d1e,'cloth detail remains dark');
 }
 assert.notEqual(targetColor(0x222222,false,'carrier'),targetColor(0x222222,true,'carrier'));
 assert.equal(targetColor(0x222222,false,'detail'),0x222222);
 assert.equal(JSON.stringify(targetSource),before);
});
