import * as THREE from 'three';
import data from '../../../../assets/materials/courtyard-concrete/ground.json';
import type { Vec3 } from '../sim/types.js';

export const groundTileMetres = data.tileMetres;
export const groundLevels = data.levels.map(level => ({size:level.size,rgba:Uint8Array.from(atob(level.rgba),c=>c.charCodeAt(0))}));
export const groundUV = (x:number,z:number) => [x/groundTileMetres,z/groundTileMetres] as const;
export function groundLevel(footprintMetres:number) {
  return groundLevels[Math.min(groundLevels.length-1,Math.max(0,Math.floor(Math.log2(Math.max(1,footprintMetres*groundLevels[0]!.size/groundTileMetres)))))]!;
}
export function groundOffset(x:number,z:number,size:number) {
  const u=Math.floor(x/groundTileMetres*size)&(size-1),v=Math.floor(z/groundTileMetres*size)&(size-1);
  return (v*size+u)*4;
}
// One floor plane, drawn before the existing depth-clipped walls and actors.
// Colour-only fallback: the same metres/UV and source mips, not a second world.
export function drawGround(context:CanvasRenderingContext2D,image:ImageData,eye:Vec3,yaw:number,horizon:number,focal:number) {
  const {width:w,height:h,data:pixels}=image,top=Math.max(0,Math.min(h,Math.ceil(horizon))),sin=Math.sin(yaw),cos=Math.cos(yaw);
  for(let y=top;y<h;y+=2){
    const sy=Math.min(y+1,h-.5),depth=eye.y*focal/(sy-horizon);
    const footprint=Math.max(depth/focal,depth*depth/(Math.max(.01,eye.y)*focal))*2;
    const mip=groundLevel(footprint),gradient=(sy-horizon)/Math.max(1,h-horizon);
    const red=133-34*gradient-120,green=148-27*gradient-137,blue=139-22*gradient-130;
    for(let x=0;x<w;x+=2){
      const plane=(x+1-w/2)/focal,wx=eye.x+(sin+plane*cos)*depth,wz=eye.z+(cos-plane*sin)*depth;
      const source=groundOffset(wx,wz,mip.size),r=mip.rgba[source]!+red,g=mip.rgba[source+1]!+green,b=mip.rgba[source+2]!+blue;
      for(let dy=0;dy<2&&y+dy<h;dy++)for(let dx=0;dx<2&&x+dx<w;dx++){
        const i=((y+dy)*w+x+dx)*4;pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;pixels[i+3]=255;
      }
    }
  }
  if(top<h)context.putImageData(image,0,0,0,top,w,h-top);
}

// ---------------------------------------------------------------------------
// Rendered floor dressing. This is presentation-only: the simulation still reads
// the baked mip chain above. The overlay is authored in courtyard metres, so
// wear reads as use rather than a repeating noise swatch.
// ---------------------------------------------------------------------------
export const GROUND_BOUNDS = Object.freeze({ minX: -13.5, maxX: 13.5, minZ: -18.5, maxZ: 18.5 });
export type GroundSurface = { overlay: THREE.CanvasTexture; roughness: THREE.CanvasTexture; bump: THREE.CanvasTexture };

function wrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(canvas: HTMLCanvasElement, srgb: boolean) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // The overlay is authored with canvas Y increasing with courtyard +Z, so it
  // must not be flipped on upload; this keeps the ring pad and north drain on
  // their real-world coordinates instead of mirroring them across the yard.
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Albedo wear, roughness and a shallow bump map share the floor's metre frame.
 *  Three paving programmes are authored directly in courtyard metres: the three
 *  circulation lanes, a square training pad under the site ring, and a rougher
 *  service band along every wall with a drainage channel. */
