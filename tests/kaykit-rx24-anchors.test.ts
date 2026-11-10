import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { parseGlb } from '../asset-pipeline/kaykit-rx24/extract.js';
import {
  GRIP_MAX_AXIS_ERROR, GRIP_NODE, HAND_NODES, LOADER_ID, PALM_MAX_AXIS_ERROR, ROOT, SCHEMA, SOURCE_BYTES,
  SOURCE_COMMIT, SOURCE_PATH, SOURCE_SHA256, UNITS, buildAnchors, serializeAnchors,
} from '../asset-pipeline/kaykit-rx24/anchors.js';
import { weaponParts } from '../src/render/weapon.js';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT_DIR, SOURCE_PATH);
const SOURCE_JSON = join(ROOT_DIR, 'assets/weapons/rx24-rifle.json');
const ANCHORS_JSON = join(ROOT_DIR, 'asset-pipeline/kaykit-rx24/anchors.json');
const ANCHORS_CLI = join(ROOT_DIR, 'asset-pipeline/kaykit-rx24/anchors.ts');

// Fixed inputs supplied by the task card. The implementation must derive these
// from the live rifle consumer and the fixed GLB, and these assertions must
// fail if either drifts.
const EXPECTED_PRIMARY = [0.036, -0.099, -0.19] as const;
const EXPECTED_IDLE_SUPPORT = [-0.033, -0.044, -0.446] as const;
const EXPECTED_RELOAD_TARGET = [-0.03443, -0.175014, -0.345572] as const;
const EXPECTED_SUPPORT_BEFORE_Y = [-0.033, -0.069, -0.446] as const;

function sourceBytes(): Buffer {
  return readFileSync(SOURCE);
}

function hashOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function load(bytes: Buffer): Promise<GLTF> {
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
}

function uniqueNode(scene: THREE.Object3D, name: string): THREE.Object3D {
  const matches: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  assert.equal(matches.length, 1, `expected exactly one node named ${name}`);
  return matches[0]!;
}

function worldOrigin(object: THREE.Object3D): number[] {
  const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
  return [position.x, position.y, position.z];
}

function assertVec(actual: readonly number[], expected: readonly number[], tolerance: number, label: string): void {
  assert.equal(actual.length, 3, `${label} must be a 3-vector`);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(
      Math.abs(actual[axis]! - expected[axis]!) <= tolerance,
      `${label}[${axis}] ${actual[axis]} != ${expected[axis]} (tolerance ${tolerance})`,
    );
  }
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

// Rewrite only the JSON chunk of the fixed GLB so structural rejection paths
// can be exercised without touching the accepted source artifact.
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

function renameNode(document: any, from: string, to: string): void {
  const node = document.nodes.find((entry: any) => entry.name === from);
  assert.ok(node, `fixture needs a node named ${from}`);
  node.name = to;
}

function cli(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', ANCHORS_CLI, ...args], { cwd: ROOT_DIR, encoding: 'utf8' });
}

