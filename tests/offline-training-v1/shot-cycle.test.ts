import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { SECOND, SUBTICKS, type Shot } from '../../src/candidates/offline-training-v1/sim/types.js';
import { weaponPose, localShotResult, weaponParts, weaponMesh, weaponPartPosition } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { synthesize, type Cue } from '../../src/candidates/offline-training-v1/render/synth.js';
import { Soundscape, type ReloadAudioPolicy } from '../../src/candidates/offline-training-v1/render/audio.js';
const shot = (actorId: string, time=0): Shot => ({actorId,time,weapon:'rifle',yaw:0,pitch:0,hit:null,part:null,damage:0,visible:false,targetId:null,targetVisible:false});

// Actual synthesis reaches the AudioContext stand-in. This checks scheduling
// and samples, not audibility, browser decoding or subjective sound quality.
async function cancellationAudio(policy: ReloadAudioPolicy) {
  const events: Cue[] = [], recipes = (['shot', 'reload-out', 'reload-in', 'bolt'] as Cue[]).flatMap(cue => (['rifle', 'pistol'] as const).map(weapon => ({ cue, samples: synthesize(cue, weapon, 48000) })));
  class Context {
    state = 'running'; sampleRate = 48000; destination = {};
    createBuffer() { return { samples: new Float32Array(), copyToChannel(samples: Float32Array) { this.samples = samples.slice(); } }; }
    createBufferSource() { return { buffer: null as ReturnType<Context['createBuffer']> | null, onended: null, connect() { return this; }, disconnect() {}, stop() {}, start() {
      const samples = this.buffer!.samples;
      const recipe = recipes.find(value => value.samples.length === samples.length && value.samples.every((sample, i) => sample === samples[i]));
      assert.ok(recipe, 'consumer must submit a known unmodified recipe'); events.push(recipe.cue);
    } }; }
    createGain() { return { gain: { value: 0 }, connect() { return this; }, disconnect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() { return this; }, disconnect() {} }; }
    close() { return Promise.resolve(); }
  }
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  const game = await Game.create(1, [{ id: 'a', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'd', team: 'blue', position: { x: 0, y: 0, z: 5 } }], {}, { weaponPresentation: 'generation-v1' });
  const sound = new Soundscape('baseline', policy);
  const update = (audible: number[] = [], rifle?: Parameters<Soundscape['update']>[4]) => {
    const state = game.state, before = JSON.stringify(state), hash = game.stateHash;
    sound.update(state, state.actors.find(actor => actor.id === 'a')!, 0, audible, rifle);
    assert.equal(JSON.stringify(state), before); assert.equal(game.stateHash, hash);
  };
  await sound.unlock();
  game.step([{ actorId: 'a', type: 'shoot', yaw: 0, pitch: 1.4 }]); update(); events.length = 0;
  return { game, sound, events, update, close() { sound.dispose(); game.dispose(); globalThis.AudioContext = previous; } };
}

for (const policy of ['baseline', 'source-rifle-v1'] as const) {
  test(`${policy} does not start a reload sound canceled by one or two same-tick switches`, async () => {
    for (const back of [false, true]) {
      const f = await cancellationAudio(policy);
      try {
        f.game.step([{ actorId: 'a', type: 'reload', at: 1 }, { actorId: 'a', type: 'switch', weapon: 'pistol', at: 2 }, ...(back ? [{ actorId: 'a', type: 'switch' as const, weapon: 'rifle' as const, at: 3 }] : [])]);
        assert.equal(f.game.state.actors[0]!.reload, null); f.update(); f.update();
        for (let tick = 0; tick < 120; tick++) { f.game.step(); f.update(); }
        assert.deepEqual(f.events, []);
      } finally { f.close(); }
    }
  });
  test(`${policy} starts only the surviving reload when cancellation and restart share a timestamp`, async () => {
    const f = await cancellationAudio(policy);
    try {
      f.game.step([{ actorId: 'a', type: 'reload' }, { actorId: 'a', type: 'switch', weapon: 'pistol' }, { actorId: 'a', type: 'switch', weapon: 'rifle' }, { actorId: 'a', type: 'reload' }]);
      const reloads = f.game.state.sounds.filter(event => event.kind === 'reload');
      assert.equal(reloads.length, 2); assert.equal(reloads[0]!.time, reloads[1]!.time);
      f.update(); assert.deepEqual(f.events, ['reload-out']);
      while (f.game.state.actors[0]!.reload) { f.game.step(); f.update(); f.update(); }
      assert.deepEqual(f.events, ['reload-out', 'reload-in', 'bolt']);
      assert.equal(f.game.state.actors[0]!.weapons.rifle.ammo, 24);
      assert.equal(f.sound.reloadAudioState.sourceTimeline, false, 'no View receipt retains the baseline timing');
    } finally { f.close(); }
  });
}

