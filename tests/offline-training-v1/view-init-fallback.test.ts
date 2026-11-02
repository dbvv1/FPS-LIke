import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as Three from 'three';

// Actual View constructor and Three resource disposal; only WebGLRenderer is a
// fault-injection substitute. No GPU, pixels or browser acceptance is claimed.
const url=new URL('../../src/candidates/offline-training-v1/render/scene.ts',import.meta.url);
let source=readFileSync(url,'utf8');
const deps:Record<string,unknown>={};
for(const match of source.matchAll(/^import \{ (.*) \} from '([^']+)';$/gm)){
 const module=await import(new URL(match[2]!,url).href);
 for(const entry of match[1]!.split(',').map(x=>x.trim()).filter(x=>!x.startsWith('type '))){
  const [name,alias]=entry.split(/\s+as\s+/);deps[alias??name!]=module[name!];
 }
}
source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')).replace('export class View','return class View');
for(const failure of ['renderer','resize'] as const)test(`actual View cleans allocated resources after ${failure} initialization failure`,()=>{
 const disposed:string[]=[],oldGeometry=Three.BufferGeometry.prototype.dispose,oldMaterial=Three.Material.prototype.dispose;
 Three.BufferGeometry.prototype.dispose=function(){disposed.push(this.type);oldGeometry.call(this);};
 Three.Material.prototype.dispose=function(){disposed.push(this.type);oldMaterial.call(this);};
 let rendererDisposed=0;
 class Renderer{
  domElement={clientWidth:640,clientHeight:360};
  constructor(){if(failure==='renderer')throw new Error('injected renderer');}
  setPixelRatio(){}
  setSize(){throw new Error('injected resize');}
  dispose(){rendererDisposed++;}
 }
 try{
  const View=new Function('THREE','devicePixelRatio',...Object.keys(deps),source)({...Three,WebGLRenderer:Renderer},1,...Object.values(deps));
  assert.throws(()=>new View({}),new RegExp(`injected ${failure}`));
  assert.equal(disposed.filter(x=>x==='SphereGeometry').length,1,'field-created flash released exactly once');
  assert.equal(disposed.filter(x=>x==='RingGeometry').length,failure==='resize'?1:0);
  assert.equal(rendererDisposed,failure==='resize'?1:0);
  assert.ok(disposed.includes('MeshBasicMaterial'));
 }finally{
  Three.BufferGeometry.prototype.dispose=oldGeometry;Three.Material.prototype.dispose=oldMaterial;
 }
});
