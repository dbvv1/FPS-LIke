import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityPairQuery, validateQualityShot, comparableQualityShot, QUALITY_SHOTS } from '../tools/quality-pair-support.js';
import { qualityCaptureOptions } from '../src/candidates/offline-training-v1/capture/quality-route.js';
import { REPLAY } from '../src/candidates/offline-training-v1/capture/replay.js';
import { CAMERAS } from '../src/capture/cameras.js';
function fixture(shot = 'cross-lane', variant = 'default'): any {
  return { ready: true, name: shot, backend: 'webgl2', frame: 0, t: 2, hz:60, state: { tick: 120 }, warmFrames:12, replay: REPLAY, botIds: Array.from({length:9},(_,i)=>`${i}`), viewport: {width:1280,height:720,pixelRatio:1,bufferWidth:1280,bufferHeight:720}, renderInfo: {art:{state:'ready',active:true}, lighting:{id:'courtyard-light-v1'}, ...(variant==='materials'?{materials:{id:'ai-courtyard-full-v1',state:'ready'}}:{})}, renderer:'SwiftShader', rendererEvidence:{rendererClass:'software',unmasked:true}, camera: CAMERAS['cross-lane'], pngDataUrl:'data:image/png;base64,eA==' };
}
test('paired queries use existing current-route parser and only differ in materials',()=>{
 for(const shot of QUALITY_SHOTS){
  const a=new URLSearchParams(qualityPairQuery(shot,'default')),b=new URLSearchParams(qualityPairQuery(shot,'materials'));
  assert.equal(qualityCaptureOptions(a.toString())?.name,shot); assert.equal(qualityCaptureOptions(b.toString())?.name,shot);
  assert.equal(b.get('materials'),'ai-courtyard-full-v1');b.delete('materials');assert.equal(a.toString(),b.toString());
 }
 assert.throws(()=>qualityPairQuery('bad','default'));assert.throws(()=>qualityPairQuery('gameplay','bad'));
});
test('current metadata accepts frozen ready pair and compares state without material differences',()=>{
 const a=fixture(),b=fixture('cross-lane','materials'); validateQualityShot(a,'cross-lane','default');validateQualityShot(b,'cross-lane','materials');assert.deepEqual(comparableQualityShot(a),comparableQualityShot(b));
});
test('reject incomplete, wrong replay, fallback, wrong dimensions or wrong renderer',()=>{
 for(const mutate of [(m:any)=>m.ready=false,(m:any)=>m.frame=1,(m:any)=>m.state.tick=121,(m:any)=>m.viewport.height=900,(m:any)=>m.renderInfo.art.active=false,(m:any)=>m.renderInfo.materials.state='fallback',(m:any)=>m.rendererEvidence.rendererClass='gpu',(m:any)=>m.replay={...REPLAY,seed:2},(m:any)=>m.camera={...m.camera,yaw:9}]){
  const m=structuredClone(fixture('cross-lane','materials'));mutate(m);assert.throws(()=>validateQualityShot(m,'cross-lane','materials'));
 }
 assert.throws(()=>validateQualityShot({},'gameplay','default'));
});

import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { captureBuildInvocation } from '../tools/capture-support.js';
const scriptUrl = new URL('../tools/capture-quality-pair.mjs',import.meta.url);
const source=readFileSync(scriptUrl,'utf8').replace(/^#!.*\n/,'').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(scriptUrl.href));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function runMock(out:string, failClose=false, sha='a'.repeat(40)) {
 let previewClosed=false, browserClosed=false, printed='';
 const png=PNG.sync.write(new PNG({width:1280,height:720}));
 const processStub={platform:'linux',env:{},exitCode:undefined as number|undefined};
 const browser={on(){},version:()=> 'mock-no-browser',isConnected:()=>!browserClosed,async close(){browserClosed=true;if(failClose)throw new Error('mock close failure');},async newContext(){return{async route(){},async close(){},async newPage(){let meta:any;return{on(){},async goto(url:string){const p=new URL(url).searchParams;meta=fixture(p.get('qualityCapture')!,p.has('materials')?'materials':'default');meta.pngDataUrl='data:image/png;base64,'+png.toString('base64');meta.camera=CAMERAS[p.get('qualityCapture')! as keyof typeof CAMERAS];if(p.get('qualityCapture')==='gameplay'){meta.camera={fov:80};meta.cameraKind='player';}},async waitForFunction(){},locator:()=>({async waitFor(){}}),async waitForTimeout(){},async evaluate(){return structuredClone(meta);},async close(){}};}};}};
 const deps={assert,parseArgs:()=>({values:{sha,out}}),mkdir,writeFile,readFile,readdir:async()=>[],resolve,join,relative,fileURLToPath,createHash,PNG,captureBuildInvocation,QUALITY_SHOTS,qualityPairQuery,validateQualityShot,comparableQualityShot,process:processStub,console:{log:(x:string)=>printed=x},execFileSync:(f:string,args:string[])=>f==='git'?(args[0]==='status'?'':args[1]==='HEAD'?'a'.repeat(40):'b'.repeat(40)):'',chromium:{launch:async()=>browser},preview:async()=>({httpServer:{address:()=>({port:4321}),get listening(){return !previewClosed;},closeAllConnections(){},close(fn:Function){previewClosed=true;fn();}}})};
 await new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));return{report:JSON.parse(printed),previewClosed,browserClosed,exit:processStub.exitCode};
}
test('real CLI orchestration writes twelve exclusive paired PNGs and cleans browser/preview',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'quality-runner-'));
 try{const out=join(dir,'pair'),r=await runMock(out);assert.equal(r.report.passed,true);assert.equal(r.report.shots.length,12);assert.equal((await readdir(out)).length,25);assert.equal(r.previewClosed,true);assert.equal(r.browserClosed,true);await assert.rejects(runMock(out));}finally{await rm(dir,{recursive:true,force:true});}
});
test('cleanup failure still closes preview and writes failed receipt; wrong SHA never starts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'quality-runner-fail-'));
 try{const r=await runMock(join(dir,'pair'),true);assert.equal(r.report.passed,false);assert.equal(r.exit,1);assert.equal(r.previewClosed,true);await assert.rejects(runMock(join(dir,'wrong'),false,'c'.repeat(40)));}finally{await rm(dir,{recursive:true,force:true});}
});
