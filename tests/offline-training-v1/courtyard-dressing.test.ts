import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addCourtyardDressing, dressingEnabled, DRESSING_WALL_MARGIN, DRESSING_FOLIAGE_MARGIN } from '../../src/candidates/offline-training-v1/render/courtyard-dressing.js';
import { MAP } from '../../src/candidates/offline-training-v1/content/map.js';

const HEAD = 1.8;

test('dressing is opt-in and only valid on the courtyard environment', () => {
  for (const search of ['', '?dressing=courtyard-dressing-v1', '?environment=courtyard-v1', '?environment=courtyard-v1&dressing=other',
    '?environment=courtyard-v1&dressing=courtyard-dressing-v1&dressing=courtyard-dressing-v1']) assert.equal(dressingEnabled(search), false, search);
  assert.equal(dressingEnabled('?environment=courtyard-v1&dressing=courtyard-dressing-v1'), true);
});

test('below head height no dressing mesh stands out in the playable courtyard', () => {
  const scene = new THREE.Scene();
  let geometries = 0;
  addCourtyardDressing(scene, { geometry() { geometries++; }, material() {}, texture() {} });
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
