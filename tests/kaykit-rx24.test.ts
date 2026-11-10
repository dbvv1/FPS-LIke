import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  EXPECTED_TRIANGLES, EXPECTED_VERTICES, EXCLUDED_NODES, REQUIRED_NODES, SOURCE_BYTES, SOURCE_SHA256,
  buildWeaponOnly, parseGlb, verifyWeaponOnly, type WeaponManifest,
} from '../asset-pipeline/kaykit-rx24/extract.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'assets/content-set/fp-arms-rx24.glb');
const OUTPUT = join(ROOT, 'asset-pipeline/kaykit-rx24/weapon-only.glb');
const MANIFEST = join(ROOT, 'asset-pipeline/kaykit-rx24/manifest.json');
const README = join(ROOT, 'asset-pipeline/kaykit-rx24/README.md');
const EXTRACT = join(ROOT, 'asset-pipeline/kaykit-rx24/extract.ts');

const sourceBytes = () => readFileSync(SOURCE);
const hashOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const outputBytes = () => readFileSync(OUTPUT);
const outputManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8')) as WeaponManifest;

async function load(bytes: Buffer): Promise<GLTF> {
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
}

// Rewrite only the JSON chunk of a fixed GLB so structural rejection paths can
// be exercised without changing the accepted source artifact.
function rewriteJson(source: Buffer, mutate: (json: any) => void): Buffer {
  const { json, bin } = parseGlb(source);
  const document = json as any;
  mutate(document);
  let jsonBuffer = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  if (jsonPadding > 0) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  const total = 12 + 8 + jsonBuffer.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, bin]);
}

function mutated(source: Buffer, mutate: (json: any) => void) {
  const bytes = rewriteJson(source, mutate);
  return { bytes, options: { expectedSha256: hashOf(bytes), expectedBytes: bytes.length } };
}

function bufferViewBytes(document: { json: any; bin: Buffer }, accessorIndex: number): Buffer {
  const accessor = document.json.accessors[accessorIndex];
  const view = document.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type as 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4']!;
  const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType as 5120 | 5121 | 5122 | 5123 | 5125 | 5126]!;
  return document.bin.subarray(start, start + accessor.count * size * componentSize);
}

function floatPositions(document: { json: any; bin: Buffer }, accessorIndex: number): number[] {
  const accessor = document.json.accessors[accessorIndex];
  const view = document.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  assert.equal(accessor.componentType, 5126);
  const values: number[] = [];
  for (let index = 0; index < accessor.count * 3; index++) values.push(document.bin.readFloatLE(start + index * 4));
  return values;
}

