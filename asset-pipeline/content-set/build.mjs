#!/usr/bin/env node
// Rebuild the Relay Yard content-set standard pieces from the repository sources.
//
//   node asset-pipeline/content-set/build.mjs
//   node asset-pipeline/content-set/build.mjs --check
//   node asset-pipeline/content-set/build.mjs --variant
//
// The script is deliberately self-contained: Node built-ins only, no browser,
// no GPU, no network. Every output is deterministic for the same inputs.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SPEC = JSON.parse(readFileSync(join(HERE, 'spec.json'), 'utf8'));
const DIST = join(HERE, 'dist');
const TMP = join(HERE, '.tmp-build');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

const IS_CHECK = flag('--check');
const IS_VARIANT = flag('--variant');
const OUT = value('--out', IS_VARIANT || IS_CHECK ? TMP : DIST);

// ---------- small deterministic helpers ----------
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const hexToInt = (hex) => parseInt(hex.replace('#', ''), 16);
const rgbOf = (int) => [(int >> 16) & 255, (int >> 8) & 255, int & 255];
const hexOf = (int) => '#' + int.toString(16).padStart(6, '0');
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const linear = (channel) => {
  const c = clamp01(channel / 255);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const linearRgb = (int) => rgbOf(int).map(linear);
const fmt = (n, digits = 4) => Number(n.toFixed(digits));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => mul(a, 1 / Math.max(1e-12, length(a)));
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

// ---------- palette / variant grading ----------
const PALETTE = Object.fromEntries(SPEC.palette.map((entry) => [entry.role, entry.hex]));
const FAMILIES = Object.fromEntries(SPEC.materialFamilies.map((entry) => [entry.id, entry]));
const family = (id) => {
  const entry = FAMILIES[id];
  if (!entry) throw new Error(`spec.json has no material family ${id}`);
  return entry;
};
const VARIANT = SPEC.variant;
const variantRoleTarget = VARIANT?.roleTargets ?? {};
const variantScale = IS_VARIANT ? VARIANT?.scale ?? 1 : 1;
const roleDelta = new Map();
for (const [role, target] of Object.entries(variantRoleTarget)) {
  const base = hexToInt(PALETTE[role]);
  const src = rgbOf(base);
  const dst = rgbOf(hexToInt(target));
  roleDelta.set(role, [dst[0] - src[0], dst[1] - src[1], dst[2] - src[2]]);
}
function gradeHex(int, role) {
  if (!IS_VARIANT || !role || !roleDelta.has(role)) return int;
  const delta = roleDelta.get(role);
  const [r, g, b] = rgbOf(int).map((v, i) => Math.round(clamp01((v + delta[i]) / 255) * 255));
  return (r << 16) | (g << 8) | b;
}
const P = (role) => hexToInt(PALETTE[role]);
const point = (p) => [p[0] * variantScale, p[1] * variantScale, p[2] * variantScale];

// ---------- GLB writer ----------
class Primitive {
  constructor(material) {
    this.material = material;
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
  }
  add(a0, b0, c0, color, center = null, uvs = null) {
    let a = point(a0);
    let b = point(b0);
    let c = point(c0);
    let n = cross(sub(b, a), sub(c, a));
    const centroid = center ? mul(add(add(a, b), c), 1 / 3) : null;
    // Degenerate source triangles have no area and therefore no normal. Keep
    // the vertex (so triangle counts stay stable) but give it a deterministic
    // unit direction; int8 normal accessors must pass the validator's
    // unit-length check.
    if (length(n) < 1e-9) {
      n = centroid ? sub(centroid, point(center)) : [0, 1, 0];
      if (length(n) < 1e-9) n = [0, 1, 0];
    }
    if (center && dot(n, sub(centroid, point(center))) < 0) {
      [b, c] = [c, b];
      n = mul(n, -1);
    }
    n = normalize(n);
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(...linearRgb(color));
    }
    if (uvs) for (const uv of uvs) this.uv.push(uv[0] * variantScale, uv[1] * variantScale);
  }
  get triangles() { return this.pos.length / 9; }
}

function quad(prim, a, b, c, d, color, center = null, uvs = null) {
  prim.add(a, b, c, color, center, uvs ? [uvs[0], uvs[1], uvs[2]] : null);
  prim.add(a, c, d, color, center, uvs ? [uvs[0], uvs[2], uvs[3]] : null);
}

function boxFaces(center, size, rotationY = 0) {
  const [cx, cy, cz] = center;
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  const rot = (x, y, z) => [cx + x * cos + z * sin, cy + y, cz - x * sin + z * cos];
  const corner = (sx, sy, sz) => rot(sx * hx, sy * hy, sz * hz);
  return [
    [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)], // +Z
    [corner(1, -1, -1), corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1)], // -Z
    [corner(1, -1, 1), corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1)], // +X
    [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)], // -X
    [corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1), corner(-1, 1, -1)], // +Y
    [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)], // -Y
  ];
}

function worldUv(p, normal) {
  const [x, y, z] = p;
  const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]);
  if (ay >= ax && ay >= az) return [x / 2, z / 2];
  if (ax >= az) return [z / 2, y / 2];
  return [x / 2, y / 2];
}

function addBox(prim, center, size, color, role = null, rotationY = 0, uv = false) {
  const faces = boxFaces(center, size, rotationY);
  const graded = gradeHex(color, role);
  for (const f of faces) {
    const n = normalize(cross(sub(f[1], f[0]), sub(f[2], f[0])));
    if (uv) {
      const uvs = f.map((p) => worldUv(p, n));
      quad(prim, f[0], f[1], f[2], f[3], graded, center, uvs);
    } else {
      quad(prim, f[0], f[1], f[2], f[3], graded, center);
    }
  }
}

