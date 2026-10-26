import { init, importNavMesh, NavMeshQuery, type NavMesh } from 'recast-navigation';
import baked from '../content/navigation.json';
import { MAP } from '../content/map.js';
import { hash } from './math.js';
import type { Vec3 } from './types.js';
let initialization: Promise<void> | undefined;
export const initNavigation = () => initialization ??= init();
export class Navigation {
  private mesh: NavMesh;
  private query: NavMeshQuery;
  constructor() {
    if (baked.mapHash !== hash(MAP)) throw new Error('Navigation is stale: run npm run bake-nav');
    this.mesh = importNavMesh(new Uint8Array(baked.bytes)).navMesh;
    this.query = new NavMeshQuery(this.mesh);
  }
  path(from: Vec3, to: Vec3): Vec3[] {
    const result = this.query.computePath(from, to);
    return result.success ? result.path.map(p => ({ x: p.x, y: 0, z: p.z })) : [];
  }
  dispose() { this.query.destroy(); this.mesh.destroy(); }
}
