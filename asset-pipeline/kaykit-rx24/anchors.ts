#!/usr/bin/env node
// RX-24 contact-anchor contract for the fixed first-person weapon source.
//
//   node --import tsx asset-pipeline/kaykit-rx24/anchors.ts \
//     --src assets/content-set/fp-arms-rx24.glb \
//     > asset-pipeline/kaykit-rx24/anchors.json
//
// The three semantics come from the live render consumer, not from a second
// hand-transcribed constant table: the two palm centres are the positions of
// `weaponParts('rifle')` parts, and the reload target is
// `support-palm.position + support-palm.gripOffset`. The fixed source GLB is
// then read with the real THREE GLTFLoader to check that the trigger-hand /
// support-hand node origins carry those palm centres and that the source grip
// node carries the reload target (within its existing 4-decimal encoding).
//
// This card publishes points only. It deliberately leaves palm surface
// normals/rotations, Knight bone binding and a contact tolerance null: a set of
// 3-D points is not a complete mount frame, and the source has no such data.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { weaponParts } from '../../src/render/weapon.js';

export const SOURCE_PATH = 'assets/content-set/fp-arms-rx24.glb';
export const SOURCE_SHA256 = 'e672d06e30262f2575076f759645aa3d82d6734f0c26ef280a2a36870549b9e1';
export const SOURCE_BYTES = 188088;
export const SOURCE_COMMIT = 'b198df62a56f4c520716fbc9cb4afac47dd62213';
export const ROOT = 'rx24-root';
export const UNITS = 'metres';
export const SCHEMA = 1;
export const LOADER_ID = 'three 0.186.1 GLTFLoader';

// The source hand nodes sit exactly on the live palm centres; grip keeps its
// existing 4-decimal encoding in the fixed source, hence the wider bound.
export const PALM_MAX_AXIS_ERROR = 1e-5;
export const GRIP_MAX_AXIS_ERROR = 5e-5;

export const HAND_NODES = ['trigger-hand', 'support-hand'] as const;
export const GRIP_NODE = 'grip';
export const GRIP_SOURCE_ROLE = 'support-palm-contact';

export type Vec3 = [number, number, number];
export type AnchorRole = 'primary-palm-center' | 'idle-support-palm-center' | 'reload-magazine-palm-target';

export interface AnchorsDocument {
  schema: 1;
  id: 'kaykit-rx24-anchors';
  generatedBy: 'asset-pipeline/kaykit-rx24/anchors.ts';
  source: {
    path: string;
    bytes: number;
    sha256: string;
    commit: string;
    license: string;
    licenseNote: string;
  };
  root: 'rx24-root';
  units: 'metres';
  up: '+Y';
  forward: '-Z';
  points: Record<AnchorRole, Vec3>;
  semantics: Record<AnchorRole, string>;
  derivation: Record<AnchorRole, string>;
  distances: {
    primaryToIdleSupport: number;
    primaryToReloadMagazineTarget: number;
  };
  muzzle: {
    position: Vec3;
    axis: Vec3;
    axisSource: string;
    geometryEvidence: {
      rifleStaticMinZ: number;
      muzzleZ: number;
      muzzleAtDistalNegativeZ: boolean;
    };
  };
  evidence: {
    loader: string;
    handNodes: {
      'trigger-hand': { role: AnchorRole; nodeOrigin: Vec3; perAxisError: Vec3; maxAxisError: number };
      'support-hand': { role: AnchorRole; nodeOrigin: Vec3; perAxisError: Vec3; maxAxisError: number };
    };
    gripNode: {
      role: AnchorRole;
      sourceName: string;
      sourceExtrasRole: string;
      nodeOrigin: Vec3;
      computedTarget: Vec3;
      perAxisError: Vec3;
      maxAxisError: number;
    };
  };
  gripInterpretation: string;
  unverified: {
    palmSurfaceNormal: null;
    palmRotation: null;
    knightBoneBinding: null;
    acceptableContactTolerance: null;
  };
}