class Gltf {
  constructor() {
    this.nodes = [];
    this.meshes = [];
    this.materials = [];
    this.materialIndex = new Map();
    this.animations = [];
    // Serialized as scenes[0].extras, i.e. three.js gltf.scene.userData.
    this.sceneExtras = {};
    this.sceneName = 'scene';
    this.accessors = [];
    this.bufferViews = [];
    this.chunks = [];
    this.bytes = 0;
  }
  material(id, def) {
    if (!this.materialIndex.has(id)) {
      this.materialIndex.set(id, this.materials.length);
      this.materials.push({
        name: def.name,
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: def.metalness,
          roughnessFactor: def.roughness,
        },
        doubleSided: true,
        ...(def.emissive ? { emissiveFactor: linearRgb(def.emissive).map((v) => fmt(v)) } : {}),
        extras: { family: def.family ?? id },
      });
    }
    return this.materialIndex.get(id);
  }
  addNode(node) {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }
  addMeshNode(name, meshName, primitives, extras = {}) {
    const meshIndex = this.meshes.length;
    this.meshes.push({ name: meshName, primitives });
    return this.addNode({ name, mesh: meshIndex, extras });
  }
  accessor(array, type, componentType, opts = {}) {
    const buf = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const pad = (4 - (this.bytes % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.bytes += pad;
    }
    const offset = this.bytes;
    this.chunks.push(buf);
    this.bytes += buf.length;
    // Vertex attributes must start on and stride across 4-byte boundaries.
    // Int8 normals and uint8 colours carry one zero pad byte per element.
    this.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(opts.byteStride ? { byteStride: opts.byteStride } : {}), ...(opts.target ? { target: opts.target } : {}) });
    const acc = {
      bufferView: this.bufferViews.length - 1,
      componentType,
      count: opts.count ?? array.length / { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type],
      type,
    };
    if (opts.min) acc.min = opts.min;
    if (opts.max) acc.max = opts.max;
    if (opts.normalized) acc.normalized = true;
    this.accessors.push(acc);
    return this.accessors.length - 1;
  }
  addAnimation(name, channels) {
    const nodeIndex = new Map(this.nodes.map((n, i) => [n.name, i]));
    const samplers = [], outChannels = [];
    for (const channel of channels) {
      const input = Float32Array.from(channel.times.map((t) => t / 1000));
      const inputAccessor = this.accessor(input, 'SCALAR', 5126, {
        min: [Math.min(...channel.times) / 1000],
        max: [Math.max(...channel.times) / 1000],
      });
      const width = channel.path === 'rotation' ? 4 : 3;
      // Translation keyframes live in the same scaled space as node.translation,
      // so a variant rebuild must not mix scaled rests with unscaled tracks.
      const flat = channel.path === 'translation' ? channel.values.flatMap((v) => point(v)) : channel.values.flat();
      const output = Float32Array.from(flat);
      const outputAccessor = this.accessor(output, width === 4 ? 'VEC4' : 'VEC3', 5126);
      samplers.push({ input: inputAccessor, output: outputAccessor, interpolation: 'LINEAR' });
      const node = nodeIndex.get(channel.node);
      if (node === undefined) throw new Error(`Animation ${name} targets unknown node ${channel.node}`);
      if (channel.path === 'translation') {
        const rest = this.nodes[node].translation ?? [0, 0, 0];
        const start = point(channel.values[0]);
        if (start.some((v, axis) => Math.abs(v - rest[axis]) > 1e-3)) {
          throw new Error(`Animation ${name} starts ${channel.node} at ${start} but its rest translation is ${rest}`);
        }
      }
      outChannels.push({ sampler: samplers.length - 1, target: { node, path: channel.path } });
    }
    this.animations.push({ name, samplers, channels: outChannels });
  }
  finish() {
    // Assign mesh primitives after all data is known, then serialize.
    const meshJson = this.meshes.map((mesh) => ({
      name: mesh.name,
      primitives: mesh.primitives.map((prim) => {
        const pos = Float32Array.from(prim.pos);
        const vertexCount = prim.pos.length / 3;
        // NORMAL and COLOR_0 stay quantised, but each VEC3 element occupies a
        // full 4-byte slot (XYZ + zero pad) as required for vertex attributes.
        const nor = new Int8Array(vertexCount * 4);
        const col = new Uint8Array(vertexCount * 4);
        for (let v = 0; v < vertexCount; v++) {
          for (let axis = 0; axis < 3; axis++) {
            nor[v * 4 + axis] = Math.max(-127, Math.min(127, Math.round(prim.nor[v * 3 + axis] * 127)));
            col[v * 4 + axis] = Math.round(clamp01(prim.col[v * 3 + axis]) * 255);
          }
        }
        const min = [0, 1, 2].map((axis) => Math.min(...Array.from({ length: vertexCount }, (_, i) => prim.pos[i * 3 + axis])));
        const max = [0, 1, 2].map((axis) => Math.max(...Array.from({ length: vertexCount }, (_, i) => prim.pos[i * 3 + axis])));
        const attributes = {
          POSITION: this.accessor(pos, 'VEC3', 5126, { target: 34962, min, max }),
          // KHR_mesh_quantization is declared used+required below; int8 normals
          // are only legal with that extension. The stride is 4 bytes so the
          // validator accepts the quantised element alignment.
          NORMAL: this.accessor(nor, 'VEC3', 5120, { count: vertexCount, target: 34962, normalized: true, byteStride: 4 }),
          COLOR_0: this.accessor(col, 'VEC3', 5121, { count: vertexCount, target: 34962, normalized: true, byteStride: 4 }),
        };
        if (prim.uv.length) attributes.TEXCOORD_0 = this.accessor(Float32Array.from(prim.uv), 'VEC2', 5126, { target: 34962 });
        return { attributes, material: prim.material, mode: 4, extras: { triangles: prim.triangles } };
      }),
    }));
    const binPad = (4 - (this.bytes % 4)) % 4;
    if (binPad) {
      this.chunks.push(Buffer.alloc(binPad));
      this.bytes += binPad;
    }
    const bin = Buffer.concat(this.chunks, this.bytes);
    const json = {
      asset: { version: '2.0', generator: 'FPS-Like content-set build.mjs (original pipeline)' },
      scene: 0,
      scenes: [{ name: this.sceneName, nodes: [0], extras: this.sceneExtras }],
      nodes: this.nodes.map((node) => ({
        name: node.name,
        ...(node.mesh !== undefined ? { mesh: node.mesh } : {}),
        ...(node.translation ? { translation: node.translation.map((v) => fmt(v)) } : {}),
        ...(node.rotation ? { rotation: node.rotation.map((v) => fmt(v, 6)) } : {}),
        ...(node.children ? { children: node.children } : {}),
        ...(node.extras && Object.keys(node.extras).length ? { extras: node.extras } : {}),
      })),
      meshes: meshJson,
      materials: this.materials,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: bin.length }],
      extensionsUsed: ['KHR_mesh_quantization'],
      extensionsRequired: ['KHR_mesh_quantization'],
      ...(this.animations.length ? { animations: this.animations } : {}),
    };
    let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
    if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
    const total = 12 + 8 + jsonBuf.length + 8 + bin.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBuf.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(bin.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, bin]);
  }
}

