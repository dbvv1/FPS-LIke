import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addCourtyardDressing, buildCourtyardDressing, dressingEnabled, DRESSING_WALL_MARGIN, DRESSING_FOLIAGE_MARGIN } from '../../src/candidates/offline-training-v1/render/courtyard-dressing.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';

const HEAD = 1.8;
const track = () => ({ geometry() {}, material() {}, texture() {} });
const meshesOf = (scene: THREE.Scene) => {
  const meshes: THREE.Mesh[] = [];
  scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return meshes;
};
const vertexBounds = (scene: THREE.Scene) => {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
  for (const mesh of meshesOf(scene)) {
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) bounds.expandByPoint(vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
};

test('dressing is opt-in and only valid on the courtyard environment', () => {
  for (const search of ['', '?dressing=courtyard-dressing-v1', '?environment=courtyard-v1', '?environment=courtyard-v1&dressing=other',
    '?environment=courtyard-v1&dressing=courtyard-dressing-v1&dressing=courtyard-dressing-v1']) assert.equal(dressingEnabled(search), false, search);
  assert.equal(dressingEnabled('?environment=courtyard-v1&dressing=courtyard-dressing-v1'), true);
});

test('below head height no dressing mesh stands out in the playable courtyard', () => {
  const scene = new THREE.Scene();
  let geometries = 0;
  buildCourtyardDressing(scene, { geometry() { geometries++; }, material() {}, texture() {} });
  assert.ok(geometries > 0);
  scene.updateMatrixWorld(true);
  // Render space mirrors simulation z.
  const walls = (margin: number) => MAP.walls.map(w => new THREE.Box3(
    new THREE.Vector3(w.center.x - w.half.x, 0, -w.center.z - w.half.z),
    new THREE.Vector3(w.center.x + w.half.x, w.center.y + w.half.y, -w.center.z + w.half.z)).expandByScalar(margin));
  const solid = walls(DRESSING_WALL_MARGIN), foliage = walls(DRESSING_FOLIAGE_MARGIN);
  const interior = new THREE.Box3(new THREE.Vector3(-MAP.bounds.x, 0, -MAP.bounds.z), new THREE.Vector3(MAP.bounds.x, HEAD, MAP.bounds.z));
  const offenders: string[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const bounds = new THREE.Box3().setFromObject(object);
    // Floor aprons and decals (under 15 cm) and overhead structure are walkable.
    if (bounds.max.y < .15 || bounds.min.y > HEAD) return;
    const body = bounds.clone(); body.min.y = Math.max(body.min.y, .15); body.max.y = Math.min(body.max.y, HEAD);
    if (!body.intersectsBox(interior)) return;
    if ((object.userData.foliage ? foliage : solid).some(wall => wall.containsBox(body))) return;
    const c = body.getCenter(new THREE.Vector3());
    offenders.push(`${c.x.toFixed(2)},${(-c.z).toFixed(2)}`);
  });
  assert.deepEqual(offenders, []);
});

test('merged dressing keeps every vertex in place with few draw calls', () => {
  const unmerged = new THREE.Scene();
  const root = buildCourtyardDressing(unmerged, track());
  assert.ok(unmerged.children.includes(root));
  const before = vertexBounds(unmerged);

  const merged = new THREE.Scene();
  addCourtyardDressing(merged, track());
  const meshes = meshesOf(merged);
  assert.ok(meshes.length <= 20, `expected <= 20 merged meshes, got ${meshes.length}`);
  assert.ok(meshes.some(mesh => mesh.userData.foliage === true), 'merged foliage keeps its marker');
  assert.ok(meshes.some(mesh => mesh.customDepthMaterial !== undefined), 'merged foliage keeps its depth material');
  const after = vertexBounds(merged);
  assert.ok(before.min.distanceTo(after.min) < 1e-5, `${before.min.toArray()} != ${after.min.toArray()}`);
  assert.ok(before.max.distanceTo(after.max) < 1e-5, `${before.max.toArray()} != ${after.max.toArray()}`);
});