test('fixed RX-24 source extracts exactly the weapon-only contract', () => {
  const source = sourceBytes();
  assert.equal(source.length, SOURCE_BYTES);
  assert.equal(hashOf(source), SOURCE_SHA256);

  const { glb, manifest } = buildWeaponOnly(source);
  const sourceDocument = parseGlb(source);
  const output = parseGlb(glb);
  const json: any = output.json;

  assert.deepEqual(json.nodes.map((node: any) => node.name), [...REQUIRED_NODES]);
  assert.deepEqual(json.meshes.map((mesh: any) => mesh.name), ['rx24-static', 'rx24-magazine', 'rx24-bolt']);
  assert.equal(json.materials.length, 1);
  assert.equal(json.materials[0].name, 'RX-24 gunmetal');
  assert.deepEqual(json.materials, [(sourceDocument.json as any).materials[0]]);
  assert.equal(json.animations, undefined);
  assert.equal(json.images, undefined);
  assert.equal(json.skins, undefined);
  assert.equal(json.textures, undefined);
  assert.deepEqual(json.extensionsRequired, ['KHR_mesh_quantization']);
  assert.equal(json.accessors.length, 9);
  assert.equal(json.bufferViews.length, 9);
  for (const name of EXCLUDED_NODES) {
    assert.ok(!json.nodes.some((node: any) => node.name === name), `output node ${name}`);
    assert.ok(!json.meshes.some((mesh: any) => mesh.name === name), `output mesh ${name}`);
  }

  assert.equal(manifest.source.sha256, SOURCE_SHA256);
  assert.equal(manifest.source.bytes, SOURCE_BYTES);
  assert.equal(manifest.output.triangles, EXPECTED_TRIANGLES);
  assert.equal(manifest.output.vertices, EXPECTED_VERTICES);
  assert.equal(manifest.output.materials, 1);
  assert.equal(manifest.output.meshes, 3);
  assert.equal(manifest.output.nodes, 6);
  assert.equal(manifest.output.path, 'asset-pipeline/kaykit-rx24/weapon-only.glb');
  assert.equal(manifest.output.sha256, hashOf(glb));
  assert.equal(manifest.output.bytes, glb.length);
  assert.deepEqual(manifest.output.bbox, {
    min: [-0.027446, -0.214921, -0.777468],
    max: [0.036, 0.071522, 0.049542],
  });
  assert.equal(manifest.nodes.reduce((sum, node) => sum + node.triangles, 0), EXPECTED_TRIANGLES);
  assert.equal(manifest.nodes.reduce((sum, node) => sum + node.bytes, 0), (output.json as any).buffers[0].byteLength);
  for (const node of manifest.nodes) assert.deepEqual(node.outputMatrix, node.sourceMatrix);

  assert.equal(manifest.mounts.grip.role, 'support-palm-contact');
  assert.deepEqual(json.nodes.find((node: any) => node.name === 'grip').extras, { role: 'support-palm-contact' });
  assert.deepEqual(manifest.mounts.grip.position, [-0.0344, -0.175, -0.3456]);
  assert.deepEqual(manifest.mounts.muzzle.position, [0.0003, 0.0021, -0.7775]);
  assert.equal(manifest.mounts.muzzle.role, 'flash-and-tracer-anchor');
  assert.equal(manifest.coordinateSystem.rootMatrix.join(','), '1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1');
  assert.match(manifest.coordinateSystem.restMount, /not exported/);
  assert.deepEqual(manifest.excluded.nodes, [...EXCLUDED_NODES]);
  assert.equal(manifest.excluded.triangles, 1048);
  assert.equal(manifest.excluded.vertices, 3144);
  assert.deepEqual(manifest.animations.source, ['idle', 'fire', 'reload-magazine', 'reload-bolt']);
  assert.deepEqual(manifest.animations.exported, []);

  // Byte-for-byte vertex data: every retained accessor keeps its source bytes.
  const sourceMeshes = new Map((sourceDocument.json as any).meshes.map((mesh: any) => [mesh.name, mesh]));
  const outputMeshes = new Map(json.meshes.map((mesh: any) => [mesh.name, mesh]));
  for (const [name, sourceMesh] of sourceMeshes) {
    if (!outputMeshes.has(name)) continue;
    const sourcePrimitive = (sourceMesh as any).primitives[0];
    const outputPrimitive = (outputMeshes.get(name) as any).primitives[0];
    assert.deepEqual(Object.keys(outputPrimitive.attributes), Object.keys(sourcePrimitive.attributes));
    for (const semantic of Object.keys(sourcePrimitive.attributes)) {
      const sourceAccessor = sourcePrimitive.attributes[semantic];
      const outputAccessor = outputPrimitive.attributes[semantic];
      assert.deepEqual(bufferViewBytes(sourceDocument, sourceAccessor), bufferViewBytes(output, outputAccessor), `${name} ${semantic}`);
    }
  }
});