// ---------- source recipes copied from src/render ----------
function sleevePath(shoulder, elbow, cuff) {
  const entry = lerp(shoulder, elbow, 0.78), exit = lerp(elbow, cuff, 0.24);
  const bend = [0, 0.25, 0.5, 0.75, 1].map((t) => lerp(lerp(entry, elbow, t), lerp(elbow, exit, t), t));
  return [[...shoulder], lerp(shoulder, elbow, 0.48), ...bend, lerp(elbow, cuff, 0.66), [...cuff]];
}
function tube(id, path, radii, color, support = false) {
  const center = path[Math.floor(path.length / 2)];
  const vertices = [], faces = [], sides = 8;
  for (let j = 0; j < path.length; j++) {
    const p = path[j], a = path[Math.max(0, j - 1)], b = path[Math.min(path.length - 1, j + 1)];
    const d = sub(b, a), len = length(d), t = mul(d, 1 / Math.max(1e-9, len));
    const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalize(cross(t, ref)), v = cross(t, u);
    for (let k = 0; k < sides; k++) {
      const angle = k / sides * Math.PI * 2, r = radii[j];
      vertices.push(add(p, add(mul(u, r * Math.cos(angle)), mul(v, r * Math.sin(angle)))).map((n, axis) => n - center[axis]));
    }
  }
  faces.push(Array.from({ length: sides }, (_, i) => sides - 1 - i));
  for (let j = 0; j < path.length - 1; j++) for (let i = 0; i < sides; i++) faces.push([j * sides + i, j * sides + (i + 1) % sides, (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i]);
  faces.push(Array.from({ length: sides }, (_, i) => (path.length - 1) * sides + i));
  return { id, position: center, mesh: { vertices, faces }, color, ...(support ? { support: true } : {}) };
}
function palm(id, center, radii, color, support = false) {
  const vertices = [[0, -radii[1], 0], [0, radii[1], 0]], faces = [], segments = 10, rings = 5;
  for (let j = 1; j < rings; j++) {
    const latitude = -Math.PI / 2 + Math.PI * j / rings;
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2;
      vertices.push([Math.cos(a) * Math.cos(latitude) * radii[0], Math.sin(latitude) * radii[1], Math.sin(a) * Math.cos(latitude) * radii[2]]);
    }
  }
  for (let i = 0; i < segments; i++) {
    faces.push([0, 2 + i, 2 + (i + 1) % segments]);
    const top = 2 + (rings - 2) * segments;
    faces.push([1, top + (i + 1) % segments, top + i]);
  }
  for (let j = 0; j < rings - 2; j++) for (let i = 0; i < segments; i++) faces.push([2 + j * segments + i, 2 + j * segments + (i + 1) % segments, 2 + (j + 1) * segments + (i + 1) % segments, 2 + (j + 1) * segments + i].reverse());
  return { id, position: center, mesh: { vertices, faces }, color, ...(support ? { support: true } : {}) };
}
function handsRecipe() {
  const glove = 0x7d725f, edge = 0x665d50, sleeve = 0x3e514e;
  const supportRadii = [0.052, 0.049, 0.047, 0.047, 0.046, 0.045, 0.043, 0.036, 0.027];
  const triggerRadii = [0.056, 0.053, 0.050, 0.050, 0.049, 0.048, 0.046, 0.037, 0.029];
  const parts = [
    palm('support-palm', [-0.033, -0.069, -0.446], [0.027, 0.026, 0.050], glove, true),
    tube('support-sleeve', sleevePath([-0.17, -0.38, 0.02], [-0.105, -0.19, -0.27], [-0.05, -0.09, -0.41]), supportRadii, sleeve, true),
    tube('support-wrist', [[-0.05, -0.09, -0.41], [-0.036, -0.071, -0.442]], [0.027, 0.025], edge, true),
    palm('trigger-palm', [0.036, -0.099, -0.19], [0.025, 0.042, 0.033], glove),
    tube('trigger-sleeve', sleevePath([0.18, -0.35, 0.16], [0.11, -0.20, -0.075], [0.047, -0.14, -0.17]), triggerRadii, sleeve),
    tube('trigger-wrist', [[0.047, -0.14, -0.17], [0.036, -0.11, -0.19]], [0.029, 0.026], edge),
  ];
  for (let i = 0; i < 4; i++) {
    const z = -0.412 - i * 0.021;
    parts.push(tube(`support-finger-${i}`, [[-0.047, -0.059, z], [-0.033, -0.084, z - 0.004], [0.010, -0.084, z - 0.007], [0.024, -0.060, z - 0.005]], [0.0085, 0.008, 0.0075, 0.006], glove, true));
  }
  parts.push(tube('support-thumb', [[-0.035, -0.055, -0.425], [-0.039, -0.026, -0.45], [-0.012, -0.018, -0.46]], [0.011, 0.009, 0.007], glove, true));
  for (let i = 0; i < 3; i++) {
    const y = -0.082 - i * 0.022;
    parts.push(tube(`trigger-finger-${i}`, [[0.043, y, -0.205], [0.027, y, -0.229], [-0.019, y, -0.232], [-0.030, y, -0.209]], [0.009, 0.0085, 0.008, 0.0065], glove));
  }
  parts.push(tube('trigger-index', [[0.049, -0.065, -0.198], [0.046, -0.052, -0.237], [0.019, -0.060, -0.26]], [0.009, 0.008, 0.0065], glove));
  parts.push(tube('trigger-thumb', [[0.036, -0.081, -0.163], [0.006, -0.066, -0.166], [-0.020, -0.078, -0.178]], [0.011, 0.009, 0.007], glove));
  for (const part of parts) if (part.support) part.position = [part.position[0], part.position[1] + 0.025, part.position[2]];
  return parts;
}
function bevelBox(id, position, size, color, bevel) {
  const [sx, sy, sz] = size, x = sx / 2, y = sy / 2, z = sz / 2, b = Math.min(bevel ?? 0, sx * 0.45, sy * 0.45);
  const ring = b > 0
    ? [[-x + b, -y], [x - b, -y], [x, -y + b], [x, y - b], [x - b, y], [-x + b, y], [-x, y - b], [-x, -y + b]]
    : [[-x, -y], [x, -y], [x, y], [-x, y]];
  const vertices = [-z, z].flatMap((depth) => ring.map(([vx, vy]) => [vx, vy, depth]));
  const n = ring.length;
  const faces = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i)];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, (i + 1) % n + n, i + n]);
  return { id, position, mesh: { vertices, faces }, color };
}

