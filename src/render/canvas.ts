import { drawGround } from './ground.js';
import { Feedback } from './feedback.js';
import { targetTriangles, targetVertices, targetColor } from './target.js';
import { YARD, wallPaint, rgb, css } from './yard.js';
import type { Box } from '../content/map.js';
import { MAP } from '../content/map.js';
import { drawWeapon } from './canvas-weapon.js';
import { eye } from '../sim/physics.js';
import type { Actor, GameState } from '../sim/types.js';
type Occluder = { depth: number; top: number; bottom: number };
// CPU fallback: same map and snapshots, no alternate simulation or WebGL emulation.
export class CanvasView {
  readonly backend = 'canvas2d-cpu';
  private feedback=new Feedback();
  private context: CanvasRenderingContext2D;
  private width = 640; private height = 360;
  private ground: ImageData | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas2D is unavailable');
    this.context = context; this.resize();
  }
  get info() { return { memory: { geometries: 0, textures: 0 }, calls: 1 }; }
  resize() {
    this.width = Math.min(800, this.canvas.clientWidth);
    this.height = Math.max(240, Math.round(this.width * this.canvas.clientHeight / this.canvas.clientWidth));
    this.canvas.width = this.width; this.canvas.height = this.height;
    this.ground=this.context.createImageData(this.width,this.height);
  }
  reset() {this.feedback.reset();}
  render(state: GameState, player: Actor, yaw: number, pitch: number, now: number, _dt: number) {
    const effects=this.feedback.update(state,now);
    const c = this.context, w = this.width, h = this.height, e = eye(player);
    const focal = h / (2 * Math.tan(40 * Math.PI / 180));
    const horizon = h / 2 + Math.tan(pitch) * focal;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, css(YARD.sky)); sky.addColorStop(1, '#b3c1bb'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
    drawGround(c,this.ground!,e,yaw,horizon,focal);
    const project = (x: number, y: number, z: number) => {
      const dx = x - e.x, dz = z - e.z, depth = dx * sin + dz * cos;
      return { x: w / 2 + (dx * cos - dz * sin) * focal / depth, y: horizon - (y - e.y) * focal / depth, depth };
    };
    c.strokeStyle = '#edb76b'; c.lineWidth = 3;
    let drawing = false; c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const p = project(MAP.site.x + Math.sin(i / 48 * Math.PI * 2) * MAP.siteRadius, 0.03, MAP.site.z + Math.cos(i / 48 * Math.PI * 2) * MAP.siteRadius);
      if (p.depth <= 0.1) { drawing = false; continue; }
      if (!drawing) { c.moveTo(p.x, p.y); drawing = true; } else c.lineTo(p.x, p.y);
    }
    c.stroke();
    const occluders: Occluder[][] = Array.from({ length: Math.ceil(w / 2) }, () => []);
    for (let x = 0; x < w; x += 2) {
      const plane = (x + 1 - w / 2) / focal, dx = sin + plane * cos, dz = cos - plane * sin;
      const hits: { depth: number; top: number; bottom: number; shade: number; wall: Box }[] = [];
      for (const wall of MAP.walls) {
        let enter = -Infinity, exit = Infinity, side = 1;
        for (const axis of ['x', 'z'] as const) {
          const dir = axis === 'x' ? dx : dz;
          const lower = wall.center[axis] - wall.half[axis], upper = wall.center[axis] + wall.half[axis];
          if (Math.abs(dir) < 1e-9) { if (e[axis] < lower || e[axis] > upper) { enter = Infinity; break; } continue; }
          const near = Math.min((lower - e[axis]) / dir, (upper - e[axis]) / dir), far = Math.max((lower - e[axis]) / dir, (upper - e[axis]) / dir);
          if (near > enter) { enter = near; side = axis === 'x' ? 0.84 : 1; } exit = Math.min(exit, far);
        }
        if (enter > exit || exit <= 0.05) continue;
        const depth = Math.max(0.05, enter);
        const top = horizon - (wall.center.y + wall.half.y - e.y) * focal / depth, bottom = horizon - (wall.center.y - wall.half.y - e.y) * focal / depth;
        hits.push({ depth, top, bottom, shade: side / (1 + depth * 0.009), wall });
      }
      hits.sort((a, b) => b.depth - a.depth);
      occluders[x / 2] = hits;
      for (const hit of hits) {
        const height=hit.wall.half.y*2,levels=[0,Math.min(.48,height),Math.min(.53,height),Math.max(.53,height-.06),height].filter((v,i,a)=>v<=height&&(i===0||v>a[i-1]!));
        for(let i=0;i<levels.length-1;i++){
          const low=levels[i]!,high=levels[i+1]!,color=rgb(wallPaint(hit.wall,(low+high)/2));
          c.fillStyle=`rgb(${color.map(v=>Math.round(v*hit.shade)).join(',')})`;
          const top=hit.bottom-high*focal/hit.depth,bottom=hit.bottom-low*focal/hit.depth;c.fillRect(x,top,2,bottom-top);
        }
      }
    }
    const sprites = state.actors.filter(a => a.id !== player.id && this.feedback.actor(a).visible).map(a => ({ actor: a, p: project(a.position.x, 0, a.position.z) })).sort((a, b) => b.p.depth - a.p.depth);
    const rectangle = (x: number, top: number, width: number, height: number, depth: number, color: string) => {
      c.fillStyle = color;
      for (let column = Math.max(0, Math.floor(x / 2)); column < Math.min(occluders.length, Math.ceil((x + width) / 2)); column++) {
        let spans: [number, number][] = [[top, top + height]];
        for (const wall of occluders[column]!) if (wall.depth < depth) {
          const visible: [number, number][] = [];
          for (const [a, b] of spans) {
            if (b <= wall.top || a >= wall.bottom) visible.push([a, b]);
            else { if (a < wall.top) visible.push([a, wall.top]); if (b > wall.bottom) visible.push([wall.bottom, b]); }
          }
          spans = visible;
        }
        for (const [a, b] of spans) c.fillRect(column * 2, a, 2, b - a);
      }
    };
    for (const { actor, p } of sprites) {
      if (p.depth <= 0.1) continue;
      const reaction=this.feedback.actor(actor),vertices=targetVertices(actor,reaction.fall-reaction.flinch).map(v=>project(...v));
      const triangles=targetTriangles.map(face=>({face,corners:face.indices.map(i=>vertices[i]!)})).filter(t=>t.corners.every(v=>v.depth>.1));
      triangles.sort((a,b)=>b.corners.reduce((s,v)=>s+v.depth,0)-a.corners.reduce((s,v)=>s+v.depth,0));
      for(const {face,corners} of triangles){
        const color=css(targetColor(face.color,actor.team===player.team,face.region));
        const min=Math.max(0,Math.floor(Math.min(...corners.map(v=>v.x))/2)),max=Math.min(occluders.length,Math.ceil(Math.max(...corners.map(v=>v.x))/2));
        for(let column=min;column<max;column++){
          const x=column*2+1,ys:number[]=[],depths:number[]=[];
          for(let i=0;i<3;i++){
            const a=corners[i]!,b=corners[(i+1)%3]!;
            if((a.x<=x&&b.x>x)||(b.x<=x&&a.x>x)){const t=(x-a.x)/(b.x-a.x);ys.push(a.y+(b.y-a.y)*t);depths.push(1/((1-t)/a.depth+t/b.depth));}
          }
          if(ys.length>=2)rectangle(column*2,Math.min(...ys),2,Math.max(...ys)-Math.min(...ys),Math.min(...depths),color);
        }
      }
    }
    if (state.bomb.planted || !state.bomb.carrier) {
      const p = project(state.bomb.position.x, 0, state.bomb.position.z);
      if (p.depth > 0.1) rectangle(p.x - 0.22 * focal / p.depth, p.y - 0.36 * focal / p.depth, 0.44 * focal / p.depth, 0.36 * focal / p.depth, p.depth, '#f2b264');
    }
    for(const event of effects){
      const impact=event.shot.impact!;if(event.age>=180||impact.kind==='range')continue;
      const dx=impact.origin.x-impact.end.x,dy=impact.origin.y-impact.end.y,dz=impact.origin.z-impact.end.z,length=Math.hypot(dx,dy,dz)||1;
      const p=project(impact.end.x+dx/length*.018,impact.end.y+dy/length*.018,impact.end.z+dz/length*.018);
      if(p.depth<=.1)continue;const size=Math.max(.5,.09*focal/p.depth)*(1-event.age/180);
      rectangle(p.x-size/2,p.y-size/2,size,size,p.depth,'#e6c49a');
    }
    drawWeapon(c, w, h, state, player);
    c.fillStyle = '#b5d3d0'; c.font = '9px monospace'; c.fillText('CPU / CANVAS2D', 10, h - 8);
  }
  dispose() { this.ground=null; this.context.clearRect(0, 0, this.width, this.height); }
}
