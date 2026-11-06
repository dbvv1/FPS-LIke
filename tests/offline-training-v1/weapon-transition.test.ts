import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { SUBTICKS, type Actor, type GameState } from '../../src/candidates/offline-training-v1/sim/types.js';
import { WeaponTransition, readyWeapon, WEAPON_DROP } from '../../src/candidates/offline-training-v1/render/weapon-transition.js';
import { weaponPose } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { CanvasView } from '../../src/candidates/offline-training-v1/render/canvas.js';
import { drawWeapon } from '../../src/candidates/offline-training-v1/render/canvas-weapon.js';
const specs = [{ id:'player', team:'amber' as const }, { id:'enemy', team:'blue' as const }];
const create = () => Game.create(1, specs, {}, { weaponPresentation:'generation-v1' });
const player = (state:GameState) => state.actors.find(a=>a.id==='player')!;
const frame = (transition:WeaponTransition, state:GameState, actor:Actor=player(state)) => transition.sample(state,actor,weaponPose(state,actor));

test('real switch lowers the displayed gun, exchanges below frame, and is ready by the firing gate', async()=>{
  const game=await create(), transition=new WeaponTransition();
  try {
    assert.equal(frame(transition,game.state).phase,'ready');
    game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);
    const state=game.state, hash=game.stateHash, start=state.time,end=player(state).nextShot;
    assert.ok(end>start);let value=frame(transition,state);
    assert.equal(player(state).weapon,'pistol');assert.equal(value.weapon,'rifle');assert.equal(value.phase,'lower');assert.equal(value.drop,0);
    value=frame(transition,{...state,time:(start+end)/2});assert.equal(value.weapon,'pistol');assert.equal(value.phase,'raise');assert.equal(value.drop,1);
    value=frame(transition,{...state,time:end});assert.equal(value.weapon,'pistol');assert.equal(value.phase,'ready');assert.equal(value.drop,0);
    assert.equal(game.stateHash,hash);
  }finally{game.dispose();}
});

test('pause freezes, unchanged generation does not restart, and sample density does not alter pose after the same observation',async()=>{
  const game=await create(), dense=new WeaponTransition(), sparse=new WeaponTransition();
  try{
    frame(dense,game.state);frame(sparse,game.state);game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);
    const state=game.state,start=state.time,end=player(state).nextShot;
    frame(dense,state);frame(sparse,state);
    for(let time=start;time<(start+end)/2;time+=100)frame(dense,{...state,time});
    const middle={...state,time:(start+end)/2};const value=frame(dense,middle);
    assert.deepEqual(value,frame(sparse,middle));for(let i=0;i<100;i++)assert.deepEqual(frame(dense,middle),value);
    assert.equal(frame(dense,{...state,time:end}).phase,'ready');assert.equal(frame(dense,{...state,time:end+1000}).phase,'ready');
  }finally{game.dispose();}
});

test('rapid reversal continues from the last displayed pose and does not revive old muzzle flash or reload',async()=>{
  const game=await create(),transition=new WeaponTransition();
  try{
    game.step([{actorId:'player',type:'shoot',yaw:0,pitch:0}]);frame(transition,game.state);
    game.step([{actorId:'player',type:'reload'}]);for(let i=0;i<35;i++)game.step();const reloadFrame=frame(transition,game.state);assert.ok(reloadFrame.pose.magazine>0);
    game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);const first=frame(transition,game.state);
    assert.equal(first.pose.magazine,reloadFrame.pose.magazine);assert.equal(first.pose.flash,0);
    game.step();const partlyLowered=frame(transition,game.state);assert.ok(partlyLowered.drop>0);
    game.step([{actorId:'player',type:'switch',weapon:'rifle'}]);const reversed=frame(transition,game.state);
    assert.equal(reversed.drop,partlyLowered.drop);assert.equal(reversed.weapon,partlyLowered.weapon);
    while(game.state.time<player(game.state).nextShot){game.step();frame(transition,game.state);}
    const ready=frame(transition,game.state);assert.equal(ready.phase,'ready');assert.equal(ready.pose.magazine,0);assert.equal(ready.pose.flash,0);assert.equal(ready.pose.kick,0);
    game.step([{actorId:'player',type:'shoot',yaw:0,pitch:0}]);const fired=frame(transition,game.state);assert.equal(fired.weapon,'rifle');assert.equal(fired.phase,'ready');assert.ok(fired.pose.flash>0);
  }finally{game.dispose();}
});