// ---------- piece: first-person arms + rifle ----------
function buildFpArms() {
  const source = readJson('assets/weapons/rx24-rifle.json');
  const gltf = new Gltf();
  gltf.sceneName = 'fp-arms-rx24';
  const metal = gltf.material('weapon-metal', { name: 'RX-24 gunmetal', family: 'gunmetal', roughness: family('gunmetal').roughness, metalness: family('gunmetal').metalness });
  const fabric = gltf.material('glove-fabric', { name: 'Glove and sleeve fabric', family: 'glove-fabric', roughness: family('glove-fabric').roughness, metalness: family('glove-fabric').metalness });
  const staticPrim = new Primitive(metal);
  const magazinePrim = new Primitive(metal);
  const boltPrim = new Primitive(metal);
  const supportPrim = new Primitive(fabric);
  const triggerPrim = new Primitive(fabric);

  const addPart = (prim, part, pivot = [0, 0, 0]) => {
    const center = sub(part.position, pivot);
    for (const face of part.mesh.faces) {
      for (let i = 1; i < face.length - 1; i++) {
        const idx = [face[0], face[i], face[i + 1]];
        const pts = idx.map((index) => sub(add(part.position, part.mesh.vertices[index]), pivot));
        prim.add(pts[0], pts[1], pts[2], part.color, center);
      }
    }
  };
  const magazinePivot = source.parts.find((part) => part.role === 'magazine').position;
  for (const part of source.parts) {
    if (part.role === 'magazine') addPart(magazinePrim, part, magazinePivot);
    else addPart(staticPrim, part);
  }
  const bolt = bevelBox('rx24-charging-handle', [0.026, -0.005, -0.245], [0.020, 0.012, 0.035], 0x899797, 0.003);
  addPart(boltPrim, bolt, bolt.position);

  const hands = handsRecipe();
  const supportPivot = hands.find((part) => part.id === 'support-palm').position;
  const triggerPivot = hands.find((part) => part.id === 'trigger-palm').position;
  for (const part of hands) {
    const prim = part.support ? supportPrim : triggerPrim;
    addPart(prim, part, part.support ? supportPivot : triggerPivot);
  }

  const root = gltf.addNode({ name: 'rx24-root', children: [], extras: {} });
  gltf.sceneExtras = {
    id: 'fp-arms-rx24',
    kind: 'view-model',
    units: 'metres',
    up: '+Y',
    forward: '-Z',
    restMount: { translation: [0.29, -0.28, -0.32], pitch: 0, roll: 0, verticalFovDeg: 80 },
    source: 'assets/weapons/rx24-rifle.json',
    axis: 'weapon-group local, the transform scene.ts applies to this.weapon',
  };
  const staticNode = gltf.addMeshNode('rifle-static', 'rx24-static', [staticPrim]);
  // "pivot" is reserved by three's GLTFLoader for GLTFExporter containers; these
  // leaf nodes use pivotM so loading never treats them as pivot wrappers.
  const magNode = gltf.addMeshNode('rifle-magazine', 'rx24-magazine', [magazinePrim], { role: 'magazine', pivotM: magazinePivot.map((v) => fmt(v)) });
  gltf.nodes[magNode].translation = point(magazinePivot);
  const boltNode = gltf.addMeshNode('rifle-bolt', 'rx24-bolt', [boltPrim], { role: 'bolt', pivotM: bolt.position.map((v) => fmt(v)) });
  gltf.nodes[boltNode].translation = point(bolt.position);
  const supportNode = gltf.addMeshNode('support-hand', 'support-hand', [supportPrim], { role: 'support', pivotM: supportPivot.map((v) => fmt(v)) });
  gltf.nodes[supportNode].translation = point(supportPivot);
  const triggerNode = gltf.addMeshNode('trigger-hand', 'trigger-hand', [triggerPrim], { role: 'trigger', pivotM: triggerPivot.map((v) => fmt(v)) });
  gltf.nodes[triggerNode].translation = point(triggerPivot);
  const muzzle = source.muzzle;
  const grip = source.grip.surface.map((n, axis) => n + source.grip.palmOffset[axis]);
  const muzzleNode = gltf.addNode({ name: 'muzzle', translation: point(muzzle), extras: { role: 'flash-and-tracer-anchor' } });
  const gripNode = gltf.addNode({ name: 'grip', translation: point(grip), extras: { role: 'support-palm-contact' } });
  gltf.nodes[root].children = [staticNode, magNode, boltNode, supportNode, triggerNode, muzzleNode, gripNode];

  const qx = (angle) => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  gltf.addAnimation('idle', [
    { node: 'rx24-root', path: 'translation', times: [0, 1000, 2500, 4000], values: [[0, 0, 0], [0.004, 0.002, 0], [-0.003, -0.001, 0], [0, 0, 0]] },
  ]);
  gltf.addAnimation('fire', [
    { node: 'rx24-root', path: 'translation', times: [0, 20, 60, 120], values: [[0, 0, 0], [-0.019, -0.019, 0.08], [-0.006, -0.006, 0.025], [0, 0, 0]] },
    { node: 'rx24-root', path: 'rotation', times: [0, 20, 60, 120], values: [[0, 0, 0, 1], qx(0.107), qx(0.05), [0, 0, 0, 1]] },
  ]);
  gltf.addAnimation('reload-magazine', [
    { node: 'rifle-magazine', path: 'translation', times: [0, 380, 480, 1000, 1100, 1900], values: [magazinePivot, magazinePivot, [magazinePivot[0], magazinePivot[1] - 0.18, magazinePivot[2]], [magazinePivot[0], magazinePivot[1] - 0.18, magazinePivot[2]], magazinePivot, magazinePivot] },
  ]);
  gltf.addAnimation('reload-bolt', [
    { node: 'rifle-bolt', path: 'translation', times: [0, 1440, 1500, 1600, 1691, 1900], values: [bolt.position, bolt.position, [bolt.position[0], bolt.position[1], bolt.position[2] + 0.065], [bolt.position[0], bolt.position[1], bolt.position[2] + 0.03], bolt.position, bolt.position] },
  ]);
  return { gltf, piece: 'fp-arms-rx24', width: 5 };
}

