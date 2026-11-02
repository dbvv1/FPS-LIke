import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../../src/candidates/offline-training-v1/frame-budget.js';
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
const scheduleHashes = new Map<boolean,string>();
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

const cases: Array<[number,boolean,string,string]> = [17,433,1250].flatMap(d=>[[d,false,'ground-v1',''],[d,true,'ground-v1',''],[d,true,'unknown',''],[d,true,'ground-v1&smoke=ground-v1','']] as Array<[number,boolean,string,string]>);
cases.push([17,true,'ground-v1','init'],[17,false,'ground-v1','asset']);
for(const [frameDelta,ground,smoke,failure] of cases) test(`fixed smoke tape client (ground=${ground}, smoke=${smoke}, frameDelta=${frameDelta}, failure=${failure})`,async()=>{
 let start!:()=>void,next!:()=>void,clock=0,raf!:(now:number)=>void,locks=0;
 const botCommands=new Set<string>();
 let interpolated=0,renderedInterpolated=0,lastVisual:any=null;
 const interpolationSpy: typeof interpolateState = (previous,current,alpha) => {const result=interpolateState(previous,current,alpha); if(result!==current && alpha>0 && alpha<1){interpolated++;lastVisual=result;} return result;};
 const created:Game[]=[],summaries:unknown[]=[],errors:unknown[]=[];
 const window=Object.assign(new EventTarget(),{location:{search:'?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1'+'&smoke='+smoke+(ground?'&feel=ground-v1':'')}}) as any;
 let replacements=0;const replacement=new EventTarget();const canvas=Object.assign(new EventTarget(),{cloneNode:()=>replacement,replaceWith:(next:unknown)=>{assert.equal(next,replacement);replacements++;}}),elements=new Map<string,any>();
 const document={hidden:false,hasFocus:()=>true,querySelector:()=>canvas,createElement:()=>({getContext:()=>failure?{getExtension:()=>null}:null}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id);}};
 class View{backend='canvas2d-cpu';info={};render(state:any,_actor:any,yaw:number,pitch:number){if(state===lastVisual)renderedInterpolated++;assert.equal(yaw,0.7);assert.equal(pitch,0.2);}reset(){}resize(){}dispose(){}}
 class WebGLView extends View { constructor(){super();if(failure==='init')throw new Error('synthetic renderer initialization failure');}override info=failure==='asset'?{materials:{state:'fallback'}}:{};}
 class Hud{difficulty='normal';constructor(a:()=>void,b:()=>void){start=a;next=b;}setBusy(){}menu(){}reset(){}update(){}message(){}}
 class Controls{locked=false;yaw=0.7;pitch=0.2;constructor(_canvas:unknown,private changed:(locked:boolean)=>void){}async lock(){this.locked=true;locks++;this.changed(true);}pause(){this.locked=false;this.changed(false);}reset(){}discardBefore(){}commands(){return [];}dispose(){}}
 class Soundscape{enabled=true;async unlock(){}update(){}reset(){}dispose(){}}
 class MatchPanel{update(_state:unknown,_player:unknown,summary:unknown){summaries.push(summary);}}
 const deps={frameBudget,resumeFrameBudget,TICK_MS,MAX_CATCHUP_STEPS,trainingFeelEnabled,interpolateState:interpolationSpy,squadsRequested,squadSpecs,squadBots,Game:{async create(seed:number,specs:any,rules:any,options:any){const g=await Game.create(seed,specs,rules,options);const step=g.step.bind(g);g.step=(commands=[])=>{for(const c of commands)if(c.actorId!=='player')botCommands.add(c.actorId);step(commands);};created.push(g);return g;}},Bot,initNavigation,Navigation,Controls,MouseSensitivity:class{dirty=false;value=1;},View:WebGLView,CanvasView:View,Soundscape,RESULT_HOLD_MS:700,Hud,TrainingMatch,completeMatchRequested,MatchPanel,document,window,performance:{now:()=>clock},requestAnimationFrame:(fn:(now:number)=>void)=>{raf=fn;return 1;},cancelAnimationFrame:()=>{},console:{error:(e:unknown)=>errors.push(e)}};
 try{
 await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 if(smoke !== 'ground-v1'){assert.equal(window.fpsClient.state().smoke,undefined);clock+=17;raf(clock);assert.equal(created[0]!.state.tick,0);assert.equal(locks,0);
 // Invalid/duplicate smoke stays ordinary play: sustained slow foreground frames advance, large jumps pause.
 start();await new Promise(r=>setImmediate(r));
 // The resume event clock can be newer than the first delivered rAF stamp.
 const resumeTick=created[0]!.state.tick;raf(clock-5);assert.equal(window.fpsClient.state().running,true);assert.equal(created[0]!.state.tick,resumeTick);
 clock+=17;raf(clock);
 assert.equal(window.fpsClient.state().running,true);const before=created[0]!.state.tick;assert(before>0);
 for(let i=0;i<4;i++){const prior: number=created[0]!.state.tick;clock+=483;raf(clock);assert.equal(window.fpsClient.state().running,true);const advanced: number=created[0]!.state.tick-prior;assert.ok(advanced>=14 && advanced<=15);}
 const slowTick=created[0]!.state.tick;assert.ok(slowTick>before);
 clock+=2000;raf(clock);assert.equal(window.fpsClient.state().running,false);assert.equal(created[0]!.state.tick,slowTick);
 start();await new Promise(r=>setImmediate(r));raf(clock);assert.equal(created[0]!.state.tick,slowTick);clock+=17;raf(clock);assert.equal(window.fpsClient.state().running,true);assert.equal(created[0]!.state.tick,slowTick+1);
 document.hidden=true;const visibleTick=created[0]!.state.tick;clock+=17;raf(clock);assert.equal(window.fpsClient.state().running,false);assert.equal(created[0]!.state.tick,visibleTick);assert.deepEqual(errors,[]);return;}
 for(let frames=0;frames<500 && !window.fpsClient.state().smoke.complete;frames++){const before=created.at(-1)!.state.tick;clock+=frameDelta;raf(clock);assert(created.at(-1)!.state.tick<=before+1);await new Promise(r=>setImmediate(r));}
 const result=window.fpsClient.state().smoke;
 assert.equal(result.complete,true);
 const domReceipt=JSON.parse(elements.get('debug-state').textContent),apiReceipt=window.fpsClient.state();
 for(const key of ['ready','smoke','acceptance','renderFallback','backend','running'])assert.deepEqual(domReceipt[key],apiReceipt[key],`DOM receipt ${key} matches read-only API`);
 assert.equal(domReceipt.ready,true);

 assert.deepEqual(window.fpsClient.state().acceptance,{requiredTicksPerRun:144,requiredRuns:2,movement:ground?'ground-v1':'baseline'});
 if(failure){assert.equal(replacements,failure==='init'?1:0);assert.equal(elements.get('render-mode').hidden,false);assert.match(elements.get('render-mode').textContent,/默认/);assert.ok(window.fpsClient.state().renderFallback);}assert.equal(result.pass,1);assert.equal(result.steps,144);
 assert.equal(created.length,2);assert.equal(locks,0);assert.equal(botCommands.size,9);
 assert.deepEqual(result.runs.map((r:any)=>r.ticks),[144,144]);assert.equal(result.runs[0].hash,result.runs[1].hash);
 if(scheduleHashes.has(ground))assert.equal(result.runs[0].hash,scheduleHashes.get(ground));else scheduleHashes.set(ground,result.runs[0].hash);
 assert.equal(created[1]!.state.actors.find(a=>a.id==='player')!.input.z,0);
 assert.equal(window.fpsClient.state().running,false);assert.deepEqual(errors,[]);
 if(ground){assert.ok(interpolated>0);assert.ok(renderedInterpolated>0);}else assert.equal(interpolated,0);
 const tick=created[1]!.state.tick;clock+=17;raf(clock);assert.equal(created[1]!.state.tick,tick);
 }finally{for(const game of created)game.dispose();}
});
