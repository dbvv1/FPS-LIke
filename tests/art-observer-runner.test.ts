import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error runner utilities are deliberately plain Node JavaScript
import { assertObserver, comparable, finishCleanup } from '../tools/art-observer-support.mjs';
const fixture=()=>({ready:true,mode:'offline-art-observer',name:'wall-lamp-observer',art:false,firstPersonWeapon:false,renderer:{rendererClass:'gpu',unmasked:true,renderer:'NVIDIA example',vendor:'example',version:'example'},replay:{seed:1,difficulty:'easy',ticks:120},state:{tick:120,actors:Array(10).fill({})},stateHash:'4a118389',commands:Array(120).fill([]),botIds:Array.from({length:9},(_,i)=>String(i)),viewport:{width:1365,height:900,dpr:1},renderInfo:{environment:{id:'courtyard-v1',active:true}},observer:{position:{x:0,y:1.02,z:15.5}},actualPlayerPose:{hp:100},t:2});
test('observer runner rejects software/unknown, wrong namespace/state/candidate and compares full evidence',()=>{
 const base=fixture();assert.doesNotThrow(()=>assertObserver(base,base.name,false));
 for(const patch of [{renderer:{...base.renderer,rendererClass:'software'}},{renderer:{...base.renderer,rendererClass:'unknown'}},{stateHash:'wrong'},{mode:'legacy-shot'},{art:true}])assert.throws(()=>assertObserver({...base,...patch},base.name,false));
 const art={...base,art:true,renderInfo:{...base.renderInfo,art:{state:'ready',active:true,pieces:3}}};assert.doesNotThrow(()=>assertObserver(art,base.name,true));assert.deepEqual(comparable(base),comparable(art));
 assert.throws(()=>assertObserver({...art,renderInfo:{...art.renderInfo,art:{state:'fallback',active:false,pieces:0}}},base.name,true));
});
test('cleanup attempts preview even if browser close rejects and preserves failure',async()=>{
 const attempted:string[]=[];
 const errors=await finishCleanup([['browser',async()=>{attempted.push('browser');throw new Error('owned close failed');}],['preview',async()=>{attempted.push('preview');}]]);
 assert.deepEqual(attempted,['browser','preview']);assert.equal(errors.length,1);assert.match(errors[0],/owned close failed/);
});
