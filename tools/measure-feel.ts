import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Game as DefaultGame } from '../src/sim/game.js';
import { Game as MovementGame } from '../src/candidates/movement-v2/sim/game.js';
import { Game as TrainingGame } from '../src/candidates/offline-training-v1/sim/game.js';
import { shootingState } from '../src/candidates/movement-v2/sim/shooting.js';
import type { Command } from '../src/sim/types.js';
export async function measure() {
 const results = []; const recoveryProbes = [];
 for (const [mode, Factory] of [['default', DefaultGame], ['movement-v2', MovementGame], ['offline-training-v1', TrainingGame]] as const) {
  for (const probeTick of [72,73]) {
   const probe = await Factory.create(1, [{id:'p',team:'amber',position:{x:0,y:0,z:-16}}, {id:'d',team:'blue',position:{x:8,y:0,z:14}}]);
   try { for(let tick=0;tick<=probeTick;tick++) probe.step(tick<60||tick===probeTick?[{actorId:'p',type:'shoot',yaw:Math.PI/2,pitch:0}]:[]);
    const s=probe.state,p=s.actors.find(a=>a.id==='p')!; recoveryProbes.push({mode,delayAfterLastBurstShotSeconds:probeTick/60-0.9,acceptedShots:s.shots.length,patternShotsAfterProbe:p.weapons.rifle.shots,lastShot:s.shots.at(-1)});
   } finally {probe.dispose();}
  }
  for (const scenario of ['release', 'reverse', 'burst-reload'] as const) {
   const game = await Factory.create(1, [{id:'p',team:'amber',position:{x:0,y:0,z:-16}}, {id:'d',team:'blue',position:{x:8,y:0,z:14}}]);
   const rows = []; let previous = game.state.actors.find(a=>a.id==='p')!.position; let reloadStart:number|null=null, reloadEnd:number|null=null;
   try {
    for (let tick=0;tick<300;tick++) {
     const commands:Command[]=[];
     if(scenario!=='burst-reload') {
      if(tick===0) commands.push({actorId:'p',type:'move',x:0,z:1});
      if(tick===60) commands.push({actorId:'p',type:'move',x:0,z:scenario==='release'?0:-1});
     } else {
      if(tick<60) commands.push({actorId:'p',type:'shoot',yaw:Math.PI/2,pitch:0});
      if(tick===150) commands.push({actorId:'p',type:'reload'});
     }
     const before=game.state; game.step(commands);
     const state=game.state, p=state.actors.find(a=>a.id==='p')!;
     const velocity={x:(p.position.x-previous.x)*60,z:(p.position.z-previous.z)*60};previous=p.position;
     if(p.reload && reloadStart===null) reloadStart=before.time/60000;
     if(reloadStart!==null && !p.reload && reloadEnd===null) reloadEnd=state.time/60000;
     rows.push({tick:state.tick,time:state.time/60000,commands,position:p.position,velocity,speed:Math.hypot(velocity.x,velocity.z),yaw:p.yaw,pitch:p.pitch,ammo:p.weapons.rifle.ammo,reload:p.reload,patternShots:p.weapons.rifle.shots,
       accuracy: mode==='movement-v2'?shootingState(p as Parameters<typeof shootingState>[0],state.time):null,
       events:state.shots.filter(s=>s.time>=before.time).map(s=>({time:s.time/60000,yaw:s.yaw,pitch:s.pitch})),soundEvents:state.sounds.filter(s=>s.time>=before.time)});
    }
    const atRelease=rows[59]!, after=rows.slice(60);
    const stop=after.find(r=>scenario==='reverse'?r.velocity.z<=0:r.speed<0.001);
    const shots=game.state.shots;
    const recovered=rows.find(r=>r.time>0.9 && r.accuracy && r.accuracy.recoilIndex===0);
    results.push({mode,scenario,stateHash:game.stateHash,summary:{speedAtOneSecond:atRelease.speed,stopOrReverseSeconds:scenario==='burst-reload'?null:stop?stop.time-1:null,stopDistance:scenario==='burst-reload'?null:stop?stop.position.z-atRelease.position.z:null,shotCount:shots.length,shotTimes:shots.map(s=>s.time/60000),shotIntervals:shots.slice(1).map((s,i)=>(s.time-shots[i]!.time)/60000),recoilRecoveryAfterLastShotSeconds:recovered&&shots.length?recovered.time-shots.at(-1)!.time/60000:null,reloadSeconds:reloadStart!==null&&reloadEnd!==null?reloadEnd-reloadStart:null},rows});
   } finally {game.dispose();}
  }
 }
 return {schema:1,source:'83e7c0b4e2c026ded1906aa5be71601859482431',seed:1,hz:60,units:'world units, seconds, radians; position-delta velocity includes collision',scope:'Real Game.step command replay, not browser/hardware input or rendered feedback. Two stationary actors, no bot commands. Reverse records first nonpositive forward velocity, not exact zero crossing.',results,recoveryProbes};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){const result=await measure(); if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result.results.map(({mode,scenario,summary})=>({mode,scenario,...summary})),null,2));}