test('fixed RX-24 anchors expose the three distinct contact semantics', async () => {
  const document = await buildAnchors(sourceBytes());

  assert.equal(document.schema, SCHEMA);
  assert.equal(document.schema, 1);
  assert.equal(document.root, ROOT);
  assert.equal(document.units, UNITS);
  assert.equal(document.up, '+Y');
  assert.equal(document.forward, '-Z');
  assert.equal(document.evidence.loader, LOADER_ID);
  assert.equal(document.source.path, SOURCE_PATH);
  assert.equal(document.source.bytes, SOURCE_BYTES);
  assert.equal(document.source.sha256, SOURCE_SHA256);
  assert.equal(document.source.commit, SOURCE_COMMIT);

  const primary = document.points['primary-palm-center'];
  const idleSupport = document.points['idle-support-palm-center'];
  const reloadTarget = document.points['reload-magazine-palm-target'];
  assertVec(primary, EXPECTED_PRIMARY, 1e-12, 'primary-palm-center');
  assertVec(idleSupport, EXPECTED_IDLE_SUPPORT, 1e-12, 'idle-support-palm-center');
  assertVec(reloadTarget, EXPECTED_RELOAD_TARGET, 1e-12, 'reload-magazine-palm-target');

  // The three roles must not collapse into one point or into a relabelled grip.
  assert.notDeepEqual(primary, idleSupport);
  assert.notDeepEqual(primary, reloadTarget);
  assert.notDeepEqual(idleSupport, reloadTarget);
  assert.equal(new Set([primary.join(','), idleSupport.join(','), reloadTarget.join(',')]).size, 3);

  // Distances are published from the same points.
  assert.ok(Math.abs(document.distances.primaryToIdleSupport - distance(primary, idleSupport)) <= 1e-9);
  assert.ok(Math.abs(document.distances.primaryToReloadMagazineTarget - distance(primary, reloadTarget)) <= 1e-9);

  // Muzzle axis comes from the source local gun axis, with geometry evidence.
  assert.deepEqual(document.muzzle.axis, [0, 0, -1]);
  assert.deepEqual(document.muzzle.position, [0.0003, 0.0021, -0.7775]);
  assert.equal(document.muzzle.geometryEvidence.muzzleAtDistalNegativeZ, true);
  assert.ok(document.muzzle.axisSource.includes('forward -Z'));

  // A set of points is not a frame; these stay explicitly unverified.
  assert.equal(document.unverified.palmSurfaceNormal, null);
  assert.equal(document.unverified.palmRotation, null);
  assert.equal(document.unverified.knightBoneBinding, null);
  assert.equal(document.unverified.acceptableContactTolerance, null);

  // The source grip node keeps its existing role; it is reinterpreted as the
  // reload magazine target, never renamed or rewritten.
  assert.equal(document.evidence.gripNode.sourceName, 'grip');
  assert.equal(document.evidence.gripNode.sourceExtrasRole, 'support-palm-contact');
  assert.ok(document.gripInterpretation.includes('reload-magazine palm target'));
  assert.ok(document.gripInterpretation.includes('not the idle support foregrip hold'));
});

test('anchors match the real GLTFLoader hand and grip node origins', async () => {
  const document = await buildAnchors(sourceBytes());
  const gltf = await load(sourceBytes());
  gltf.scene.updateMatrixWorld(true);

  assert.equal(gltf.scene.userData.units, 'metres');
  assert.equal(gltf.scene.userData.up, '+Y');
  assert.equal(gltf.scene.userData.forward, '-Z');
  assert.deepEqual([...HAND_NODES], ['trigger-hand', 'support-hand']);
  assert.equal(uniqueNode(gltf.scene, ROOT).matrixWorld.equals(new THREE.Matrix4()), true);

  const trigger = uniqueNode(gltf.scene, 'trigger-hand');
  const support = uniqueNode(gltf.scene, 'support-hand');
  const grip = uniqueNode(gltf.scene, GRIP_NODE);
  const triggerOrigin = worldOrigin(trigger);
  const supportOrigin = worldOrigin(support);
  const gripOrigin = worldOrigin(grip);

  assertVec(triggerOrigin, document.points['primary-palm-center'], PALM_MAX_AXIS_ERROR, 'trigger-hand root origin');
  assertVec(supportOrigin, document.points['idle-support-palm-center'], PALM_MAX_AXIS_ERROR, 'support-hand root origin');
  // Only the grip point gets the wider existing 4-decimal encoding bound.
  assertVec(gripOrigin, document.points['reload-magazine-palm-target'], GRIP_MAX_AXIS_ERROR, 'grip root origin');
  assert.ok(distance(triggerOrigin, gripOrigin) > 0.1, 'grip must not be consumed as the primary palm centre');
  assert.equal(grip.userData.role, 'support-palm-contact');

  // Evidence recorded in the document is the observed error, not a guess.
  assertVec(document.evidence.handNodes['trigger-hand'].nodeOrigin, triggerOrigin, 1e-12, 'recorded trigger-hand origin');
  assertVec(document.evidence.handNodes['support-hand'].nodeOrigin, supportOrigin, 1e-12, 'recorded support-hand origin');
  assertVec(document.evidence.gripNode.nodeOrigin, gripOrigin, 1e-12, 'recorded grip origin');
  assertVec(document.evidence.gripNode.computedTarget, document.points['reload-magazine-palm-target'], 1e-12, 'recorded computed target');
  assert.ok(document.evidence.gripNode.maxAxisError <= GRIP_MAX_AXIS_ERROR);
  assert.ok(document.evidence.gripNode.maxAxisError > 0, 'the source 4-decimal grip encoding should be reported, not hidden');
  assert.ok(document.evidence.handNodes['trigger-hand'].maxAxisError <= PALM_MAX_AXIS_ERROR);
  assert.ok(document.evidence.handNodes['support-hand'].maxAxisError <= PALM_MAX_AXIS_ERROR);
});

