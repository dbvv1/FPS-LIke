import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

/** Courtyard-facing wall planes, in render space. Kept off the simulation boxes. */
export type CourtyardFace = {
  id: string; center: THREE.Vector3; normal: THREE.Vector3;
  width: number; height: number; rotationY: number;
};
export function courtyardFaces(walls: readonly Box[]): CourtyardFace[] {
  const byId = new Map(walls.map(wall => [wall.id, wall]));
  const faces: CourtyardFace[] = [];
  const add = (id: string, wall: Box, normal: readonly [number, number, number], center: readonly [number, number, number], width: number) => {
    const n = new THREE.Vector3(...normal);
    faces.push({ id, center: new THREE.Vector3(...center).addScaledVector(n, .014), normal: n, width, height: wall.half.y * 2,
      rotationY: Math.atan2(n.x, n.z) });
  };
  const west = byId.get('west'), east = byId.get('east'), north = byId.get('north'), south = byId.get('south');
  // Boundary faces sit on the courtyard side of the collision box: +X for the
  // west wall and -X for the east wall, not their outer faces.
  if (west) add('west', west, [1, 0, 0], [west.center.x + west.half.x, west.center.y, -west.center.z], west.half.z * 2);
  if (east) add('east', east, [-1, 0, 0], [east.center.x - east.half.x, east.center.y, -east.center.z], east.half.z * 2);
  if (north) add('north', north, [0, 0, 1], [north.center.x, north.center.y, -north.center.z + north.half.z], north.half.x * 2);
  if (south) add('south', south, [0, 0, -1], [south.center.x, south.center.y, -south.center.z - south.half.z], south.half.x * 2);
  for (const wall of walls) {
    if (!wall.id.endsWith('divider')) continue;
    add(`${wall.id}-east`, wall, [1, 0, 0], [wall.center.x + wall.half.x, wall.center.y, -wall.center.z], wall.half.z * 2);
    add(`${wall.id}-west`, wall, [-1, 0, 0], [wall.center.x - wall.half.x, wall.center.y, -wall.center.z], wall.half.z * 2);
  }
  return faces;
}

/** One canvas band: dark rain wash with an uneven, streaked top edge.
 *  Authored for a ~0.6 m wall-foot plane, so the soil line sits low and the
 *  upper edge breaks into individual runs instead of a painted straight stripe. */
export function createWallGrime() {
  if (typeof document === 'undefined') return null;
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const top = new Array<number>(size + 1);
  for (let x = 0; x <= size; x++) {
    const wave = Math.sin(x * .047) * 14 + Math.sin(x * .013 + 1.7) * 24 + Math.sin(x * .19) * 5;
    top[x] = 96 + wave;
  }
  context.beginPath(); context.moveTo(0, size);
  for (let x = 0; x <= size; x++) context.lineTo(x, top[x]!);
  context.lineTo(size, size); context.closePath();
  const wash = context.createLinearGradient(0, 76, 0, size);
  wash.addColorStop(0, 'rgba(74,84,72,.07)');
  wash.addColorStop(.30, 'rgba(66,76,66,.36)');
  wash.addColorStop(.68, 'rgba(47,58,51,.62)');
  wash.addColorStop(1, 'rgba(32,43,38,.82)');
  context.fillStyle = wash; context.fill();
  context.save(); context.clip();
  // Rain runs: varying widths and lengths pull the top edge down unevenly.
  for (let i = 0; i < 128; i++) {
    const x = (i * 61.7) % size, length = 20 + ((i * 37) % 118), alpha = .03 + ((i * 13) % 9) * .009;
    context.fillStyle = `rgba(34,44,39,${alpha})`;
    context.fillRect(x, top[Math.floor(x)]! + 2, 1 + (i % 3), length);
  }
  // Warm dust and splash-back along the very foot, cool wash above it.
  const dust = context.createLinearGradient(0, size, 0, size - 68);
  dust.addColorStop(0, 'rgba(178,160,126,.46)');
  dust.addColorStop(.55, 'rgba(148,134,108,.22)');
  dust.addColorStop(1, 'rgba(148,134,108,0)');
  context.fillStyle = dust; context.fillRect(0, size - 58, size, 58);
  for (let i = 0; i < 9; i++) {
    const x = 10 + i * 29, width = 10 + (i * 11) % 22;
    const splash = context.createLinearGradient(0, size, 0, size - 34);
    splash.addColorStop(0, 'rgba(66,76,62,.18)'); splash.addColorStop(1, 'rgba(66,76,62,0)');
    context.fillStyle = splash; context.fillRect(x, size - 34, width, 34);
  }
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 2; texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    map: texture, transparent: true, alphaTest: .015, depthWrite: false, roughness: .96, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  return { texture, material };
}

/**
 * Thin proud seams and a contact plinth. Merged into a single draw so the wall
 * relief costs one call while still catching the directional shadow.
 */
export function wallSeamGeometry(faces: readonly CourtyardFace[]): THREE.BufferGeometry | null {
  const pieces: THREE.BufferGeometry[] = [];
  for (const face of faces) {
    const alongX = Math.abs(face.normal.x) > .5;
    const tangent = alongX ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
    const half = face.width / 2 - .35;
    for (let offset = -half + 1; offset <= half; offset += 2) {
      const center = face.center.clone().addScaledVector(tangent, offset);
      const geometry = new THREE.BoxGeometry(alongX ? .05 : .075, face.height, alongX ? .075 : .05);
      geometry.translate(center.x, face.center.y, center.z);
      pieces.push(geometry);
    }
    const plinth = new THREE.BoxGeometry(alongX ? .055 : face.width, .14, alongX ? face.width : .055);
    plinth.translate(face.center.x, .07, face.center.z);
    pieces.push(plinth);
  }
  if (!pieces.length) return null;
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged;
}
