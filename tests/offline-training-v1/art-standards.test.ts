import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ART_PIECES, ArtStandards, artEnabled } from '../../src/candidates/offline-training-v1/render/art-standards.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';
const read = async (piece: typeof ART_PIECES[number]) => {
  const b = await readFile(new URL(piece.url));
  assert.equal(b.byteLength, piece.bytes);
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
};
function setup(load: (piece: typeof ART_PIECES[number], signal: AbortSignal) => Promise<THREE.Object3D> = read, timeout = 12000) {
  const scene = new THREE.Scene();
  const slots = ART_PIECES.map((p, i) => ({ id: p.id, position: [i, 0, -i], fallback: [new THREE.Group()] }));
  for (const slot of slots) scene.add(...slot.fallback);
  return { scene, slots, art: new ArtStandards(scene, slots, load, timeout) };
}
test('explicit art and courtyard opt-in; absent, malformed, duplicate stay old', () => {
  for (const s of ['', '?art=standards-v1', '?environment=courtyard-v1', '?environment=courtyard-v1&art=x', '?environment=courtyard-v1&art=standards-v1&art=standards-v1']) assert.equal(artEnabled(s), false);
  assert.equal(artEnabled('?environment=courtyard-v1&art=standards-v1'), true);
});
test('real three GLBs consume exact budget and install only after complete; twice dispose is safe', async () => {
  const before = JSON.stringify(MAP), { art, scene, slots } = setup();
  assert.ok(slots.every(s => s.fallback[0]!.visible));
  await art.start(); await art.start();
  assert.equal(art.info.state, 'ready'); assert.equal(art.info.pieces, 3);
  assert.deepEqual(art.info.budget, { triangles: 2396, calls: 4, bytes: 123604 });
  assert.equal(scene.children.length, 6); assert.ok(slots.every(s => !s.fallback[0]!.visible));
  for (let i = 0; i < 3; i++) assert.deepEqual(scene.children[i + 3]!.position.toArray(), slots[i]!.position);
  let geometryDisposals = 0, materialDisposals = 0;
  for (const root of scene.children.slice(3)) root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.addEventListener('dispose', () => geometryDisposals++); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.addEventListener('dispose', () => materialDisposals++); } });
  art.dispose(); art.dispose();
  assert.equal(geometryDisposals, 4); assert.equal(materialDisposals, 4);
  assert.equal(scene.children.length, 3); assert.ok(slots.every(s => s.fallback[0]!.visible));
  assert.equal(JSON.stringify(MAP), before);
});
test('second asset error rolls back loaded first; original objects never hidden', async () => {
  let loads = 0, disposed = 0;
  const { art, scene, slots } = setup(async p => {
    if (++loads === 2) throw Error('network');
    const r = await read(p); r.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => disposed++); }); return r;
  });
  await art.start(); assert.equal(art.info.state, 'fallback'); assert.equal(disposed, 1);
  assert.equal(scene.children.length, 3); assert.ok(slots.every(s => s.fallback[0]!.visible));
});
test('late asset after dispose is released and never attached', async () => {
  let done!: (root: THREE.Object3D) => void;
  const r = await read(ART_PIECES[0]); let disposed = 0;
  r.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => disposed++); });
  const { art, scene } = setup(() => new Promise(resolve => { done = resolve; }));
  const pending = art.start(); art.dispose(); done(r); await pending;
  assert.equal(art.info.state, 'disposed'); assert.equal(disposed, 1); assert.equal(scene.children.length, 3);
});
test('timeout retains originals and rejects a late success', async () => {
  let done!: (root: THREE.Object3D) => void;
  const { art, scene, slots } = setup(() => new Promise(resolve => { done = resolve; }), 5);
  const pending = art.start(); await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(art.info.state, 'fallback'); assert.ok(slots.every(s => s.fallback[0]!.visible));
  done(await read(ART_PIECES[0])); await pending; assert.equal(scene.children.length, 3);
});
test('wrong dimensions fail closed and missing destination slots cannot partially replace', async () => {
  const invalid = setup(async p => { const r = await read(p); r.scale.setScalar(2); return r; });
  await invalid.art.start(); assert.equal(invalid.art.info.state, 'fallback');
  const scene = new THREE.Scene(), art = new ArtStandards(scene, [], read);
  await art.start(); assert.equal(art.info.state, 'fallback'); assert.equal(scene.children.length, 0);
});
test('actual View consumer ties only two map IDs and one existing lamp, owns shutdown', async () => {
  const source = await readFile(new URL('../../src/candidates/offline-training-v1/render/scene.ts', import.meta.url), 'utf8');
  assert.match(source, /wall\.id === 'center-dogleg' \|\| wall\.id === 'site-cover'/);
  assert.match(source, /y: wall\.center\.y - wall\.half\.y/);
  assert.match(source, /x === -11\.5 && z === -13/);
  assert.match(source, /if \(artEnabled\(globalThis\.location\?\.search \?\? ''\)\)/);
  assert.match(source, /dispose\(\) \{ this\.artPresented=false; this\.art\?\.dispose\(\)/);
});

test('actual View constructor installs exact world slots, leaves other five lamps and map intact, releases on shutdown', async () => {
  const { stripTypeScriptTypes } = await import('node:module');
  const url = new URL('../../src/candidates/offline-training-v1/render/scene.ts', import.meta.url);
  let source = await readFile(url, 'utf8');
  const deps: Record<string, unknown> = {};
  class Renderer {
    domElement = { clientWidth: 1365, clientHeight: 900 };
    info = { memory: {}, render: { calls: 0 } }; outputColorSpace = ''; disposed = false;
    setPixelRatio() {} setSize() {} dispose() { this.disposed = true; }
  }
  for (const m of source.matchAll(/^import (.*?) from '(.*?)';$/gm)) {
    if (m[1]!.startsWith('*')) { deps.THREE = { ...THREE, WebGLRenderer: Renderer }; continue; }
    const imported = await import(new URL(m[2]!, url).href);
    for (const name of m[1]!.slice(1, -1).split(',').map(s => s.trim()).filter(s => s && !s.startsWith('type '))) deps[name] = imported[name];
  }
  source = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace('export class View', 'class View'));
  const make = (search: string) => new Function(...Object.keys(deps), 'globalThis', 'devicePixelRatio', source + '\nreturn View;')(...Object.values(deps), { location: { search } }, 1);
  const previousFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = (async (input: string) => { requests++; return new Response(await readFile(new URL(input))); }) as typeof fetch;
  const before = JSON.stringify(MAP);
  try {
    const Default = make(''), defaultView = new Default({}); defaultView.dispose(); assert.equal(requests, 0);
    const Current = make('?environment=courtyard-v1'), currentView = new Current({}); currentView.dispose(); assert.equal(requests, 0);
    const Candidate = make('?environment=courtyard-v1&art=standards-v1'), view = new Candidate({});
    for (let i = 0; i < 100 && view.info.art.state === 'loading'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(view.info.art.state, 'ready'); assert.equal(requests, 3);
    assert.equal(view.artSlots.length, 3);
    for (const slot of view.artSlots) {
      if (slot.id === 'lamp-existing') assert.deepEqual(slot.position, [-11.5, 0, 13]);
      else { const w = MAP.walls.find(w => w.id === slot.id)!; assert.deepEqual(slot.position, [w.center.x, w.center.y - w.half.y, -w.center.z]); }
      assert.ok(slot.fallback.every((o: THREE.Object3D) => !o.visible));
    }
    const unchangedHeads = view.scene.children.filter((o: THREE.Object3D) => o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry && Math.abs(o.geometry.parameters.width - .8) < 1e-8 && o.visible);
    assert.equal(unchangedHeads.length, 5);
    view.dispose(); assert.equal(view.info.art.state, 'disposed'); assert.equal(view.renderer.disposed, true);
    assert.equal(JSON.stringify(MAP), before);
  } finally { globalThis.fetch = previousFetch; }
});

test('timeout during second load immediately frees first asset and clears live geometry budget', async () => {
  let done!: (root: THREE.Object3D) => void, count = 0, disposals = 0;
  const first = await read(ART_PIECES[0]);
  first.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => disposals++); });
  const { art } = setup(async () => ++count === 1 ? first : await new Promise<THREE.Object3D>(resolve => { done = resolve; }), 10);
  const pending = art.start(); await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(count, 2); assert.equal(art.info.state, 'fallback'); assert.equal(disposals, 1);
  assert.deepEqual(art.info.budget, { triangles: 0, calls: 0, bytes: 123604 });
  done(await read(ART_PIECES[1])); await pending; assert.equal(disposals, 1);
});
