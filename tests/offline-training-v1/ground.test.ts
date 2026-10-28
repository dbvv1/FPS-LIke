import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {drawGround,groundLevels,groundTileMetres,groundLevel,groundOffset,groundUV} from '../../src/candidates/offline-training-v1/render/ground.js';

test('the real licensed concrete source produces one shared, opaque and bounded mip chain',()=>{
 const bytes=readFileSync(new URL('../../assets/materials/courtyard-concrete/source/concrete_floor_01_diff_1k.jpg',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'db7c800f1464359b5f359fc743e82ac51b34e014fdfd53844f4af34bb1949229');
 assert.equal(groundTileMetres,2);assert.deepEqual(groundLevels.map(m=>m.size),[256,128,64,32,16,8,4,2,1]);
 for(const mip of groundLevels){assert.equal(mip.rgba.length,mip.size*mip.size*4);for(let i=3;i<mip.rgba.length;i+=4)assert.equal(mip.rgba[i],255);}
 assert.deepEqual([...groundLevels.at(-1)!.rgba],[120,137,130,255]);
});
test('both floor consumers wrap the same real-world UV including negative coordinates and use coarser far footprints',()=>{
 for(const [x,z] of [[.3,.7],[-.3,-.7],[2.3,-2.7]]){
  const [u,v]=groundUV(x!,z!);assert.equal(u,x!/2);assert.equal(v,z!/2);
  assert.equal(groundOffset(x!,z!,256),groundOffset(x!+2,z!-2,256));
  const expected=((Math.floor(v*256)&255)*256+(Math.floor(u*256)&255))*4;assert.equal(groundOffset(x!,z!,256),expected);
 }
 assert.equal(groundLevel(.001).size,256);assert.equal(groundLevel(100).size,1);
});
test('CPU floor writes finite colour below its horizon before existing occlusion, including odd view sizes and vertical aim',()=>{
 const w=65,h=37,image={width:w,height:h,data:new Uint8ClampedArray(w*h*4)} as ImageData;
 const calls:number[][]=[],context={putImageData(_image:ImageData,...args:number[]){calls.push(args);}} as unknown as CanvasRenderingContext2D;
 for(const horizon of [-100,18.2,100])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  image.data.fill(7);calls.length=0;drawGround(context,image,{x:-.2,y:1.62,z:4},yaw,horizon,40);
  const top=Math.max(0,Math.min(h,Math.ceil(horizon)));
  assert.equal(calls.length,top<h?1:0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.equal(image.data[(y*w+x)*4+3],y<top?7:255);
 }
});
