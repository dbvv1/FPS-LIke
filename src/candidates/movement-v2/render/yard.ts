import type { Box } from '../content/map.js';
// Original paint/material recipe. Surface bounds stay exactly on the simulation
// boxes: no decorative opening, extra cover, collision or navigation changes.
export const YARD = Object.freeze({sky:0x94afb7,ground:0x788982,grid:0x657b77,cap:0xc9c9b9,base:0x4c6669,
  wall:0xb3b8a9,boundary:0x9eaead,cover:0x829b96,enemy:0xc76844,friend:0x54c9c0,helmet:0x354d55,visor:0xe1ba75});
export function wallPaint(wall: Box, heightFromBottom: number) {
  const height=wall.half.y*2;
  if(heightFromBottom<.48)return YARD.base;
  if(heightFromBottom<.53||heightFromBottom>height-.06)return YARD.cap;
  if(wall.id.endsWith('-cover'))return YARD.cover;
  return wall.id.includes('divider')||wall.id==='center-dogleg'?YARD.wall:YARD.boundary;
}
export const rgb=(value:number)=>[(value>>16)&255,(value>>8)&255,value&255] as const;
export const css=(value:number)=>'#'+value.toString(16).padStart(6,'0');
export function wallStrip(wall:Box,height=128){
 const pixels=new Uint8Array(height*4);
 for(let y=0;y<height;y++){const color=rgb(wallPaint(wall,(y+.5)/height*wall.half.y*2));pixels.set([...color,255],y*4);}
 return pixels;
}
