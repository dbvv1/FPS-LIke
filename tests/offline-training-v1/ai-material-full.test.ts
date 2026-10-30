import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FullAiMaterials } from '../../src/candidates/offline-training-v1/render/ai-materials.js';
import { atlasBaseColor, bindSurface, fullAiMaterialsEnabled, surfaceAttributes } from '../../src/candidates/offline-training-v1/render/ai-surface.js';
import { ART_PIECES, ArtStandards } from '../../src/candidates/offline-training-v1/render/art-standards.js';
import { KIT, makeKitWall } from '../../src/candidates/offline-training-v1/render/environment-kit.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';
const loadArt = async (piece: typeof ART_PIECES[number]) => {
  const b = await readFile(new URL(piece.url));
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
};
function surfaces() { return MAP.walls.map(w => ({id:w.id,mesh:makeKitWall(w).mesh})); }
function shader() { return { uniforms: {} as Record<string, {value:unknown}>, vertexShader:'#include <uv_vertex>', fragmentShader:'#include <map_fragment>\n#include <color_fragment>' }; }
function snapshot(root: THREE.Object3D) {
  const data: unknown[]=[];
  root.traverse(o=>{if(o instanceof THREE.Mesh)data.push({p:Array.from(o.geometry.attributes.position.array),n:Array.from(o.geometry.attributes.normal.array),i:o.geometry.index?Array.from(o.geometry.index.array):null,c:o.geometry.attributes.color?Array.from(o.geometry.attributes.color.array):null,uv:o.geometry.attributes.uv?Array.from(o.geometry.attributes.uv.array):null});});return data;
}
test('whole-material option is separate from the old sample and malformed queries fail closed',()=>{
  assert(fullAiMaterialsEnabled('?environment=courtyard-v1&materials=ai-courtyard-full-v1'));
  for(const q of ['', '?materials=ai-courtyard-full-v1', '?environment=courtyard-v1&materials=ai-courtyard-v1', '?environment=courtyard-v1&materials=ai-courtyard-full-v1&materials=ai-courtyard-full-v1','?environment=courtyard-v1&environment=courtyard-v1&materials=ai-courtyard-full-v1'])assert.equal(fullAiMaterialsEnabled(q),false);
});
test('all ten actual atlas walls including three cover colors bind only vertical panels at four metre scale',()=>{
  const walls=surfaces();assert.equal(walls.length,10);
  for(const {id,mesh} of walls){
    const before=snapshot(mesh),oldUV=mesh.geometry.attributes.uv,oldHook=mesh.material.onBeforeCompile,oldKey=mesh.material.customProgramCacheKey;
    const binding=bindSurface(mesh,new THREE.Texture(),'atlas',atlasBaseColor(id));
    assert.equal(binding.eligibleVertices,16,id);assert.equal(mesh.geometry.attributes.uv,oldUV);
    const pos=mesh.geometry.attributes.position!,n=mesh.geometry.attributes.normal!,uv=mesh.geometry.attributes.aiSurfaceUv!,mask=mesh.geometry.attributes.aiSurfaceMask!;
    for(let i=0;i<pos.count;i++){
      assert(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i)));
      assert.equal(mask.getX(i),Math.abs(n.getY(i))>.5?0:1);
      assert(Math.abs(uv.getY(i)-pos.getY(i)/4)<1e-6);
    }
    const s=shader();mesh.material.onBeforeCompile(s as never,{} as never);
    assert.deepEqual((s.uniforms.aiOriginalPlaster!.value as THREE.Color).toArray(),new THREE.Color(id.endsWith('-cover')?0x9aaba8:KIT.plaster).toArray());
    assert.match(s.fragmentShader,/plasterMask=.*vAiSurfaceMask/);
    assert.deepEqual(snapshot(mesh),before);
    binding.restore();binding.restore();assert.equal(mesh.material.onBeforeCompile,oldHook);assert.equal(mesh.material.customProgramCacheKey,oldKey);assert.equal(mesh.geometry.attributes.aiSurfaceUv,undefined);assert.equal(mesh.geometry.attributes.aiSurfaceMask,undefined);
  }
});
test('real authored wall and cover replace only plaster vertex tint; protect all paint and lamp',async()=>{
  const owner=new FullAiMaterials();
  for(const piece of ART_PIECES){
    const root=await loadArt(piece),before=snapshot(root);let hits=0,protectedVertices=0;
    root.traverse(o=>{if(o instanceof THREE.Mesh && piece.id!=='lamp-existing'){
      const attrs=surfaceAttributes(o,true),c=o.geometry.attributes.color!,n=o.geometry.attributes.normal!,p=new THREE.Color(KIT.plaster);
      for(let i=0;i<c.count;i++){
        const plaster=Math.hypot(c.getX(i)-p.r,c.getY(i)-p.g,c.getZ(i)-p.b)<.005;
        if(attrs.mask.getX(i)){assert(plaster);hits++;}else protectedVertices++;
      }
      assert(attrs.eligibleVertices>0);assert(protectedVertices>0);
      const binding=bindSurface(o as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,new THREE.Texture(),'vertex');
      const s=shader();(o.material as THREE.Material).onBeforeCompile(s as never,{} as never);
      assert.match(s.fragmentShader,/mix\(vColor.rgb,texture2D/);assert.doesNotMatch(s.fragmentShader,/#include <color_fragment>/);
      assert.deepEqual(snapshot(root),before);binding.restore();
    }});
    if(piece.id==='lamp-existing'){const detach=owner.registerArt(piece.id,root);assert.deepEqual(owner.info.authoredIds,[]);detach();}else assert(hits>0&&protectedVertices>0);
  }
  owner.dispose();
});
test('physical UV includes child scale without changing source mesh data',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshStandardMaterial());mesh.scale.set(2,3,4);mesh.position.set(8,7,6);
  const before=snapshot(mesh),a=surfaceAttributes(mesh,false);
  assert.equal(Math.max(...Array.from(a.uv.array).filter((_,i)=>i%2===1)),1.5);
  assert.equal(Math.max(...Array.from(a.uv.array).filter((_,i)=>i%2===0)),2);
  assert.deepEqual(snapshot(mesh),before);
});
for(const order of ['models-first','textures-first']) test(`shared textures apply to visible GLBs (${order}), detach and restart retain ownership`,async()=>{
  const original=THREE.TextureLoader.prototype.loadAsync;let requests=0,released=0;
  const loaded:THREE.Texture[]=[];
  THREE.TextureLoader.prototype.loadAsync=async()=>{requests++;const t=new THREE.Texture<HTMLImageElement>();t.addEventListener('dispose',()=>released++);loaded.push(t);return t;};
  try{
    for(let run=0;run<2;run++){
      const owner=new FullAiMaterials(),floor=new THREE.MeshStandardMaterial({map:new THREE.Texture()}),oldMap=floor.map,walls=surfaces();
      const scene=new THREE.Scene(),slots=ART_PIECES.map((p,i)=>({id:p.id,position:[i,0,0],fallback:[new THREE.Group()]}));
      const art=new ArtStandards(scene,slots,loadArt,12000,owner.registerArt);
      if(order==='models-first'){await art.start();assert.equal(owner.info.authoredIds.length,0);await owner.start(floor,walls);}else{await owner.start(floor,walls);await art.start();}
      assert.equal(art.info.state,'ready');assert.equal(owner.info.state,'ready');assert.equal(owner.info.wallIds.length,10);assert.deepEqual(owner.info.authoredIds,['center-dogleg','site-cover']);
      assert.equal(owner.info.atlasSideVertices,160);assert.deepEqual(owner.info.authoredCoverage,[{id:'center-dogleg',plasterVertices:424},{id:'site-cover',plasterVertices:120}]);
      assert.equal(requests,(run+1)*2);assert.equal(slots.every(s=>s.fallback.every(o=>!o.visible)),true);
      const roots=[...scene.children];assert.equal(roots.length,3);
      for(let i=0;i<2;i++)roots[i]!.traverse(o=>{if(o instanceof THREE.Mesh)assert(o.geometry.attributes.aiSurfaceMask);});
      roots[2]!.traverse(o=>{if(o instanceof THREE.Mesh)assert.equal(o.geometry.attributes.aiSurfaceMask,undefined);});
      art.dispose();assert.equal(owner.info.authoredIds.length,0);assert.equal(released,run*2);
      owner.dispose();owner.dispose();assert.equal(floor.map,oldMap);assert.equal(released,(run+1)*2);
    }
  }finally{THREE.TextureLoader.prototype.loadAsync=original;}
});
test('full owner partial/late loads preserve all original surfaces and release late successes',async()=>{
  const original=THREE.TextureLoader.prototype.loadAsync;
  let resolve!: (t: THREE.Texture<HTMLImageElement>)=>void,requests=0,released=0;
  THREE.TextureLoader.prototype.loadAsync=async()=>{if(requests++===0)throw Error('missing');return new Promise<THREE.Texture<HTMLImageElement>>(r=>resolve=r);};
  const owner=new FullAiMaterials(),floor=new THREE.MeshStandardMaterial({map:new THREE.Texture()}),before=floor.map,walls=surfaces();
  try{await owner.start(floor,walls);assert.equal(owner.info.state,'fallback');assert.equal(floor.map,before);for(const w of walls)assert.equal(w.mesh.geometry.attributes.aiSurfaceUv,undefined);
    owner.dispose();const t=new THREE.Texture<HTMLImageElement>();t.addEventListener('dispose',()=>released++);resolve(t);await new Promise(r=>setImmediate(r));assert.equal(released,1);assert.equal(owner.info.state,'disposed');
  }finally{owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
test('art late failure cannot leave registration retaining released meshes or relax external texture rejection',async()=>{
  const original=THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture<HTMLImageElement>();
  const owner=new FullAiMaterials(),floor=new THREE.MeshStandardMaterial();
  try{
    await owner.start(floor,surfaces());
    let calls=0;const scene=new THREE.Scene(),slots=ART_PIECES.map(p=>({id:p.id,position:[0,0,0],fallback:[new THREE.Group()]}));
    const art=new ArtStandards(scene,slots,async p=>{if(++calls===3)throw Error('failed');return loadArt(p);},12000,owner.registerArt);
    await art.start();assert.equal(art.info.state,'fallback');assert.deepEqual(owner.info.authoredIds,[]);assert.equal(scene.children.length,0);
    const bad=new ArtStandards(scene,slots,async p=>{const root=await loadArt(p);root.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.MeshStandardMaterial).map=new THREE.Texture();});return root;},12000,owner.registerArt);
    await bad.start();assert.equal(bad.info.state,'fallback');assert.deepEqual(owner.info.authoredIds,[]);art.dispose();bad.dispose();
  }finally{owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
test('actual View wires full material to ten walls and two visible standards; absent and old sample stay separate',async()=>{
  const {stripTypeScriptTypes}=await import('node:module');
  const url=new URL('../../src/candidates/offline-training-v1/render/scene.ts',import.meta.url);
  let source=await readFile(url,'utf8');const deps:Record<string,unknown>={};
  class Renderer {domElement={clientWidth:960,clientHeight:540};info={memory:{},render:{calls:0}};render(){}setPixelRatio(){}setSize(){}dispose(){}}
  for(const m of source.matchAll(/^import (.*?) from '(.*?)';$/gm)){
    if(m[1]!.startsWith('*')){deps.THREE={...THREE,WebGLRenderer:Renderer};continue;}
    const imported=await import(new URL(m[2]!,url).href);
    for(const name of m[1]!.slice(1,-1).split(',').map(s=>s.trim()).filter(s=>s&&!s.startsWith('type ')))deps[name]=imported[name];
  }
  source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace('export class View','class View'));
  const make=(search:string)=>new Function(...Object.keys(deps),'globalThis','devicePixelRatio',source+'\nreturn View;')(...Object.values(deps),{location:{search}},1);
  const originalFetch=globalThis.fetch,originalTexture=THREE.TextureLoader.prototype.loadAsync;let loads=0;
  globalThis.fetch=(async(input:string)=>new Response(await readFile(new URL(input)))) as typeof fetch;
  THREE.TextureLoader.prototype.loadAsync=async()=>{loads++;return new THREE.Texture<HTMLImageElement>();};
  try{
    const base='?environment=courtyard-v1&art=standards-v1';
    const Default=make(base),defaultView=new Default({});
    for(let i=0;i<100&&defaultView.info.art.state==='loading';i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(defaultView.info.materials,undefined);assert.equal(loads,0);
    const baseline=snapshot(defaultView.scene);defaultView.dispose();
    const Old=make(base+'&materials=ai-courtyard-v1'),oldView=new Old({});
    for(let i=0;i<100&&(oldView.info.art.state==='loading'||oldView.info.materials.state==='loading');i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(oldView.info.materials.scope,'floor-and-left-divider');assert.equal(loads,2);assert.deepEqual(snapshot(oldView.scene),baseline);oldView.dispose();
    const Full=make(base+'&materials=ai-courtyard-full-v1'),full=new Full({});
    for(let i=0;i<100&&(full.info.art.state==='loading'||full.info.materials.state==='loading');i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(full.info.art.state,'ready');assert.equal(full.info.materials.state,'ready');assert.deepEqual(full.info.materials.wallIds,MAP.walls.map(w=>w.id));assert.deepEqual(full.info.materials.authoredIds,['center-dogleg','site-cover']);assert.equal(loads,4);assert.deepEqual(snapshot(full.scene),baseline);
    const {Game}=await import('../../src/candidates/offline-training-v1/sim/game.js');
    const {CAMERAS}=await import('../../src/capture/cameras.js');const game=await Game.create();
    try{const state=game.state,p=state.actors[0]!,hash=game.stateHash;for(const camera of Object.values(CAMERAS)){if(camera.kind!=='fixed')continue;full.render(state,p,p.yaw,p.pitch,2000,0,camera);assert.equal(full.info.art.active,true);assert.equal(full.info.materials.authoredIds.length,2);assert.equal(game.stateHash,hash);}}finally{game.dispose();}
    full.reset();full.dispose();assert.equal(full.info.materials.state,'disposed');
  }finally{globalThis.fetch=originalFetch;THREE.TextureLoader.prototype.loadAsync=originalTexture;}
});
test('second registration failure rolls back the first visible root before releasing all art',async()=>{
  const original=THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture<HTMLImageElement>();
  const owner=new FullAiMaterials(),scene=new THREE.Scene(),slots=ART_PIECES.map(p=>({id:p.id,position:[0,0,0],fallback:[new THREE.Group()]}));
  let first:THREE.Object3D|undefined;
  const art=new ArtStandards(scene,slots,loadArt,12000,(id,root)=>{
    if(id==='site-cover')throw Error('register failure');
    first=root;return owner.registerArt(id,root);
  });
  try{
    await owner.start(new THREE.MeshStandardMaterial(),surfaces());await art.start();
    assert(first);assert.equal(art.info.state,'fallback');assert.equal(scene.children.length,0);
    assert.equal(owner.info.registeredRoots,0);assert.deepEqual(owner.info.authoredCoverage,[]);
    first.traverse(o=>{if(o instanceof THREE.Mesh)assert.equal(o.geometry.attributes.aiSurfaceMask,undefined);});
    assert(slots.every(s=>s.fallback.every(o=>o.visible)));
  }finally{art.dispose();owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
test('late art after timeout cannot register with a live texture owner',async()=>{
  const original=THREE.TextureLoader.prototype.loadAsync;
  THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture<HTMLImageElement>();
  const owner=new FullAiMaterials(),scene=new THREE.Scene(),slots=ART_PIECES.map(p=>({id:p.id,position:[0,0,0],fallback:[new THREE.Group()]}));
  const roots=await Promise.all(ART_PIECES.map(loadArt));let release!:()=>void,calls=0,disposed=0;
  roots[1]!.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>disposed++);});
  const art=new ArtStandards(scene,slots,async()=>{
    const i=calls++;if(i===1)await new Promise<void>(r=>release=r);return roots[i]!;
  },15,owner.registerArt);
  try{
    await owner.start(new THREE.MeshStandardMaterial(),surfaces());const pending=art.start();
    while(!release)await new Promise(r=>setImmediate(r));
    await new Promise(r=>setTimeout(r,30));assert.equal(art.info.state,'fallback');
    release();await pending;
    assert.equal(disposed,1);assert.equal(owner.info.registeredRoots,0);assert.equal(scene.children.length,0);
  }finally{art.dispose();owner.dispose();THREE.TextureLoader.prototype.loadAsync=original;}
});