test('real GLTFLoader round trip keeps root-space vertices, separate parts and mounts', async () => {
  const source = sourceBytes();
  const { glb, manifest } = buildWeaponOnly(source);
  const verified = await verifyWeaponOnly(glb, source, manifest);
  assert.equal(verified.triangles, EXPECTED_TRIANGLES);
  assert.equal(verified.vertices, EXPECTED_VERTICES);
  assert.equal(verified.meshes, 3);
  assert.equal(verified.materials, 1);
  assert.equal(verified.maxMatrixError, 0);
  assert.equal(verified.maxVertexError, 0);

  const [sourceGltf, outputGltf] = await Promise.all([load(source), load(glb)]);
  outputGltf.scene.updateMatrixWorld(true);

  const outputNodeNames: string[] = [];
  const outputMeshes: THREE.Mesh[] = [];
  outputGltf.scene.traverse((object) => {
    outputNodeNames.push(object.name);
    if (object instanceof THREE.SkinnedMesh) assert.fail('output must not be skinned');
    if (object instanceof THREE.Mesh) outputMeshes.push(object);
  });
  assert.equal(outputMeshes.length, 3);
  for (const name of EXCLUDED_NODES) assert.ok(!outputNodeNames.includes(name));
  assert.equal(outputGltf.scene.userData.restMount, undefined);
  assert.equal(outputGltf.animations.length, 0);

  const staticMesh = outputGltf.scene.getObjectByName('rifle-static') as THREE.Mesh;
  const magazine = outputGltf.scene.getObjectByName('rifle-magazine') as THREE.Mesh;
  const bolt = outputGltf.scene.getObjectByName('rifle-bolt') as THREE.Mesh;
  assert.ok(staticMesh && magazine && bolt);
  assert.notEqual(staticMesh.geometry, magazine.geometry);
  assert.notEqual(staticMesh.geometry, bolt.geometry);
  assert.equal(staticMesh.geometry.getAttribute('position').count, 5418);
  assert.equal(magazine.geometry.getAttribute('position').count, 372);
  assert.equal(bolt.geometry.getAttribute('position').count, 84);

  // Independent source-space check: decode raw POSITION accessors rather than
  // trusting the extractor's manifest, and compare the first vertex plus the
  // magazine translation with the loaded output.
  const sourceDocument = parseGlb(source);
  const sourceJson: any = sourceDocument.json;
  const staticNode = sourceJson.nodes.find((node: any) => node.name === 'rifle-static');
  const magazineNode = sourceJson.nodes.find((node: any) => node.name === 'rifle-magazine');
  const staticPositions = floatPositions(sourceDocument, sourceJson.meshes[staticNode.mesh].primitives[0].attributes.POSITION);
  const magazinePositions = floatPositions(sourceDocument, sourceJson.meshes[magazineNode.mesh].primitives[0].attributes.POSITION);
  const outputStatic = staticMesh.geometry.getAttribute('position');
  const outputMagazine = magazine.geometry.getAttribute('position');
  assert.ok(Math.abs(outputStatic.getX(0) - staticPositions[0]!) < 1e-6);
  assert.ok(Math.abs(outputStatic.getY(0) - staticPositions[1]!) < 1e-6);
  assert.ok(Math.abs(outputStatic.getZ(0) - staticPositions[2]!) < 1e-6);
  const magazineWorld = new THREE.Vector3().fromBufferAttribute(outputMagazine, 0).applyMatrix4(magazine.matrixWorld);
  assert.ok(Math.abs(magazineWorld.x - (magazinePositions[0]! + magazineNode.translation[0])) < 1e-6);
  assert.ok(Math.abs(magazineWorld.y - (magazinePositions[1]! + magazineNode.translation[1])) < 1e-6);
  assert.ok(Math.abs(magazineWorld.z - (magazinePositions[2]! + magazineNode.translation[2])) < 1e-6);

  const originalGrip = sourceGltf.scene.getObjectByName('grip')!.getWorldPosition(new THREE.Vector3());
  const outputGrip = outputGltf.scene.getObjectByName('grip')!.getWorldPosition(new THREE.Vector3());
  assert.ok(originalGrip.distanceTo(outputGrip) < 1e-6);
  assert.ok(outputGrip.distanceTo(new THREE.Vector3(-0.0344, -0.175, -0.3456)) < 1e-6);
  const originalMuzzle = sourceGltf.scene.getObjectByName('muzzle')!.getWorldPosition(new THREE.Vector3());
  const outputMuzzle = outputGltf.scene.getObjectByName('muzzle')!.getWorldPosition(new THREE.Vector3());
  assert.ok(originalMuzzle.distanceTo(outputMuzzle) < 1e-6);
});

test('rebuilds are deterministic and committed products match the fixed source', () => {
  const source = sourceBytes();
  const first = buildWeaponOnly(source);
  const second = buildWeaponOnly(source);
  assert.deepEqual(first.glb, second.glb);
  assert.equal(hashOf(first.glb), hashOf(second.glb));
  assert.deepEqual(first.manifest, second.manifest);
  assert.equal(JSON.stringify(first.manifest), JSON.stringify(second.manifest));

  assert.deepEqual(outputBytes(), first.glb);
  assert.equal(hashOf(outputBytes()), first.manifest.output.sha256);
  assert.deepEqual(outputManifest(), first.manifest);
});

