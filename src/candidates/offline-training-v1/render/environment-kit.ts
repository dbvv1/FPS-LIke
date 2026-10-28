import * as THREE from 'three';
import type { Box } from '../content/map.js';

// Original, editable surface recipe. Marks are paint, never openings or normal maps.
export const KIT = Object.freeze({ id: 'courtyard-v1', atlasWidth: 512, atlasHeight: 256, tile: 128, gutter: 2,
  plaster: 0xd8d5c5, base: 0x526e78, trim: 0xc2c6bd, orange: 0xcc9552,
  seam: 0x82928f, recess: 0x6d8588, floor: 0xa6b0a6, sky: 0x99b8c7 });
export function environmentEnabled(search: string) {
  const values = new URLSearchParams(search).getAll('environment');
  return values.length === 1 && values[0] === KIT.id;
}
// BoxGeometry face order: +X,-X,+Y,-Y,+Z,-Z. Z has already crossed the render boundary.
export function faceMetres(wall: Box, face: number): readonly [number, number] {
  if (face < 2) return [wall.half.z * 2, wall.half.y * 2];
  if (face < 4) return [wall.half.x * 2, wall.half.z * 2];
  return [wall.half.x * 2, wall.half.y * 2];
}
const phase = (n: number, span: number) => ((n % span) + span) % span;
export function surfaceColor(wall: Box, face: number, u: number, v: number) {
  const [width, height] = faceMetres(wall, face);
  const x = u * width, y = v * height;
  // Caps get their own metre-space sample, never a stretched vertical wall band.
  if (face === 2 || face === 3) {
    const edge = Math.min(x, width - x, y, height - y);
    return edge < .08 ? KIT.trim : KIT.base;
  }
  const cover = wall.id.endsWith('-cover');
  const plinth = Math.min(.68, height * .28);
  if (y < .09) return KIT.recess;
  if (y > height - .10) return KIT.trim;
  if (y < plinth) return KIT.base;
  if (y < plinth + .07) return KIT.orange;
  // Every wall is assembled from 2 m panels. Broad, quiet joins survive minification.
  const seam = phase(x, 2);
  if (seam < .07 || seam > 1.95) return KIT.seam;
  if (seam < .13) return KIT.trim;
  // Flush service band: painted grooves, NOT geometry holes, cover or collision.
  if (!cover && y > height - .44 && y < height - .30) return KIT.base;
  // One broad, inset-looking inspection panel per 4 m bay, below eye-level.
  const bay = phase(x, 4);
  if (!cover && bay > .28 && bay < 1.08 && y > plinth + .22 && y < plinth + .68) {
    if (bay < .34 || bay > 1.02 || y < plinth + .28 || y > plinth + .62) return KIT.trim;
    return phase(y, .14) < .055 ? KIT.recess : KIT.base;
  }
  return cover ? 0x9aaba8 : KIT.plaster;
}
function rgba(color: number, target: Uint8Array, i: number) {
  target[i] = color >> 16 & 255; target[i + 1] = color >> 8 & 255; target[i + 2] = color & 255; target[i + 3] = 255;
}
export function wallAtlas(wall: Box) {
  const pixels = new Uint8Array(KIT.atlasWidth * KIT.atlasHeight * 4);
  for (let i = 0; i < pixels.length; i += 4) rgba(KIT.trim, pixels, i);
  const interior = KIT.tile - KIT.gutter * 2;
  for (let face = 0; face < 6; face++) for (let y = 0; y < KIT.tile; y++) for (let x = 0; x < KIT.tile; x++) {
    const u = (Math.max(0, Math.min(interior - 1, x - KIT.gutter)) + .5) / interior;
    const v = (Math.max(0, Math.min(interior - 1, y - KIT.gutter)) + .5) / interior;
    const offset = (((face >> 2) * KIT.tile + y) * KIT.atlasWidth + (face % 4) * KIT.tile + x) * 4;
    rgba(surfaceColor(wall, face, u, v), pixels, offset);
  }
  return pixels;
}
export function floorPixels(size = 256) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const mx = (x + .5) / size * 4, mz = (y + .5) / size * 4;
    const seam = phase(mx, 2) < .035 || phase(mz, 2) < .035;
    rgba(seam ? 0x8e9d97 : KIT.floor, pixels, (y * size + x) * 4);
  }
  return pixels;
}
export function kitTexture(data: Uint8Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  // No mip atlas cross-face bleeding. All faces use broad low-frequency patterns.
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export function makeKitWall(wall: Box) {
  const geometry = new THREE.BoxGeometry(wall.half.x * 2, wall.half.y * 2, wall.half.z * 2);
  const uv = geometry.getAttribute('uv');
  const interior = KIT.tile - KIT.gutter * 2;
  for (let face = 0; face < 6; face++) for (let vertex = 0; vertex < 4; vertex++) {
    const i = face * 4 + vertex;
    uv.setXY(i, ((face % 4) * KIT.tile + KIT.gutter + .5 + uv.getX(i) * (interior - 1)) / KIT.atlasWidth,
      ((face >> 2) * KIT.tile + KIT.gutter + .5 + uv.getY(i) * (interior - 1)) / KIT.atlasHeight);
  }
  uv.needsUpdate = true; geometry.clearGroups(); // One native-order indexed draw; same triangles as the default reordered face groups.
  const texture = kitTexture(wallAtlas(wall), KIT.atlasWidth, KIT.atlasHeight);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .91, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wall.center.x, wall.center.y, -wall.center.z);
  return { mesh, geometry, material, texture };
}
export function kitBudget(wallCount: number) {
  return { wallTriangles: wallCount * 12, wallDraws: wallCount,
    rgbaBytes: wallCount * KIT.atlasWidth * KIT.atlasHeight * 4 + 256 * 256 * 4, extraPasses: 0 };
}
