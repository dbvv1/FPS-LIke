import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../src/candidates/offline-training-v1/frame-budget.js';
import { contentSetDiagnostics } from '../src/render/content-set-assets.js';
import { Game } from '../src/sim/game.js';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
test('actual legacy client survives visible 333 ms frames and inverted resume stamp, retaining lifecycle pauses and restart',async()=>{
 let start!:()=>void,restart!:()=>void,clock=0,raf!:(now:number)=>void,controls!:Controls,focused=true;
 const created:Game[]=[],errors:unknown[]=[];
 const window=Object.assign(new EventTarget(),{location:{search:'?gameplay=legacy-v1'}}) as any;
 const canvas=new EventTarget(),elements=new Map<string,any>();
 const document={hidden:false,hasFocus:()=>focused,querySelector:()=>canvas,createElement:()=>({getContext:()=>null}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id);}};
 class View{backend='canvas2d-cpu';info={};render(){}reset(){}resize(){}dispose(){}}
 class Hud{difficulty='normal';constructor(a:()=>void,_b:()=>void,c:()=>void){start=a;restart=c;}setBusy(){}menu(){}reset(){}update(){}message(){}}
 class Controls{locked=false;yaw=0;pitch=0;discarded:number[]=[];constructor(_canvas:unknown,private changed:(locked:boolean)=>void){controls=this;}async lock(){this.locked=true;this.changed(true);}pause(){this.locked=false;this.changed(false);}reset(){}discardBefore(t:number){this.discarded.push(t);}commands(){return [{actorId:'player',type:'move' as const,x:0,z:-1}];}dispose(){}}
 class Soundscape{enabled=true;async unlock(){}update(){}reset(){}dispose(){}}
 const deps={frameBudget,resumeFrameBudget,TICK_MS,MAX_CATCHUP_STEPS,contentSetDiagnostics,Game:{async create(){const g=await Game.create(1,[{id:'player',team:'amber'},{id:'bot',team:'blue'}]);created.push(g);return g;}},Bot:class{commands(){return [];}},initNavigation:async()=>{},Navigation:class{dispose(){}},Controls,MouseSensitivity:class{dirty=false;value=1;},View,CanvasView:View,Soundscape,RESULT_HOLD_MS:700,Hud,document,window,performance:{now:()=>clock},requestAnimationFrame:(fn:(now:number)=>void)=>{raf=fn;return 1;},cancelAnimationFrame:()=>{},console:{error:(e:unknown)=>errors.push(e)}};
 try {
  await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
  clock=100;start();await new Promise(r=>setImmediate(r));raf(95);assert.equal(created[0]!.state.tick,0);assert.equal(window.fpsClient.state().running,true);
  const initial=created[0]!.state.actors.find(a=>a.id==='player')!.position;
  let stamp=95;
  for(let i=0;i<4;i++){const before: number=created[0]!.state.tick;stamp+=333.2;clock=stamp+20;raf(stamp);const steps: number=created[0]!.state.tick-before;assert.ok(steps>=14&&steps<=15);assert.equal(window.fpsClient.state().running,true);}
  assert.notDeepEqual(created[0]!.state.actors.find(a=>a.id==='player')!.position,initial);assert.equal(controls.discarded.length,4);
  const tick=created[0]!.state.tick;controls.pause();stamp+=333.2;clock=stamp+20;raf(stamp);assert.equal(created[0]!.state.tick,tick);
  start();await new Promise(r=>setImmediate(r));raf(stamp+10);assert.equal(window.fpsClient.state().running,true);assert.equal(created[0]!.state.tick,tick);
  stamp+=343.2;clock=stamp+20;raf(stamp);assert.ok(created[0]!.state.tick>tick);
  for(const reason of ['hidden','focus','lock','long-gap'] as const){
   const before: number=created[0]!.state.tick;
   if(reason==='hidden')document.hidden=true;else if(reason==='focus')focused=false;else if(reason==='lock')controls.locked=false;
   stamp+=reason==='long-gap'?2000:17;clock=stamp+20;raf(stamp);assert.equal(window.fpsClient.state().running,false);assert.equal(created[0]!.state.tick,before);
   document.hidden=false;focused=true;start();await new Promise(r=>setImmediate(r));raf(stamp+10);stamp+=343.2;clock=stamp+20;raf(stamp);assert.equal(window.fpsClient.state().running,true);assert.ok(created[0]!.state.tick>before);
  }
  restart();await new Promise(r=>setTimeout(r,10));assert.equal(created.length,2);assert.equal(created[1]!.state.tick,0);assert.equal(window.fpsClient.state().running,false);
  start();await new Promise(r=>setImmediate(r));raf(stamp+10);stamp+=343.2;clock=stamp+20;raf(stamp);assert.ok(created[1]!.state.tick>0);assert.deepEqual(errors,[]);
 } finally {for(const g of created)g.dispose();}
});
