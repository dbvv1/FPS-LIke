import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { weaponParts, weaponMesh, weaponPose, weaponPartPosition } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { armJoints, weaponToView, viewToWeapon } from '../../src/candidates/offline-training-v1/render/arm.js';

test('reload sleeves bend with finite segments around stable body anchors; wrist targets do not move',async()=>{
  const game=await Game.create(1);
  try{
    const state=game.state,actor=state.actors[0]!;actor.reload={weapon:'rifle',end:114000};
    const sleeves=weaponParts('rifle').filter(p=>p.arm),previous=new Map<string,readonly(readonly number[])[]>();
    assert.equal(sleeves.length,2);
    for(let step=0;step<=1000;step++){
      state.time=114000*step/1000;const pose=weaponPose(state,actor);
      for(const part of sleeves){
        const rig=part.arm!,position=weaponPartPosition(part,pose),shift=position.map((n,i)=>n-part.position[i]!) as [number,number,number];
        const joint=armJoints(rig,pose,shift);
        assert.ok(joint.reachable,`${part.id} frame ${step} exceeds authored arm reach`);
        for(const [a,b,length] of [[joint.shoulder,joint.elbow,rig.lengths[0]],[joint.elbow,joint.cuff,rig.lengths[1]]] as const)assert.ok(Math.abs(Math.hypot(...a.map((n,i)=>n-b[i]!))-length)<1e-8);
        const data=weaponMesh(part,pose);assert.equal(data.vertices.length,weaponMesh(part).vertices.length);
        const vertices=data.vertices.map(v=>weaponToView(v.map((n,i)=>n+position[i]!) as [number,number,number],pose));
        for(const [offset,target] of [[0,rig.shoulder],[64,joint.cuff]] as const)for(let i=0;i<3;i++)assert.ok(Math.abs(vertices.slice(offset,offset+8).reduce((s,v)=>s+v[i]!,0)/8-target[i]!)<1e-8);
        assert.ok(vertices.every(p=>p.every(Number.isFinite)&&p[2]<-.05),'sleeve never enters near plane');
        const before=previous.get(part.id!);if(before)assert.ok(Math.max(...vertices.map((v,i)=>Math.hypot(...v.map((n,k)=>n-before[i]![k]!))))<.006,'continuous path without elbow/ring flips');
        previous.set(part.id!,vertices);
      }
    }
  }finally{game.dispose();}
});

test('shared sleeve geometry preserves pose roundtrip and does not modify hands or source parts',async()=>{
  const game=await Game.create(1);
  try{
    const state=game.state,actor=state.actors[0]!;actor.reload={weapon:'rifle',end:114000};
    for(const progress of [0,.1,.25,.4,.65,.85,1]){
      state.time=114000*progress;const pose=weaponPose(state,actor);
      const point:[number,number,number]=[.23,-.19,-.65],roundtrip=viewToWeapon(weaponToView(point,pose),pose);
      roundtrip.forEach((v,i)=>assert.ok(Math.abs(v-point[i]!)<1e-10));
      for(const weapon of ['rifle','pistol'] as const)for(const part of weaponParts(weapon))if(!part.arm)assert.deepEqual(weaponMesh(part,pose),weaponMesh(part));
    }
  }finally{game.dispose();}
});


test('sleeve cuff shares every rim vertex with the unchanged wrist through the entire reload',async()=>{
  const game=await Game.create(1);
  try{
    const state=game.state,actor=state.actors[0]!;actor.reload={weapon:'rifle',end:114000};
    for(let step=0;step<=100;step++){
      state.time=114000*step/100;const pose=weaponPose(state,actor);
      for(const side of ['support','trigger']){
        const parts=weaponParts('rifle'),sleeve=parts.find(p=>p.id===side+'-sleeve')!,wrist=parts.find(p=>p.id===side+'-wrist')!;
        const rim=(part:typeof sleeve,start:number)=>{const pos=weaponPartPosition(part,pose);return weaponMesh(part,pose).vertices.slice(start,start+8).map(v=>weaponToView(v.map((n,i)=>n+pos[i]!) as [number,number,number],pose));};
        const cuff=rim(sleeve,64),wristStart=rim(wrist,0);
        for(let vertex=0;vertex<8;vertex++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(cuff[vertex]![axis]!-wristStart[vertex]![axis]!)<1e-9,`${side} seam vertex ${vertex} differs at ${step}`);
      }
    }
  }finally{game.dispose();}
});
