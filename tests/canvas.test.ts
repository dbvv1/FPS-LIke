import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { CanvasView } from '../src/render/canvas.js';
test('CPU source silhouettes preserve the same facing view in four cardinal directions',async()=>{
 const rects:{color:string;xy:number[]}[]=[],context={fillStyle:'',createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){},createLinearGradient(){return {addColorStop(){}};},fillRect(x:number,y:number,w:number,h:number){rects.push({color:String(this.fillStyle),xy:[x,y,w,h]});},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},save(){},restore(){},fillText(){},clearRect(){}};
 const canvas={clientWidth:640,clientHeight:360,width:0,height:0,getContext:()=>context};
 const game=await Game.create(1),view=new CanvasView(canvas as unknown as HTMLCanvasElement);
 try{const s=game.state,player=s.actors[0]!,enemy=s.actors[1]!,widths:number[]=[];
 player.position={x:0,y:0,z:-14};
 for(const yaw of[0,Math.PI/2,Math.PI,Math.PI*1.5]){
  enemy.position={x:3*Math.sin(yaw),y:0,z:-14+3*Math.cos(yaw)};enemy.yaw=yaw+Math.PI;rects.length=0;
  const before=JSON.stringify(s);view.render(s,player,yaw,0,1000,0);
  const torso=rects.filter(r=>r.color==='#c46d4e');assert.ok(torso.length>0,`live target visible at yaw ${yaw}`);
  widths.push(torso.length);assert.equal(JSON.stringify(s),before);
 }
 assert.deepEqual(widths,[widths[0],widths[0],widths[0],widths[0]],'the same source pose projects identically after rotating camera and actor together');
 }finally{view.dispose();game.dispose();}
});
test('CPU presentation uses the shared snapshot, clips behind-wall actors and preserves it', async () => {
  const rects: { color: string; xy: number[] }[] = [];
  const context = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){},createLinearGradient: (...values: number[]) => { assert.ok(values.every(Number.isFinite)); return { addColorStop() {} }; },
    fillRect(x: number, y: number, w: number, h: number) { assert.ok([x, y, w, h].every(Number.isFinite)); rects.push({ color: String(this.fillStyle), xy: [x, y, w, h] }); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, fillText() {}, clearRect() {},
  };
  const canvas = { clientWidth: 640, clientHeight: 360, width: 0, height: 0, getContext: () => context };
  const game = await Game.create(1), view = new CanvasView(canvas as unknown as HTMLCanvasElement);
  try {
    const state = game.state, player = state.actors.find(a => a.side === 'attack')!, enemy = state.actors.find(a => a.side === 'defend')!;
    const original = JSON.stringify(state);
    view.render(state, player, 0, 0, 0, 0);
    assert.equal(rects.filter(r => r.color === '#c46d4e').length, 0, 'center cover occludes the enemy');
    assert.equal(JSON.stringify(state), original);
    enemy.position.z = -10; rects.length = 0;
    view.render(state, player, 0, 0, 0, 0);
    assert.ok(rects.some(r => r.color === '#c46d4e'), 'same actor is visible in front of the cover');
    rects.length = 0; view.render(state, player, Math.PI, 0, 0, 0);
    assert.equal(rects.filter(r => r.color === '#c46d4e').length, 0, 'behind-camera actor is not drawn');
    for (const pitch of [-1.45, 1.45]) view.render(state, player, 0, pitch, 0, 0);
    assert.equal(view.backend, 'canvas2d-cpu');
  } finally { view.dispose(); game.dispose(); }
});

test('actual world impact is depth clipped behind cover, and appears only from an unobstructed view',async()=>{
 const rects:string[]=[],context={fillStyle:'',createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){},createLinearGradient(){return {addColorStop(){}};},fillRect(){rects.push(String(this.fillStyle));},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},save(){},restore(){},fillText(){},clearRect(){}};
 const canvas={clientWidth:640,clientHeight:360,width:0,height:0,getContext:()=>context};
 const game=await Game.create(2,[{id:'a',team:'amber',position:{x:-6,y:0,z:0}},{id:'b',team:'blue',position:{x:-2,y:0,z:0}}]),view=new CanvasView(canvas as unknown as HTMLCanvasElement);
 try{game.step([{actorId:'b',type:'shoot',yaw:Math.PI/2,pitch:0}]);const s=game.state,original=JSON.stringify(s);assert.equal(s.shots[0]!.impact!.kind,'world');
 view.render(s,s.actors[0]!,Math.PI/2,0,1000,0);assert.ok(!rects.includes('#e6c49a'),'wall blocks the actual impact from an observer');
 rects.length=0;view.render(s,s.actors[1]!,Math.PI/2,0,1000,0);assert.ok(rects.includes('#e6c49a'),'same actual world endpoint is visible from shooting side');assert.equal(JSON.stringify(s),original);
 }finally{view.dispose();game.dispose();}
});
