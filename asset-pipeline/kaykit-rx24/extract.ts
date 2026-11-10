#!/usr/bin/env node
// Extract the weapon-only subset of the fixed RX-24 first-person GLB.
//
//   node --import tsx asset-pipeline/kaykit-rx24/extract.ts \
//     --src assets/content-set/fp-arms-rx24.glb \
//     --out asset-pipeline/kaykit-rx24/weapon-only.glb \
//     --manifest asset-pipeline/kaykit-rx24/manifest.json
//
// The input is a fixed artifact: its SHA-256 is checked before any structural
// decision. The output keeps the source root coordinate system, root-space
// vertices, quantised normals/colours and material JSON. The support-hand and
// trigger-hand subtrees are excluded by identity, never by colour or prefix
// heuristics. Temp files are re-read with the real THREE GLTFLoader and only
// replace the targets after every contract check passes.
//
// This card delivers static weapon geometry only. It does not attach the rifle
// to Knight, does not build hand IK, and does not treat the first-person
// camera restMount as a world or bone mount.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export const SOURCE_PATH = 'assets/content-set/fp-arms-rx24.glb';
export const SOURCE_SHA256 = 'e672d06e30262f2575076f759645aa3d82d6734f0c26ef280a2a36870549b9e1';
export const SOURCE_BYTES = 188088;
export const SOURCE_COMMIT = 'b198df62a56f4c520716fbc9cb4afac47dd62213';
export const OUTPUT_PATH = 'asset-pipeline/kaykit-rx24/weapon-only.glb';
export const REQUIRED_NODES = ['rx24-root', 'rifle-static', 'rifle-magazine', 'rifle-bolt', 'muzzle', 'grip'] as const;
export const EXCLUDED_NODES = ['support-hand', 'trigger-hand'] as const;
export const EXPECTED_TRIANGLES = 1958;
export const EXPECTED_VERTICES = 5874;
export const LOADER_ID = 'three 0.186.1 GLTFLoader';

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  extras?: Record<string, unknown>;
}

interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  extras?: Record<string, unknown>;
}

interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
  extras?: Record<string, unknown>;
}

type GltfMaterial = Record<string, unknown> & { name?: string };

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  normalized?: boolean;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

interface GltfScene {
  name?: string;
  nodes: number[];
  extras?: Record<string, unknown>;
}

interface GltfJson {
  asset?: { version?: string; generator?: string };
  scene?: number;
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  materials?: GltfMaterial[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: { byteLength?: number }[];
  animations?: { name?: string }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  [key: string]: unknown;
}

interface OutputGltfJson {
  asset: { version: string; generator: string };
  scene: number;
  scenes: GltfScene[];
  nodes: GltfNode[];
  meshes: GltfMesh[];
  materials: GltfMaterial[];
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: { byteLength: number }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ManifestNode {
  name: string;
  sourceName: string;
  role: string;
  parent: string | null;
  parentChain: string[];
  sourceMatrix: number[];
  outputMatrix: number[];
  mesh: string | null;
  bytes: number;
  triangles: number;
  vertices: number;
  materials: number;
  bbox: Bounds | null;
}

export interface ManifestMount {
  node: string;
  role: string;
  roleMeaning: string;
  position: [number, number, number];
  matrix: number[];
}

export interface WeaponManifest {
  schema: 1;
  id: string;
  generatedBy: string;
  source: { path: string; sourceCommit: string; bytes: number; sha256: string; license: string; licenseNote: string };
  output: {
    path: string;
    bytes: number;
    sha256: string;
    triangles: number;
    vertices: number;
    materials: number;
    meshes: number;
    nodes: number;
    drawCalls: number;
    bbox: Bounds;
    units: string;
    unitsNote: string;
  };
  coordinateSystem: { root: string; rootMatrix: number[]; restMount: string; origin: string };
  nodes: ManifestNode[];
  mounts: { muzzle: ManifestMount; grip: ManifestMount };
  excluded: { nodes: string[]; meshes: string[]; triangles: number; vertices: number; materials: string[]; reason: string };
  animations: { source: string[]; exported: string[]; reason: string };
  verification: { loader: string; checks: string[]; unverified: string[] };
}

export interface BuildOptions {
  // Test-only override for mutated fixtures that exercise structural rejection.
  // The CLI never accepts these values: the fixed artifact hash stays mandatory.
  expectedSha256?: string;
  expectedBytes?: number;
}

export interface BuildResult {
  glb: Buffer;
  manifest: WeaponManifest;
}

export interface VerifyResult {
  nodes: number;
  meshes: number;
  triangles: number;
  vertices: number;
  materials: number;
  maxMatrixError: number;
  maxVertexError: number;
  bbox: Bounds;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const POSITION_TARGET = 34962;

function fail(message: string): never {
  throw new Error(message);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isFiniteVector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

export function parseGlb(bytes: Buffer): { json: GltfJson; bin: Buffer } {
  if (bytes.length < 20) fail('GLB is too short');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) fail('Not a GLB (magic mismatch)');
  if (bytes.readUInt32LE(4) !== 2) fail('Unsupported GLB version');
  if (bytes.readUInt32LE(8) !== bytes.length) fail('GLB length header mismatch');
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) fail('Truncated GLB chunk');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) {
      if (json) fail('Duplicate GLB JSON chunk');
      json = JSON.parse(chunk.toString('utf8')) as GltfJson;
    } else if (type === CHUNK_BIN) {
      if (bin) fail('Duplicate GLB BIN chunk');
      bin = chunk;
    }
    offset += 8 + length;
  }
  if (!json) fail('GLB has no JSON chunk');
  if (!bin) fail('GLB has no BIN chunk');
  return { json, bin };
}

function requiredArray<T>(value: T[] | undefined, label: string): T[] {
  if (!value || value.length === 0) fail(`GLB is missing ${label}`);
  return value;
}