// ---------- piece: enemy relay guard ----------
function targetColor(color, friend, region) {
  const armor = [0x1c1c1c, 0x222222, 0x2b2b2b, 0x333333, 0x4c4c4c, 0x5c5c5c, 0x707070];
  const helmet = [0x9e8b70, 0xab9678, 0xb6a07f, 0xc0ab89, 0xc8b393, 0xd0bc9e, 0xd9c8ae];
  const friendlyCarrier = [0x487d79, 0x548b86, 0x629992, 0x72a59e, 0x83b1a8, 0x91bdb4, 0xa0c9c1];
  const enemyCarrier = [0x936540, 0xa57348, 0xb68152, 0xc18d5e, 0xc99b6e, 0xd3aa7f, 0xddbc96];
  const shade = armor.indexOf(color);
  if (shade >= 0 && region !== 'detail') return (region === 'helmet' ? helmet : (friend ? friendlyCarrier : enemyCarrier))[shade];
  if (color === 0xcfaf7c) return friend ? 0x75b9b0 : 0xc46d4e;
  if (color === 0x6b624b) return friend ? 0x426f6b : 0x775142;
  return color;
}
function buildEnemy() {
  const data = readJson('assets/characters/relay-guard/guard.json');
  const gltf = new Gltf();
  gltf.sceneName = 'enemy-relay-guard';
  const mat = gltf.material('actor-cloth', { name: 'Actor cloth and carrier', family: 'actor-cloth', roughness: family('actor-cloth').roughness, metalness: family('actor-cloth').metalness });
  const headSet = new Set(data.head), torsoSet = new Set(data.torso);
  const regionOf = (face) => {
    if (face.part !== 'body') return 'detail';
    if (face.indices.every((i) => headSet.has(i))) return 'helmet';
    if (face.indices.every((i) => torsoSet.has(i)) && face.indices.reduce((sum, i) => sum + data.vertices[i][1], 0) / face.indices.length > 1.05) return 'carrier';
    return 'detail';
  };
  const groups = { head: [], spine: [], 'leg-l': [], 'leg-r': [], weapon: [] };
  const flip = ([x, y, z]) => [x, y, -z];
  for (const face of data.faces) {
    const y = face.indices.reduce((sum, i) => sum + data.vertices[i][1], 0) / face.indices.length;
    const x = face.indices.reduce((sum, i) => sum + data.vertices[i][0], 0) / face.indices.length;
    let key;
    if (face.part === 'weapon') key = 'weapon';
    else if (y >= 1.42) key = 'head';
    else if (y >= 0.86) key = 'spine';
    else key = x >= 0.075 ? 'leg-r' : 'leg-l';
    groups[key].push(face);
  }
  const groupCenter = (faces, filter = null) => {
    const pts = faces.flatMap((f) => f.indices.map((i) => flip(data.vertices[i]))).filter((p) => !filter || filter(p));
    const n = Math.max(1, pts.length);
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n, pts.reduce((s, p) => s + p[2], 0) / n];
  };
  const pivots = {
    head: groupCenter(groups.head, (p) => p[1] < 1.48),
    spine: groupCenter(groups.spine, (p) => p[1] < 0.95),
    'leg-l': groupCenter(groups['leg-l'], (p) => p[1] > 0.78),
    'leg-r': groupCenter(groups['leg-r'], (p) => p[1] > 0.78),
    weapon: groupCenter(groups.weapon),
  };
  // Keep the pivot on the body mid-line rather than on weapon-heavy centroids.
  pivots.head[0] = 0.075; pivots.spine[0] = 0.075;
  // "pivot" is a GLTFLoader-reserved userData key for GLTFExporter pivot
  // containers. enemy-root has children, so using "pivot" here made the loader
  // subtract the pivot and zero the first child; keep the fall origin explicit.
  const root = gltf.addNode({ name: 'enemy-root', children: [], extras: { fallPivot: [0, 0, 0], role: 'fall' } });
  gltf.sceneExtras = {
    id: 'enemy-relay-guard',
    kind: 'character',
    units: 'metres',
    up: '+Y',
    forward: '-Z',
    heightM: fmt(Math.max(...data.vertices.map((v) => v[1]))),
    origin: 'feet centre',
    source: 'assets/characters/relay-guard/guard.json',
    hitRegions: { head: [1.42, 1.765], torso: [0.86, 1.42], legs: [0, 0.86] },
  };
  const meshNodes = [];
  for (const key of ['head', 'spine', 'leg-l', 'leg-r', 'weapon']) {
    const prim = new Primitive(mat);
    const pivot = pivots[key];
    for (const face of groups[key]) {
      const region = key === 'head' ? 'helmet' : regionOf(face);
      let color = targetColor(face.color, false, region);
      const role = region === 'helmet' ? 'concrete-pale' : region === 'carrier' ? 'faction-warm' : face.color === 0xcfaf7c || face.color === 0x6b624b ? 'faction-warm' : null;
      color = gradeHex(color, role);
      for (let i = 1; i < face.indices.length - 1; i++) {
        const idx = [face.indices[0], face.indices[i], face.indices[i + 1]].map((index) => sub(flip(data.vertices[index]), pivot));
        prim.add(idx[0], idx[1], idx[2], color, [0, 0, 0]);
      }
    }
    const node = gltf.addMeshNode(key, `guard-${key}`, [prim], { role: key === 'weapon' ? 'rifle' : key, pivotM: pivot.map((v) => fmt(v)) });
    gltf.nodes[node].translation = point(pivot);
    meshNodes.push(node);
  }
  gltf.nodes[root].children = meshNodes;
  const qx = (angle) => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  gltf.addAnimation('idle', [
    { node: 'spine', path: 'rotation', times: [0, 1000, 2500, 4000], values: [[0, 0, 0, 1], qx(0.015), qx(-0.01), [0, 0, 0, 1]] },
    { node: 'head', path: 'rotation', times: [0, 1000, 2500, 4000], values: [[0, 0, 0, 1], qx(-0.02), qx(0.01), [0, 0, 0, 1]] },
  ]);
  gltf.addAnimation('walk', [
    { node: 'leg-l', path: 'rotation', times: [0, 225, 450, 675, 900], values: [[0, 0, 0, 1], qx(0.38), [0, 0, 0, 1], qx(-0.30), [0, 0, 0, 1]] },
    { node: 'leg-r', path: 'rotation', times: [0, 225, 450, 675, 900], values: [[0, 0, 0, 1], qx(-0.30), [0, 0, 0, 1], qx(0.38), [0, 0, 0, 1]] },
    { node: 'spine', path: 'translation', times: [0, 225, 450, 675, 900], values: [pivots.spine, [pivots.spine[0], pivots.spine[1] + 0.02, pivots.spine[2]], pivots.spine, [pivots.spine[0], pivots.spine[1] + 0.02, pivots.spine[2]], pivots.spine] },
  ]);
  gltf.addAnimation('fire', [
    { node: 'weapon', path: 'rotation', times: [0, 30, 120], values: [[0, 0, 0, 1], qx(0.1), [0, 0, 0, 1]] },
    { node: 'spine', path: 'rotation', times: [0, 30, 120], values: [[0, 0, 0, 1], qx(0.02), [0, 0, 0, 1]] },
  ]);
  gltf.addAnimation('hit', [
    { node: 'spine', path: 'rotation', times: [0, 50, 180], values: [[0, 0, 0, 1], qx(0.09), [0, 0, 0, 1]] },
    { node: 'head', path: 'rotation', times: [0, 50, 180], values: [[0, 0, 0, 1], qx(0.12), [0, 0, 0, 1]] },
  ]);
  gltf.addAnimation('death', [
    { node: 'enemy-root', path: 'rotation', times: [0, 600], values: [[0, 0, 0, 1], qx(1.47)] },
  ]);
  return { gltf, piece: 'enemy-relay-guard', width: 5 };
}

