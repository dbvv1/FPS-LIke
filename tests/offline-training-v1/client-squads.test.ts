import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../../src/candidates/offline-training-v1/frame-budget.js';
import { trainingFeelEnabled } from '../../src/candidate-route.js';
import { interpolateState } from '../../src/candidates/offline-training-v1/render/interpolation.js';
import { squadsRequested, squadSpecs, squadBots } from '../../src/candidates/offline-training-v1/session/squads.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Controls } from '../../src/candidates/offline-training-v1/input/controls.js';
import { Bot } from '../../src/candidates/offline-training-v1/sim/bot.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { TrainingMatch, completeMatchRequested } from '../../src/candidates/offline-training-v1/session/match.js';

const source=stripTypeScriptTypes(readFileSync(new URL('../../src/candidates/offline-training-v1/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

for(const ground of [false,true]) test(`actual offline squad client drives real held input, pause/resume, nine bots, six rounds and clean restart (ground=${ground})`,async t=>{
 let start!:()=>void,next!:()=>void,clock=0,raf!:(now:number)=>void,locks=0;
 const botCommands=new Set<string>();
 let interpolated=0,renderedInterpolated=0,lastVisual:any=null;
 const interpolationSpy: typeof interpolateState = (previous,current,alpha) => {const result=interpolateState(previous,current,alpha); if(result!==current && alpha>0 && alpha<1){interpolated++;lastVisual=result;} return result;};
 const created:Game[]=[],summaries:unknown[]=[],errors:unknown[]=[];
 const window=Object.assign(new EventTarget(),{performance,location:{search:'?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1'+(ground?'&feel=ground-v1':'')}}) as any;
 const event=(type:string,properties:Record<string,unknown>={})=>Object.assign(new Event(type,{cancelable:true}),properties);
 const canvas=Object.assign(new EventTarget(),{async requestPointerLock(){locks++;document.pointerLockElement=canvas;document.dispatchEvent(event('pointerlockchange'));}}),elements=new Map<string,any>();
 const document=Object.assign(new EventTarget(),{pointerLockElement:null as unknown,hidden:false,hasFocus:()=>true,exitPointerLock(){document.pointerLockElement=null;document.dispatchEvent(event('pointerlockchange'));},querySelector:()=>canvas,createElement:()=>({getContext:()=>null}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id);}});
 // Production Controls reads browser globals; only the DOM/clock boundary is synthetic.
 const originals=new Map(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'window',{value:window,configurable:true});Object.defineProperty(globalThis,'document',{value:document,configurable:true});
 t.mock.method(performance,'now',()=>clock);
 class View{backend='canvas2d-cpu';info={};render(state:any,_actor:any,yaw:number,pitch:number){if(state===lastVisual)renderedInterpolated++;assert.ok(Number.isFinite(yaw));assert.ok(Number.isFinite(pitch));}reset(){}resize(){}dispose(){}}
 class Hud{difficulty='normal';constructor(a:()=>void,b:()=>void){start=a;next=b;}setBusy(){}menu(){}reset(){}update(){}message(){}}
 class Soundscape{enabled=true;async unlock(){}update(){}reset(){}dispose(){}}
 class MatchPanel{update(_state:unknown,_player:unknown,summary:unknown){summaries.push(summary);}}
 const deps={frameBudget,resumeFrameBudget,TICK_MS,MAX_CATCHUP_STEPS,trainingFeelEnabled,interpolateState:interpolationSpy,squadsRequested,squadSpecs,squadBots,Game:{async create(seed:number,specs:any,rules:any,options:any){const g=await Game.create(seed,specs,rules,options);const step=g.step.bind(g);g.step=(commands=[])=>{for(const c of commands)if(c.actorId!=='player')botCommands.add(c.actorId);step(commands);};created.push(g);return g;}},Bot,initNavigation,Navigation,Controls,MouseSensitivity:class{dirty=false;value=1;},View,CanvasView:View,Soundscape,RESULT_HOLD_MS:700,Hud,TrainingMatch,completeMatchRequested,MatchPanel,document,window,performance:{now:()=>clock},requestAnimationFrame:(fn:(now:number)=>void)=>{raf=fn;return 1;},cancelAnimationFrame:()=>{},console:{error:(e:unknown)=>errors.push(e)}};
 try{
 await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 assert.deepEqual(errors,[]);
 start();await new Promise(r=>setImmediate(r));
 for(let round=1;round<=6;round++){
   // Feed real input through the assembled client, then pause while actions are held.
   // Aim skyward so this acceptance tape does not deliberately hit a teammate.
   document.dispatchEvent(event('mousemove',{movementX:20,movementY:-1000}));
   document.dispatchEvent(event('keydown',{code:'KeyW',repeat:false}));
   canvas.dispatchEvent(event('mousedown',{button:0}));
   // Shooting cancels interaction, so press E after the shot in the same input batch.
   document.dispatchEvent(event('keydown',{code:'KeyE',repeat:false}));
   clock+=17;raf(clock);clock+=17;raf(clock);
   const active=created[0]!.state,actor=active.actors.find(a=>a.id==='player')!;
   assert.ok(Math.hypot(actor.input.x,actor.input.z)>0,'real keyboard movement reaches simulation input');
   assert.equal(actor.input.interact,true,'real interaction key reaches simulation input before pause');
   assert.ok(active.shots.some(s=>s.actorId==='player'),'real mouse press reaches firing simulation');
   // Add unconsumed actions just before interruption. They must not leak into resume.
   canvas.dispatchEvent(event('mousedown',{button:0}));
   document.dispatchEvent(event('keydown',{code:'KeyR',repeat:false}));
   const pauseHash=created[0]!.stateHash,shotsBeforePause=active.shots.filter(s=>s.actorId==='player').length;
   document.dispatchEvent(event('keydown',{code:'Escape',repeat:false}));
   assert.equal(window.fpsClient.state().running,false);assert.equal(document.pointerLockElement,null);
   clock+=2000;raf(clock);assert.equal(created[0]!.stateHash,pauseHash,'pause does not advance authoritative state');
   start();await new Promise(r=>setImmediate(r));clock+=17;raf(clock);clock+=17;raf(clock);
   const resumed=created[0]!.state,local=resumed.actors.find(a=>a.id==='player')!;
   assert.equal(local.reload,null,'pause discards unconsumed reload');
   assert.deepEqual([local.input.x,local.input.z,local.input.interact],[0,0,false],'resume clears held movement and interaction');
   assert.equal(resumed.shots.filter(s=>s.actorId==='player').length,shotsBeforePause,'resume does not resurrect held fire');
   let frames=0;while(created[0]!.state.phase==='live'&&frames++<6000){clock+=17;raf(clock);}
   assert.equal(created[0]!.state.round,round);assert.equal(created[0]!.state.phase,'over');
   assert.equal(created[0]!.state.actors.length,10);assert.equal(created[0]!.state.actors.find(a=>a.id==='player')!.side,round<=3?'attack':'defend');
   const current=(window as any).fpsClient.state().match;assert.equal(current.rounds.length,round);assert.equal(current.complete,round===6);
   if(round<6){next();await new Promise(r=>setImmediate(r));}
 }
 const completed=(window as any).fpsClient.state().match;
 if(ground){assert.ok(interpolated>0);assert.ok(renderedInterpolated>0);}else assert.equal(interpolated,0);
 assert.equal(completed.shots,6,'one actual local shot per round reaches the complete-match recap');
 assert.equal(completed.wins+completed.losses,6);assert.equal(botCommands.size,9);
 assert.equal((window as any).fpsClient.state().squads.botIds.length,9);
 const lockCount=locks;next();await new Promise(r=>setTimeout(r,10));
 assert.equal(created.length,2);assert.equal(locks,lockCount,'new match returns to deployment instead of silently relocking');
 assert.equal(created[1]!.state.round,1);assert.equal(created[1]!.state.actors.length,10);assert.deepEqual(created[1]!.options,{formation:'squads-v1',...(ground?{movement:'ground-v1'}:{})});assert.deepEqual(created[1]!.state.score,{amber:0,blue:0});
 assert.equal((window as any).fpsClient.state().match.rounds.length,0);assert.deepEqual(errors,[]);
 start();await new Promise(r=>setImmediate(r));clock+=17;raf(clock);clock+=17;raf(clock);
 const fresh=created[1]!.state,freshPlayer=fresh.actors.find(a=>a.id==='player')!;
 assert.ok(fresh.tick>0);assert.deepEqual([freshPlayer.input.x,freshPlayer.input.z,freshPlayer.input.interact],[0,0,false]);
 assert.equal(fresh.shots.filter(s=>s.actorId==='player').length,0,'new match has no held trigger from the previous match');
 const currentPlayer=()=>created[1]!.state.actors.find(a=>a.id==='player')!;
 // Reproduce returned software frames (p95 533ms): a short key press lands
 // before the retained 250ms catch-up window, but must still reach Game once.
 clock+=10;document.dispatchEvent(event('keydown',{code:'Digit2',repeat:false}));
 document.dispatchEvent(event('keyup',{code:'Digit2'}));
 clock+=533;raf(clock);
 assert.equal(currentPlayer().weapon,'pistol','slow foreground frame must not eat weapon choice');
 document.dispatchEvent(event('mousemove',{movementX:0,movementY:-1000}));
 clock+=10;canvas.dispatchEvent(event('mousedown',{button:0}));document.dispatchEvent(event('mouseup',{button:0}));
 clock+=533;raf(clock);
 assert.equal(currentPlayer().weapons.pistol.ammo,9,'one short click survives without a burst');
 clock+=10;document.dispatchEvent(event('keydown',{code:'KeyR',repeat:false}));document.dispatchEvent(event('keyup',{code:'KeyR'}));
 clock+=533;raf(clock);
 assert.notEqual(currentPlayer().reload,null,'reload intent survives slow foreground frame');
 clock+=10;document.dispatchEvent(event('keydown',{code:'Digit1',repeat:false}));document.dispatchEvent(event('keyup',{code:'Digit1'}));
 clock+=533;raf(clock);
 assert.equal(currentPlayer().weapon,'rifle');assert.equal(currentPlayer().reload,null,'switch still cancels reload');
 t.diagnostic(JSON.stringify({movement:ground?'ground-v1':'baseline',rounds:completed.rounds.length,localShots:completed.shots,bots:botCommands.size,newMatchTick:fresh.tick,errors:errors.length}));
 }finally{
   window.dispatchEvent(new Event('pagehide'));
   for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
   for(const game of created)game.dispose();
 }
});
