import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';
import { KIT, environmentEnabled, faceMetres, surfaceColor, wallAtlas, floorPixels, makeKitWall, kitBudget } from '../../src/candidates/offline-training-v1/render/environment-kit.js';

test('environment is explicit opt-in only, repeated or unknown values stay default', () => {
  for (const search of ['', '?environment=other', '?environment=courtyard-v1&environment=courtyard-v1']) assert.equal(environmentEnabled(search), false);
  assert.equal(environmentEnabled('?environment=courtyard-v1'), true);
  assert.equal(environmentEnabled('?contentSet=characters-v1&environment=courtyard-v1'), true);
});
test('all ten pieces retain exact collision silhouettes, oriented triangle set and transform', () => {
  const before = JSON.stringify(MAP);
  for (const wall of MAP.walls) {
    const piece = makeKitWall(wall), reference = new BoxGeometry(wall.half.x * 2, wall.half.y * 2, wall.half.z * 2);
    try {
      for (const key of ['position','normal']) assert.deepEqual(piece.geometry.getAttribute(key).array, reference.getAttribute(key).array);
      const original=Array.from(reference.index!.array);
      const defaultIndices=[...original.slice(0,12),...original.slice(18),...original.slice(12,18)];
      const triangles=(indices:ArrayLike<number>)=>Array.from({length:indices.length/3},(_,i)=>[indices[i*3],indices[i*3+1],indices[i*3+2]].join(',')).sort();
      assert.deepEqual(triangles(piece.geometry.index!.array),triangles(defaultIndices));
      assert.notDeepEqual(Array.from(piece.geometry.index!.array),defaultIndices);
      assert.deepEqual(piece.mesh.position.toArray(), [wall.center.x,wall.center.y,-wall.center.z]);
      assert.equal(piece.geometry.groups.length, 0); assert.equal(piece.geometry.index!.count, 36);
      assert.equal(piece.material.normalMap, null); assert.equal(piece.material.displacementMap, null);
      assert.equal(piece.material.transparent, false); assert.equal(piece.material.roughness,.91);
      const uv = piece.geometry.getAttribute('uv');
      for(let face=0;face<6;face++)for(let j=0;j<4;j++) {
        const i=face*4+j,x=uv.getX(i)*KIT.atlasWidth,y=uv.getY(i)*KIT.atlasHeight;
        assert.ok(x > face%4*128+2 && x < face%4*128+126);
        assert.ok(y > (face>>2)*128+2 && y < (face>>2)*128+126);
      }
    } finally {piece.geometry.dispose();piece.material.dispose();piece.texture.dispose();reference.dispose();}
  }
  assert.equal(JSON.stringify(MAP),before);
});
test('six face recipes use metre spans including independent horizontal caps, never vertical strip stretching',()=>{
  for(const wall of MAP.walls) {
    assert.deepEqual(faceMetres(wall,0),[wall.half.z*2,wall.half.y*2]);
    assert.deepEqual(faceMetres(wall,2),[wall.half.x*2,wall.half.z*2]);
    assert.deepEqual(faceMetres(wall,4),[wall.half.x*2,wall.half.y*2]);
    assert.equal(surfaceColor(wall,2,.5,.5),KIT.base);
    assert.equal(surfaceColor(wall,2,0,.5),KIT.trim);
    const atlas=wallAtlas(wall);
    assert.equal(atlas.length,512*256*4);assert.deepEqual(atlas,wallAtlas(wall));
    for(let i=3;i<atlas.length;i+=4)assert.equal(atlas[i],255);
  }
});
test('panel joins preserve metre spacing across differently sized faces',()=>{
  const wall=MAP.walls.find(w=>w.id==='north')!;
  for(const face of [0,4]) {
    const [width,height]=faceMetres(wall,face);
    if(width>4) {
      assert.equal(surfaceColor(wall,face,2.02/width,1.7/height),KIT.seam);
      assert.equal(surfaceColor(wall,face,4.02/width,1.7/height),KIT.seam);
      assert.equal(surfaceColor(wall,face,2.5/width,1.7/height),KIT.plaster);
    }
  }
});
test('offline budget is bounded and floor is a reproducible two-metre slab family',()=>{
  const budget=kitBudget(MAP.walls.length);
  assert.equal(budget.wallDraws,10);assert.equal(budget.wallTriangles,120);assert.equal(budget.extraPasses,0);
  assert.equal(budget.rgbaBytes,5505024);assert.ok(budget.rgbaBytes<8*1024*1024);
  assert.deepEqual(floorPixels(),floorPixels());assert.equal(floorPixels().length,256*256*4);
});