// ---------- piece: passage and cover ----------
function buildPassage() {
  const gltf = new Gltf();
  gltf.sceneName = 'passage-cover';
  const concrete = gltf.material('courtyard-concrete', { name: 'Courtyard concrete 2m', family: 'painted-concrete', roughness: family('painted-concrete').roughness, metalness: family('painted-concrete').metalness });
  const metal = gltf.material('gunmetal-trim', { name: 'Gunmetal trim', family: 'gunmetal', roughness: family('gunmetal').roughness, metalness: family('gunmetal').metalness });
  const signal = gltf.material('signal-paint', { name: 'Signal and hazard paint', family: 'signal-paint', roughness: family('signal-paint').roughness, metalness: family('signal-paint').metalness, emissive: P('signal-hot') });
  const conc = new Primitive(concrete);
  const steel = new Primitive(metal);
  const paint = new Primitive(signal);
  const add = (prim, c, s, color, role, rotY = 0, uv = true) => addBox(prim, c, s, color, role, rotY, uv);

  function wallPanel(cx, cz, rotY) {
    add(conc, [cx, 0.15, cz], [4.0, 0.3, 0.36], P('concrete-dark'), 'concrete-dark', rotY);
    add(conc, [cx, 1.55, cz], [4.0, 2.5, 0.3], P('concrete-pale'), 'concrete-pale', rotY);
    add(conc, [cx, 2.9, cz], [4.0, 0.2, 0.4], P('concrete-pale'), 'concrete-pale', rotY);
    const ex = [Math.cos(rotY), 0, -Math.sin(rotY)], ez = [Math.sin(rotY), 0, Math.cos(rotY)];
    for (const s of [-1, 1]) {
      const post = [cx + ex[0] * s * 1.9, 1.55, cz + ex[2] * s * 1.9];
      add(steel, post, [0.08, 2.5, 0.34], P('gunmetal'), 'gunmetal', rotY, false);
    }
    const stripe = [cx + ez[0] * 0.16, 0.62, cz + ez[2] * 0.16];
    add(paint, stripe, [0.5, 0.12, 0.02], P('signal-hot'), 'signal-hot', rotY, false);
  }
  function doorway(cx, cz, rotY) {
    const ex = [Math.cos(rotY), 0, -Math.sin(rotY)];
    for (const s of [-1, 1]) {
      const jx = cx + ex[0] * s * 1.3, jz = cz + ex[2] * s * 1.3;
      add(conc, [jx, 0.15, jz], [1.4, 0.3, 0.36], P('concrete-dark'), 'concrete-dark', rotY);
      add(conc, [jx, 1.25, jz], [1.4, 1.9, 0.3], P('concrete-pale'), 'concrete-pale', rotY);
      add(conc, [jx, 2.5, jz], [1.4, 0.6, 0.34], P('concrete-pale'), 'concrete-pale', rotY);
      add(steel, [jx, 2.2, jz], [1.4, 0.06, 0.34], P('gunmetal'), 'gunmetal', rotY, false);
    }
    add(conc, [cx, 2.5, cz], [1.2, 0.6, 0.3], P('concrete-pale'), 'concrete-pale', rotY);
    add(conc, [cx, 2.9, cz], [4.0, 0.2, 0.4], P('concrete-pale'), 'concrete-pale', rotY);
    const ez = [Math.sin(rotY), 0, Math.cos(rotY)];
    add(paint, [cx + ez[0] * 0.16, 2.3, cz + ez[2] * 0.16], [1.2, 0.1, 0.02], P('signal-hot'), 'signal-hot', rotY, false);
  }
  function halfWall(cx, cz, rotY) {
    add(conc, [cx, 0.45, cz], [2.4, 0.9, 0.45], P('concrete-pale'), 'concrete-pale', rotY);
    add(conc, [cx, 0.95, cz], [2.4, 0.1, 0.5], P('concrete-pale'), 'concrete-pale', rotY);
    const ez = [Math.sin(rotY), 0, Math.cos(rotY)];
    for (const s of [-1, 1]) add(paint, [cx + ez[0] * s * 0.24, 0.72, cz + ez[2] * s * 0.24], [2.4, 0.08, 0.02], P('signal-hot'), 'signal-hot', rotY, false);
  }
  function crate(cx, cz, rotY) {
    add(conc, [cx, 0.6, cz], [1.2, 1.2, 1.2], P('concrete-pale'), 'concrete-pale', rotY);
    add(steel, [cx, 1.22, cz], [1.24, 0.08, 1.24], P('gunmetal'), 'gunmetal', rotY, false);
    add(steel, [cx, 0.04, cz], [1.24, 0.08, 1.24], P('gunmetal'), 'gunmetal', rotY, false);
    const ex = [Math.cos(rotY), 0, -Math.sin(rotY)], ez = [Math.sin(rotY), 0, Math.cos(rotY)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add(steel, [cx + ex[0] * sx * 0.56 + ez[0] * sz * 0.56, 0.6, cz + ex[2] * sx * 0.56 + ez[2] * sz * 0.56], [0.08, 1.2, 0.08], P('gunmetal'), 'gunmetal', rotY, false);
    }
    add(paint, [cx + ez[0] * 0.615, 0.78, cz + ez[2] * 0.615], [0.36, 0.18, 0.02], P('signal-hot'), 'signal-hot', rotY, false);
  }

  wallPanel(-2.0, -4.0, Math.PI / 2);
  wallPanel(2.0, -4.0, Math.PI / 2);
  wallPanel(-2.0, 4.0, Math.PI / 2);
  wallPanel(2.0, 0.0, Math.PI / 2);
  doorway(-2.0, 0.0, Math.PI / 2);
  doorway(2.0, 4.0, Math.PI / 2);
  wallPanel(0.0, 6.0, 0);
  halfWall(0.9, -1.6, 0);
  crate(-0.8, 2.2, 0);

  const root = gltf.addNode({ name: 'passage-cover-root', children: [], extras: {} });
  const node = gltf.addMeshNode('passage-cover', 'passage-cover-assembly', [conc, steel, paint]);
  gltf.nodes[root].children = [node];
  const contract = readJson('asset-pipeline/content-set/contracts/passage-cover.actions.json');
  gltf.sceneExtras = {
    id: 'passage-cover',
    kind: 'environment',
    units: 'metres',
    up: '+Y',
    forward: '-Z',
    dimensions: contract.dimensions,
    modules: contract.modules,
    collision: contract.collision,
    materialBinding: contract.materialBinding,
    source: 'original procedural recipe in build.mjs',
  };
  return { gltf, piece: 'passage-cover', width: 4 };
}