export interface BuildOptions {
  // Test-only overrides for mutated fixtures that exercise structural
  // rejection. The CLI never accepts these values: the fixed artifact hash and
  // byte size stay mandatory for every real build.
  expectedSha256?: string;
  expectedBytes?: number;
}

const ROLE_SEMANTICS: Record<AnchorRole, string> = {
  'primary-palm-center': 'Trigger-hand palm centre consumed by the live rifle view model; the primary hand contact point in root space, metres.',
  'idle-support-palm-center': 'Support-hand palm centre in the idle two-hand hold, after hands() applies its single +0.025 m Y adjustment. This is the normal support foregrip hold.',
  'reload-magazine-palm-target': 'Support palm target for the reload magazine grasp: support-palm.position + support-palm.gripOffset, i.e. source grip.surface + grip.palmOffset. This is the reload contact, not the idle foregrip hold.',
};

const ROLE_DERIVATION: Record<AnchorRole, string> = {
  'primary-palm-center': "weaponParts('rifle') part 'trigger-palm'.position",
  'idle-support-palm-center': "weaponParts('rifle') part 'support-palm'.position (hands() Y adjustment already applied once)",
  'reload-magazine-palm-target': "weaponParts('rifle') part 'support-palm'.position + its gripOffset",
};

function fail(message: string): never {
  throw new Error(message);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// 12 significant digits keep derived metres free of binary noise while
// preserving the source's meaningful precision.
function round12(value: number): number {
  return Number(value.toPrecision(12));
}

function roundVec(values: readonly [number, number, number]): Vec3 {
  return [round12(values[0]), round12(values[1]), round12(values[2])];
}

function vecOf(value: readonly [number, number, number]): Vec3 {
  return [value[0], value[1], value[2]];
}

function addVec(a: readonly [number, number, number], b: readonly [number, number, number]): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function perAxisError(actual: Vec3, expected: Vec3): Vec3 {
  return [round12(Math.abs(actual[0] - expected[0])), round12(Math.abs(actual[1] - expected[1])), round12(Math.abs(actual[2] - expected[2]))];
}

function maxError(errors: Vec3): number {
  return round12(Math.max(errors[0], errors[1], errors[2]));
}

function riflePart(id: string): { position: readonly [number, number, number]; gripOffset?: readonly [number, number, number] } {
  const matches = weaponParts('rifle').filter((part) => part.id === id);
  if (matches.length !== 1) fail(`Expected exactly one rifle part named ${id}, got ${matches.length}`);
  return matches[0]!;
}

function uniqueNode(gltf: GLTF, name: string): THREE.Object3D {
  // Count the raw glTF node names first: GLTFLoader renames duplicate loaded
  // objects (for example trigger-hand_1), which would hide a duplicated mount.
  const rawNodes = (gltf.parser.json as { nodes?: { name?: string }[] }).nodes ?? [];
  const raw = rawNodes.filter((node) => node.name === name);
  if (raw.length !== 1) fail(`Expected exactly one node named ${name} in the fixed source, got ${raw.length}`);
  const matches: THREE.Object3D[] = [];
  gltf.scene.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  if (matches.length !== 1) fail(`Expected exactly one loaded node named ${name}, got ${matches.length}`);
  return matches[0]!;
}

function worldPosition(object: THREE.Object3D): Vec3 {
  const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
  return [round12(position.x), round12(position.y), round12(position.z)];
}

async function loadGlb(bytes: Buffer): Promise<Awaited<ReturnType<GLTFLoader['parseAsync']>>> {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

function matrixIsIdentity(matrix: THREE.Matrix4): boolean {
  return matrix.elements.every((value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) <= 1e-12);
}

export async function buildAnchors(bytes: Buffer, options: BuildOptions = {}): Promise<AnchorsDocument> {
  const expectedSha256 = options.expectedSha256 ?? SOURCE_SHA256;
  const expectedBytes = options.expectedBytes ?? SOURCE_BYTES;
  if (bytes.length !== expectedBytes) fail(`Source byte size ${bytes.length} != expected ${expectedBytes}`);
  const digest = sha256(bytes);
  if (digest !== expectedSha256) fail(`Source SHA-256 mismatch: ${digest} != ${expectedSha256}`);

  // Derive the contact points from the same consumer the renderer uses. No
  // second constant table lives here.
  const triggerPalm = riflePart('trigger-palm');
  const supportPalm = riflePart('support-palm');
  const gripOffset = supportPalm.gripOffset;
  if (!gripOffset) fail("Rifle part 'support-palm' has no gripOffset; the reload target cannot be derived");

  const primaryPalm = vecOf(triggerPalm.position);
  const idleSupportPalm = vecOf(supportPalm.position);
  const reloadMagazineTarget = addVec(idleSupportPalm, gripOffset);

  const gltf = await loadGlb(bytes);
  const root = uniqueNode(gltf, ROOT);
  if (!matrixIsIdentity(root.matrixWorld)) fail(`Root node ${ROOT} is not at the identity; anchor points would not be in its root space`);

  const triggerHand = uniqueNode(gltf, 'trigger-hand');
  const supportHand = uniqueNode(gltf, 'support-hand');
  const triggerOrigin = worldPosition(triggerHand);
  const supportOrigin = worldPosition(supportHand);
  const triggerErrors = perAxisError(triggerOrigin, roundVec(primaryPalm));
  const supportErrors = perAxisError(supportOrigin, roundVec(idleSupportPalm));
  if (maxError(triggerErrors) > PALM_MAX_AXIS_ERROR) {
    fail(`trigger-hand root-space origin ${triggerOrigin} does not match the primary palm centre ${roundVec(primaryPalm)} within ${PALM_MAX_AXIS_ERROR} m per axis (errors ${triggerErrors})`);
  }
  if (maxError(supportErrors) > PALM_MAX_AXIS_ERROR) {
    fail(`support-hand root-space origin ${supportOrigin} does not match the idle support palm centre ${roundVec(idleSupportPalm)} within ${PALM_MAX_AXIS_ERROR} m per axis (errors ${supportErrors})`);
  }

  // The source grip node is the reload palm target. Its existing 4-decimal
  // encoding is reported, not averaged away or corrected in the source.
  const gripNode = uniqueNode(gltf, GRIP_NODE);
  const gripOrigin = worldPosition(gripNode);
  const gripErrors = perAxisError(gripOrigin, roundVec(reloadMagazineTarget));
  if (maxError(gripErrors) > GRIP_MAX_AXIS_ERROR) {
    fail(`grip root-space origin ${gripOrigin} does not match the computed reload target ${roundVec(reloadMagazineTarget)} within ${GRIP_MAX_AXIS_ERROR} m per axis (errors ${gripErrors})`);
  }
  const gripExtrasRole = gripNode.userData.role;
  if (gripExtrasRole !== GRIP_SOURCE_ROLE) {
    fail(`Source grip extras.role ${String(gripExtrasRole)} != ${GRIP_SOURCE_ROLE}; the source contract must not be relabelled`);
  }

  // Muzzle axis comes only from the source's declared local gun axis. The
  // muzzle node is a position-only anchor, so no rotation is invented from it.
  const sceneData = gltf.scene.userData as Record<string, unknown>;
  if (sceneData.units !== UNITS) fail(`Source scene units ${String(sceneData.units)} != ${UNITS}`);
  if (sceneData.up !== '+Y') fail(`Source scene up ${String(sceneData.up)} != +Y`);
  if (sceneData.forward !== '-Z') fail(`Source scene forward ${String(sceneData.forward)} != -Z`);
  const muzzleNode = uniqueNode(gltf, 'muzzle');
  const muzzlePosition = worldPosition(muzzleNode);
  const rifleStatic = uniqueNode(gltf, 'rifle-static');
  const staticBounds = new THREE.Box3().setFromObject(rifleStatic);
  const rifleStaticMinZ = round12(staticBounds.min.z);
  const muzzleAtDistalNegativeZ = muzzlePosition[2] <= staticBounds.min.z + 1e-6;
  if (!muzzleAtDistalNegativeZ) {
    fail(`muzzle z ${muzzlePosition[2]} is not at the rifle-static distal -Z bound ${round12(staticBounds.min.z)}`);
  }

  const primary = roundVec(primaryPalm);
  const idleSupport = roundVec(idleSupportPalm);
  const reloadTarget = roundVec(reloadMagazineTarget);
  const primaryToIdleSupport = round12(Math.hypot(
    primary[0] - idleSupport[0],
    primary[1] - idleSupport[1],
    primary[2] - idleSupport[2],
  ));
  const primaryToReloadMagazineTarget = round12(Math.hypot(
    primary[0] - reloadTarget[0],
    primary[1] - reloadTarget[1],
    primary[2] - reloadTarget[2],
  ));

  return {
    schema: SCHEMA,
    id: 'kaykit-rx24-anchors',
    generatedBy: 'asset-pipeline/kaykit-rx24/anchors.ts',
    source: {
      path: SOURCE_PATH,
      bytes: bytes.length,
      sha256: digest,
      commit: SOURCE_COMMIT,
      license: 'assets/content-set/LICENSE.txt',
      licenseNote: 'CC0-1.0; upstream RX-24 geometry by Quaternius, Ultimate Guns Pack. The fixed source bytes stay unchanged.',
    },
    root: ROOT,
    units: UNITS,
    up: '+Y',
    forward: '-Z',
    points: {
      'primary-palm-center': primary,
      'idle-support-palm-center': idleSupport,
      'reload-magazine-palm-target': reloadTarget,
    },
    semantics: ROLE_SEMANTICS,
    derivation: ROLE_DERIVATION,
    distances: {
      primaryToIdleSupport,
      primaryToReloadMagazineTarget,
    },
    muzzle: {
      position: muzzlePosition,
      axis: [0, 0, -1],
      axisSource: 'Source scene extras declare up +Y / forward -Z as the weapon-group local axis; the muzzle node is a position-only anchor with no rotation, so the firing axis is the local -Z axis and no frame is derived from the point.',
      geometryEvidence: {
        rifleStaticMinZ,
        muzzleZ: muzzlePosition[2],
        muzzleAtDistalNegativeZ,
      },
    },
    evidence: {
      loader: LOADER_ID,
      handNodes: {
        'trigger-hand': {
          role: 'primary-palm-center',
          nodeOrigin: triggerOrigin,
          perAxisError: triggerErrors,
          maxAxisError: maxError(triggerErrors),
        },
        'support-hand': {
          role: 'idle-support-palm-center',
          nodeOrigin: supportOrigin,
          perAxisError: supportErrors,
          maxAxisError: maxError(supportErrors),
        },
      },
      gripNode: {
        role: 'reload-magazine-palm-target',
        sourceName: GRIP_NODE,
        sourceExtrasRole: GRIP_SOURCE_ROLE,
        nodeOrigin: gripOrigin,
        computedTarget: reloadTarget,
        perAxisError: gripErrors,
        maxAxisError: maxError(gripErrors),
      },
    },
    gripInterpretation: 'The source node named grip (extras.role support-palm-contact) is the reload-magazine palm target, not the idle support foregrip hold, a primary-hand grip, a generic bone socket or a camera mount. Its name and extras are unchanged.',
    unverified: {
      palmSurfaceNormal: null,
      palmRotation: null,
      knightBoneBinding: null,
      acceptableContactTolerance: null,
    },
  };
}

export function serializeAnchors(document: AnchorsDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function parseSourcePath(argv: string[]): string {
  const index = argv.indexOf('--src');
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) fail('Missing input: --src <fixed GLB path> is required');
  return value;
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

async function main(): Promise<void> {
  const source = parseSourcePath(process.argv.slice(2));
  let bytes: Buffer;
  try {
    bytes = readFileSync(resolve(source));
  } catch {
    fail(`Cannot read source GLB: ${source}`);
  }
  // The document is fully built and validated before stdout is touched, so a
  // failed build leaves the redirection target empty.
  process.stdout.write(serializeAnchors(await buildAnchors(bytes)));
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kaykit-rx24 anchors: ${message}\n`);
    process.exitCode = 1;
  });
}
