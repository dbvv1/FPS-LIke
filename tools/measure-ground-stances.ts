import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Game} from '../src/candidates/offline-training-v1/sim/game.js';
import {groundMovement} from '../src/candidates/offline-training-v1/sim/movement.js';
export async function measureGroundStances(){
 const results=[];
 for(const spawn of [{x:0,y:0,z:-16},{x:0,y:0,z:-12},{x:8,y:0,z:-12}])for(const stance of ['run','walk','crouch'] as const)for(const direction of ['forward','diagonal'] as const){
  const game=await Game.create(1,[{id:'p',team:'amber',position:spawn},{id:'d',team:'blue',position:{x:8,y:0,z:14}}],{}, {movement:'ground-v1'});
  const rows=[],freeRows=[];let free={x:0,z:0};
  const input={x:direction==='diagonal'?1:0,z:1,walk:stance==='walk',crouch:stance==='crouch',interact:false};
  try{for(let tick=1;tick<=180;tick++){
   free=groundMovement(free,input,1/60).velocity;freeRows.push({tick,speed:Math.hypot(free.x,free.z)});
   if(tick<=60){game.step(tick===1?[{actorId:'p',type:'move',...input}]:[]);const a=game.state.actors.find(a=>a.id==='p')!;
    rows.push({tick,position:a.position,velocity:a.velocity!,speed:Math.hypot(a.velocity!.x,a.velocity!.z),walk:a.input.walk,crouch:a.input.crouch});}
  }
  results.push({spawn,stance,direction,distanceAt60:Math.hypot(rows[59]!.position.x-spawn.x,rows[59]!.position.z-spawn.z),hash:game.stateHash,rows,freeRows});
  }finally{game.dispose();}
 }
 return {hz:60,scope:'Real Game.step (first-tick command then empty steps) and separate collision-free movement kernel; project bug regression, not CS2 benchmark or rendered input latency',results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await measureGroundStances();writeFileSync(process.argv[2]!,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r.results.map(r=>({spawn:r.spawn,stance:r.stance,direction:r.direction,distanceAt60:r.distanceAt60,speed1:r.rows[0]!.speed,speed60:r.rows[59]!.speed,free60:r.freeRows[59]!.speed,free180:r.freeRows[179]!.speed})),null,2));}
