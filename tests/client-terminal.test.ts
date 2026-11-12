import { contentSetDiagnostics } from '../src/render/content-set-assets.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {frameBudget,resumeFrameBudget,TICK_MS,MAX_CATCHUP_STEPS} from '../src/candidates/offline-training-v1/frame-budget.js';
import {Game as RealGame} from '../src/sim/game.js';

// Execute the production orchestration. Resource and browser contracts are
// controlled here; browser context-loss/BFCache admission are separate checks.
const source=stripTypeScriptTypes(readFileSync(new URL('../src/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function fixture(options:{initialFailure?:'navigation'|'game';initialPending?:'navigation'|'game';throwCleanup?:string;resetFailure?:boolean;realGame?:boolean}={}){
 const events:string[]=[],errors:unknown[]=[],window=new EventTarget() as EventTarget&{fpsClient:{state():{ready:boolean;running:boolean};snapshot():unknown}},canvas=new EventTarget();
 let clock=0,nextId=0,creates=0,throwRender=false,start!:()=>void,restart!:()=>void,enable!:(enabled:boolean)=>void,changed!:(locked:boolean)=>void;
 const frames=new Map<number,(now:number)=>void>(),pending=deferred<ReturnType<typeof gameResource>>(),initialGate=deferred<void>();
 const elements=new Map<string,{hidden:boolean;textContent:string;onclick?:()=>void}>();
 const document={hidden:false,hasFocus:()=>true,querySelector:()=>canvas,createElement:()=>({getContext:()=>({getExtension:()=>({loseContext(){}})})}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id)!;}};
 const release=(id:string)=>{events.push(`${id}.dispose`);if(options.throwCleanup===id)throw new Error(`cleanup ${id}`);};
 function gameResource(id:string){return{state:{tick:0,time:0,round:1,phase:'live',actors:[{id:'player',team:'amber',position:{x:0,z:0},hp:100,weapon:'rifle',weapons:{rifle:{ammo:30}},reload:null,input:{}}],score:{amber:0,blue:0},result:null},step(){this.state.tick++;this.state.time+=1000;},observe(){return{sounds:[]};},dispose(){release(id);}};}
 const realGame=options.realGame?await RealGame.create(1,[{id:'player',team:'amber'},{id:'bot',team:'blue'}]):undefined;
 const initial=realGame??gameResource('initial'),replacement=gameResource('replacement');
 if(realGame){const dispose=realGame.dispose.bind(realGame);realGame.dispose=()=>{release('initial');dispose();};}
 class View{backend='three-webgl2';info={};render(){events.push('render');if(throwRender)throw new Error('controlled render failure');}resize(){events.push('resize');}reset(){events.push('view.reset');if(options.resetFailure)throw new Error('controlled reset failure');}dispose(){release('view');}}
 class Navigation{dispose(){release('nav');}}
 class Controls{locked=false;yaw=0;pitch=0;constructor(_canvas:unknown,onChanged:(locked:boolean)=>void){changed=locked=>{this.locked=locked;onChanged(locked);};}async lock(){events.push('lock');changed(true);}pause(){events.push('pause');if(this.locked)changed(false);}dispose(){release('controls');}reset(){}discardBefore(){}commands(){return[];}}
 class Soundscape{enabled=true;async unlock(){events.push('unlock');}update(){}reset(){}dispose(){release('sound');}}
 class Hud{difficulty='hard';constructor(onStart:()=>void,_next:unknown,onRestart:()=>void,onEnabled:(v:boolean)=>void){start=onStart;restart=onRestart;enable=onEnabled;}setBusy(v:boolean){events.push(`busy:${v}`);}menu(v:boolean){events.push(`menu:${v}`);}message(v:string){events.push(`message:${v}`);}update(){}reset(){}}
 const deps={contentSetDiagnostics,frameBudget,resumeFrameBudget,TICK_MS,MAX_CATCHUP_STEPS,Game:{async create(){creates++;if(creates===1){if(options.initialPending==='game')await initialGate.promise;if(options.initialFailure==='game')throw new Error('controlled game failure');return initial;}return pending.promise;}},Bot:class{commands(){return[];}},initNavigation:async()=>{if(options.initialPending==='navigation')await initialGate.promise;if(options.initialFailure==='navigation')throw new Error('controlled navigation failure');},Navigation,Controls,MouseSensitivity:class{dirty=false;value=1;},View,CanvasView:View,Soundscape,RESULT_HOLD_MS:700,Hud,document,window,performance:{now:()=>clock},requestAnimationFrame:(fn:(now:number)=>void)=>{frames.set(++nextId,fn);return nextId;},cancelAnimationFrame:(id:number)=>{frames.delete(id);events.push(`cancel:${id}`);},console:{error:(e:unknown)=>errors.push(e)}};
 const done=new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 if(!options.initialPending)await done;
 const page=(type:'pagehide'|'pageshow',persisted:boolean)=>{const e=new Event(type);Object.defineProperty(e,'persisted',{value:persisted});window.dispatchEvent(e);};
 const lost=()=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
 const frame=(now:number)=>{clock=now;const entry=frames.entries().next().value as [number,(n:number)=>void]|undefined;assert.ok(entry);frames.delete(entry[0]);entry[1](now);};
 return{events,errors,elements,window,frames,initial,realGame,replacement,pending,initialGate,done,page,lost,frame,start:()=>start(),restart:()=>restart(),enable:(v:boolean)=>enable(v),lateLock:()=>changed(true),failRender:()=>{throwRender=true;},creates:()=>creates,settle:()=>new Promise<void>(r=>setImmediate(r))};
}
for(const stage of ['navigation','game'] as const)test(`terminal ${stage} initialization failure releases every acquired owner`,async()=>{
 const f=await fixture({initialFailure:stage});assert.equal(f.frames.size,0);assert.equal(f.elements.get('fatal')!.hidden,false);
 assert.equal(f.events.filter(e=>e==='view.dispose').length,1);assert.equal(f.events.filter(e=>e==='sound.dispose').length,1);assert.equal(f.events.filter(e=>e==='nav.dispose').length,stage==='game'?1:0);
 f.page('pagehide',false);assert.equal(f.events.filter(e=>e==='view.dispose').length,1);
});
test('context loss terminates once and stale callbacks or BFCache return cannot restart the failed client',async()=>{
 const f=await fixture(),queued=[...f.frames.values()][0]!;f.lost();
 assert.equal(f.window.fpsClient.state().ready,false);assert.equal(f.window.fpsClient.state().running,false);assert.equal(f.frames.size,0);
 for(const owner of ['controls','view','initial','nav','sound'])assert.equal(f.events.filter(e=>e===`${owner}.dispose`).length,1,owner);
 const before=f.events.length;queued(100);f.page('pageshow',true);f.page('pagehide',false);f.window.dispatchEvent(new Event('resize'));f.lateLock();f.start();f.restart();f.enable(true);await f.settle();
 assert.equal(f.frames.size,0);assert.equal(f.creates(),1);assert.deepEqual(f.events.slice(before),[]);assert.equal(f.window.fpsClient.state().running,false);
});
test('render failure releases owners even when an individual disposal throws',async()=>{
 const f=await fixture({throwCleanup:'controls'});f.failRender();f.frame(0);
 assert.equal(f.frames.size,0);assert.equal(f.window.fpsClient.state().ready,false);
 for(const owner of ['controls','view','initial','nav','sound'])assert.equal(f.events.filter(e=>e===`${owner}.dispose`).length,1,owner);
 assert.match(f.elements.get('fatal')!.textContent,/controlled render failure/);assert.ok(f.errors.some(e=>e instanceof Error&&e.message==='cleanup controls'));
});
test('a replacement arriving after terminal failure is disposed without reviving the old client',async()=>{
 const f=await fixture();f.restart();f.lost();const before=f.events.length;f.pending.resolve(f.replacement);await f.settle();
 assert.deepEqual(f.events.slice(before),['replacement.dispose']);assert.equal(f.events.filter(e=>e==='initial.dispose').length,1);assert.equal(f.window.fpsClient.state().ready,false);assert.equal(f.frames.size,0);
});
test('recoverable restart failure preserves the playable round and offers Continue instead of fatal shutdown',async()=>{
 const f=await fixture();f.restart();f.pending.reject(new Error('controlled restart failure'));await f.settle();
 assert.equal(f.window.fpsClient.state().ready,true);assert.notEqual(f.elements.get('fatal')?.hidden,false);assert.ok(f.events.some(e=>e.startsWith('message:重新开始失败')));assert.equal(f.events.filter(e=>e==='initial.dispose').length,0);
 f.start();await f.settle();f.frame(100);f.frame(150);assert.ok(f.initial.state.tick>0);assert.equal(f.window.fpsClient.state().running,true);
});

for(const stage of ['navigation','game'] as const)test(`context loss during pending ${stage} initialization cancels late ownership`,async()=>{
 const f=await fixture({initialPending:stage});await f.settle();f.lost();f.initialGate.resolve();await f.done;
 assert.equal(f.window.fpsClient,undefined);assert.equal(f.frames.size,0);assert.equal(f.elements.get('fatal')?.hidden,false);
 for(const owner of ['view','sound'])assert.equal(f.events.filter(e=>e===`${owner}.dispose`).length,1,owner);
 assert.equal(f.events.filter(e=>e==='nav.dispose').length,stage==='game'?1:0);assert.equal(f.events.filter(e=>e==='initial.dispose').length,stage==='game'?1:0);
});
test('failure after committing a replacement is fatal rather than offering an already disposed old round',async()=>{
 const f=await fixture({resetFailure:true});f.restart();f.pending.resolve(f.replacement);await f.settle();
 assert.equal(f.window.fpsClient.state().ready,false);assert.equal(f.frames.size,0);
 for(const owner of ['initial','replacement','controls','view','nav','sound'])assert.equal(f.events.filter(e=>e===`${owner}.dispose`).length,1,owner);
 assert.match(f.elements.get('fatal')!.textContent,/controlled reset failure/);
});

test('a real physics-backed Game survives rejected replacement and continues through the production client',async()=>{
 const f=await fixture({realGame:true});assert.ok(f.realGame);const hash=f.realGame.stateHash;
 try{f.restart();f.pending.reject(new Error('controlled replacement rejection'));await f.settle();
  assert.equal(f.realGame.stateHash,hash);assert.equal(f.window.fpsClient.state().ready,true);assert.equal(f.events.filter(e=>e==='initial.dispose').length,0);
  f.start();await f.settle();f.frame(100);f.frame(150);assert.ok(f.realGame.state.tick>0);assert.notEqual(f.realGame.stateHash,hash);assert.equal(f.window.fpsClient.state().running,true);
 }finally{f.page('pagehide',false);}
 assert.equal(f.events.filter(e=>e==='initial.dispose').length,1);assert.throws(()=>f.realGame!.step([]),/disposed/);
});
