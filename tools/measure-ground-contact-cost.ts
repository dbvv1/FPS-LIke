import {performance} from 'node:perf_hooks';
import {Game} from '../src/candidates/offline-training-v1/sim/game.js';
import {squadSpecs} from '../src/candidates/offline-training-v1/session/squads.js';
/** Native ten-actor Game.step cost; setup, snapshot cloning and rendering excluded. */
export async function measureContactCost(Factory:typeof Game=Game){
 const g=await Factory.create(1,squadSpecs('normal'),{}, {formation:'squads-v1',movement:'ground-v1'});const actors=g.state.actors;const times:number[]=[];let movingActorTicks=0;
 try{let previous=g.state;for(let tick=0;tick<180;tick++){
  const commands=tick%60===0?actors.map((a,i)=>({actorId:a.id,type:'move' as const,x:tick===60?.5:0,z:(a.side==='attack'?1:-1)*(tick===120?-1:1),walk:i%3===1,crouch:i%3===2})):[];
  const start=performance.now();g.step(commands);times.push(performance.now()-start);const s=g.state;
  for(const a of s.actors){const before=previous.actors.find(b=>b.id===a.id)!;if(Math.hypot(a.position.x-before.position.x,a.position.z-before.position.z)>.0001)movingActorTicks++;}previous=s;
 }
 const sorted=[...times].sort((a,b)=>a-b);return {ticks:180,actors:10,movingActorTicks,totalMs:times.reduce((a,b)=>a+b,0),medianStepMs:sorted[90]!,p95StepMs:sorted[170]!,hash:g.stateHash};
 }finally{g.dispose();}
}