test('hands() Y adjustment is applied exactly once and recomposes the reload target', async () => {
  const document = await buildAnchors(sourceBytes());
  const parts = weaponParts('rifle');
  const support = parts.find((part) => part.id === 'support-palm')!;
  const trigger = parts.find((part) => part.id === 'trigger-palm')!;
  assert.ok(support.gripOffset, 'support-palm must carry the derived gripOffset');

  // The pre-adjustment palm sat at y -0.069; the finished part is y -0.044.
  assert.ok(Math.abs(support.position[1]! - EXPECTED_SUPPORT_BEFORE_Y[1]! - 0.025) <= 1e-12);
  assert.ok(Math.abs(support.position[1]! - (-0.044)) <= 1e-12);
  assert.ok(Math.abs(document.points['idle-support-palm-center'][1]! - (-0.044)) <= 1e-12);
  assert.ok(Math.abs(document.points['idle-support-palm-center'][1]! - (-0.069)) > 1e-3);
  assert.ok(Math.abs(document.points['idle-support-palm-center'][1]! - (-0.019)) > 1e-3);

  // A second application would change the offset to about -0.156014.
  assert.ok(Math.abs(support.gripOffset[1]! - (-0.131014)) <= 1e-9);
  assert.ok(Math.abs(support.gripOffset[1]! - (-0.156014)) > 1e-3);

  const recomposed = [0, 1, 2].map((axis) => support.position[axis]! + support.gripOffset![axis]!);
  assertVec(document.points['reload-magazine-palm-target'], recomposed, 1e-12, 'support.position + gripOffset');
  assertVec(document.points['primary-palm-center'], trigger.position, 1e-12, 'trigger-palm.position');
});

test('independent source-JSON recomputation matches the published reload point', async () => {
  const document = await buildAnchors(sourceBytes());
  // Independent path: read the fixed source JSON directly and add surface +
  // palmOffset, without going through rifle.ts / weaponParts.
  const source = JSON.parse(readFileSync(SOURCE_JSON, 'utf8')) as {
    grip: { surface: [number, number, number]; palmOffset: [number, number, number] };
  };
  assert.equal(source.grip.surface.length, 3);
  const independent = source.grip.surface.map((value, axis) => value + source.grip.palmOffset[axis]!);
  assertVec(document.points['reload-magazine-palm-target'], independent, 1e-12, 'independent grip recomputation');

  // And the independent GLB grip node agrees within its existing encoding.
  const gltf = await load(sourceBytes());
  gltf.scene.updateMatrixWorld(true);
  assertVec(worldOrigin(uniqueNode(gltf.scene, 'grip')), independent, GRIP_MAX_AXIS_ERROR, 'independent GLB grip origin');
});

test('committed anchors.json is the deterministic build output', async () => {
  const first = await buildAnchors(sourceBytes());
  const second = await buildAnchors(sourceBytes());
  const serialized = serializeAnchors(first);
  assert.equal(serializeAnchors(second), serialized);
  assert.deepEqual(second, first);
  assert.equal(readFileSync(ANCHORS_JSON, 'utf8'), serialized);

  const runA = cli(['--src', 'assets/content-set/fp-arms-rx24.glb']);
  const runB = cli(['--src', 'assets/content-set/fp-arms-rx24.glb']);
  assert.equal(runA.status, 0, runA.stderr);
  assert.equal(runB.status, 0, runB.stderr);
  assert.equal(runA.stderr, '');
  assert.equal(runB.stderr, '');
  assert.equal(runA.stdout, runB.stdout);
  assert.equal(runA.stdout, serialized);
  assert.deepEqual(JSON.parse(runA.stdout), first);
});