test('actual View construction owns kit resources; active requires a completed render and clears on failure/reset/dispose', async()=>{
  const THREE=await import('three');
  const {readFileSync}=await import('node:fs');
  const {stripTypeScriptTypes}=await import('node:module');
  const art=await import('../../src/candidates/offline-training-v1/render/art-standards.js');
  const kit=await import('../../src/candidates/offline-training-v1/render/environment-kit.js');
  const ground=await import('../../src/candidates/offline-training-v1/render/ground.js');
  const yard=await import('../../src/candidates/offline-training-v1/render/yard.js');
  const feedback=await import('../../src/candidates/offline-training-v1/render/feedback.js');
  const target=await import('../../src/candidates/offline-training-v1/render/target.js');
  const physics=await import('../../src/candidates/offline-training-v1/sim/physics.js');
  const weapon=await import('../../src/candidates/offline-training-v1/render/weapon.js');
  const coordinates=await import('../../src/candidates/offline-training-v1/render/coordinates.js');
  const {Game}=await import('../../src/candidates/offline-training-v1/sim/game.js');
  let throwRender=false,disposed=0;
  class Renderer {
    domElement={clientWidth:640,clientHeight:360};info={memory:{},render:{calls:0}};
    setPixelRatio(){}setSize(){}render(){if(throwRender)throw new Error('render fixture');}dispose(){disposed++;}
  }
  const source=stripTypeScriptTypes(readFileSync(new URL('../../src/candidates/offline-training-v1/render/scene.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class View','class View'));
  const deps={THREE:{...THREE,WebGLRenderer:Renderer},...art,...kit,...ground,...yard,...feedback,...target,...physics,...weapon,...coordinates,MAP,devicePixelRatio:1,globalThis:{location:{search:'?environment=courtyard-v1'}}};
  const View=new Function(...Object.keys(deps),`${source};return View;`)(...Object.values(deps));
  const view=new View({}),events={geometry:0,material:0,texture:0};
  const watched=new Set();
  const watch=()=>{for(const [key,set] of [['geometry',view.geometries],['material',view.materials],['texture',view.textures]] as const)
    for(const item of set)if(!watched.has(item)){watched.add(item);item.addEventListener('dispose',()=>events[key]++);}};
  watch();
  assert.equal(view.info.environment.active,false);assert.equal(view.textures.size,11);
  assert.equal(view.scene.children.filter((o:{geometry?:{type:string}})=>o.geometry?.type==='BoxGeometry').length>10,true);
  const game=await Game.create(1);
  try {
    view.render(game.state,game.state.actors[0],0,0,0,0);assert.equal(view.info.environment.active,true);
    throwRender=true;assert.throws(()=>view.render(game.state,game.state.actors[0],0,0,0,0),/render fixture/);assert.equal(view.info.environment.active,false);
    throwRender=false;view.render(game.state,game.state.actors[0],0,0,0,0);view.reset();assert.equal(view.info.environment.active,false);
  }finally{watch();game.dispose();view.dispose();}
  assert.equal(disposed,1);assert.equal(events.texture,11);assert.equal(events.geometry,view.geometries.size);assert.equal(events.material,view.materials.size);
  assert.equal(view.info.environment.active,false);
});