function nodeName(node: GltfNode, index: number): string {
  if (typeof node.name !== 'string' || node.name.length === 0) fail(`Node ${index} has no name`);
  return node.name;
}

function accessorOf(json: GltfJson, index: number, label: string): GltfAccessor {
  const accessors = requiredArray(json.accessors, 'accessors');
  const accessor = accessors[index];
  if (!accessor) fail(`${label}: accessor ${index} is missing`);
  return accessor;
}

function trianglesOf(json: GltfJson, mesh: GltfMesh, meshIndex: number): number {
  let triangles = 0;
  for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    const mode = primitive.mode ?? 4;
    if (mode !== 4) fail(`Mesh ${meshIndex} primitive ${primitiveIndex}: only triangle mode 4 is supported`);
    if (primitive.indices !== undefined) {
      const indices = accessorOf(json, primitive.indices, `Mesh ${meshIndex} indices`);
      if (indices.count % 3 !== 0) fail(`Mesh ${meshIndex} primitive ${primitiveIndex}: index count is not a triangle count`);
      triangles += indices.count / 3;
    } else {
      const position = primitive.attributes.POSITION;
      if (position === undefined) fail(`Mesh ${meshIndex} primitive ${primitiveIndex}: missing POSITION`);
      const accessor = accessorOf(json, position, `Mesh ${meshIndex} POSITION`);
      if (accessor.count % 3 !== 0) fail(`Mesh ${meshIndex} primitive ${primitiveIndex}: vertex count is not a triangle count`);
      triangles += accessor.count / 3;
    }
  }
  return triangles;
}

function verticesOf(json: GltfJson, mesh: GltfMesh, meshIndex: number): number {
  let vertices = 0;
  for (const primitive of mesh.primitives) {
    const position = primitive.attributes.POSITION;
    if (position === undefined) fail(`Mesh ${meshIndex}: missing POSITION`);
    vertices += accessorOf(json, position, `Mesh ${meshIndex} POSITION`).count;
  }
  return vertices;
}

function primitiveAccessors(primitive: GltfPrimitive): number[] {
  const indices = Object.values(primitive.attributes);
  if (primitive.indices !== undefined) indices.push(primitive.indices);
  return indices;
}

function meshAccessors(json: GltfJson, mesh: GltfMesh): number[] {
  return mesh.primitives.flatMap(primitiveAccessors);
}

function meshBytes(json: GltfJson, mesh: GltfMesh): number {
  const accessors = requiredArray(json.accessors, 'accessors');
  const bufferViews = requiredArray(json.bufferViews, 'bufferViews');
  const views = new Set<number>();
  for (const accessorIndex of meshAccessors(json, mesh)) {
    const accessor = accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined) fail(`Mesh accessor ${accessorIndex}: missing bufferView`);
    views.add(accessor.bufferView);
  }
  let bytes = 0;
  for (const viewIndex of views) {
    const view = bufferViews[viewIndex];
    if (!view) fail(`bufferView ${viewIndex} is missing`);
    bytes += view.byteLength;
  }
  return bytes;
}

function localMatrixOf(node: GltfNode, index: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  if (node.matrix !== undefined) {
    if (!isFiniteVector(node.matrix, 16)) fail(`Node ${index}: matrix must have 16 finite entries`);
    matrix.fromArray(node.matrix);
    return matrix;
  }
  const translation = node.translation ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  if (!isFiniteVector(translation, 3)) fail(`Node ${index}: invalid translation`);
  if (!isFiniteVector(rotation, 4)) fail(`Node ${index}: invalid rotation`);
  if (!isFiniteVector(scale, 3)) fail(`Node ${index}: invalid scale`);
  return matrix.compose(
    new THREE.Vector3(translation[0]!, translation[1]!, translation[2]!),
    new THREE.Quaternion(rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!),
    new THREE.Vector3(scale[0]!, scale[1]!, scale[2]!),
  );
}

function roundBounds(bounds: Bounds): Bounds {
  return {
    min: bounds.min.map((value) => Number(value.toPrecision(12))) as [number, number, number],
    max: bounds.max.map((value) => Number(value.toPrecision(12))) as [number, number, number],
  };
}

function boundsOfMesh(json: GltfJson, mesh: GltfMesh, world: THREE.Matrix4, meshIndex: number): Bounds {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new THREE.Vector3();
  for (const primitive of mesh.primitives) {
    const positionIndex = primitive.attributes.POSITION;
    if (positionIndex === undefined) fail(`Mesh ${meshIndex}: missing POSITION`);
    const accessor = accessorOf(json, positionIndex, `Mesh ${meshIndex} POSITION`);
    if (!isFiniteVector(accessor.min, 3) || !isFiniteVector(accessor.max, 3)) fail(`Mesh ${meshIndex}: POSITION accessor needs min/max`);
    for (const x of [accessor.min[0]!, accessor.max[0]!]) {
      for (const y of [accessor.min[1]!, accessor.max[1]!]) {
        for (const z of [accessor.min[2]!, accessor.max[2]!]) {
          corner.set(x, y, z).applyMatrix4(world);
          min.min(corner);
          max.max(corner);
        }
      }
    }
  }
  return roundBounds({ min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] });
}

function unionBounds(bounds: Bounds[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const entry of bounds) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, entry.min[axis]!);
      max[axis] = Math.max(max[axis]!, entry.max[axis]!);
    }
  }
  return roundBounds({ min, max });
}

