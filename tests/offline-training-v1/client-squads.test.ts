import { frameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../../src/candidates/offline-training-v1/frame-budget.js';
import { trainingFeelEnabled } from '../../src/candidate-route.js';
import { interpolateState } from '../../src/candidates/offline-training-v1/render/interpolation.js';
import { squadsRequested, squadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Bot } from '../../src/candidates/offline-training-v1/sim/bot.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { TrainingMatch, completeMatchRequested } from '../../src/candidates/offline-training-v1/session/match.js';

const source=stripTypeScriptTypes(readFileSync(new URL('../../src/candidates/offline-training-v1/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

for(const ground of [false,true]) test(`actual offline squad client drives nine real bots through six rounds and clean restart (ground=${ground})`,async()=>{
 let start!:()=>void,next!:()=>void,clock=0,raf!:(now:number)=>void,locks=0;
 const botCommands=new Set<string>();
 let interpolated=0,renderedInterpolated=0,lastVisual:any=null;
 const interpolationSpy: typeof interpolateState = (previous,current,alpha) => {const result=interpolateState(previous,current,alpha); if(result!==current && alpha>0 && alpha<1){interpolated++;lastVisual=result;} return result;};
 const created:Game[]=[],summaries:unknown[]=[],errors:unknown[]=[];
 const window=Object.assign(new EventTarget(),{location:{search:'?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1'+(ground?'&feel=ground-v1':'')}}) as any;
 const canvas=new EventTarget(),elements=new Map<string,any>();
 const document={hidden:false,hasFocus:()=>true,querySelector:()=>canvas,createElement:()=>({getContext:()=>null}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id);}};
 class View{backend='canvas2d-cpu';info={};render(state:any,_actor:any,yaw:number,pitch:number){if(state===lastVisual)renderedInterpolated++;assert.equal(yaw,0.7);assert.equal(pitch,0.2);}reset(){}resize(){}dispose(){}}
 class Hud{difficulty='normal';constructor(a:()=>void,b:()=>void){start=a;next=b;}setBusy(){}menu(){}reset(){}update(){}message(){}}
 class Controls{locked=false;yaw=0.7;pitch=0.2;constructor(_canvas:unknown,private changed:(locked:boolean)=>void){}async lock(){this.locked=true;locks++;this.changed(true);}pause(){this.locked=false;this.changed(false);}reset(){}discardBefore(){}commands(){return [];}dispose(){}}
 class Soundscape{enabled=true;async unlock(){}update(){}reset(){}dispose(){}}
 class MatchPanel{update(_state:unknown,_player:unknown,summary:unknown){summaries.push(summary);}}
 const deps={frameBudget,TICK_MS,MAX_CATCHUP_STEPS,trainingFeelEnabled,interpolateState:interpolationSpy,squadsRequested,squadSpecs,squadBots,Game:{async create(seed:number,specs:any,rules:any,options:any){const g=await Game.create(seed,specs,rules,options);const step=g.step.bind(g);g.step=(commands=[])=>{for(const c of commands)if(c.actorId!=='player')botCommands.add(c.actorId);step(commands);};created.push(g);return g;}},Bot,initNavigation,Navigation,Controls,MouseSensitivity:class{dirty=false;value=1;},View,CanvasView:View,Soundscape,RESULT_HOLD_MS:700,Hud,TrainingMatch,completeMatchRequested,MatchPanel,document,window,performance:{now:()=>clock},requestAnimationFrame:(fn:(now:number)=>void)=>{raf=fn;return 1;},cancelAnimationFrame:()=>{},console:{error:(e:unknown)=>errors.push(e)}};
 try{
 await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 start();await new Promise(r=>setImmediate(r));
 for(let round=1;round<=6;round++){
   let frames=0;while(created[0]!.state.phase==='live'&&frames++<6000){clock+=17;raf(clock);}
   assert.equal(created[0]!.state.round,round);assert.equal(created[0]!.state.phase,'over');
   assert.equal(created[0]!.state.actors.length,10);assert.equal(created[0]!.state.actors.find(a=>a.id==='player')!.side,round<=3?'attack':'defend');
   const current=(window as any).fpsClient.state().match;assert.equal(current.rounds.length,round);assert.equal(current.complete,round===6);
   if(round<6){next();await new Promise(r=>setImmediate(r));}
 }
 const completed=(window as any).fpsClient.state().match;
 if(ground){assert.ok(interpolated>0);assert.ok(renderedInterpolated>0);}else assert.equal(interpolated,0);
 assert.equal(completed.wins+completed.losses,6);assert.equal(botCommands.size,9);
 assert.equal((window as any).fpsClient.state().squads.botIds.length,9);
 const lockCount=locks;next();await new Promise(r=>setTimeout(r,10));
 assert.equal(created.length,2);assert.equal(locks,lockCount,'new match returns to deployment instead of silently relocking');
 assert.equal(created[1]!.state.round,1);assert.equal(created[1]!.state.actors.length,10);assert.deepEqual(created[1]!.options,{formation:'squads-v1',...(ground?{movement:'ground-v1'}:{})});assert.deepEqual(created[1]!.state.score,{amber:0,blue:0});
 assert.equal((window as any).fpsClient.state().match.rounds.length,0);assert.deepEqual(errors,[]);
 }finally{for(const game of created)game.dispose();}
});
