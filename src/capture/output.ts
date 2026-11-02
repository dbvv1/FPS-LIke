import { CAPTURE_SIZE } from './cameras.js';

/** Detached drawing buffer: CSS, window size and device DPR never size a shot. */
export function createCaptureCanvas(document: Pick<Document, 'createElement'>) {
  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_SIZE.width; canvas.height = CAPTURE_SIZE.height;
  if (!canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })) throw new Error('Capture requires WebGL2; Canvas2D fallback is disabled');
  return canvas;
}
export function captureOutput(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
  if (canvas.getContext('webgl2') !== gl || gl.isContextLost()) throw new Error('Capture requires an active WebGL2 context');
  if (canvas.width !== CAPTURE_SIZE.width || canvas.height !== CAPTURE_SIZE.height) throw new Error('Capture buffer must be 1280x720');
  gl.finish();
  const pngDataUrl = canvas.toDataURL('image/png');
  if (!pngDataUrl.startsWith('data:image/png;base64,')) throw new Error('Capture PNG encoding failed');
  return { backend: 'webgl2', image: { ...CAPTURE_SIZE, dpr: 1 }, pngDataUrl,
    viewport: { ...CAPTURE_SIZE, pixelRatio: 1, bufferWidth: canvas.width, bufferHeight: canvas.height } };
}