export function buildWeaponOnly(sourceBytes: Buffer, options: BuildOptions = {}): BuildResult {
  const expectedSha256 = options.expectedSha256 ?? SOURCE_SHA256;
  const expectedBytes = options.expectedBytes ?? SOURCE_BYTES;
  const actualSha256 = sha256(sourceBytes);
  if (actualSha256 !== expectedSha256) {
    fail(`Source hash mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }
  if (sourceBytes.length !== expectedBytes) {
    fail(`Source byte size mismatch: expected ${expectedBytes}, got ${sourceBytes.length}`);
  }

  const { json, bin } = parseGlb(sourceBytes);
  const nodes = requiredArray(json.nodes, 'nodes');
  const meshes = requiredArray(json.meshes, 'meshes');
  const materials = json.materials ?? [];
  const accessors = requiredArray(json.accessors, 'accessors');
  const bufferViews = requiredArray(json.bufferViews, 'bufferViews');

  const nameToIndices = new Map<string, number[]>();
  for (const [index, node] of nodes.entries()) {
    const name = nodeName(node, index);
    const list = nameToIndices.get(name) ?? [];
    list.push(index);
    nameToIndices.set(name, list);
  }
  for (const [name, indices] of nameToIndices) {
    if (indices.length > 1) fail(`Duplicate node name ${name} (indices ${indices.join(', ')})`);
  }

  const required = new Map<string, number>();
  for (const name of REQUIRED_NODES) {
    const indices = nameToIndices.get(name);
    if (!indices) fail(`Missing required node ${name}`);
    required.set(name, indices[0]!);
  }

  const excludedRoots: number[] = [];
  for (const name of EXCLUDED_NODES) {
    const indices = nameToIndices.get(name);
    if (indices) excludedRoots.push(...indices);
  }

  const parents = new Map<number, number>();
  for (const [index, node] of nodes.entries()) {
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length) fail(`Node ${index}: invalid child ${child}`);
      if (parents.has(child)) fail(`Node ${child} has multiple parents`);
      parents.set(child, index);
    }
  }

  const chains = new Map<number, number[]>();
  function chainOf(index: number): number[] {
    const cached = chains.get(index);
    if (cached) return cached;
    const chain: number[] = [];
    const seen = new Set<number>();
    let current: number | undefined = index;
    while (current !== undefined) {
      if (seen.has(current)) fail(`Node parent cycle at ${current}`);
      seen.add(current);
      chain.push(current);
      current = parents.get(current);
    }
    chain.reverse();
    chains.set(index, chain);
    return chain;
  }

  const rootIndex = required.get('rx24-root')!;
  const rootChain = chainOf(rootIndex);
  if (rootChain.length !== 1) fail('rx24-root must be the root node of the weapon hierarchy');
  const scene = json.scenes?.[json.scene ?? 0] ?? json.scenes?.[0];
  if (!scene || !scene.nodes.includes(rootIndex)) fail('rx24-root is not the scene root node');
  for (const name of REQUIRED_NODES) {
    const chain = chainOf(required.get(name)!);
    if (chain[0] !== rootIndex) fail(`Cannot separate: required node ${name} is not under rx24-root`);
  }

  // The excluded set is the complete support-hand / trigger-hand subtrees.
  const excluded = new Set<number>();
  const stack = [...excludedRoots];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (excluded.has(index)) fail(`Excluded hand subtree contains a cycle at node ${index}`);
    excluded.add(index);
    for (const child of nodes[index]!.children ?? []) stack.push(child);
  }

  // Kept nodes are the required nodes plus the ancestors needed to preserve the
  // root coordinate system. Nothing may be silently dropped or silently added.
  const keep = new Set<number>();
  for (const name of REQUIRED_NODES) {
    const index = required.get(name)!;
    if (excluded.has(index)) fail(`Cannot separate: required node ${name} is inside an excluded hand subtree`);
    for (const ancestor of chainOf(index)) keep.add(ancestor);
  }
  for (const index of keep) {
    if (excluded.has(index)) fail(`Cannot separate: node ${nodeName(nodes[index]!, index)} is both kept and excluded`);
  }
  for (const [index, node] of nodes.entries()) {
    if (!keep.has(index) && !excluded.has(index)) {
      fail(`Cannot classify node ${nodeName(node, index)} as weapon geometry or excluded hand geometry`);
    }
  }

  const keepSorted = [...keep].sort((a, b) => a - b);
  const excludedSorted = [...excluded].sort((a, b) => a - b);

  const retainedMeshes = new Set<number>();
  for (const index of keepSorted) {
    const meshIndex = nodes[index]!.mesh;
    if (meshIndex === undefined) continue;
    if (!Number.isInteger(meshIndex) || meshIndex < 0 || meshIndex >= meshes.length) fail(`Node ${index}: invalid mesh ${meshIndex}`);
    retainedMeshes.add(meshIndex);
  }
  const excludedMeshes = new Set<number>();
  for (const index of excludedSorted) {
    const meshIndex = nodes[index]!.mesh;
    if (meshIndex === undefined) continue;
    if (!Number.isInteger(meshIndex) || meshIndex < 0 || meshIndex >= meshes.length) fail(`Node ${index}: invalid mesh ${meshIndex}`);
    excludedMeshes.add(meshIndex);
  }
  for (const meshIndex of retainedMeshes) {
    if (excludedMeshes.has(meshIndex)) fail(`Cannot separate: mesh ${meshIndex} is shared by kept and excluded nodes`);
  }

  const excludedAccessors = new Set<number>();
  const excludedMaterialIndices = new Set<number>();
  for (const meshIndex of excludedMeshes) {
    const mesh = meshes[meshIndex]!;
    for (const accessor of meshAccessors(json, mesh)) excludedAccessors.add(accessor);
    for (const primitive of mesh.primitives) if (primitive.material !== undefined) excludedMaterialIndices.add(primitive.material);
  }
  for (const meshIndex of retainedMeshes) {
    const mesh = meshes[meshIndex]!;
    for (const primitive of mesh.primitives) {
      for (const accessor of primitiveAccessors(primitive)) {
        if (excludedAccessors.has(accessor)) fail(`Cannot separate: mesh ${meshIndex} shares accessor ${accessor} with an excluded hand mesh`);
      }
      if (primitive.material !== undefined && excludedMaterialIndices.has(primitive.material)) {
        fail(`Cannot separate: mesh ${meshIndex} uses hand-only material ${primitive.material}`);
      }
    }
  }

  const triangles = [...retainedMeshes].reduce((sum, meshIndex) => sum + trianglesOf(json, meshes[meshIndex]!, meshIndex), 0);
  if (triangles > EXPECTED_TRIANGLES) fail(`Weapon-only triangle count ${triangles} exceeds the source contract ${EXPECTED_TRIANGLES}`);
  if (triangles !== EXPECTED_TRIANGLES) fail(`Weapon-only triangle count ${triangles} does not match the source contract ${EXPECTED_TRIANGLES}`);
  const vertices = [...retainedMeshes].reduce((sum, meshIndex) => sum + verticesOf(json, meshes[meshIndex]!, meshIndex), 0);
  if (vertices !== EXPECTED_VERTICES) fail(`Weapon-only vertex count ${vertices} does not match the source contract ${EXPECTED_VERTICES}`);

  const retainedAccessors = new Set<number>();
  const retainedMaterialIndices = new Set<number>();
  for (const meshIndex of retainedMeshes) {
    const mesh = meshes[meshIndex]!;
    for (const primitive of mesh.primitives) {
      for (const accessor of primitiveAccessors(primitive)) {
        if (!accessors[accessor]) fail(`Mesh ${meshIndex}: missing accessor ${accessor}`);
        retainedAccessors.add(accessor);
      }
      if (primitive.material !== undefined) {
        if (!materials[primitive.material]) fail(`Mesh ${meshIndex}: missing material ${primitive.material}`);
        retainedMaterialIndices.add(primitive.material);
      }
    }
  }
  for (const accessorIndex of retainedAccessors) {
    const accessor = accessors[accessorIndex]!;
    if (accessor.bufferView === undefined) fail(`Accessor ${accessorIndex}: external or sparse accessors are unsupported`);
    if (!bufferViews[accessor.bufferView]) fail(`Accessor ${accessorIndex}: missing bufferView ${accessor.bufferView}`);
  }

  const sortedAccessors = [...retainedAccessors].sort((a, b) => a - b);
  const usedViews: number[] = [];
  for (const accessorIndex of sortedAccessors) {
    const view = accessors[accessorIndex]!.bufferView!;
    if (!usedViews.includes(view)) usedViews.push(view);
  }
  usedViews.sort((a, b) => a - b);

  const chunks: Buffer[] = [];
  let binOffset = 0;
  const viewRemap = new Map<number, number>();
  const outBufferViews: GltfBufferView[] = [];
  for (const viewIndex of usedViews) {
    const view = bufferViews[viewIndex]!;
    if (view.buffer !== 0) fail(`bufferView ${viewIndex}: only the embedded buffer is supported`);
    // Vertex attribute data must start on a 4-byte boundary.
    const padding = (4 - (binOffset % 4)) % 4;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      binOffset += padding;
    }
    const sourceOffset = view.byteOffset ?? 0;
    if (sourceOffset < 0 || sourceOffset + view.byteLength > bin.length) fail(`bufferView ${viewIndex}: out of range`);
    viewRemap.set(viewIndex, outBufferViews.length);
    outBufferViews.push({
      buffer: 0,
      byteOffset: binOffset,
      byteLength: view.byteLength,
      ...(view.byteStride !== undefined ? { byteStride: view.byteStride } : {}),
      ...(view.target !== undefined ? { target: view.target } : {}),
    });
    const bytes = bin.subarray(sourceOffset, sourceOffset + view.byteLength);
    chunks.push(bytes);
    binOffset += bytes.length;
  }
  const finalPadding = (4 - (binOffset % 4)) % 4;
  if (finalPadding > 0) {
    chunks.push(Buffer.alloc(finalPadding));
    binOffset += finalPadding;
  }
  const outputBin = Buffer.concat(chunks, binOffset);

  const accessorRemap = new Map<number, number>();
  const outAccessors: GltfAccessor[] = [];
  for (const accessorIndex of sortedAccessors) {
    const accessor = accessors[accessorIndex]!;
    const bufferView = viewRemap.get(accessor.bufferView!);
    if (bufferView === undefined) fail(`Accessor ${accessorIndex}: bufferView was not copied`);
    accessorRemap.set(accessorIndex, outAccessors.length);
    outAccessors.push({
      bufferView,
      ...(accessor.byteOffset !== undefined ? { byteOffset: accessor.byteOffset } : {}),
      componentType: accessor.componentType,
      count: accessor.count,
      type: accessor.type,
      ...(accessor.min !== undefined ? { min: [...accessor.min] } : {}),
      ...(accessor.max !== undefined ? { max: [...accessor.max] } : {}),
      ...(accessor.normalized ? { normalized: true } : {}),
    });
  }

  const sortedMeshes = [...retainedMeshes].sort((a, b) => a - b);
  const meshRemap = new Map<number, number>();
  const outMeshes: GltfMesh[] = [];
  for (const meshIndex of sortedMeshes) {
    const mesh = meshes[meshIndex]!;
    meshRemap.set(meshIndex, outMeshes.length);
    outMeshes.push({
      ...(mesh.name !== undefined ? { name: mesh.name } : {}),
      primitives: mesh.primitives.map((primitive) => {
        const attributes: Record<string, number> = {};
        for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) {
          const remapped = accessorRemap.get(accessorIndex);
          if (remapped === undefined) fail(`Mesh ${meshIndex}: accessor ${accessorIndex} was not copied`);
          attributes[semantic] = remapped;
        }
        const indices = primitive.indices !== undefined ? accessorRemap.get(primitive.indices) : undefined;
        if (primitive.indices !== undefined && indices === undefined) fail(`Mesh ${meshIndex}: index accessor was not copied`);
        return {
          attributes,
          ...(indices !== undefined ? { indices } : {}),
          ...(primitive.material !== undefined ? { material: materialRemapOf(primitive.material) } : {}),
          mode: primitive.mode ?? 4,
          ...(primitive.extras !== undefined ? { extras: cloneJson(primitive.extras) } : {}),
        };
      }),
      ...(mesh.extras !== undefined ? { extras: cloneJson(mesh.extras) } : {}),
    });
  }

  function materialRemapOf(sourceIndex: number): number {
    const sorted = [...retainedMaterialIndices].sort((a, b) => a - b);
    const remapped = sorted.indexOf(sourceIndex);
    if (remapped < 0) fail(`Material ${sourceIndex} was not retained`);
    return remapped;
  }
  const sortedMaterials = [...retainedMaterialIndices].sort((a, b) => a - b);
  const outMaterials = sortedMaterials.map((index) => cloneJson(materials[index]!));

  const nodeRemap = new Map<number, number>();
  keepSorted.forEach((index, outIndex) => nodeRemap.set(index, outIndex));
  const outNodes: GltfNode[] = keepSorted.map((index) => {
    const node = nodes[index]!;
    const children = (node.children ?? []).filter((child) => keep.has(child)).map((child) => nodeRemap.get(child)!);
    const meshIndex = node.mesh;
    const mesh = meshIndex !== undefined ? meshRemap.get(meshIndex) : undefined;
    return {
      name: nodeName(node, index),
      ...(mesh !== undefined ? { mesh } : {}),
      ...(children.length > 0 ? { children } : {}),
      ...(node.translation !== undefined ? { translation: [...node.translation] } : {}),
      ...(node.rotation !== undefined ? { rotation: [...node.rotation] } : {}),
      ...(node.scale !== undefined ? { scale: [...node.scale] } : {}),
      ...(node.matrix !== undefined ? { matrix: [...node.matrix] } : {}),
      ...(node.extras !== undefined ? { extras: cloneJson(node.extras) } : {}),
    };
  });

  const sourceScene = json.scenes?.[json.scene ?? 0] ?? json.scenes?.[0];
  const sourceExtras = sourceScene?.extras ? cloneJson(sourceScene.extras) : {};
  delete sourceExtras.restMount;
  const sceneExtras: Record<string, unknown> = {
    ...sourceExtras,
    id: 'kaykit-rx24-weapon-only',
    kind: 'weapon-only-static',
    weaponOnly: {
      source: SOURCE_PATH,
      sourceSha256: SOURCE_SHA256,
      excludedNodes: [...EXCLUDED_NODES],
      note: 'Static weapon geometry; first-person restMount is not exported and must not be used as a world or bone mount.',
    },
  };

  const outputJson: OutputGltfJson = {
    asset: { version: '2.0', generator: 'FPS-Like asset-pipeline/kaykit-rx24/extract.ts (weapon-only subset)' },
    scene: 0,
    scenes: [{ name: 'fp-arms-rx24-weapon-only', nodes: [nodeRemap.get(rootIndex)!], extras: sceneExtras }],
    nodes: outNodes,
    meshes: outMeshes,
    materials: outMaterials,
    accessors: outAccessors,
    bufferViews: outBufferViews,
    buffers: [{ byteLength: outputBin.length }],
    ...(json.extensionsUsed !== undefined ? { extensionsUsed: [...json.extensionsUsed] } : {}),
    ...(json.extensionsRequired !== undefined ? { extensionsRequired: [...json.extensionsRequired] } : {}),
  };

  const glb = serializeGlb(outputJson, outputBin);

  // World matrices and root-space bounds come from the source, before any
  // serialisation, and are recorded per node in the manifest.
  const worldMatrices = new Map<number, THREE.Matrix4>();
  function worldOf(index: number): THREE.Matrix4 {
    const cached = worldMatrices.get(index);
    if (cached) return cached;
    const local = localMatrixOf(nodes[index]!, index);
    const parent = parents.get(index);
    const world = parent === undefined ? local : worldOf(parent).clone().multiply(local);
    worldMatrices.set(index, world);
    return world;
  }

  const offsetOf = (index: number): [number, number, number] => {
    const position = new THREE.Vector3().setFromMatrixPosition(worldOf(index));
    return [position.x, position.y, position.z];
  };

  const meshBounds = new Map<number, Bounds>();
  for (const meshIndex of sortedMeshes) {
    const owningNode = keepSorted.find((index) => nodes[index]!.mesh === meshIndex);
    if (owningNode === undefined) fail(`Mesh ${meshIndex}: no owning kept node`);
    meshBounds.set(meshIndex, boundsOfMesh(json, meshes[meshIndex]!, worldOf(owningNode), meshIndex));
  }

  const nodeRecords: ManifestNode[] = keepSorted.map((index) => {
    const node = nodes[index]!;
    const name = nodeName(node, index);
    const meshIndex = node.mesh;
    const mesh = meshIndex !== undefined ? meshes[meshIndex]! : null;
    const materialCount = mesh ? new Set(mesh.primitives.map((primitive) => primitive.material ?? -1)).size : 0;
    const role = meshIndex === undefined ? (name === 'rx24-root' ? 'weapon-root' : String(node.extras?.role ?? 'mount')) : (name === 'rifle-static' ? 'gun-body' : String(node.extras?.role ?? name));
    const parentIndex = parents.get(index);
    return {
      name,
      sourceName: name,
      role,
      parent: parentIndex !== undefined ? nodeName(nodes[parentIndex]!, parentIndex) : null,
      parentChain: chainOf(index).map((entry) => nodeName(nodes[entry]!, entry)),
      sourceMatrix: worldOf(index).toArray(),
      outputMatrix: worldOf(index).toArray(),
      mesh: mesh ? mesh.name ?? null : null,
      bytes: mesh ? meshBytes(json, mesh) : 0,
      triangles: mesh ? trianglesOf(json, mesh, meshIndex!) : 0,
      vertices: mesh ? verticesOf(json, mesh, meshIndex!) : 0,
      materials: materialCount,
      bbox: meshIndex !== undefined ? meshBounds.get(meshIndex)! : null,
    };
  });

  const gripIndex = required.get('grip')!;
  const muzzleIndex = required.get('muzzle')!;
  const gripExtras = nodes[gripIndex]!.extras ?? {};
  if (gripExtras.role !== 'support-palm-contact') {
    fail(`grip.extras.role must remain "support-palm-contact" verbatim (got ${JSON.stringify(gripExtras.role)})`);
  }

  const outputBounds = unionBounds([...meshBounds.values()]);
  const sourceAnimationNames = (json.animations ?? []).map((animation) => animation.name ?? '<unnamed>');

  const manifest: WeaponManifest = {
    schema: 1,
    id: 'kaykit-rx24-weapon-only',
    generatedBy: 'asset-pipeline/kaykit-rx24/extract.ts',
    source: {
      path: SOURCE_PATH,
      sourceCommit: SOURCE_COMMIT,
      bytes: sourceBytes.length,
      sha256: actualSha256,
      license: 'assets/content-set/LICENSE.txt',
      licenseNote: 'Source file and licence stay byte-for-byte unchanged; the RX-24 upstream geometry is Quaternius Ultimate Guns Pack, CC0-1.0.',
    },
    output: {
      path: OUTPUT_PATH,
      bytes: glb.length,
      sha256: sha256(glb),
      triangles,
      vertices,
      materials: outMaterials.length,
      meshes: outMeshes.length,
      nodes: outNodes.length,
      drawCalls: outMeshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
      bbox: outputBounds,
      units: 'metres',
      unitsNote: 'The source glTF declares metres. Actual human-body scale fit is not verified by this asset.',
    },
    coordinateSystem: {
      root: 'rx24-root',
      rootMatrix: worldOf(rootIndex).toArray(),
      restMount: 'The source scene extras contain a first-person camera restMount. It is deliberately not exported and is not a world or bone mount.',
      origin: 'All recorded matrices and bounds are in the original rx24-root root coordinate system.',
    },
    nodes: nodeRecords,
    mounts: {
      muzzle: {
        node: 'muzzle',
        role: String(nodes[muzzleIndex]!.extras?.role ?? 'flash-and-tracer-anchor'),
        roleMeaning: 'Source muzzle flash and tracer anchor. It is not a hand grip or a camera mount.',
        position: offsetOf(muzzleIndex),
        matrix: worldOf(muzzleIndex).toArray(),
      },
      grip: {
        node: 'grip',
        role: 'support-palm-contact',
        roleMeaning: 'Support palm contact point. This is not a primary-hand grip, a generic bone socket, or a first-person camera mount.',
        position: offsetOf(gripIndex),
        matrix: worldOf(gripIndex).toArray(),
      },
    },
    excluded: {
      nodes: excludedRoots.map((index) => nodeName(nodes[index]!, index)),
      meshes: [...excludedMeshes].map((index) => meshes[index]!.name ?? `<mesh ${index}>`),
      triangles: [...excludedMeshes].reduce((sum, index) => sum + trianglesOf(json, meshes[index]!, index), 0),
      vertices: [...excludedMeshes].reduce((sum, index) => sum + verticesOf(json, meshes[index]!, index), 0),
      materials: [...excludedMaterialIndices].map((index) => materials[index]?.name ?? `<material ${index}>`),
      reason: 'Player arms and hands are separate hand meshes; the complete support-hand / trigger-hand subtrees are excluded before export. No hand or sleeve faces are removed by colour.',
    },
    animations: {
      source: sourceAnimationNames,
      exported: [],
      reason: 'This card delivers static weapon geometry and independent magazine/bolt nodes. The source clips (including first-person idle/fire) remain in the unchanged source and are not exported as weapon mounts or world animation.',
    },
    verification: {
      loader: LOADER_ID,
      checks: [
        'source SHA-256 and byte size',
        'unique required node names and root parent chain',
        'support-hand / trigger-hand subtrees excluded by node and mesh identity',
        'retained accessors, bufferViews and materials disjoint from hand meshes',
        'triangle and vertex contracts: 1958 / 5874',
        'real GLTFLoader re-read: node/world matrices, root-space vertices, separate magazine, materials, bbox and mounts',
      ],
      unverified: [
        'grip / muzzle placement against Knight hands and native reload clips',
        'style match, silhouette and first-person camera framing',
        'human-body metre scale fit',
        'browser, GPU and in-game adoption',
      ],
    },
  };

  return { glb, manifest };
}

function serializeGlb(json: OutputGltfJson, bin: Buffer): Buffer {
  let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  if (jsonPadding > 0) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  const total = 12 + 8 + jsonBuffer.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, bin]);
}

async function loadGlb(bytes: Buffer): Promise<GLTF> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new GLTFLoader().parseAsync(copy, '');
}

function uniqueNode(root: THREE.Object3D, name: string): THREE.Object3D {
  const matches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  if (matches.length !== 1) fail(`Expected exactly one node named ${name} in the loaded output, got ${matches.length}`);
  return matches[0]!;
}

function matrixDelta(a: THREE.Matrix4, b: THREE.Matrix4): number {
  let maximum = 0;
  for (let index = 0; index < 16; index++) maximum = Math.max(maximum, Math.abs(a.elements[index]! - b.elements[index]!));
  return maximum;
}

function compareBounds(actual: THREE.Box3, expected: Bounds, label: string): void {
  const values = [actual.min.x, actual.min.y, actual.min.z, actual.max.x, actual.max.y, actual.max.z];
  const wanted = [...expected.min, ...expected.max];
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || Math.abs(value - wanted[index]!) > 1e-6) {
      fail(`${label} bbox mismatch at ${index}: ${value} vs ${wanted[index]}`);
    }
  });
}

// Real THREE GLTFLoader round trip. Both inputs are parsed independently; the
// output is compared against the untouched source, not merely against itself.
export async function verifyWeaponOnly(outputGlb: Buffer, sourceBytes: Buffer, manifest: WeaponManifest): Promise<VerifyResult> {
  const sourceHash = sha256(sourceBytes);
  if (sourceHash !== SOURCE_SHA256) fail(`Source hash mismatch during verification: ${sourceHash}`);
  const [source, output] = await Promise.all([loadGlb(sourceBytes), loadGlb(outputGlb)]);
  source.scene.updateMatrixWorld(true);
  output.scene.updateMatrixWorld(true);

  const outputNames: string[] = [];
  let skinned = 0;
  let meshCount = 0;
  let triangles = 0;
  let vertices = 0;
  const outputMaterials = new Set<THREE.Material>();
  output.scene.traverse((object) => {
    if (object !== output.scene && object.name.length > 0) outputNames.push(object.name);
    if (object instanceof THREE.SkinnedMesh) skinned++;
    if (object instanceof THREE.Mesh) {
      meshCount++;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) outputMaterials.add(material);
      const geometry = object.geometry;
      const position = geometry.getAttribute('position');
      vertices += position.count;
      triangles += (geometry.index ? geometry.index.count : position.count) / 3;
      if (!geometry.getAttribute('normal')) fail(`Output mesh ${object.name} has no NORMAL attribute`);
      if (!geometry.getAttribute('color')) fail(`Output mesh ${object.name} has no COLOR_0 attribute`);
    }
  });
  if (skinned !== 0) fail(`Output must not contain skinned meshes (found ${skinned})`);
  if (meshCount !== 3) fail(`Output must contain exactly 3 meshes, got ${meshCount}`);
  if (triangles !== EXPECTED_TRIANGLES) fail(`Loaded output triangle count ${triangles} != ${EXPECTED_TRIANGLES}`);
  if (vertices !== EXPECTED_VERTICES) fail(`Loaded output vertex count ${vertices} != ${EXPECTED_VERTICES}`);
  for (const name of [...REQUIRED_NODES, ...EXCLUDED_NODES]) {
    if (!outputNames.includes(name)) continue;
    if ((EXCLUDED_NODES as readonly string[]).includes(name)) fail(`Output still contains excluded node ${name}`);
    uniqueNode(output.scene, name);
  }
  for (const name of outputNames) {
    if ((EXCLUDED_NODES as readonly string[]).includes(name)) fail(`Output still contains excluded node ${name}`);
  }
  if (output.scene.userData.restMount !== undefined) fail('Output scene must not carry the first-person restMount');
  if (output.animations.length !== 0) fail('Output must not export source animation clips');
  if (outputMaterials.size !== manifest.output.materials) fail(`Loaded material count ${outputMaterials.size} != manifest ${manifest.output.materials}`);

  let maxMatrixError = 0;
  let maxVertexError = 0;
  const vectorSource = new THREE.Vector3();
  const vectorOutput = new THREE.Vector3();

  for (const record of manifest.nodes) {
    const sourceNode = uniqueNode(source.scene, record.sourceName);
    const outputNode = uniqueNode(output.scene, record.name);
    maxMatrixError = Math.max(maxMatrixError, matrixDelta(sourceNode.matrixWorld, outputNode.matrixWorld));
    const wanted = new THREE.Matrix4().fromArray(record.outputMatrix);
    maxMatrixError = Math.max(maxMatrixError, matrixDelta(outputNode.matrixWorld, wanted));
    if (record.mesh !== null) {
      if (!(sourceNode instanceof THREE.Mesh) || !(outputNode instanceof THREE.Mesh)) fail(`Mesh node ${record.name} is not a THREE.Mesh`);
      const sourcePosition = sourceNode.geometry.getAttribute('position');
      const outputPosition = outputNode.geometry.getAttribute('position');
      if (sourcePosition.count !== outputPosition.count) fail(`Node ${record.name}: vertex count changed`);
      const sourceIndex = sourceNode.geometry.index;
      const outputIndex = outputNode.geometry.index;
      if ((sourceIndex === null) !== (outputIndex === null)) fail(`Node ${record.name}: index layout changed`);
      if (sourceIndex && outputIndex) {
        if (sourceIndex.count !== outputIndex.count) fail(`Node ${record.name}: index count changed`);
        for (let index = 0; index < sourceIndex.count; index++) {
          if (sourceIndex.getX(index) !== outputIndex.getX(index)) fail(`Node ${record.name}: index order changed`);
        }
      }
      for (let index = 0; index < sourcePosition.count; index++) {
        vectorSource.fromBufferAttribute(sourcePosition, index).applyMatrix4(sourceNode.matrixWorld);
        vectorOutput.fromBufferAttribute(outputPosition, index).applyMatrix4(outputNode.matrixWorld);
        maxVertexError = Math.max(maxVertexError, vectorSource.distanceTo(vectorOutput));
      }
      for (const semantic of ['normal', 'color'] as const) {
        const sourceAttribute = sourceNode.geometry.getAttribute(semantic);
        const outputAttribute = outputNode.geometry.getAttribute(semantic);
        if (!sourceAttribute || !outputAttribute) fail(`Node ${record.name}: missing ${semantic}`);
        if (sourceAttribute.count !== outputAttribute.count) fail(`Node ${record.name}: ${semantic} count changed`);
        for (let index = 0; index < sourceAttribute.count; index++) {
          maxVertexError = Math.max(
            maxVertexError,
            Math.abs(sourceAttribute.getX(index) - outputAttribute.getX(index)),
            Math.abs(sourceAttribute.getY(index) - outputAttribute.getY(index)),
            Math.abs(sourceAttribute.getZ(index) - outputAttribute.getZ(index)),
          );
        }
      }
    }
  }
  if (maxMatrixError > 1e-6) fail(`World matrix error ${maxMatrixError} exceeds 1e-6`);
  if (maxVertexError > 1e-6) fail(`Root-space vertex error ${maxVertexError} exceeds 1e-6`);

  const box = new THREE.Box3().setFromObject(output.scene);
  compareBounds(box, manifest.output.bbox, 'Output');
  for (const record of manifest.nodes) {
    if (record.bbox === null) continue;
    const node = uniqueNode(output.scene, record.name);
    compareBounds(new THREE.Box3().setFromObject(node), record.bbox, `Node ${record.name}`);
  }

  for (const mountName of ['muzzle', 'grip'] as const) {
    const mount = manifest.mounts[mountName];
    const sourceNode = uniqueNode(source.scene, mount.node);
    const outputNode = uniqueNode(output.scene, mount.node);
    const sourcePosition = sourceNode.getWorldPosition(new THREE.Vector3());
    const outputPosition = outputNode.getWorldPosition(new THREE.Vector3());
    const wanted = new THREE.Vector3(...mount.position);
    if (sourcePosition.distanceTo(wanted) > 1e-6) fail(`${mountName} source position does not match manifest`);
    if (outputPosition.distanceTo(sourcePosition) > 1e-6) fail(`${mountName} output position moved`);
  }

  const sourceMaterials = new Map<string, THREE.Material>();
  source.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.name) sourceMaterials.set(material.name, material);
    }
  });
  for (const material of outputMaterials) {
    if (!material.name) fail('Output material has no name');
    const sourceMaterial = sourceMaterials.get(material.name);
    if (!sourceMaterial) fail(`Output material ${material.name} has no source counterpart`);
    const sourceStandard = sourceMaterial as THREE.MeshStandardMaterial;
    const outputStandard = material as THREE.MeshStandardMaterial;
    if (typeof outputStandard.metalness !== 'number' || typeof outputStandard.roughness !== 'number') fail(`Material ${material.name}: loaded values are not standard PBR`);
    if (Math.abs(sourceStandard.metalness - outputStandard.metalness) > 1e-6) fail(`Material ${material.name}: metalness changed`);
    if (Math.abs(sourceStandard.roughness - outputStandard.roughness) > 1e-6) fail(`Material ${material.name}: roughness changed`);
    if (sourceStandard.side !== outputStandard.side) fail(`Material ${material.name}: side changed`);
    if (sourceStandard.color.getHex() !== outputStandard.color.getHex()) fail(`Material ${material.name}: base colour changed`);
  }
  if (manifest.mounts.grip.role !== 'support-palm-contact') fail('Manifest grip role must stay support-palm-contact');

  return {
    nodes: outputNames.length,
    meshes: meshCount,
    triangles,
    vertices,
    materials: outputMaterials.size,
    maxMatrixError,
    maxVertexError,
    bbox: roundBounds({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }),
  };
}

interface CliArgs {
  src: string;
  out: string;
  manifest: string;
}

function parseArgs(argv: string[]): CliArgs {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const src = value('--src');
  const out = value('--out');
  const manifest = value('--manifest');
  if (!src || !out || !manifest) {
    fail('Missing input: --src, --out and --manifest are all required');
  }
  return { src, out, manifest };
}

function temporaryName(target: string, suffix: string): string {
  return `${target}.tmp-${process.pid}-${suffix}`;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (!existsSync(args.src)) fail(`Input source is missing: ${args.src}`);
  if (!statSync(args.src).isFile()) fail(`Input source is not a file: ${args.src}`);
  const sourceBytes = readFileSync(args.src);
  const { glb, manifest } = buildWeaponOnly(sourceBytes);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  mkdirSync(dirname(resolve(args.manifest)), { recursive: true });

  const tempGlb = temporaryName(args.out, 'glb');
  const tempManifest = temporaryName(args.manifest, 'json');
  try {
    writeFileSync(tempGlb, glb);
    writeFileSync(tempManifest, manifestText, 'utf8');
    // Verify the bytes that will actually replace the targets, not just the
    // in-memory build, then replace both files only after every check passes.
    const persisted = readFileSync(tempGlb);
    const verify = await verifyWeaponOnly(persisted, sourceBytes, manifest);
    const persistedManifest = JSON.parse(readFileSync(tempManifest, 'utf8')) as WeaponManifest;
    if (persistedManifest.output.sha256 !== sha256(persisted)) fail('Manifest hash does not match the temporary GLB');
    renameSync(tempGlb, args.out);
    renameSync(tempManifest, args.manifest);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output: args.out,
      manifest: args.manifest,
      bytes: glb.length,
      sha256: manifest.output.sha256,
      triangles: verify.triangles,
      vertices: verify.vertices,
      maxMatrixError: verify.maxMatrixError,
      maxVertexError: verify.maxVertexError,
    }, null, 2)}\n`);
  } catch (error) {
    for (const path of [tempGlb, tempManifest]) {
      try {
        rmSync(path, { force: true });
      } catch {
        // Best-effort cleanup; the original targets were never replaced.
      }
    }
    throw error;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(resolve(entry)).href.toLowerCase() === import.meta.url.toLowerCase();
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kaykit-rx24 extract: ${message}\n`);
    process.exitCode = 1;
  });
}
