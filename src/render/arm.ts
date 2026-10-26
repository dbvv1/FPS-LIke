// Original view-model sleeves, not a retargeted character or a new clock.
// The existing hand pose is the sole wrist target; a stable camera-space
// shoulder and outward hint resolve two fixed-length segments.
export type Point = readonly [number, number, number];
type MutablePoint = [number, number, number];
export type ArmRig = { shoulder: Point; hint: Point; lengths: readonly [number, number]; cuff: Point; wrist: Point; radii: readonly number[] };
export type ViewPose = { x:number;y:number;z:number;pitch:number;roll:number };
const add=(a:Point,b:Point):MutablePoint=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a:Point,b:Point):MutablePoint=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a:Point,n:number):MutablePoint=>[a[0]*n,a[1]*n,a[2]*n];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a:Point)=>mul(a,1/Math.max(1e-9,Math.hypot(...a)));
const cross=(a:Point,b:Point):MutablePoint=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const lerp=(a:Point,b:Point,t:number)=>add(a,mul(sub(b,a),t));
export function weaponToView(p:Point,pose:ViewPose):MutablePoint {
  const y=p[1]*Math.cos(pose.pitch)-p[2]*Math.sin(pose.pitch),z=p[1]*Math.sin(pose.pitch)+p[2]*Math.cos(pose.pitch);
  return [pose.x+p[0]*Math.cos(pose.roll)-y*Math.sin(pose.roll),pose.y+p[0]*Math.sin(pose.roll)+y*Math.cos(pose.roll),pose.z+z];
}
export function viewToWeapon(p:Point,pose:ViewPose):MutablePoint {
  const x=p[0]-pose.x,y=p[1]-pose.y,z=p[2]-pose.z,rx=x*Math.cos(pose.roll)+y*Math.sin(pose.roll),ry=-x*Math.sin(pose.roll)+y*Math.cos(pose.roll);
  return [rx,ry*Math.cos(pose.pitch)+z*Math.sin(pose.pitch),-ry*Math.sin(pose.pitch)+z*Math.cos(pose.pitch)];
}
export function armJoints(rig:ArmRig,pose:ViewPose,shift:Point) {
  const shoulder=rig.shoulder,cuff=weaponToView(add(rig.cuff,shift),pose),delta=sub(cuff,shoulder),distance=Math.hypot(...delta),axis=unit(delta);
  const [upper,fore]=rig.lengths;
  // The authored reload stays inside this reach. Clamping only protects the
  // square root against rounding; it never moves the authoritative hand.
  const along=(upper*upper-fore*fore+distance*distance)/(2*Math.max(distance,1e-9));
  const hint=sub(rig.hint,shoulder),bend=unit(sub(hint,mul(axis,dot(hint,axis))));
  const elbow=add(add(shoulder,mul(axis,along)),mul(bend,Math.sqrt(Math.max(0,upper*upper-along*along))));
  const wrist=weaponToView(add(rig.wrist,shift),pose);
  return {shoulder,elbow,cuff,wrist,distance,reachable:distance<=upper+fore&&distance>=Math.abs(upper-fore)};
}
export function sleevePath(shoulder:Point,elbow:Point,cuff:Point):MutablePoint[] {
  const entry=lerp(shoulder,elbow,.78),exit=lerp(elbow,cuff,.24);
  const bend=[0,.25,.5,.75,1].map(t=>lerp(lerp(entry,elbow,t),lerp(elbow,exit,t),t));
  return [[...shoulder],lerp(shoulder,elbow,.48),...bend,lerp(elbow,cuff,.66),[...cuff]];
}
export function sleeveVertices(rig:ArmRig,pose:ViewPose,shift:Point,partPosition:Point):MutablePoint[] {
  const {shoulder,elbow,cuff,wrist}=armJoints(rig,pose,shift);
  const path=sleevePath(shoulder,elbow,cuff);
  const vertices:MutablePoint[]=[];
  for(let j=0;j<path.length;j++){
    const p=path[j]!,a=path[Math.max(0,j-1)]!,b=j===path.length-1?wrist:path[j+1]!;
    // A joined ring needs the wrist's full basis, not just its centre. Build
    // the cuff in weapon space exactly as the original wrist tube does;
    // camera-space up would introduce a roll-dependent polygon mismatch.
    const cuff=j===path.length-1;
    const tangent=unit(cuff?sub(rig.wrist,rig.cuff):sub(b,a)),ref:Point=Math.abs(tangent[1])<.9?[0,1,0]:[1,0,0],u=unit(cross(tangent,ref)),v=cross(tangent,u);
    for(let k=0;k<8;k++){
      const angle=k*Math.PI/4,radius=rig.radii[j]!;
      const radial=add(mul(u,radius*Math.cos(angle)),mul(v,radius*Math.sin(angle)));
      const point=cuff?add(add(rig.cuff,shift),radial):viewToWeapon(add(p,radial),pose);
      vertices.push(sub(point,partPosition));
    }
  }
  return vertices;
}
