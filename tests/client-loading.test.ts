import { frameBudget, resumeFrameBudget, TICK_MS, MAX_CATCHUP_STEPS } from '../src/candidates/offline-training-v1/frame-budget.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import { contentSetDiagnostics } from '../src/render/content-set-assets.js';

// Execute the actual client orchestration with controlled asynchronous resources.
// This is a lifecycle component check, not a browser/GPU or gameplay substitute.
const source=stripTypeScriptTypes(readFileSync(new URL('../src/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
function fixture(stage:'navigation'|'game'){
 const gate=deferred(),events:string[]=[],window=new EventTarget() as EventTarget&{fpsClient?:{state:()=>{ready:boolean}}},canvas=new EventTarget();
 const elements=new Map<string,{hidden:boolean;textContent:string}>();
 const document={querySelector:()=>canvas,createElement:()=>({getContext:()=>({getExtension:()=>({loseContext(){}})})}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id)!;}};
 const actor={id:'player'},game={state:{actors:[actor],phase:'live'},dispose(){events.push('game.dispose');}};
 class View{backend='three-webgl2';dispose(){events.push('view.dispose');}resize(){}}
 class CanvasView{}
 class Navigation{constructor(){events.push('nav.create');}dispose(){events.push('nav.dispose');}}
 class Hud{difficulty='hard';setBusy(){}menu(){}message(){}}
 class Controls{reset(){}pause(){events.push('controls.pause');}dispose(){events.push('controls.dispose');}}
 class Soundscape{dispose(){events.push('sound.dispose');}}
 const deps={frameBudget,resumeFrameBudget,TICK_MS,MAX_CATCHUP_STEPS,contentSetDiagnostics,Game:{async create(){events.push('game.create');if(stage==='game')await gate.promise;return game;}},Bot:class{},initNavigation:async()=>{events.push('nav.init');if(stage==='navigation')await gate.promise;},Navigation,Controls,MouseSensitivity:class{},View,CanvasView,Soundscape,RESULT_HOLD_MS:700,Hud,document,window,performance:{now:()=>0},requestAnimationFrame:()=>{events.push('raf');return 1;},cancelAnimationFrame:()=>events.push('cancelRaf'),console:{error:()=>events.push('fatal')}};
 const done=new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 const hide=(persisted=false)=>{const event=new Event('pagehide');Object.defineProperty(event,'persisted',{value:persisted});window.dispatchEvent(event);};
 const settle=()=>new Promise<void>(r=>setImmediate(r));
 return{gate,events,window,done,hide,settle};
}
for(const stage of ['navigation','game'] as const)test(`leaving during ${stage} cannot revive initialization after its await`,async()=>{
 const f=fixture(stage);await f.settle();f.hide();f.gate.resolve();await f.done;
 assert.equal(f.window.fpsClient,undefined);assert.ok(!f.events.includes('raf'));assert.ok(!f.events.includes('fatal'));
 assert.equal(f.events.filter(e=>e==='view.dispose').length,1);
 assert.equal(f.events.filter(e=>e==='game.create').length,stage==='game'?1:0);
 assert.equal(f.events.filter(e=>e==='game.dispose').length,stage==='game'?1:0);
 assert.equal(f.events.filter(e=>e==='nav.dispose').length,stage==='game'?1:0);
});
test('persisted pagehide during loading retains resources and permits original initialization',async()=>{
 const f=fixture('navigation');await f.settle();f.hide(true);f.gate.resolve();await f.done;
 assert.equal(f.window.fpsClient?.state().ready,true);assert.equal(f.events.filter(e=>e==='game.create').length,1);
 assert.ok(!f.events.includes('view.dispose'));assert.ok(!f.events.includes('fatal'));assert.equal(f.events.filter(e=>e==='raf').length,1);
});