// ---------- piece: hit feedback ----------
function buildHitFeedback() {
  const gltf = new Gltf();
  gltf.sceneName = 'hit-feedback';
  const markerFamily = family('ui-marker');
  const coreMat = gltf.material('marker-core', { name: 'Marker core white', family: 'ui-marker', roughness: markerFamily.roughness, metalness: markerFamily.metalness, emissive: P('marker-white') });
  const accentMat = gltf.material('marker-accent', { name: 'Marker accent', family: 'ui-marker', roughness: markerFamily.roughness, metalness: markerFamily.metalness, emissive: P('signal') });
  const sparkMat = gltf.material('impact-spark', { name: 'Impact spark', family: 'ui-marker', roughness: markerFamily.roughness, metalness: markerFamily.metalness, emissive: P('signal-hot') });
  const core = new Primitive(coreMat), accent = new Primitive(accentMat), spark = new Primitive(sparkMat);
  const inner = 0.0022, outer = 0.0054, halfWidth = 0.00065;
  function tick(prim, angle, r0, r1, color) {
    const d = [Math.cos(angle), Math.sin(angle)], n = [-d[1], d[0]];
    const a = [d[0] * r0 + n[0] * halfWidth, d[1] * r0 + n[1] * halfWidth, 0];
    const b = [d[0] * r0 - n[0] * halfWidth, d[1] * r0 - n[1] * halfWidth, 0];
    const c = [d[0] * r1 - n[0] * halfWidth, d[1] * r1 - n[1] * halfWidth, 0];
    const dd = [d[0] * r1 + n[0] * halfWidth, d[1] * r1 + n[1] * halfWidth, 0];
    quad(prim, a, b, c, dd, color, [0, 0, 0]);
  }
  for (let i = 0; i < 4; i++) tick(core, Math.PI / 4 + i * Math.PI / 2, inner, outer, P('marker-white'));
  for (let i = 0; i < 4; i++) tick(accent, i * Math.PI / 2, 0.0048, 0.0068, P('signal'));
  // Low-poly impact burst: an octahedron, 8 triangles.
  const r = 0.035;
  const top = [0, 0, r], bottom = [0, 0, -r];
  const ring = [[r, 0, 0], [0, r, 0], [-r, 0, 0], [0, -r, 0]];
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    spark.add(top, a, b, P('signal-hot'), [0, 0, 0]);
    spark.add(bottom, b, a, P('signal-hot'), [0, 0, 0]);
  }
  const root = gltf.addNode({ name: 'hit-feedback', children: [], extras: {} });
  const marker = gltf.addNode({ name: 'hit-marker', children: [], extras: { billboardPlaneM: 0.5, screenSizePx: 14 } });
  const coreNode = gltf.addMeshNode('marker-core', 'marker-core', [core], { role: 'body' });
  const accentNode = gltf.addMeshNode('marker-accent', 'marker-accent', [accent], { role: 'head-and-kill' });
  gltf.nodes[marker].children = [coreNode, accentNode];
  const impactNode = gltf.addMeshNode('impact-burst', 'impact-burst', [spark], { role: 'world-or-actor-impact' });
  gltf.nodes[root].children = [marker, impactNode];
  gltf.sceneExtras = {
    id: 'hit-feedback',
    kind: 'feedback',
    units: 'metres',
    up: '+Y',
    forward: '-Z',
    markerOuterM: outer,
    markerScreen: { billboardPlaneM: 0.5, targetPxAt1080p: 14 },
    impactRadiusM: r,
    colors: { body: PALETTE['marker-white'], head: PALETTE.signal, kill: PALETTE['signal-hot'], friendly: PALETTE['faction-cool'] },
  };
  const scale = (node, times, values) => ({ node, path: 'scale', times, values });
  gltf.addAnimation('hit-body', [scale('hit-marker', [0, 40, 120], [[1, 1, 1], [1.18, 1.18, 1], [1, 1, 1]])]);
  gltf.addAnimation('hit-head', [scale('hit-marker', [0, 60, 180], [[1, 1, 1], [1.3, 1.3, 1], [1, 1, 1]])]);
  gltf.addAnimation('hit-kill', [scale('hit-marker', [0, 80, 300, 700], [[1, 1, 1], [1.35, 1.35, 1], [1, 1, 1], [1, 1, 1]])]);
  gltf.addAnimation('impact', [scale('impact-burst', [0, 80, 180], [[0.6, 0.6, 0.6], [1.4, 1.4, 1.4], [1.8, 1.8, 1.8]])]);
  return { gltf, piece: 'hit-feedback', width: 3 };
}

// ---------- palette artifacts ----------
function paletteArtifacts() {
  const ground = readJson('assets/materials/courtyard-concrete/ground.json');
  const level = Buffer.from(ground.levels[0].rgba, 'base64');
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < level.length; i += 4) { r += level[i]; g += level[i + 1]; b += level[i + 2]; n++; }
  const measured = '#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const palette = {
    revision: 1,
    source: 'Locked from src/render/yard.ts, src/render/target.ts and the adopted courtyard concrete source.',
    measuredConcreteAverage: measured,
    tileMetres: 2,
    colors: SPEC.palette.map((entry) => ({
      ...entry,
      srgb: rgbOf(hexToInt(entry.hex)),
      linear: linearRgb(hexToInt(entry.hex)).map((v) => fmt(v, 5)),
    })),
    materialFamilies: SPEC.materialFamilies,
    variantRoleTargets: VARIANT?.roleTargets ?? {},
  };
  const cols = 4, cellW = 280, cellH = 132, pad = 40;
  const rows = Math.ceil(SPEC.palette.length / cols);
  const width = cols * cellW + pad * 2, height = 120 + rows * cellH + 80;
  const swatches = SPEC.palette.map((entry, i) => {
    const x = pad + (i % cols) * cellW, y = 120 + Math.floor(i / cols) * cellH;
    return `<g><rect x="${x}" y="${y}" width="240" height="72" rx="4" fill="${entry.hex}" stroke="#202c32" stroke-width="2"/>` +
      `<text x="${x}" y="${y + 96}" font-family="Arial, sans-serif" font-size="16" fill="#f4f1e8">${entry.role}</text>` +
      `<text x="${x}" y="${y + 116}" font-family="Arial, sans-serif" font-size="13" fill="#aab5b6">${entry.hex} · ${entry.use}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#171c1e"/>` +
    `<text x="${pad}" y="52" font-family="Arial, sans-serif" font-size="26" fill="#f4f1e8">RELAY YARD · CONTENT SET PALETTE v1</text>` +
    `<text x="${pad}" y="82" font-family="Arial, sans-serif" font-size="15" fill="#aab5b6">Locked sRGB roles. Concrete measured from the adopted 2 m courtyard tile: ${measured}. Not a quality render.</text>` +
    swatches +
    `<text x="${pad}" y="${height - 28}" font-family="Arial, sans-serif" font-size="13" fill="#aab5b6">Source: original palette selection plus CC0 courtyard concrete. No copied commercial art.</text>` +
    `</svg>`;
  return { palette, svg, measured };
}

// ---------- validation helpers ----------
function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  if (buf.readUInt32LE(4) !== 2) throw new Error('unsupported GLB version');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('GLB length mismatch');
  let offset = 12, json = null, bin = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset), type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + len;
  }
  if (!json) throw new Error('missing JSON chunk');
  return { json, bin };
}

