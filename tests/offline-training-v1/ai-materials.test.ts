import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AiMaterials,aiMaterialsEnabled} from '../../src/candidates/offline-training-v1/render/ai-materials.js';
const env='environment=courtyard-v1';
test('AI materials require an explicit unique option and supported environment',()=>{
 assert(aiMaterialsEnabled('?'+env+'&materials=ai-courtyard-v1'));
 for(const q of ['',env,env+'&materials=unknown',env+'&materials=ai-courtyard-v1&materials=ai-courtyard-v1','materials=ai-courtyard-v1',env+'&'+env+'&materials=ai-courtyard-v1'])assert.equal(aiMaterialsEnabled('?'+q),false,q);
});
function setup(){return {floor:new THREE.MeshStandardMaterial({map:new THREE.Texture()}),wall:new THREE.Mesh(new THREE.BoxGeometry(1.2,3.4,16),new THREE.MeshStandardMaterial({map:new THREE.Texture()}))};}
test('two material loads apply atomically, preserve geometry and own both textures',async()=>{
 const original=THREE.TextureLoader.prototype.loadAsync,loaded:THREE.Texture[]=[];let released=0;
 THREE.TextureLoader.prototype.loadAsync=async()=>{const t=new THREE.Texture<HTMLImageElement>();t.addEventListener('dispose',()=>released++);loaded.push(t);return t;};
 const owner=new AiMaterials(),{floor,wall}=setup();const vertices=Array.from(wall.geometry.attributes.position!.array),indices=Array.from(wall.geometry.index!.array);
 try{await owner.start(floor,wall);assert.equal(owner.info.state,'ready');assert.equal(loaded.length,2);assert.equal(floor.map,loaded[0]);for(const t of loaded){assert.equal(t.colorSpace,THREE.SRGBColorSpace);assert.equal(t.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(t.wrapS,THREE.RepeatWrapping);}assert.deepEqual(Array.from(wall.geometry.attributes.position!.array),vertices);assert.deepEqual(Array.from(wall.geometry.index!.array),indices);assert.equal(wall.geometry.attributes.aiSurfaceUv!.count,vertices.length/3);owner.dispose();owner.dispose();assert.equal(released,2);}finally{owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
test('one failed load leaves both original surfaces intact and releases successful sibling',async()=>{
 const original=THREE.TextureLoader.prototype.loadAsync;let count=0,released=0;
 THREE.TextureLoader.prototype.loadAsync=async()=>{if(count++===1)throw Error('fixture missing image');const t=new THREE.Texture<HTMLImageElement>();t.addEventListener('dispose',()=>released++);return t;};
 const owner=new AiMaterials(),{floor,wall}=setup(),map=floor.map,hook=wall.material.onBeforeCompile;
 try{await owner.start(floor,wall);assert.equal(owner.info.state,'fallback');assert.equal(floor.map,map);assert.equal(wall.material.onBeforeCompile,hook);assert.equal(wall.geometry.attributes.aiSurfaceUv,undefined);owner.dispose();assert.equal(released,1);}finally{owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
test('disposal while loading rejects late texture publication and releases both arrivals',async()=>{
 const original=THREE.TextureLoader.prototype.loadAsync;const pending:Array<(t:THREE.Texture<HTMLImageElement>)=>void>=[];let released=0;
 THREE.TextureLoader.prototype.loadAsync=()=>new Promise<THREE.Texture<HTMLImageElement>>(resolve=>pending.push(resolve));
 const owner=new AiMaterials(),{floor,wall}=setup(),map=floor.map;
 try{const task=owner.start(floor,wall);owner.dispose();for(const done of pending){const t=new THREE.Texture<HTMLImageElement>();t.addEventListener('dispose',()=>released++);done(t);}await task;assert.equal(floor.map,map);assert.equal(wall.geometry.attributes.aiSurfaceUv,undefined);assert.equal(released,2);}finally{owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
