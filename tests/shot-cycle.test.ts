import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { SECOND, SUBTICKS, type Shot } from '../src/sim/types.js';
import { weaponPose, localShotResult, weaponParts, weaponMesh, weaponPartPosition } from '../src/render/weapon.js';
import { synthesize, type Cue } from '../src/render/synth.js';
import { Soundscape } from '../src/render/audio.js';
const shot = (actorId: string, time=0): Shot => ({actorId,time,weapon:'rifle',yaw:0,pitch:0,hit:null,part:null,damage:0,visible:false,targetId:null,targetVisible:false});

test('one shot has attack/recovery, shares simulation timing, and never moves aim or snapshot', async()=>{
  const game=await Game.create(1);
  try {
    const s=game.state,a=s.actors[0]!;s.shots=[shot(a.id)];s.time=1000;
    const original=JSON.stringify(s),kick=weaponPose(s,a);
    assert.ok(kick.kick>.5 && kick.flash>0);assert.equal(JSON.stringify(s),original);
    s.time=.4*SECOND;assert.ok(weaponPose(s,a).kick<.01);assert.equal(weaponPose(s,a).flash,0);
    s.phase='over';s.time=1000;assert.equal(weaponPose(s,a).flash,0);assert.equal(weaponPose(s,a).kick,0);
    assert.equal(a.yaw,0);assert.equal(a.pitch,0);
  }finally{game.dispose();}
});
test('reload has exit/insert/settle phases and switch interruption instantly returns magazine',async()=>{
  const game=await Game.create(1);
  try {
    const s=game.state,a=s.actors[0]!; a.reload={weapon:'rifle',end:114*SUBTICKS};
    s.time=114*SUBTICKS*.4;const out=weaponPose(s,a);assert.ok(out.magazine>.99 && out.lower>.99);
    s.time=114*SUBTICKS*.8;const inserted=weaponPose(s,a);assert.equal(inserted.magazine,0);assert.ok(inserted.bolt>0);
    s.time=114*SUBTICKS*.98;assert.ok(weaponPose(s,a).lower<.05);
    a.reload=null;a.weapon='pistol';assert.equal(weaponPose(s,a).lower,0);assert.equal(weaponPose(s,a).magazine,0);
    for(const id of ['rifle','pistol'] as const)for(const part of weaponParts(id))assert.ok([...part.position,...part.size].every(Number.isFinite));
  }finally{game.dispose();}
});
test('head/body/miss/kill result follows actual shot, not mere eventual target death',async()=>{
  const game=await Game.create(1);
  try {
    const s=game.state,a=s.actors[0]!,b=s.actors[1]!,hit={...shot(a.id),hit:b.id,part:'head' as const,damage:84};s.shots=[hit];
    assert.equal(localShotResult(s,a)?.kind,'head');b.hp=0;assert.equal(localShotResult(s,a)?.kind,'kill');
    s.shots.push({...shot('teammate',1),hit:b.id,part:'body',damage:28});assert.equal(localShotResult(s,a)?.kind,'head');
    s.shots.push(shot(a.id,2));assert.equal(localShotResult(s,a)?.kind,'miss');
  }finally{game.dispose();}
});
test('editable synthesis recipes are finite, bounded, return to silence and distinguish weapons/results',()=>{
  const cues: Cue[]=['shot','step','reload-out','reload-in','bolt','hit','head','kill','plant'];
  for(const cue of cues){const s=synthesize(cue,'rifle',48000);assert.ok(s.every(Number.isFinite));assert.ok(Math.max(...s.map(Math.abs))<=.751);assert.equal(s[0],0);assert.ok(Math.abs(s.at(-1)!)<.01);assert.deepEqual(s,synthesize(cue,'rifle',48000));}
  assert.notDeepEqual(synthesize('shot','rifle',48000),synthesize('shot','pistol',48000));
  assert.notDeepEqual(synthesize('hit','rifle',48000),synthesize('head','rifle',48000));
});
test('sound consumer keeps observation filtering, one-shot delivery and cancels reset voices',async()=>{
  let starts=0,stops=0;
  class FakeContext {state='running';sampleRate=48000;destination={};
    createBuffer(_channels:number,length:number){return {length,copyToChannel(){}};}
    createBufferSource(){return {buffer:null,onended:null,connect(){return this;},disconnect(){},start(){starts++;},stop(){stops++;}};}
    createGain(){return {gain:{value:0},connect(){return this;},disconnect(){}};}
    createStereoPanner(){return {pan:{value:0},connect(){return this;},disconnect(){}};}
    close(){return Promise.resolve();}
  }
  const original=globalThis.AudioContext;globalThis.AudioContext=FakeContext as unknown as typeof AudioContext;
  const game=await Game.create(1),sound=new Soundscape();
  try {
    await sound.unlock();const s=game.state,a=s.actors[0]!,b=s.actors[1]!;
    s.sounds=[{id:0,actorId:b.id,position:{...a.position},kind:'shot',radius:40,time:0}];s.soundSequence=1;
    sound.update(s,a,0,[]);assert.equal(starts,0,'inaudible enemy cannot emit sound');
    s.sounds.push({id:1,actorId:a.id,position:{...a.position},kind:'shot',radius:40,time:0});s.soundSequence=2;
    sound.update(s,a,0,[]);assert.equal(starts,1);sound.update(s,a,0,[]);assert.equal(starts,1);
    sound.reset();assert.equal(stops,1);
  }finally{sound.dispose();game.dispose();globalThis.AudioContext=original;}
});
test('actual visible CPU viewmodel vertices match Three projection and front-face selection through recoil and reload',async()=>{
  const {drawWeapon}=await import('../src/render/canvas-weapon.js');const THREE=await import('three');
  const game=await Game.create(1);
  try{
    const s=game.state,a=s.actors[0]!,points:number[][]=[];
    const c={fillStyle:'',save(){},restore(){},beginPath(){},closePath(){},fill(){},stroke(){},moveTo(x:number,y:number){if(this.fillStyle!=='#ffecc0')points.push([x,y]);},lineTo(x:number,y:number){if(this.fillStyle!=='#ffecc0')points.push([x,y]);}};
    const camera=new THREE.PerspectiveCamera(80,640/360,.05,100);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    for(const weapon of ['rifle','pistol'] as const)for(const reload of [false,true]){
      a.weapon=weapon;
      s.time=1000;s.shots=[shot(a.id)];a.reload=reload?{weapon:'rifle',end:s.time+114*SUBTICKS*.6}:null;points.length=0;
      drawWeapon(c as unknown as CanvasRenderingContext2D,640,360,s,a);const pose=weaponPose(s,a);
      const expected:number[][]=[];
      for(const part of weaponParts(a.weapon)){
        const mesh=weaponMesh(part,pose),vertices=mesh.vertices.map(vertex=>new THREE.Vector3(...vertex).applyAxisAngle(new THREE.Vector3(1,0,0),part.tilt??0).add(new THREE.Vector3(...weaponPartPosition(part,pose))).applyEuler(new THREE.Euler(pose.pitch,0,pose.roll,'ZYX')).add(new THREE.Vector3(pose.x,pose.y,pose.z)));
        for(const face of mesh.faces){
          if(part.mesh){const normal=new THREE.Vector3();let area=0;for(let i=1;i<face.length-1&&area<5e-11;i++){const triangle=new THREE.Triangle(vertices[face[0]!]!,vertices[face[i]!]!,vertices[face[i+1]!]!);area=triangle.getArea();triangle.getNormal(normal);}if(area<5e-11||normal.dot(vertices[face[0]!]!)>=0)continue;}
          for(const index of face){const v=vertices[index]!.clone().project(camera);expected.push([(v.x+1)*320,(1-v.y)*180]);}
        }
      }
      assert.ok(expected.length>0);assert.equal(points.length,expected.length,'no missing front faces or extra back faces');
      for(const target of expected)assert.ok(points.some(p=>Math.hypot(p[0]!-target[0]!,p[1]!-target[1]!)<1e-7));
    }
  }finally{game.dispose();}
});
