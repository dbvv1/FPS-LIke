import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createCaptureCanvas,captureOutput} from '../../src/capture/output.js';
import {qualityCaptureOptions,CAPTURE_SIZE} from '../../src/candidates/offline-training-v1/capture/quality-route.js';
import {CaptureLifetime} from '../../src/capture/lifetime.js';
const source=stripTypeScriptTypes(readFileSync(new URL('../../src/candidates/offline-training-v1/capture/quality-client.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url', JSON.stringify('https://example.test/quality-client.js')));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function fixture(webgl=true){
  const host=new EventTarget() as EventTarget & {__shot?:any;__shotNext?:()=>any};
  const gl={isContextLost:()=>false,finish(){},getParameter:()=>[],SAMPLES:1,MAX_SAMPLES:2,COMPRESSED_TEXTURE_FORMATS:3};
  const canvas=Object.assign(new EventTarget(),{width:0,height:0,clientWidth:317,clientHeight:233,getContext:()=>webgl?gl:null,toDataURL:()=> 'data:image/png;base64,AA=='});
  const document={createElement:()=>canvas,getElementById:()=>({hidden:false}),getAnimations:()=>[]};
  let size:any;
  class View {
    info={art:{state:'ready'}};
    renderer={getContext:()=>gl,capabilities:{getMaxAnisotropy:()=>1},info:{render:{},memory:{}},shadowMap:{enabled:false}};
    constructor(_canvas:unknown,captureSize:unknown){size=captureSize;}resize(){}render(){}dispose(){}
  }
  class Hud {menu(){}update(){}}class TrainingMatch {summary={};observe(){}}class MatchPanel {update(){}}
  const state={tick:120,actors:[{id:'player',yaw:0,pitch:0,hp:100,position:{x:0,y:0,z:0},input:{crouch:false}}],phase:'live'};
  const deps={createCaptureCanvas,captureOutput,qualityCaptureOptions,CAPTURE_SIZE,CaptureLifetime,View,Hud,MatchPanel,TrainingMatch,MouseSensitivity:class {},
    prepareReplay:async()=>({game:{state,stateHash:'fixed'},advance(){state.tick++;},commands:[],botIds:[]}),REPLAY:{hz:60},eye:()=>({x:0,y:1.6,z:0}),rendererEvidence:()=>({unmasked:false}),
    location:{search:'?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1&qualityCapture=cross-lane'},
    window:host,document,innerWidth:317,innerHeight:233,devicePixelRatio:3,performance,setTimeout,structuredClone};
  const done=new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));
  return {host,canvas,done,size:()=>size};
}
test('production qualityCapture publishes fixed PNG/camera despite a small DPR3 window and resize',async()=>{
  const f=await fixture();await f.done;
  assert.deepEqual(f.size(),CAPTURE_SIZE);assert.equal(f.host.__shot.ready,true);assert.equal(f.host.__shot.backend,'webgl2');assert.equal(f.host.__shot.name,'cross-lane');
  assert.deepEqual(f.host.__shot.image,{width:1280,height:720,dpr:1});assert.equal(f.host.__shot.pngDataUrl,'data:image/png;base64,AA==');
  f.host.dispatchEvent(new Event('resize'));assert.equal(f.host.__shot.ready,true);assert.equal(f.host.__shotNext!().frame,1);
  f.canvas.dispatchEvent(new Event('webglcontextlost'));assert.equal(f.host.__shot.ready,false);assert.equal(f.host.__shot.pngDataUrl,undefined);
});
test('production qualityCapture reports missing WebGL2 instead of accepting a CPU image',async()=>{
  const f=await fixture(false);await assert.rejects(f.done,/WebGL2/);assert.equal(f.host.__shot.ready,false);assert.equal(f.host.__shot.backend,null);assert.equal(f.host.__shot.pngDataUrl,undefined);
});
