import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureCanvas, captureOutput } from '../src/capture/output.js';
import { View as LegacyView } from '../src/render/scene.js';
import { View as MovementView } from '../src/candidates/movement-v2/render/scene.js';
import { View as TrainingView } from '../src/candidates/offline-training-v1/render/scene.js';

test('detached capture ignores CSS/window size and exports its actual WebGL2 buffer', () => {
  const requests: string[] = [], gl = { isContextLost: () => false, finish() {} };
  const canvas = { width: 0, height: 0, clientWidth: 317, clientHeight: 233,
    getContext(type: string) { requests.push(type); return type === 'webgl2' ? gl : null; },
    toDataURL(type: string) { assert.equal(type, 'image/png'); return 'data:image/png;base64,AA=='; } };
  const document = { createElement(tag: string) { assert.equal(tag, 'canvas'); return canvas; } };
  const output = createCaptureCanvas(document as unknown as Document);
  const result = captureOutput(output, gl as unknown as WebGL2RenderingContext);
  assert.deepEqual(result.image, { width: 1280, height: 720, dpr: 1 }); assert.equal(result.backend, 'webgl2');
  assert.equal(result.pngDataUrl, 'data:image/png;base64,AA=='); assert.ok(requests.every(r => r === 'webgl2'));
  canvas.width = 317; assert.throws(() => captureOutput(output, gl as unknown as WebGL2RenderingContext), /1280x720/);
});
test('missing or lost WebGL2 fails without requesting Canvas2D or producing PNG', () => {
  const requests: string[] = [];
  const canvas = { width: 1280, height: 720, getContext(type: string) { requests.push(type); return null; }, toDataURL() { throw Error('must not encode'); } };
  assert.throws(() => createCaptureCanvas({createElement: () => canvas} as unknown as Document), /WebGL2/);
  assert.deepEqual(requests, ['webgl2']);
  const gl = { isContextLost: () => true }; canvas.getContext = () => gl as never;
  assert.throws(() => captureOutput(canvas as unknown as HTMLCanvasElement, gl as WebGL2RenderingContext), /WebGL2/);
});
for (const View of [LegacyView, MovementView, TrainingView]) test(View.name + ' actual resize keeps capture dimensions and ordinary CSS sizing', () => {
  const canvas = {clientWidth: 317, clientHeight: 233}, sizes: number[][] = [];
  const view = Object.create(View.prototype);
  view.renderer = {domElement: canvas, setSize: (...size: number[]) => sizes.push(size), getPixelRatio: () => 1};
  view.camera = {aspect: 0, updateProjectionMatrix() {}};
  view.captureSize = {width:1280,height:720}; view.resize();
  assert.deepEqual(sizes[0]!.slice(0,2), [1280,720]); assert.equal(view.camera.aspect,1280/720);
  canvas.clientWidth=900; canvas.clientHeight=500; view.resize();assert.deepEqual(sizes[1]!.slice(0,2),[1280,720]);
  view.captureSize=undefined;view.resize();assert.deepEqual(sizes[2]!.slice(0,2),[900,500]);
});