test('CLI rejects missing input, wrong bytes and wrong hash without stdout', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rx24-anchors-'));
  try {
    const missing = cli([]);
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Missing input/);

    const noFile = cli(['--src', join(directory, 'absent.glb')]);
    assert.notEqual(noFile.status, 0);
    assert.equal(noFile.stdout, '');
    assert.match(noFile.stderr, /Cannot read source/);

    const appended = join(directory, 'appended.glb');
    writeFileSync(appended, Buffer.concat([sourceBytes(), Buffer.from([0])]));
    const wrongBytes = cli(['--src', appended]);
    assert.notEqual(wrongBytes.status, 0);
    assert.equal(wrongBytes.stdout, '');
    assert.match(wrongBytes.stderr, /byte size/);

    const flipped = join(directory, 'flipped.glb');
    const copy = sourceBytes();
    copy[copy.length - 1] = copy[copy.length - 1]! ^ 0xff;
    writeFileSync(flipped, copy);
    const wrongHash = cli(['--src', flipped]);
    assert.notEqual(wrongHash.status, 0);
    assert.equal(wrongHash.stdout, '');
    assert.match(wrongHash.stderr, /SHA-256 mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('build rejects duplicate and missing mount nodes and never edits the source', async () => {
  const original = sourceBytes();

  const duplicate = mutated(original, (json) => renameNode(json, 'support-hand', 'trigger-hand'));
  await assert.rejects(
    buildAnchors(duplicate.bytes, duplicate.options),
    /exactly one node named trigger-hand/,
  );

  const missingGrip = mutated(original, (json) => renameNode(json, 'grip', 'grip-moved'));
  await assert.rejects(
    buildAnchors(missingGrip.bytes, missingGrip.options),
    /exactly one node named grip/,
  );

  const missingMuzzle = mutated(original, (json) => renameNode(json, 'muzzle', 'muzzle-moved'));
  await assert.rejects(
    buildAnchors(missingMuzzle.bytes, missingMuzzle.options),
    /exactly one node named muzzle/,
  );

  const missingHand = mutated(original, (json) => renameNode(json, 'support-hand', 'support-hand-moved'));
  await assert.rejects(
    buildAnchors(missingHand.bytes, missingHand.options),
    /exactly one node named support-hand/,
  );

  // The same duplicate/missing fixtures also fail as a real process exit, so a
  // caller cannot mistake a rejected build for success. The inline runner is
  // the only place the test-only digest override is used.
  const directory = mkdtempSync(join(tmpdir(), 'rx24-anchors-mount-'));
  try {
    const runner = `
import { readFileSync } from 'node:fs';
import { buildAnchors } from './asset-pipeline/kaykit-rx24/anchors.ts';
await buildAnchors(readFileSync(process.argv[1]), { expectedSha256: process.argv[2], expectedBytes: Number(process.argv[3]) });
`;
    for (const [name, fixture, pattern] of [
      ['duplicate', duplicate, /exactly one node named trigger-hand/],
      ['missing-grip', missingGrip, /exactly one node named grip/],
      ['missing-hand', missingHand, /exactly one node named support-hand/],
    ] as const) {
      const file = join(directory, `${name}.glb`);
      writeFileSync(file, fixture.bytes);
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', runner, file, fixture.options.expectedSha256, String(fixture.options.expectedBytes)],
        { cwd: ROOT_DIR, encoding: 'utf8' },
      );
      assert.notEqual(result.status, 0, `${name} fixture should exit non-zero`);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, pattern);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  // The fixed artifact is read-only for this card.
  assert.deepEqual(sourceBytes(), original);
  assert.equal(hashOf(original), SOURCE_SHA256);
});

test('public anchor artifact carries no local paths, timestamps or secrets', async () => {
  const text = readFileSync(ANCHORS_JSON, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/);
  assert.doesNotMatch(text, /\/(?:Users|home|tmp)\//);
  assert.doesNotMatch(text, /file:\/\//);
  assert.doesNotMatch(text, /https?:\/\//);
  assert.doesNotMatch(text, /(?:ghp_|AKIA|BEGIN [A-Z ]*PRIVATE KEY)/);
  assert.doesNotMatch(text, /"(?:timestamp|generatedAt|localPath)"/);
  assert.doesNotMatch(text, /\u0000/);

  const serialized = serializeAnchors(await buildAnchors(sourceBytes()));
  assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/);
  assert.equal(serialized, text);
});
