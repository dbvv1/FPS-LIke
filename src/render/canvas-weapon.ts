import type { Actor, GameState } from '../sim/types.js';
import { weaponParts, weaponPose, weaponMesh, weaponPartPosition, weaponMuzzle } from './weapon.js';
type Point = [number, number, number];
export function drawWeapon(c: CanvasRenderingContext2D, w: number, h: number, state: GameState, actor: Actor) {
  if (actor.hp <= 0) return;
  const pose = weaponPose(state, actor), focal = h / (2 * Math.tan(40 * Math.PI / 180));
  const rotate = ([x, y, z]: Point): Point => {
    const y1 = y * Math.cos(pose.pitch) - z * Math.sin(pose.pitch), z1 = y * Math.sin(pose.pitch) + z * Math.cos(pose.pitch);
    return [pose.x + x * Math.cos(pose.roll) - y1 * Math.sin(pose.roll), pose.y + x * Math.sin(pose.roll) + y1 * Math.cos(pose.roll), pose.z + z1];
  };
  const project = ([x, y, z]: Point) => [w / 2 + x * focal / -z, h / 2 - y * focal / -z];
  const faces: { points: Point[]; depth: number; color: string; outline:boolean }[] = [];
  for (const part of weaponParts(actor.weapon)) {
    const [px,py,pz]=weaponPartPosition(part,pose), mesh=weaponMesh(part), tilt=part.tilt??0;
    const vertices: Point[]=mesh.vertices.map(([x,y,z])=>rotate([px+x,py+y*Math.cos(tilt)-z*Math.sin(tilt),pz+y*Math.sin(tilt)+z*Math.cos(tilt)]));
    for (const [index,indices] of mesh.faces.entries()) {
      const points = indices.map(i => vertices[i]!);
      let shade=index===0?.68:index===1?.8:.68+(index-2)/Math.max(1,mesh.faces.length-3)*.42;
      if(part.mesh){
        const a=points[0]!;let n=[0,0,0],length=0;
        // Source n-gons may begin with collinear edge vertices. Find an actual
        // triangle instead of discarding a visible whole polygon as degenerate.
        for(let i=1;i<points.length-1&&length<1e-10;i++){const b=points[i]!,d=points[i+1]!,u=b.map((v,j)=>v-a[j]!),v=d.map((q,j)=>q-a[j]!);n=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!];length=Math.hypot(...n);}
        if(length<1e-10||n[0]!*a[0]+n[1]!*a[1]+n[2]!*a[2]>=0)continue;
        shade=.58+.42*Math.max(0,(-.35*n[0]!+.7*n[1]!+.6*n[2]!)/length);
      }
      const rgb = [part.color >> 16, (part.color >> 8) & 255, part.color & 255].map(n => Math.min(255, Math.round(n * shade)));
      faces.push({ points, depth: points.reduce((sum,p) => sum + p[2], 0) / points.length, color: `rgb(${rgb.join(',')})`,outline:!part.mesh });
    }
  }
  faces.sort((a,b) => a.depth - b.depth);
  c.save(); c.lineWidth = .7;
  for (const face of faces) {
    c.fillStyle = face.color; c.strokeStyle = '#15252b'; c.beginPath();
    face.points.forEach((point, i) => { const p = project(point); if (!i) c.moveTo(p[0]!, p[1]!); else c.lineTo(p[0]!,p[1]!); });
    c.closePath(); c.fill(); if(face.outline)c.stroke();
  }
  if (pose.flash > 0) {
    const p = project(rotate([...weaponMuzzle(actor.weapon)]));
    const radius = (12 + pose.flash * 16) * h / 360;
    c.fillStyle = '#ffecc0'; c.beginPath();
    for (let i=0;i<12;i++) { const a=i*Math.PI/6, r=i%2 ? radius*.25 : radius; const x=p[0]!+Math.sin(a)*r,y=p[1]!+Math.cos(a)*r; if(i===0)c.moveTo(x,y);else c.lineTo(x,y); }
    c.closePath(); c.fill();
  }
  c.restore();
}