test('CLI needs explicit paths, rejects a bad hash and never overwrites valid output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kaykit-rx24-'));
  try {
    const out = join(directory, 'weapon-only.glb');
    const manifest = join(directory, 'manifest.json');
    const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'asset-pipeline/kaykit-rx24/extract.ts', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });

    const missing = run(['--out', out, '--manifest', manifest]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing input/);
    assert.equal(existsSync(out), false);
    assert.equal(existsSync(manifest), false);

    const valid = run(['--src', 'assets/content-set/fp-arms-rx24.glb', '--out', out, '--manifest', manifest]);
    assert.equal(valid.status, 0, valid.stderr);
    const validGlb = readFileSync(out);
    const validManifest = readFileSync(manifest, 'utf8');
    assert.equal(hashOf(validGlb), buildWeaponOnly(sourceBytes()).manifest.output.sha256);

    const corruptPath = join(directory, 'corrupt.glb');
    const corrupt = Buffer.from(sourceBytes());
    corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 0xff;
    writeFileSync(corruptPath, corrupt);
    const rejected = run(['--src', corruptPath, '--out', out, '--manifest', manifest]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /hash mismatch/i);
    assert.deepEqual(readFileSync(out), validGlb);
    assert.equal(readFileSync(manifest, 'utf8'), validManifest);

    const secondDirectory = mkdtempSync(join(tmpdir(), 'kaykit-rx24-second-'));
    try {
      const secondOut = join(secondDirectory, 'weapon-only.glb');
      const secondManifest = join(secondDirectory, 'manifest.json');
      const rebuilt = run(['--src', 'assets/content-set/fp-arms-rx24.glb', '--out', secondOut, '--manifest', secondManifest]);
      assert.equal(rebuilt.status, 0, rebuilt.stderr);
      assert.equal(hashOf(readFileSync(secondOut)), hashOf(validGlb));
      assert.equal(readFileSync(secondManifest, 'utf8'), validManifest);
    } finally {
      rmSync(secondDirectory, { recursive: true, force: true });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing, duplicate, unclassified and unseparable nodes fail closed', () => {
  const source = sourceBytes();

  const corrupt = Buffer.from(source);
  corrupt[100] = corrupt[100]! ^ 0x01;
  assert.throws(() => buildWeaponOnly(corrupt), /Source hash mismatch/);

  const missing = mutated(source, (json) => {
    json.nodes.find((node: any) => node.name === 'muzzle').name = 'muzzle-renamed';
  });
  assert.throws(() => buildWeaponOnly(missing.bytes, missing.options), /Missing required node muzzle/);

  const duplicate = mutated(source, (json) => {
    json.nodes.push({ name: 'grip', translation: [0, 0, 0] });
  });
  assert.throws(() => buildWeaponOnly(duplicate.bytes, duplicate.options), /Duplicate node name grip/);

  const sharedMesh = mutated(source, (json) => {
    json.nodes.find((node: any) => node.name === 'support-hand').mesh = 0;
  });
  assert.throws(() => buildWeaponOnly(sharedMesh.bytes, sharedMesh.options), /Cannot separate/);

  const sharedMaterial = mutated(source, (json) => {
    json.meshes[0].primitives[0].material = 1;
  });
  assert.throws(() => buildWeaponOnly(sharedMaterial.bytes, sharedMaterial.options), /hand-only material/);

  const stray = mutated(source, (json) => {
    json.nodes.push({ name: 'stray' });
  });
  assert.throws(() => buildWeaponOnly(stray.bytes, stray.options), /Cannot classify node stray/);

  const outsideRoot = mutated(source, (json) => {
    json.nodes[0].children = json.nodes[0].children.filter((index: number) => index !== 7);
    json.nodes[7].translation = [0, 0, 0];
  });
  assert.throws(() => buildWeaponOnly(outsideRoot.bytes, outsideRoot.options), /not under rx24-root/);
});

test('public artifacts contain no local absolute paths or credentials', () => {
  const patterns: [string, RegExp][] = [
    ['drive path', /[A-Za-z]:[\\/]/],
    ['user home path', /\/Users\/|\/home\//],
    ['receiver workspace name', /a1dbv-receiver/i],
    ['private IPv4', /\b(?:10|127)\.\d+\.\d+\.\d+\b|\b192\.168\.\d+\.\d+\b/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
    ['API key', /\bsk-[A-Za-z0-9]{20,}\b/],
    ['credential assignment', /(?:password|passwd|secret|api[_-]?key)\s*[:=]/i],
  ];
  for (const file of [README, MANIFEST, OUTPUT, EXTRACT]) {
    const text = readFileSync(file).toString('latin1');
    for (const [label, pattern] of patterns) assert.doesNotMatch(text, pattern, `${file} contains ${label}`);
  }
  const manifest = outputManifest();
  assert.equal(manifest.source.path, 'assets/content-set/fp-arms-rx24.glb');
  assert.equal(manifest.output.path, 'asset-pipeline/kaykit-rx24/weapon-only.glb');
  assert.ok(!manifest.source.path.includes(':'));
  assert.ok(!manifest.output.path.includes(':'));
});
