import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { actorFacing, cameraPose, toThree } from '../src/render/coordinates.js';
import { targetTriangles, targetVertices, targetColor } from '../src/render/target.js';
import { CanvasView } from '../src/render/canvas.js';
import { Game } from '../src/sim/game.js';
import { eye } from '../src/sim/physics.js';
import type { Vec3 } from '../src/sim/types.js';
const camera = () => new PerspectiveCamera(80, 640 / 360, 0.05, 100);
function project(c: PerspectiveCamera, point: Vec3) { c.updateMatrixWorld(true); return new Vector3(...toThree(point)).project(c); }
test('Three projection agrees with simulation right/forward/up at all yaw quadrants', () => {
  const c = camera(), position = { x: 2, y: 1.62, z: -4 };
  for (const yaw of [0, 0.3, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    cameraPose(c, position, yaw, 0);
    const center = { x: position.x + Math.sin(yaw) * 4, y: position.y, z: position.z + Math.cos(yaw) * 4 };
    const right = { x: center.x + Math.cos(yaw), y: center.y, z: center.z - Math.sin(yaw) };
    assert.ok(Math.abs(project(c, center).x) < 1e-12);
    assert.ok(project(c, right).x > 0, 'the exact KeyD direction projects to screen right');
    cameraPose(c, position, yaw + 0.1, 0);
    assert.ok(project(c, center).x < 0, 'positive mouse yaw turns right, moving the old center left');
    cameraPose(c, position, yaw, 0.1);
    assert.ok(project(c, center).y < 0, 'looking up moves the old center down');
    cameraPose(c, { x: position.x + Math.cos(yaw), y: position.y, z: position.z - Math.sin(yaw) }, yaw, 0);
    assert.ok(project(c, center).x < 0, 'strafing right moves stationary scenery left');
  }
});
test('Three center ray and actor facing match the simulation after the coordinate boundary', () => {
  const c = camera(), model = new Object3D(), position = { x: -3, y: 1.62, z: 7 };
  for (const yaw of [0, 0.7, Math.PI, -2]) for (const pitch of [-0.8, 0, 0.5]) {
    cameraPose(c, position, yaw, pitch); c.updateMatrixWorld(true);
    const actual = c.getWorldDirection(new Vector3());
    const expected = new Vector3(...toThree({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }));
    assert.ok(actual.distanceTo(expected) < 1e-12);
    model.rotation.y = actorFacing(yaw); model.updateMatrixWorld(true);
    const facing = new Vector3(0, 0, 1).transformDirection(model.matrixWorld);
    assert.ok(facing.distanceTo(new Vector3(Math.sin(yaw), 0, -Math.cos(yaw))) < 1e-12);
  }
});
test('actual Canvas actor columns and actual Three projection agree on horizontal location', async () => {
  const columns: number[] = [];
  const context = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect(x: number) { if (this.fillStyle === '#c46d4e') columns.push(x + 1); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, fillText() {}, clearRect() {},
  };
  const canvas = { clientWidth: 640, clientHeight: 360, width: 0, height: 0, getContext: () => context };
  const game = await Game.create(1), view = new CanvasView(canvas as unknown as HTMLCanvasElement), c = camera();
  try {
    const state = game.state, player = state.actors.find(a => a.side === 'attack')!, enemy = state.actors.find(a => a.side === 'defend')!;
    enemy.position = { x: 1, y: 0, z: -10 };
    for (const yaw of [-0.2, 0, 0.2]) {
      columns.length = 0; view.render(state, player, yaw, 0, 0, 0);
      assert.ok(columns.length > 0); cameraPose(c, eye(player), yaw, 0);
      // The source pose is asymmetric: compare actual cloth geometry, not the
      // old box's actor-center proxy. Keep the same two-pixel raster tolerance.
      const vertices = targetVertices(enemy, 0);
      const projected = targetTriangles.filter(f => targetColor(f.color, false) === 0xc46d4e).flatMap(f => f.indices.map(i => {
        const [x,y,z] = vertices[i]!; return (project(c, {x,y,z}).x + 1) * 320;
      }));
      for (const extent of [Math.min, Math.max]) {
        const cpu = extent(...columns), three = extent(...projected);
        assert.ok(Math.abs(cpu - three) <= 2, `Canvas ${cpu} and actual Three cloth extent ${three} agree`);
      }
    }
  } finally { view.dispose(); game.dispose(); }
});
