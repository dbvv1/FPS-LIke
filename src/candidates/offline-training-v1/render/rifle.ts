import source from '../../../../assets/weapons/rx24-rifle.json';
import { sleevePath } from './arm.js';
import type { WeaponPart } from './weapon.js';
type Point = [number, number, number];
// Original gloved hands: tapered, curved sections rather than large box palms.
// This small editable recipe shares the existing view-model contract; it does
// not add bones, a runtime importer, or another animation clock.
function tube(id: string, path: Point[], radii: number[], color: number, support = false): WeaponPart {
  const center = path[Math.floor(path.length / 2)]!;
  const vertices: Point[] = [], faces: number[][] = [], sides = 8;
  for (let j = 0; j < path.length; j++) {
    const p = path[j]!, a = path[Math.max(0, j - 1)]!, b = path[Math.min(path.length - 1, j + 1)]!;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], length = Math.hypot(...d);
    const t = d.map(n => n / length), ref = Math.abs(t[1]!) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = [t[1]! * ref[2]! - t[2]! * ref[1]!, t[2]! * ref[0]! - t[0]! * ref[2]!, t[0]! * ref[1]! - t[1]! * ref[0]!];
    const ul = Math.hypot(...u); for (let k = 0; k < 3; k++) u[k] = u[k]! / ul;
    const v = [t[1]! * u[2]! - t[2]! * u[1]!, t[2]! * u[0]! - t[0]! * u[2]!, t[0]! * u[1]! - t[1]! * u[0]!];
    for (let k = 0; k < sides; k++) {
      const angle = k / sides * Math.PI * 2, r = radii[j]!;
      vertices.push(p.map((n, axis) => n - center[axis]! + r * (u[axis]! * Math.cos(angle) + v[axis]! * Math.sin(angle))) as Point);
    }
  }
  faces.push(Array.from({ length: sides }, (_, i) => sides - 1 - i));
  for (let j = 0; j < path.length - 1; j++) for (let i = 0; i < sides; i++) faces.push([j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i]);
  faces.push(Array.from({length:sides},(_,i)=>(path.length-1)*sides+i));
  return {id,position:center,size:[1,1,1],color,mesh:{vertices,faces},...(support?{role:'support' as const}:{})};
}
function palm(id:string,center:Point,radii:Point,color:number,support=false):WeaponPart {
  const vertices:Point[]=[[0,-radii[1],0],[0,radii[1],0]],faces:number[][]=[],segments=10,rings=5;
  for(let j=1;j<rings;j++){const latitude=-Math.PI/2+Math.PI*j/rings;for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2;vertices.push([Math.cos(a)*Math.cos(latitude)*radii[0],Math.sin(latitude)*radii[1],Math.sin(a)*Math.cos(latitude)*radii[2]]);}}
  for(let i=0;i<segments;i++){faces.push([0,2+i,2+(i+1)%segments]);const top=2+(rings-2)*segments;faces.push([1,top+(i+1)%segments,top+i]);}
  for(let j=0;j<rings-2;j++)for(let i=0;i<segments;i++)faces.push([2+j*segments+i,2+j*segments+(i+1)%segments,2+(j+1)*segments+(i+1)%segments,2+(j+1)*segments+i].reverse());
  return {id,position:center,size:radii.map(r=>r*2) as Point,color,mesh:{vertices,faces},...(support?{role:'support' as const}:{})};
}
function hands():WeaponPart[] {
  const glove=0x7d725f,edge=0x665d50,sleeve=0x3e514e;
  const supportRadii=[.052,.049,.047,.047,.046,.045,.043,.036,.027],triggerRadii=[.056,.053,.050,.050,.049,.048,.046,.037,.029];
  // Palm first: the contact/projection contract checks its grip against the mag.
  const parts:WeaponPart[]=[
    palm('support-palm',[-.033,-.069,-.446],[.027,.026,.050],glove,true),
    tube('support-sleeve',sleevePath([-.17,-.38,.02],[-.105,-.19,-.27],[-.05,-.09,-.41]),supportRadii,sleeve,true),
    tube('support-wrist',[[-.05,-.09,-.41],[-.036,-.071,-.442]],[.027,.025],edge,true),
    palm('trigger-palm',[.036,-.099,-.19],[.025,.042,.033],glove),
    tube('trigger-sleeve',sleevePath([.18,-.35,.16],[.11,-.20,-.075],[.047,-.14,-.17]),triggerRadii,sleeve),
    tube('trigger-wrist',[[.047,-.14,-.17],[.036,-.11,-.19]],[.029,.026],edge),
  ];
  for(let i=0;i<4;i++){
    const z=-.412-i*.021;
    parts.push(tube(`support-finger-${i}`,[[-.047,-.059,z],[-.033,-.084,z-.004],[.010,-.084,z-.007],[.024,-.060,z-.005]],[.0085,.008,.0075,.006],glove,true));
  }
  parts.push(tube('support-thumb',[[-.035,-.055,-.425],[-.039,-.026,-.45],[-.012,-.018,-.46]],[.011,.009,.007],glove,true));
  for(let i=0;i<3;i++){
    const y=-.082-i*.022;
    parts.push(tube(`trigger-finger-${i}`,[[.043,y,-.205],[.027,y,-.229],[-.019,y,-.232],[-.030,y,-.209]],[.009,.0085,.008,.0065],glove));
  }
  parts.push(tube('trigger-index',[[.049,-.065,-.198],[.046,-.052,-.237],[.019,-.060,-.26]],[.009,.008,.0065],glove));
  parts.push(tube('trigger-thumb',[[.036,-.081,-.163],[.006,-.066,-.166],[-.020,-.078,-.178]],[.011,.009,.007],glove));
  for(const part of parts)if(part.role==='support')part.position=[part.position[0],part.position[1]+.025,part.position[2]];
  const rest=parts.find(p=>p.id==='support-palm')!.position;
  const grip=source.grip.surface.map((n,axis)=>n+source.grip.palmOffset[axis]!-rest[axis]!) as Point;
  for(const part of parts)if(part.role==='support')part.gripOffset=grip;
  parts.find(p=>p.id==='support-sleeve')!.arm={shoulder:[-.08,-.58,-.40],hint:[-.30,-.80,-.62],lengths:[.30,.28],cuff:[-.05,-.065,-.41],wrist:[-.036,-.046,-.442],radii:supportRadii};
  parts.find(p=>p.id==='trigger-sleeve')!.arm={shoulder:[.46,-.61,-.36],hint:[.68,-.80,-.59],lengths:[.30,.28],cuff:[.047,-.14,-.17],wrist:[.036,-.11,-.19],radii:triggerRadii};
  return parts;
}
export const rifleParts:WeaponPart[]=[...(source.parts as unknown as WeaponPart[]),...hands(),
  // Original visible charging handle; do not relabel the source's rear sight.
  {id:'rx24-charging-handle',position:[.026,-.005,-.245],size:[.020,.012,.035],color:0x899797,bevel:.003,role:'bolt'},
];
export const rifleMuzzle = Object.freeze(source.muzzle as Point);