test('a ready source receipt still selects the source timeline for the surviving reload', async () => {
  const f = await cancellationAudio('source-rifle-v1');
  // Receipt-contract check only. It does not load a GLB or render a View.
  const update = () => {
    const state = f.game.state, actor = state.actors[0]!;
    f.update([], { active: true, progress: weaponPose(state, actor).progress,
      reloadEnd: actor.reload?.end ?? null, weaponGeneration: actor.weaponGeneration,
      cuePhases: { out: .2, in: 1 / 1.9, bolt: 1.44 / 1.9 } });
  };
  try {
    f.game.step([{ actorId: 'a', type: 'reload' }, { actorId: 'a', type: 'switch', weapon: 'pistol' }, { actorId: 'a', type: 'switch', weapon: 'rifle' }, { actorId: 'a', type: 'reload' }]);
    update(); assert.equal(f.sound.reloadAudioState.sourceTimeline, true); assert.deepEqual(f.events, []);
    while (f.game.state.actors[0]!.reload) { f.game.step(); update(); update(); }
    assert.deepEqual(f.events, ['reload-out', 'reload-in', 'bolt']);
  } finally { f.close(); }
});

test('death before the first audio update cancels only the local pending reload cue', async () => {
  const f = await cancellationAudio('baseline');
  try {
    f.game.step([{ actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0 }]); f.update();
    assert.equal(f.game.state.actors[0]!.hp, 16);
    for (let tick = 0; tick < 6; tick++) f.game.step();
    f.game.step([{ actorId: 'a', type: 'reload', at: 100 }, { actorId: 'd', type: 'shoot', yaw: Math.PI, pitch: 0, at: 500 }]);
    assert.equal(f.game.state.actors[0]!.hp, 0); assert.equal(f.game.state.actors[0]!.reload, null);
    f.update(); assert.deepEqual(f.events, []);
  } finally { f.close(); }
});

test('ordinary local reload timing and other actors audible reloads remain unchanged', async () => {
  const f = await cancellationAudio('baseline');
  try {
    f.game.step([{ actorId: 'a', type: 'reload' }]); f.update();
    assert.deepEqual(f.events, ['reload-out']);
    while (f.game.state.actors[0]!.reload) { f.game.step(); f.update(); }
    assert.deepEqual(f.events, ['reload-out', 'reload-in', 'bolt']);
    f.events.length = 0;
    f.game.step([{ actorId: 'd', type: 'shoot', yaw: 0, pitch: 1.4 }]); f.update();
    f.game.step([{ actorId: 'd', type: 'reload' }]);
    const id = [...f.game.state.sounds].reverse().find(event => event.actorId === 'd' && event.kind === 'reload')!.id;
    f.update([id]); f.update([id]);
    assert.deepEqual(f.events, ['reload-out']);
    f.events.length = 0;
    f.game.step([{ actorId: 'd', type: 'switch', weapon: 'pistol' }, { actorId: 'd', type: 'switch', weapon: 'rifle' }, { actorId: 'd', type: 'reload' }]);
    f.update([]); assert.deepEqual(f.events, [], 'inaudible remote events remain filtered');
  } finally { f.close(); }
});

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
  const {drawWeapon}=await import('../../src/candidates/offline-training-v1/render/canvas-weapon.js');const THREE=await import('three');
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
