import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP} from '../../src/candidates/offline-training-v1/content/map.js';
import {wallPaint,wallStrip,rgb,YARD} from '../../src/candidates/offline-training-v1/render/yard.js';
test('Three paint strips and CPU surface colours share world-height bands without changing collision content',()=>{
 const before=JSON.stringify(MAP);
 for(const wall of MAP.walls){
  const data=wallStrip(wall),height=wall.half.y*2;
  assert.equal(data.length,128*4);
  for(let row=0;row<128;row++)assert.deepEqual([...data.slice(row*4,row*4+4)],[...rgb(wallPaint(wall,(row+.5)/128*height)),255]);
  assert.equal(wallPaint(wall,.2),YARD.base);assert.equal(wallPaint(wall,height-.01),YARD.cap);
 }
 assert.equal(JSON.stringify(MAP),before);
});
