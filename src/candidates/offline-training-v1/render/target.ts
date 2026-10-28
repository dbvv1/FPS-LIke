import data from '../../../../assets/characters/relay-guard/guard.json';
import type { Actor } from '../sim/types.js';
export const targetSource = data;
const head=new Set(data.head),torso=new Set(data.torso);
export type TargetRegion='helmet'|'carrier'|'detail';
function region(indices:number[],part:string):TargetRegion {
  if(part!=='body')return 'detail';
  if(indices.every(i=>head.has(i)))return 'helmet';
  // Keep belt, sleeves and equipment dark; only the source torso's carrier panels change.
  if(indices.every(i=>torso.has(i))&&indices.reduce((sum,i)=>sum+data.vertices[i]![1]!,0)/indices.length>1.05)return 'carrier';
  return 'detail';
}
export const targetTriangles = data.faces.flatMap(face => face.indices.slice(1,-1).map((_,i)=>({
  indices:[face.indices[0]!,face.indices[i+1]!,face.indices[i+2]!] as const,
  color:face.color, part:face.part, region:region(face.indices,face.part),
})));
export type TargetPoint = readonly [number,number,number];
// Shared posed source geometry. Presentation follows the existing fall/flinch;
// it does not move hit volumes or decide whether a shot hit.
export function targetVertices(actor: Actor, angle:number): TargetPoint[] {
  const c=Math.cos(actor.yaw),s=Math.sin(actor.yaw),a=Math.cos(angle),b=Math.sin(angle),height=actor.input.crouch?.65:1;
  return data.vertices.map(([x,y,z])=>{
    const vertical=y!*height,yy=vertical*a+z!*b,zz=z!*a-vertical*b;
    return [actor.position.x+x!*c+zz*s,actor.position.y+yy,actor.position.z-x!*s+zz*c];
  });
}
const armor=[0x1c1c1c,0x222222,0x2b2b2b,0x333333,0x4c4c4c,0x5c5c5c,0x707070];
const helmet=[0x9e8b70,0xab9678,0xb6a07f,0xc0ab89,0xc8b393,0xd0bc9e,0xd9c8ae];
const friendlyCarrier=[0x487d79,0x548b86,0x629992,0x72a59e,0x83b1a8,0x91bdb4,0xa0c9c1];
const enemyCarrier=[0x936540,0xa57348,0xb68152,0xc18d5e,0xc99b6e,0xd3aa7f,0xddbc96];
export function targetColor(color:number,friend:boolean,region:TargetRegion='detail') {
  // A small shared material family, not an emissive highlight or an extra silhouette.
  // Keep the blue visor, dark cloth, weapon and belt at their source values.
  const shade=armor.indexOf(color);
  if(shade>=0&&region!=='detail'){
    const carrier=friend?friendlyCarrier:enemyCarrier;
    return (region==='helmet'?helmet:carrier)[shade]!;
  }
  // Source cloth palette recolored as a family, rather than an emissive outline.
  if(color===0xcfaf7c)return friend?0x75b9b0:0xc46d4e;
  if(color===0x6b624b)return friend?0x426f6b:0x775142;
  return color;
}
