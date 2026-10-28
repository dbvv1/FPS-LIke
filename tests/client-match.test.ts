import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Game } from '../src/sim/game.js';
import { TrainingMatch, completeMatchRequested } from '../src/session/match.js';

const source=stripTypeScriptTypes(readFileSync(new URL('../src/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

test('actual client finishes six rounds, does not enter round seven, and next starts a clean match',async()=>{
 let start!:()=>void,next!:()=>void,clock=0,raf!:(now:number)=>void,locks=0;
 const created:Game[]=[],summaries:unknown[]=[],errors:unknown[]=[];
 const window=Object.assign(new EventTarget(),{location:{search:'?match=complete-v1'}}) as any;
 const canvas=new EventTarget(),elements=new Map<string,any>();
 const document={querySelector:()=>canvas,createElement:()=>({getContext:()=>null}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id);}};
 class View{backend='canvas2d-cpu';info={};render(){}reset(){}resize(){}dispose(){}}
 class Hud{difficulty='normal';constructor(a:()=>void,b:()=>void){start=a;next=b;}setBusy(){}menu(){}reset(){}update(){}message(){}}
 class Controls{locked=false;yaw=0;pitch=0;constructor(_canvas:unknown,private changed:(locked:boolean)=>void){}async lock(){this.locked=true;locks++;this.changed(true);}pause(){this.locked=false;this.changed(false);}reset(){}commands(){return [];}dispose(){}}
 class Soundscape{enabled=true;async unlock(){}update(){}reset(){}dispose(){}}
 class MatchPanel{update(_state:unknown,_player:unknown,summary:unknown){summaries.push(summary);}}
 const deps={Game:{async create(){const g=await Game.create(1,[{id:'player',team:'amber'},{id:'bot',team:'blue'}],{roundTicks:1});created.push(g);return g;}},Bot:class{commands(){return [];}},initNavigation:async()=>{},Navigation:class{dispose(){}},Controls,MouseSensitivity:class{dirty=false;value=1;},View,CanvasView:View,Soundscape,RESULT_HOLD_MS:700,Hud,TrainingMatch,completeMatchRequested,MatchPanel,document,window,performance:{now:()=>clock},requestAnimationFrame:(fn:(now:number)=>void)=>{raf=fn;return 1;},cancelAnimationFrame:()=>{},console:{error:(e:unknown)=>errors.push(e)}};
 try{
 await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 start();await new Promise(r=>setImmediate(r));
 for(let round=1;round<=6;round++){
   clock+=20;raf(clock);assert.equal(created[0]!.state.round,round);assert.equal(created[0]!.state.phase,'over');
   const current=(window as any).fpsClient.state().match;assert.equal(current.rounds.length,round);assert.equal(current.complete,round===6);
   if(round<6){next();await new Promise(r=>setImmediate(r));}
 }
 const completed=(window as any).fpsClient.state().match;
 assert.deepEqual([completed.wins,completed.losses],[3,3]);
 const lockCount=locks;next();await new Promise(r=>setTimeout(r,10));
 assert.equal(created.length,2);assert.equal(locks,lockCount,'new match returns to deployment instead of silently relocking');
 assert.equal(created[1]!.state.round,1);assert.deepEqual(created[1]!.state.score,{amber:0,blue:0});
 assert.equal((window as any).fpsClient.state().match.rounds.length,0);assert.deepEqual(errors,[]);
 }finally{for(const game of created)game.dispose();}
});
