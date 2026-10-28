import { freeze } from './freeze.js';
import type { Vec3 } from '../sim/types.js';
export type Box = { id: string; center: Vec3; half: Vec3 };
// Original compact courtyard: two long dividers create three attack routes.
export const MAP = freeze({
  id: 'relay-yard-v1',
  bounds: { x: 13, z: 18 },
  site: { x: 0, y: 0, z: 10 }, siteRadius: 2,
  spawns: { attack: { x: 0, y: 0, z: -14 }, defend: { x: 0, y: 0, z: 14 } },
  routes: [-8, 0, 8].map(x => [{ x, y: 0, z: -10 }, { x, y: 0, z: 8 }, { x: 0, y: 0, z: 10 }]),
  walls: [
    { id: 'west', center: { x: -13.5, y: 2, z: 0 }, half: { x: 0.5, y: 2, z: 18.5 } },
    { id: 'east', center: { x: 13.5, y: 2, z: 0 }, half: { x: 0.5, y: 2, z: 18.5 } },
    { id: 'south', center: { x: 0, y: 2, z: -18.5 }, half: { x: 13, y: 2, z: 0.5 } },
    { id: 'north', center: { x: 0, y: 2, z: 18.5 }, half: { x: 13, y: 2, z: 0.5 } },
    { id: 'left-divider', center: { x: -4, y: 1.7, z: -1 }, half: { x: 0.6, y: 1.7, z: 8 } },
    { id: 'right-divider', center: { x: 4, y: 1.7, z: -1 }, half: { x: 0.6, y: 1.7, z: 8 } },
    { id: 'west-cover', center: { x: -9.7, y: 1.2, z: -2 }, half: { x: 2.2, y: 1.2, z: 0.6 } },
    { id: 'east-cover', center: { x: 9.7, y: 1.2, z: 1 }, half: { x: 2.2, y: 1.2, z: 0.6 } },
    { id: 'center-dogleg', center: { x: 0, y: 1.7, z: -6 }, half: { x: 1.1, y: 1.7, z: 0.6 } },
    { id: 'site-cover', center: { x: 0, y: 0.4, z: 12.6 }, half: { x: 1.1, y: 0.4, z: 0.55 } },
  ] satisfies Box[],
});