function glbStats(buf) {
  const { json } = parseGlb(buf);
  let triangles = 0, primitives = 0;
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    const count = json.accessors[prim.attributes.POSITION].count;
    triangles += count / 3;
    primitives++;
  }
  return {
    bytes: buf.length,
    sha256: sha256(buf),
    triangles,
    materials: (json.materials ?? []).length,
    drawCalls: primitives,
    nodes: (json.nodes ?? []).length,
    meshes: (json.meshes ?? []).length,
    animations: (json.animations ?? []).map((a) => a.name),
    nodeNames: (json.nodes ?? []).map((n) => n.name),
    json,
  };
}

function boundsOf(json) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const mesh = json.meshes[node.mesh];
    const t = node.translation ?? [0, 0, 0];
    for (const prim of mesh.primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], acc.min[i] + t[i]);
        max[i] = Math.max(max[i], acc.max[i] + t[i]);
      }
    }
  }
  return { min: min.map((v) => fmt(v)), max: max.map((v) => fmt(v)) };
}

// ---------- build orchestration ----------
function buildAll() {
  const builders = { 'fp-arms-rx24': buildFpArms, 'enemy-relay-guard': buildEnemy, 'passage-cover': buildPassage, 'hit-feedback': buildHitFeedback };
  const built = {};
  for (const spec of SPEC.pieces) {
    const result = builders[spec.id]();
    const glb = result.gltf.finish();
    const stats = glbStats(glb);
    const contract = readJson('asset-pipeline/content-set/' + spec.actionFile);
    for (const action of spec.requiredActions) {
      if (!contract.actions.some((entry) => entry.name === action)) throw new Error(`${spec.id}: contract is missing action ${action}`);
    }
    for (const node of spec.requiredNodes) {
      if (!stats.nodeNames.includes(node)) throw new Error(`${spec.id}: GLB is missing node ${node}`);
    }
    built[spec.id] = { spec, glb, stats, contract, bounds: boundsOf(stats.json) };
  }
  return built;
}

function writeOutputs(built) {
  mkdirSync(OUT, { recursive: true });
  for (const entry of Object.values(built)) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, entry.spec.file), entry.glb);
  }
  const totalBytes = Object.values(built).reduce((s, e) => s + e.stats.bytes, 0);
  const totalTriangles = Object.values(built).reduce((s, e) => s + e.stats.triangles, 0);
  const manifest = {
    schema: 1,
    id: SPEC.id,
    title: SPEC.title,
    baseRef: SPEC.baseRef,
    units: SPEC.units,
    axes: SPEC.axes,
    generatedBy: 'asset-pipeline/content-set/build.mjs',
    palette: 'palette.json',
    paletteSheet: 'palette.svg',
    budget: SPEC.budgets.set,
    totals: { bytes: totalBytes, triangles: totalTriangles, newTextureBytes: 0 },
    pieces: Object.values(built).map((entry) => ({
      id: entry.spec.id,
      label: entry.spec.label,
      kind: entry.spec.kind,
      license: entry.spec.license,
      file: entry.spec.file,
      sha256: entry.stats.sha256,
      bytes: entry.stats.bytes,
      triangles: entry.stats.triangles,
      materials: entry.stats.materials,
      drawCalls: entry.stats.drawCalls,
      nodes: entry.stats.nodes,
      nodeNames: entry.stats.nodeNames,
      animations: entry.stats.animations,
      bounds: entry.bounds,
      budget: SPEC.budgets.pieces[entry.spec.id],
      sources: entry.spec.sources,
      derivation: entry.spec.derivation,
      actions: entry.contract.actions,
      clips: entry.contract.clips,
      gaps: entry.contract.gaps,
      status: entry.spec.status,
    })),
  };
  writeFileSync(join(HERE, 'content-set.json'), JSON.stringify(manifest, null, 2) + '\n');
  const palette = paletteArtifacts();
  writeFileSync(join(HERE, 'palette.json'), JSON.stringify(palette.palette, null, 2) + '\n');
  writeFileSync(join(HERE, 'palette.svg'), palette.svg);
  return manifest;
}

function main() {
  if (IS_VARIANT) {
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    const baseManifest = readJson('asset-pipeline/content-set/content-set.json');
    const built = buildAll();
    const report = {
      label: VARIANT.label,
      revision: 1,
      scale: VARIANT.scale,
      roleTargets: VARIANT.roleTargets,
      command: 'node asset-pipeline/content-set/build.mjs --variant',
      note: 'Regenerated every standard piece with the variant palette role deltas and a uniform 0.95 scale. Variant files are not shipped; the report records the rebuild.',
      pieces: [],
    };
    for (const spec of SPEC.pieces) {
      const entry = built[spec.id];
      const base = baseManifest.pieces.find((p) => p.id === spec.id);
      report.pieces.push({
        id: spec.id,
        baseSha256: base.sha256,
        variantSha256: entry.stats.sha256,
        baseBytes: base.bytes,
        variantBytes: entry.stats.bytes,
        triangles: entry.stats.triangles,
        changed: base.sha256 !== entry.stats.sha256,
        boundsBefore: base.bounds,
        boundsAfter: boundsOf(entry.stats.json),
      });
    }
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    const ok = report.pieces.every((p) => p.changed);
    writeFileSync(join(HERE, 'variant-report.json'), JSON.stringify({ ...report, allPiecesRebuilt: ok }, null, 2) + '\n');
    if (!ok) throw new Error('variant did not change every piece');
    console.log(`variant: ${report.pieces.length} pieces rebuilt, hashes recorded in variant-report.json`);
    return;
  }
  if (IS_CHECK) {
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    const built = buildAll();
    const manifest = readJson('asset-pipeline/content-set/content-set.json');
    let failures = 0;
    for (const spec of SPEC.pieces) {
      const entry = built[spec.id];
      const expected = manifest.pieces.find((p) => p.id === spec.id);
      const ok = entry.stats.sha256 === expected.sha256 && entry.stats.triangles === expected.triangles && entry.stats.bytes === expected.bytes;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${spec.id} ${entry.stats.sha256.slice(0, 12)} ${entry.stats.bytes}B ${entry.stats.triangles} tris`);
      if (!ok) failures++;
    }
    for (const spec of SPEC.pieces) {
      const budget = SPEC.budgets.pieces[spec.id];
      const entry = built[spec.id];
      if (entry.stats.bytes > budget.maxBytes || entry.stats.triangles > budget.maxTriangles || entry.stats.materials > budget.maxMaterials || entry.stats.drawCalls > budget.maxDrawCalls) {
        console.log(`FAIL budget ${spec.id}`);
        failures++;
      }
    }
    if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
    if (failures) process.exitCode = 1;
    return;
  }
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  const built = buildAll();
  const manifest = writeOutputs(built);
  for (const piece of manifest.pieces) {
    console.log(`${piece.id}: ${piece.bytes}B ${piece.triangles} tris ${piece.materials} materials ${piece.drawCalls} draws sha ${piece.sha256.slice(0, 12)}`);
  }
  console.log(`total: ${manifest.totals.bytes}B ${manifest.totals.triangles} tris`);
}

main();
