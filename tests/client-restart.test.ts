import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

// Real client orchestration, controlled Game resource resolution. Synthetic
// page transitions are not evidence of browser BFCache admission or GPU behavior.
const source=stripTypeScriptTypes(readFileSync(new URL('../src/client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function fixture(){
 let resolve!:()=>void,reject!:(e:Error)=>void,restart!:()=>void,createCount=0;
 const pending=new Promise<void>((yes,no)=>{resolve=yes;reject=no;}),events:string[]=[],window=new EventTarget(),canvas=new EventTarget();
 const elements=new Map<string,{hidden:boolean;textContent:string}>();
 const document={querySelector:()=>canvas,createElement:()=>({getContext:()=>({getExtension:()=>({loseContext(){}})})}),getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:''});return elements.get(id)!;}};
 const resource=(id:string)=>({state:{actors:[{id:'player'}],phase:'live'},disposeCalls:0,dispose(){this.disposeCalls++;events.push(`${id}.dispose`);}});
 const initial=resource('initial'),replacement=resource('replacement');
 class View{backend='three-webgl2';dispose(){events.push('view.dispose');}reset(){events.push('view.reset');}resize(){}}
 class Hud{difficulty='hard';constructor(_start:unknown,_next:unknown,onRestart:()=>void){restart=onRestart;}setBusy(b:boolean){events.push(`busy:${b}`);}menu(b:boolean){events.push(`menu:${b}`);}reset(){events.push('hud.reset');}message(){}}
 class Controls{reset(){events.push('controls.reset');}pause(){}dispose(){events.push('controls.dispose');}}
 class Soundscape{reset(){events.push('sound.reset');}dispose(){events.push('sound.dispose');}}
 class Navigation{dispose(){events.push('nav.dispose');}}
 const deps={Game:{async create(){createCount++;if(createCount===2)await pending;return createCount===1?initial:replacement;}},Bot:class{constructor(){events.push('bot.create');}},initNavigation:async()=>{},Navigation,Controls,MouseSensitivity:class{},View,CanvasView:class{},Soundscape,RESULT_HOLD_MS:700,Hud,document,window,performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},console:{error:()=>events.push('fatal')}};
 await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
 const hide=(persisted=false)=>{const event=new Event('pagehide');Object.defineProperty(event,'persisted',{value:persisted});window.dispatchEvent(event);};
 return{events,initial,replacement,resolve,reject,restart,hide,elements,createCount:()=>createCount,settle:()=>new Promise<void>(r=>setImmediate(r))};
}
test('normal restart replaces once and ignores another request while pending',async()=>{
 const f=await fixture();f.restart();f.restart();assert.equal(f.createCount(),2);f.events.length=0;f.resolve();await f.settle();
 assert.equal(f.initial.disposeCalls,1);assert.equal(f.replacement.disposeCalls,0);assert.deepEqual(f.events,['initial.dispose','bot.create','controls.reset','view.reset','sound.reset','hud.reset','menu:true','busy:false']);
});
test('non-persisted departure disposes a late replacement once without reviving disposed resources or HUD',async()=>{
 const f=await fixture();f.restart();f.hide();f.events.length=0;f.resolve();await f.settle();
 assert.equal(f.initial.disposeCalls,1);assert.equal(f.replacement.disposeCalls,1);assert.deepEqual(f.events,['replacement.dispose']);
 f.restart();assert.equal(f.createCount(),2,'a departed client cannot request another replacement');
});
test('late restart rejection after departure stays silent without reopening HUD',async()=>{
 const f=await fixture();f.restart();f.hide();f.events.length=0;f.reject(new Error('controlled late failure'));await f.settle();
 assert.equal(f.initial.disposeCalls,1);assert.equal(f.replacement.disposeCalls,0);assert.deepEqual(f.events,[]);assert.notEqual(f.elements.get('fatal')?.hidden,false);
});
test('active-page restart failure remains visible and releases busy state without destroying the old game',async()=>{
 const f=await fixture();f.restart();f.events.length=0;f.reject(new Error('controlled active failure'));await f.settle();
 assert.equal(f.initial.disposeCalls,0);assert.equal(f.replacement.disposeCalls,0);assert.deepEqual(f.events,['menu:false','fatal','busy:false']);assert.equal(f.elements.get('fatal')!.hidden,false);assert.match(f.elements.get('fatal')!.textContent,/controlled active failure/);
});
test('persisted departure retains original restart completion instead of permanently cancelling it',async()=>{
 const f=await fixture();f.restart();f.hide(true);f.events.length=0;f.resolve();await f.settle();
 assert.equal(f.initial.disposeCalls,1);assert.equal(f.replacement.disposeCalls,0);assert.ok(f.events.includes('view.reset'));assert.ok(f.events.includes('menu:true'));assert.ok(!f.events.includes('view.dispose'));assert.ok(!f.events.includes('fatal'));
});
