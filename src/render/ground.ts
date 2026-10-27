import data from '../../assets/materials/courtyard-concrete/ground.json';
import type { Vec3 } from '../sim/types.js';

export const groundTileMetres = data.tileMetres;
export const groundLevels = data.levels.map(level => ({size:level.size,rgba:Uint8Array.from(atob(level.rgba),c=>c.charCodeAt(0))}));
export const groundUV = (x:number,z:number) => [x/groundTileMetres,z/groundTileMetres] as const;
export function groundLevel(footprintMetres:number) {
  return groundLevels[Math.min(groundLevels.length-1,Math.max(0,Math.floor(Math.log2(Math.max(1,footprintMetres*groundLevels[0]!.size/groundTileMetres)))))]!;
}
export function groundOffset(x:number,z:number,size:number) {
  const u=Math.floor(x/groundTileMetres*size)&(size-1),v=Math.floor(z/groundTileMetres*size)&(size-1);
  return (v*size+u)*4;
}
// One floor plane, drawn before the existing depth-clipped walls and actors.
// Colour-only fallback: the same metres/UV and source mips, not a second world.
export function drawGround(context:CanvasRenderingContext2D,image:ImageData,eye:Vec3,yaw:number,horizon:number,focal:number) {
  const {width:w,height:h,data:pixels}=image,top=Math.max(0,Math.min(h,Math.ceil(horizon))),sin=Math.sin(yaw),cos=Math.cos(yaw);
  for(let y=top;y<h;y+=2){
    const sy=Math.min(y+1,h-.5),depth=eye.y*focal/(sy-horizon);
    const footprint=Math.max(depth/focal,depth*depth/(Math.max(.01,eye.y)*focal))*2;
    const mip=groundLevel(footprint),gradient=(sy-horizon)/Math.max(1,h-horizon);
    const red=133-34*gradient-120,green=148-27*gradient-137,blue=139-22*gradient-130;
    for(let x=0;x<w;x+=2){
      const plane=(x+1-w/2)/focal,wx=eye.x+(sin+plane*cos)*depth,wz=eye.z+(cos-plane*sin)*depth;
      const source=groundOffset(wx,wz,mip.size),r=mip.rgba[source]!+red,g=mip.rgba[source+1]!+green,b=mip.rgba[source+2]!+blue;
      for(let dy=0;dy<2&&y+dy<h;dy++)for(let dx=0;dx<2&&x+dx<w;dx++){
        const i=((y+dy)*w+x+dx)*4;pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;pixels[i+3]=255;
      }
    }
  }
  if(top<h)context.putImageData(image,0,0,0,top,w,h-top);
}
