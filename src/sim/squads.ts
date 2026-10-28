import { MAP } from '../content/map.js';
import { flatDistance } from './math.js';
import type { Observation } from './game.js';
import type { Vec3, Side } from './types.js';
/** Versioned, opt-in formation. Kept outside MAP so old baked navigation/hash is unchanged. */
export function squadSpawn(side: Side, slot: number): Vec3 {
  return { x: -10.5 + (slot % 3) * 1.1, y: 0, z: (side === 'attack' ? -1 : 1) * (14 + Math.floor(slot / 3) * 1.2) };
}
export type SquadPlan = { role: 'carry'|'recover'|'advance'|'hold'|'defuse'|'cover'; goal: Vec3; interact: boolean; routeIndex: number };
/** No GameState or hidden enemies accepted. Friendly positions are explicit team telemetry. */
export function squadPlan(o: Observation, slot: number, progress = 0): SquadPlan {
  const self=o.self, alive=(o.allies ?? [{id:self.id,position:self.position,hp:self.hp,bot:self.bot}]).filter(a=>a.hp>0);
  const bots=alive.filter(a=>a.bot !== null).sort((a,b)=>a.id.localeCompare(b.id));
  const nearest=(position:Vec3)=>[...bots].sort((a,b)=>flatDistance(a.position,position)-flatDistance(b.position,position)||a.id.localeCompare(b.id))[0]?.id;
  let routeIndex=progress;
  const cover=[{x:-7,y:0,z:9},{x:-2,y:0,z:9},{x:2,y:0,z:9},{x:7,y:0,z:9},{x:0,y:0,z:14}][slot%5]!;
  if(o.bomb.planted){
    const defuser=self.side==='defend' ? nearest(o.bomb.position) : undefined;
    if(self.id===defuser)return {role:'defuse',goal:{...o.bomb.position},interact:flatDistance(self.position,o.bomb.position)<1.4,routeIndex};
    return {role:'cover',goal:{...cover},interact:false,routeIndex};
  }
  if(self.side==='defend')return {role:'hold',goal:{...cover},interact:false,routeIndex};
  if(!o.bomb.carrier && self.id===nearest(o.bomb.position))return {role:'recover',goal:{...o.bomb.position},interact:false,routeIndex};
  const carrier=o.bomb.carrier===self.id;
  const route=MAP.routes[slot%3]!;
  // Stage through the approach and lane before converging on the bomb point.
  while(routeIndex < 2 && flatDistance(self.position,route[routeIndex]!) < 0.65)routeIndex++;
  let goal=routeIndex < 2 ? route[routeIndex]! : carrier ? MAP.site : cover;
  if(carrier && flatDistance(self.position,MAP.site)<1.7)goal=MAP.site;
  return {role:carrier?'carry':'advance',goal:{...goal},interact:carrier&&flatDistance(self.position,MAP.site)<1.7,routeIndex};
}
