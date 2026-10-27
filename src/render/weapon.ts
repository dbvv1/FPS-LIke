import { MOVEMENT } from '../content/movement.js';
import { freeze } from '../content/freeze.js';
import { WEAPONS } from '../content/weapons.js';
import { SECOND, SUBTICKS, type Actor, type GameState, type Shot, type WeaponId } from '../sim/types.js';
import { sleeveVertices, type ArmRig } from './arm.js';
import { rifleParts, rifleMuzzle } from './rifle.js';

export type WeaponPart = { id?:string; arm?: ArmRig; position: readonly [number, number, number]; size: readonly [number, number, number]; color: number; bevel?: number; tilt?: number; role?: 'magazine' | 'support' | 'bolt'; gripOffset?: readonly [number,number,number]; mesh?: {vertices: readonly (readonly [number,number,number])[];faces: readonly (readonly number[])[]} };
// Existing original pistol is unchanged; the rifle is a separately sourced
// editable master with original hands, sharing these pose and mesh contracts.
function makePistolParts(): WeaponPart[] {
  const steel=0x344a52, glove=0x947851, cuff=0x314c55;
  const kit: WeaponPart[] = [
    { position:[0,0,-.24],size:[.105,.09,.27],color:steel,bevel:.018 },
    { position:[0,.055,-.27],size:[.085,.035,.25],color:0x83969a,bevel:.008 },
    { position:[0,.025,-.44],size:[.04,.04,.09],color:0x14252c,bevel:.012 },
    { position:[0,.092,-.35],size:[.022,.03,.02],color:0x102128 },
    { position:[-.025,.078,-.15],size:[.012,.022,.02],color:0x13252c },
    { position:[.025,.078,-.15],size:[.012,.022,.02],color:0x13252c },
    { position:[-.054,.005,-.27],size:[.006,.014,.12],color:0x6bb5aa },
    { position:[.055,.015,-.19],size:[.012,.025,.07],color:0x101c23,role:'bolt' },
    { position:[0,-.115,-.11],size:[.07,.15,.08],color:0x1b3038,bevel:.012,tilt:.22 },
    { position:[0,-.13,-.12],size:[.064,.13,.09],color:0x1a2d36,bevel:.008,role:'magazine' },
    { position:[.037,-.105,-.095],size:[.085,.085,.075],color:glove,bevel:.022,tilt:.20 },
    { position:[.072,-.16,.015],size:[.095,.10,.28],color:cuff,bevel:.028,tilt:-.25 },
    { position:[.072,-.04,-.17],size:[.025,.026,.105],color:glove,bevel:.009 },
  ];
  for(let i=0;i<3;i++)kit.push({position:[-.009,-.076-i*.021,-.15],size:[.088,.018,.032],color:glove,bevel:.007});
    kit.push({position:[-.06,-.10,-.16],size:[.085,.075,.075],color:glove,bevel:.020,role:'support'},
      {position:[-.10,-.17,.015],size:[.095,.10,.27],color:cuff,bevel:.026,tilt:.2,role:'support'});
    for(let i=0;i<3;i++)kit.push({position:[-.014,-.065-i*.019,-.20],size:[.08,.016,.025],color:glove,bevel:.006,role:'support'});
  return kit;
}
export function weaponMesh(part: Readonly<WeaponPart>, pose?: ReturnType<typeof weaponPose>) {
  if(part.mesh){
    if(part.arm&&pose){const position=weaponPartPosition(part,pose),shift=position.map((n,i)=>n-part.position[i]!) as [number,number,number];return {vertices:sleeveVertices(part.arm,pose,shift,position),faces:part.mesh.faces};}
    return part.mesh;
  }
  const [sx,sy,sz]=part.size,x=sx/2,y=sy/2,z=sz/2,b=Math.min(part.bevel??0,sx*.45,sy*.45);
  const ring=b>0?[[-x+b,-y],[x-b,-y],[x,-y+b],[x,y-b],[x-b,y],[-x+b,y],[-x,y-b],[-x,-y+b]]:[[-x,-y],[x,-y],[x,y],[-x,y]];
  const vertices=([-z,z] as const).flatMap(depth=>ring.map(([vx,vy])=>[vx!,vy!,depth] as [number,number,number]));
  const n=ring.length,faces:number[][]=[Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>n+i)];
  for(let i=0;i<n;i++)faces.push([i,(i+1)%n,(i+1)%n+n,i+n]);
  return {vertices,faces};
}
const parts = freeze({ rifle: rifleParts, pistol: makePistolParts() });
export const weaponParts = (weapon: WeaponId) => parts[weapon];
// Visual muzzle only. The authoritative ray still starts at the shooting eye.
export const weaponMuzzle = (weapon:WeaponId):readonly[number,number,number] => weapon==='rifle'?rifleMuzzle:[0,.025,-.50];
const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export function weaponPose(state: GameState, actor: Actor) {
  let kick = 0, flash = 0;
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const shot = state.shots[i]!;
    const age = (state.time - shot.time) / SECOND;
    if (age > .55) break;
    if (shot.actorId !== actor.id || shot.weapon !== actor.weapon || age < 0) continue;
    kick += (1 - Math.exp(-age / .006)) * Math.exp(-age / .075) * 1.4;
    flash = Math.max(flash, Math.max(0, 1 - age / .065));
  }
  if (state.phase === 'over') { kick = 0; flash = 0; }
  const progress = actor.reload ? Math.max(0, Math.min(1, 1 - (actor.reload.end - state.time) / (WEAPONS[actor.reload.weapon].reload * SUBTICKS))) : 0;
  const lower = actor.reload ? smooth(progress / .18) * (1 - smooth((progress - .82) / .18)) : 0;
  const magazine = actor.reload ? smooth((progress - .22) / .13) * (1 - smooth((progress - .55) / .20)) : 0;
  const grasp = actor.reload ? smooth(progress / .18) * (1 - smooth((progress - .78) / .18)) : 0;
  const bolt = actor.reload ? Math.sin(Math.max(0, Math.min(1, (progress - .77) / .12)) * Math.PI) : 0;
  const moving = Math.min(1, Math.hypot(actor.velocity.x, actor.velocity.z) / MOVEMENT.runSpeed);
  const sway = Math.sin(state.time / SECOND * 9) * .004 * moving;
  return { kick, flash, progress, lower, magazine, bolt, grasp, supportTravel:actor.weapon==='pistol'?.04:.10,
    x: .29 + sway - lower*.08, y: -.28 + lower*.16 - kick*.018, z: -.32 - lower*.22 + kick*.075,
    pitch: kick * .10 - lower * .10, roll: lower * -.52 + sway,
  };
}
export function weaponPartPosition(part: Readonly<WeaponPart>, pose: ReturnType<typeof weaponPose>): [number,number,number] {
  const p=[...part.position] as [number,number,number];
  if(part.role==='magazine')p[1]-=pose.magazine*.18;
  if(part.role==='support'){
    const grip=part.gripOffset??[.025,-.035,pose.supportTravel];
    for(let axis=0;axis<3;axis++)p[axis]=p[axis]!+pose.grasp*grip[axis]!;
    p[1]-=pose.magazine*.18;
  }
  if(part.role==='bolt')p[2]+=pose.bolt*.065;
  return p;
}
export function localShotResult(state: GameState, actor: Actor, shot: Shot | undefined = [...state.shots].reverse().find(s => s.actorId === actor.id)) {
  if (!shot) return null;
  const target = state.actors.find(a => a.id === shot.hit);
  const lastHit = shot.hit ? [...state.shots].reverse().find(s => s.hit === shot.hit) : null;
  const killed = shot.impact ? shot.impact.killed : target?.hp === 0 && lastHit === shot;
  const kind = !shot.hit ? 'miss' : target?.team === actor.team ? 'friendly' : killed ? 'kill' : shot.part === 'head' ? 'head' : 'body';
  return { shot, kind, age: (state.time - shot.time) / SECOND };
}