export function createGroundSurface(anisotropy = 1): GroundSurface | null {
  if (typeof document === 'undefined') return null;
  const size = 1024, random = wrng(0x91c0de);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const spanX = GROUND_BOUNDS.maxX - GROUND_BOUNDS.minX, spanZ = GROUND_BOUNDS.maxZ - GROUND_BOUNDS.minZ;
  const px = (x: number) => (x - GROUND_BOUNDS.minX) / spanX * size;
  const pz = (z: number) => (GROUND_BOUNDS.maxZ - z) / spanZ * size;
  const mx = (metres: number) => metres / spanX * size;
  const mz = (metres: number) => metres / spanZ * size;
  const zone = (x0: number, z0: number, x1: number, z1: number, fill: string | CanvasGradient) => {
    context.fillStyle = fill;
    context.fillRect(px(Math.min(x0, x1)), pz(Math.max(z0, z1)), Math.abs(mx(x1 - x0)), Math.abs(mz(z1 - z0)));
  };
  const line = (x0: number, z0: number, x1: number, z1: number, stroke: string, width: number) => {
    context.strokeStyle = stroke; context.lineWidth = width;
    context.beginPath(); context.moveTo(px(x0), pz(z0)); context.lineTo(px(x1), pz(z1)); context.stroke();
  };

  context.fillStyle = '#d8d5ca'; context.fillRect(0, 0, size, size);

  // Broad overlapping patches: decades of sweeping and patching, authored at a
  // scale well above the slab joints so they never read as per-pixel noise.
  for (let i = 0; i < 46; i++) {
    const x = random() * size, y = random() * size, radius = 80 + random() * 285;
    const tone = random();
    const color = tone < .38 ? '94,99,91' : tone < .72 ? '238,235,224' : '128,135,123';
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${color},${.035 + random() * .045})`);
    gradient.addColorStop(.62, `rgba(${color},${.018 + random() * .022})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = gradient; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Main circulation: three broad polished bands with narrow brighter cores.
  const lane = (x: number, width: number, alpha: number) => {
    const gradient = context.createLinearGradient(px(x - width), 0, px(x + width), 0);
    gradient.addColorStop(0, 'rgba(72,77,69,0)');
    gradient.addColorStop(.34, `rgba(72,77,69,${alpha})`);
    gradient.addColorStop(.66, `rgba(72,77,69,${alpha})`);
    gradient.addColorStop(1, 'rgba(72,77,69,0)');
    context.fillStyle = gradient; context.fillRect(px(x - width), 0, px(x + width) - px(x - width), size);
  };
  for (const x of [-8, 0, 8]) lane(x, 1.4, .052);
  lane(-4, .75, .018); lane(4, .75, .018);
  // Directional polish runs inside the outer passages.
  for (const x of [-8.35, -7.65, 7.65, 8.35]) {
    const gradient = context.createLinearGradient(px(x - .16), 0, px(x + .16), 0);
    gradient.addColorStop(0, 'rgba(226,224,208,0)'); gradient.addColorStop(.5, 'rgba(226,224,208,.05)'); gradient.addColorStop(1, 'rgba(226,224,208,0)');
    context.fillStyle = gradient; context.fillRect(px(x - .16), 0, px(x + .16) - px(x - .16), size);
  }

  // Primary slab field: four-metre pours with a chipped highlight on one edge.
  context.lineCap = 'butt';
  for (let x = -12; x <= 12; x += 4) {
    line(x, -18, x, 18, 'rgba(55,60,55,.48)', 3);
    line(x + .055, -18, x + .055, 18, 'rgba(208,206,192,.18)', 1);
  }
  for (let z = -16; z <= 16; z += 4) {
    line(-13, z, 13, z, 'rgba(55,60,55,.44)', 3);
    line(-13, z + .045, 13, z + .045, 'rgba(208,206,192,.16)', 1);
  }

  // Ring training pad: a 9.4 m square of 1.5 m pavers under the yellow site ring.
  zone(-4.7, 5.3, 4.7, 14.7, 'rgba(174,178,172,.46)');
  const ringGlow = context.createRadialGradient(px(0), pz(10), 0, px(0), pz(10), mx(4.7));
  ringGlow.addColorStop(0, 'rgba(226,223,208,.10)');
  ringGlow.addColorStop(.72, 'rgba(86,92,86,.07)');
  ringGlow.addColorStop(1, 'rgba(86,92,86,0)');
  context.fillStyle = ringGlow;
  context.save(); context.translate(px(0), pz(10)); context.scale(1, mz(1) / mx(1)); context.translate(-px(0), -pz(10));
  context.fillRect(px(0) - mx(4.7), pz(10) - mx(4.7), mx(9.4), mx(9.4)); context.restore();
  for (let x = -4.5; x <= 4.5; x += 1.5) line(x, 5.3, x, 14.7, 'rgba(52,57,51,.42)', 2.2);
  for (let z = 5.8; z <= 14.2; z += 1.5) line(-4.7, z, 4.7, z, 'rgba(52,57,51,.38)', 2.2);
  context.strokeStyle = 'rgba(72,76,68,.38)'; context.lineWidth = 2.4;
  context.strokeRect(px(-4.7), pz(14.7), mx(9.4), mz(9.4));
  context.strokeStyle = 'rgba(203,201,185,.30)'; context.lineWidth = 1.4;
  context.strokeRect(px(-4.64), pz(14.64), mx(9.28), mz(9.28));
  // Faded painted corner brackets identify the pad as a marked training bay.
  context.strokeStyle = 'rgba(205,176,108,.34)'; context.lineWidth = Math.max(2, mx(.09));
  for (const sx of [-1, 1]) for (const [z, inward] of [[5.38, 1], [14.62, -1]] as const) {
    const x = sx * 4.52;
    line(x, z, x - sx * .95, z, 'rgba(205,176,108,.34)', Math.max(2, mx(.09)));
    line(x, z, x, z + inward * .95, 'rgba(205,176,108,.34)', Math.max(2, mx(.09)));
  }
  // Faded painted practice arc outside the yellow score ring.
  context.strokeStyle = 'rgba(196,167,96,.20)'; context.lineWidth = Math.max(2, mx(.09));
  context.beginPath(); context.arc(px(0), pz(10), mx(3.75), 0, Math.PI * 2); context.stroke();

  // Wall service bands: darker, rougher strips with one-metre transverse joints.
  zone(-13.5, -18.5, -11.25, 18.5, 'rgba(103,99,87,.26)');
  zone(11.25, -18.5, 13.5, 18.5, 'rgba(103,99,87,.26)');
  zone(-13.5, 15.35, 13.5, 18.5, 'rgba(103,99,87,.28)');
  zone(-13.5, -18.5, 13.5, -16.55, 'rgba(103,99,87,.22)');
  for (let z = -18; z <= 18; z += 1) {
    line(-13.5, z, -11.25, z, 'rgba(62,66,58,.20)', 1.5);
    line(11.25, z, 13.5, z, 'rgba(62,66,58,.20)', 1.5);
  }
  for (let x = -13; x <= 13; x += 1) {
    line(x, 15.35, x, 18.5, 'rgba(62,66,58,.20)', 1.5);
    line(x, -18.5, x, -16.55, 'rgba(62,66,58,.18)', 1.5);
  }

  // Drainage channel with a repeating grate, one bay off each long wall and
  // across the north repair apron.
  const drain = (x0: number, z0: number, x1: number, z1: number) => {
    line(x0, z0, x1, z1, 'rgba(43,47,42,.66)', Math.max(4, mx(.22)));
    line(x0, z0, x1, z1, 'rgba(22,27,24,.44)', Math.max(1, mx(.08)));
    const length = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.floor(length / .55));
    const dx = (x1 - x0) / length, dz = (z1 - z0) / length;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, gx = x0 + (x1 - x0) * t, gz = z0 + (z1 - z0) * t;
      const half = .12;
      line(gx - dz * half, gz + dx * half, gx + dz * half, gz - dx * half, 'rgba(168,169,157,.55)', 1.6);
    }
  };
  drain(-12.5, -17.5, -12.5, 17.5);
  drain(12.5, -17.5, 12.5, 17.5);
  drain(-12.2, 16.55, 12.2, 16.55);

  // Broad usage staining: oil, swept dust and dried splash rings, never dense
  // black dots. Radii are in metres so they survive thumbnail downscaling.
  const stain = (x: number, z: number, radius: number, tone: string, alpha: number, squash = 1) => {
    const gradient = context.createRadialGradient(px(x), pz(z), 4, px(x), pz(z), mx(radius));
    gradient.addColorStop(0, `rgba(${tone},${alpha})`); gradient.addColorStop(.62, `rgba(${tone},${alpha * .48})`); gradient.addColorStop(1, `rgba(${tone},0)`);
    context.save(); context.translate(px(x), pz(z)); context.scale(1, squash); context.translate(-px(x), -pz(z));
    context.fillStyle = gradient;
    context.fillRect(px(x) - mx(radius), pz(z) - mx(radius), mx(radius) * 2, mx(radius) * 2); context.restore();
  };
  for (const [x, z, r, squash] of [[11.2, 7, 2.2, .42], [3.1, 15.4, 2.4, .4], [-9.6, 4.2, 1.9, .5], [9.5, 1.4, 1.5, .46], [-5.9, 9.6, 1.6, .55], [-10.7, -3.7, 1.4, .55], [-8.2, 10.6, 1.7, .5]] as const) {
    stain(x, z, r, '42,47,42', .075 + random() * .04, squash);
  }
  for (const [x, z, r] of [[0, 10, 3.1], [-8, 1.5, 1.5], [8, -2, 1.4]] as const) stain(x, z, r, '214,209,191', .045, .7);

  // Directional boot and trolley scuffs inside the lanes, aligned with travel.
  for (let i = 0; i < 300; i++) {
    const x = px([-8, 0, 8][Math.floor(random() * 3)]! + (random() - .5) * 3.6);
    const y = random() * size, length = 8 + random() * 52;
    context.strokeStyle = random() < .55 ? `rgba(55,59,52,${.045 + random() * .06})` : `rgba(218,216,199,${.035 + random() * .05})`;
    context.lineWidth = .8 + random() * 1.5;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + (random() - .5) * 3, y + length); context.stroke();
  }

  // Sparse expansion cracks, kept out of the training pad's scored pavers.
  for (let i = 0; i < 9; i++) {
    let x = 60 + random() * (size - 120), y = 40 + random() * (size - 80);
    context.strokeStyle = 'rgba(48,52,47,.28)'; context.lineWidth = 1.1;
    context.beginPath(); context.moveTo(x, y);
    for (let step = 0; step < 9; step++) { x += (random() - .5) * 44; y += 14 + random() * 28; context.lineTo(x, y); }
    context.stroke();
  }

  // Fine aggregate grain at low contrast; deliberately larger and sparser than
  // the old full-field speckle so it reads as concrete tone, not dirt.
  for (let i = 0; i < 2600; i++) {
    context.fillStyle = random() < .5 ? 'rgba(62,66,58,.045)' : 'rgba(214,212,194,.045)';
    context.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }

  // Roughness: traffic lanes polish, the training pad sits mid-range, service
  // bands stay coarse, and drains are metal-smooth.
  const roughCanvas = document.createElement('canvas'); roughCanvas.width = roughCanvas.height = 512;
  const rough = roughCanvas.getContext('2d');
  if (!rough) return null;
  const ru = (x: number) => (x - GROUND_BOUNDS.minX) / spanX * 512;
  const rv = (z: number) => (GROUND_BOUNDS.maxZ - z) / spanZ * 512;
  rough.fillStyle = '#e8e8e8'; rough.fillRect(0, 0, 512, 512);
  for (const x of [-8, 0, 8]) {
    const u = ru(x);
    const gradient = rough.createLinearGradient(u - 26, 0, u + 26, 0);
    gradient.addColorStop(0, 'rgba(148,148,148,0)'); gradient.addColorStop(.5, 'rgba(148,148,148,.52)'); gradient.addColorStop(1, 'rgba(148,148,148,0)');
    rough.fillStyle = gradient; rough.fillRect(u - 26, 0, 52, 512);
  }
  rough.fillStyle = 'rgba(205,205,205,.55)';
  rough.fillRect(ru(-4.7), rv(14.7), ru(4.7) - ru(-4.7), rv(5.3) - rv(14.7));
  rough.fillStyle = 'rgba(246,246,246,.72)';
  for (const [x0, z0, x1, z1] of [[-13.5, -18.5, -11.25, 18.5], [11.25, -18.5, 13.5, 18.5], [-13.5, 15.35, 13.5, 18.5], [-13.5, -18.5, 13.5, -16.55]] as const) {
    rough.fillRect(ru(x0), rv(z1), ru(x1) - ru(x0), rv(z0) - rv(z1));
  }
  rough.fillStyle = 'rgba(138,138,138,.75)';
  rough.fillRect(ru(-12.58), 0, Math.max(2, 512 * .17 / spanX), 512);
  rough.fillRect(ru(12.42), 0, Math.max(2, 512 * .17 / spanX), 512);
  rough.fillRect(0, rv(16.63), 512, Math.max(2, 512 * .17 / spanZ));
  for (let i = 0; i < 46; i++) {
    rough.fillStyle = `rgba(110,110,110,${.06 + random() * .10})`;
    rough.beginPath(); rough.ellipse(random() * 512, random() * 512, 10 + random() * 42, 6 + random() * 22, random() * 3, 0, Math.PI * 2); rough.fill();
  }
  rough.strokeStyle = 'rgba(228,228,228,.85)'; rough.lineWidth = 1.5;
  for (let x = -12; x <= 12; x += 4) { const u = ru(x); rough.beginPath(); rough.moveTo(u, 0); rough.lineTo(u, 512); rough.stroke(); }
  for (let z = -16; z <= 16; z += 4) { const v = rv(z); rough.beginPath(); rough.moveTo(0, v); rough.lineTo(512, v); rough.stroke(); }

  // Very shallow relief for joints, grates and aggregate edges only.
  const bumpCanvas = document.createElement('canvas'); bumpCanvas.width = bumpCanvas.height = 512;
  const bump = bumpCanvas.getContext('2d');
  if (!bump) return null;
  const bu = (x: number) => (x - GROUND_BOUNDS.minX) / spanX * 512;
  const bv = (z: number) => (GROUND_BOUNDS.maxZ - z) / spanZ * 512;
  bump.fillStyle = '#808080'; bump.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) {
    bump.fillStyle = random() < .5 ? 'rgba(74,74,74,.09)' : 'rgba(142,142,142,.09)';
    bump.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 2);
  }
  bump.strokeStyle = 'rgba(72,72,72,.75)'; bump.lineWidth = 1.6;
  for (let x = -12; x <= 12; x += 4) { const u = bu(x); bump.beginPath(); bump.moveTo(u, 0); bump.lineTo(u, 512); bump.stroke(); }
  for (let z = -16; z <= 16; z += 4) { const v = bv(z); bump.beginPath(); bump.moveTo(0, v); bump.lineTo(512, v); bump.stroke(); }
  bump.strokeStyle = 'rgba(92,92,92,.62)'; bump.lineWidth = 1.1;
  for (let x = -4.5; x <= 4.5; x += 1.5) { const u = bu(x); bump.beginPath(); bump.moveTo(u, bv(14.7)); bump.lineTo(u, bv(5.3)); bump.stroke(); }
  for (let z = 5.8; z <= 14.2; z += 1.5) { const v = bv(z); bump.beginPath(); bump.moveTo(bu(-4.7), v); bump.lineTo(bu(4.7), v); bump.stroke(); }
  for (let i = 0; i < 90; i++) {
    const x = random() * 512, y = random() * 512, length = 4 + random() * 26;
    bump.strokeStyle = `rgba(106,106,106,${.18 + random() * .2})`; bump.lineWidth = .8 + random();
    bump.beginPath(); bump.moveTo(x, y); bump.lineTo(x + (random() - .5) * 5, y + length); bump.stroke();
  }
  // Grate bars sit proud of the channel recess.
  bump.fillStyle = 'rgba(150,150,150,.7)';
  bump.fillRect(bu(-12.62), 0, 2, 512); bump.fillRect(bu(12.45), 0, 2, 512);
  for (let z = -17; z <= 17; z += .55) {
    const v = bv(z); bump.fillRect(bu(-12.68), v, Math.max(2, bu(-12.35) - bu(-12.68)), 1.5);
    bump.fillRect(bu(12.35), v, Math.max(2, bu(12.68) - bu(12.35)), 1.5);
  }

  const overlay = canvasTexture(canvas, true), roughness = canvasTexture(roughCanvas, false), bumpMap = canvasTexture(bumpCanvas, false);
  overlay.anisotropy = roughness.anisotropy = bumpMap.anisotropy = Math.max(1, anisotropy);
  return { overlay, roughness, bump: bumpMap };
}
