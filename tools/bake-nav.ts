import { writeFileSync } from 'node:fs';
import { init, exportNavMesh, NavMeshQuery } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';
import { MAP } from '../src/content/map.js';
import { hash } from '../src/sim/math.js';
await init();
const positions: number[] = [], indices: number[] = [];
const cell = 0.25;
for (let x = -MAP.bounds.x; x < MAP.bounds.x; x += cell) {
  for (let z = -MAP.bounds.z; z < MAP.bounds.z; z += cell) {
    if (MAP.walls.some(w => Math.abs(x + cell / 2 - w.center.x) < w.half.x + cell / 2 && Math.abs(z + cell / 2 - w.center.z) < w.half.z + cell / 2)) continue;
    const n = positions.length / 3;
    positions.push(x, 0, z, x, 0, z + cell, x + cell, 0, z + cell, x + cell, 0, z);
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
}
const result = generateSoloNavMesh(positions, indices, {
  cs: 0.2, ch: 0.1, walkableHeight: 18, walkableClimb: 2, walkableRadius: 2,
  minRegionArea: 8, mergeRegionArea: 20, maxSimplificationError: 0.5,
});
if (!result.success) throw new Error(result.error);
const query = new NavMeshQuery(result.navMesh);
for (const route of MAP.routes) {
  let start = MAP.spawns.attack;
  for (const end of route) {
    const path = query.computePath(start, end);
    if (!path.success || path.path.length < 2) throw new Error('Unreachable route in baked navigation');
    start = end;
  }
}
const data = { mapHash: hash(MAP), generator: 'recast-navigation@0.43.1', bytes: [...exportNavMesh(result.navMesh)] };
writeFileSync(new URL('../src/content/navigation.json', import.meta.url), JSON.stringify(data) + '\n');
query.destroy(); result.navMesh.destroy();
console.log(`Baked ${data.bytes.length} bytes; all three routes reach the site.`);