test('same-tick switch-away/back consumes generation once, missed expired switches never animate late',async()=>{
  const game=await create(),transition=new WeaponTransition();
  try{
    frame(transition,game.state);game.step([{actorId:'player',type:'switch',weapon:'pistol'},{actorId:'player',type:'switch',weapon:'rifle'}]);
    const state=game.state;assert.equal(player(state).weaponGeneration,2);assert.equal(frame(transition,state).phase,'lower');
    while(game.state.time<player(game.state).nextShot)game.step();assert.equal(frame(transition,game.state).phase,'ready');
    game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);while(game.state.time<player(game.state).nextShot)game.step();
    assert.equal(frame(transition,game.state).phase,'ready');assert.equal(frame(transition,game.state).weapon,'pistol');
    const cold=new WeaponTransition();assert.equal(frame(cold,state).phase,'ready','first snapshot has no invented outgoing gun');
  }finally{game.dispose();}
});

test('death, settled phase, round/actor replacement, rewind and reset discard stale transitions',async()=>{
  const game=await create();
  try{
    const before=game.state;game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);const after=game.state;
    for(const boundary of ['death','over','round','actor','rewind','reset'] as const){
      const t=new WeaponTransition();frame(t,before);assert.equal(frame(t,after).phase,'lower');
      let state=after,actor=player(after);
      if(boundary==='death')actor={...actor,hp:0};if(boundary==='over')state={...after,phase:'over'};
      if(boundary==='round')state={...after,round:after.round+1};if(boundary==='actor')actor={...actor,id:'replacement'};
      if(boundary==='rewind')state={...after,time:before.time};if(boundary==='reset')t.reset();
      assert.equal(frame(t,state,actor).phase,'ready',boundary);
    }
    const t=new WeaponTransition();frame(t,before);frame(t,after);
    assert.equal(frame(t,after,{...player(after),weaponGeneration:0}).phase,'ready','generation rollback is a reset boundary');
  }finally{game.dispose();}
});

test('Canvas applies the same complete-model offset without distorting parts or changing muzzle ownership',async()=>{
  const game=await create();
  try{
    const state=game.state,actor=player(state),pose=weaponPose(state,actor);const points:number[][]=[];
    const c={save(){},restore(){},beginPath(){},moveTo(x:number,y:number){points.push([x,y]);},lineTo(x:number,y:number){points.push([x,y]);},closePath(){},fill(){},stroke(){}} as unknown as CanvasRenderingContext2D;
    const ready=readyWeapon(actor,pose);drawWeapon(c,640,360,state,actor,ready);const normal=points.splice(0);
    drawWeapon(c,640,360,state,actor,{...ready,drop:1,phase:'lower',progress:.5});
    assert.ok(normal.length>100);assert.ok(points.length>100);
    // Translating changes back-face visibility, so the face count may differ.
    assert.ok(normal.some(point=>point[1]!<360));
    for(const point of points)assert.ok(point[1]!>360,'all drawn weapon vertices move below viewport');
    assert.deepEqual(ready.pose,pose,'outer offset leaves every component and sleeve pose unchanged');
    assert.equal(WEAPON_DROP,1.6);assert.equal(SUBTICKS,1000);
  }finally{game.dispose();}
});

test('a switched gun that already fired between renders never replays a late holster using its renewed cooldown',async()=>{
  const game=await create(),transition=new WeaponTransition();
  try{
    frame(transition,game.state);game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);
    while(game.state.time<player(game.state).nextShot)game.step();game.step([{actorId:'player',type:'shoot',yaw:0,pitch:0}]);
    assert.ok(player(game.state).nextShot>game.state.time);assert.equal(game.state.shots.at(-1)!.weapon,'pistol');
    const value=frame(transition,game.state);assert.equal(value.phase,'ready');assert.equal(value.weapon,'pistol');assert.ok(value.pose.flash>0);
  }finally{game.dispose();}
});

test('actual CanvasView consumes the transition and clears its receipt on failure and reset',async()=>{
  let fail=false;const context={createImageData:(w:number,h:number)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData(){},createLinearGradient(){return{addColorStop(){}};},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},fillText(){if(fail)throw new Error('canvas failure');},clearRect(){},save(){},restore(){}};
  const canvas={clientWidth:320,clientHeight:240,getContext:()=>context};
  const view=new CanvasView(canvas as unknown as HTMLCanvasElement),game=await create();
  const draw=()=>view.render(game.state,player(game.state),0,0,0,1/60);
  try{
    draw();assert.equal(view.info.weaponTransition!.phase,'ready');game.step([{actorId:'player',type:'switch',weapon:'pistol'}]);draw();
    assert.equal(view.info.weaponTransition!.weapon,'rifle');assert.equal(view.info.weaponTransition!.phase,'lower');
    while(game.state.time<player(game.state).nextShot){game.step();draw();}
    assert.equal(view.info.weaponTransition!.weapon,'pistol');assert.equal(view.info.weaponTransition!.phase,'ready');
    fail=true;assert.throws(draw,/canvas failure/);assert.equal(view.info.weaponTransition,null);fail=false;
    view.reset();assert.equal(view.info.weaponTransition,null);draw();assert.equal(view.info.weaponTransition!.phase,'ready');view.dispose();assert.equal(view.info.weaponTransition,null);
  }finally{game.dispose();view.dispose();}
});
