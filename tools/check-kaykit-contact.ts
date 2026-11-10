// Fixed-source inspection, not a contact-quality test. Never downloads assets.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const INPUTS = {
  Knight: '60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168',
  Med_CombatRanged: '08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d',
} as const;
export const CLIPS = ['2H_Ranged_Aiming', '2H_Ranged_Shoot', '2H_Ranged_Reload'] as const;
export const POINTS = ['hand.l', 'hand.r', 'handslot.l', 'handslot.r'] as const;
type Document = {
  asset: { version: string; generator?: string };
  nodes: { name?: string; mesh?: number; skin?: number; children?: number[] }[];
  meshes?: { name?: string; primitives: { material?: number; attributes: Record<string, number> }[] }[];
  skins?: { name?: string; joints: number[]; skeleton?: number; inverseBindMatrices?: number }[];
  materials?: { name?: string }[];
  animations?: { name?: string; channels: unknown[] }[];
};
export function verifiedDocument(bytes: Buffer, hash: string): Document {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, 'fixed source SHA256 mismatch');
  assert.ok(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF', 'GLB header missing');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON', 'GLB JSON chunk missing');
  assert.ok(length > 0 && 20 + length <= bytes.length, 'GLB JSON bounds');
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + length)) as Document;
  assert.ok(Array.isArray(document.nodes) && document.nodes.length > 0, 'nodes required');
  return document;
}
export function uniqueNode(scene: THREE.Object3D, name: string) {
  const found: THREE.Object3D[] = []; scene.traverse(n => { if (n.name === name || n.userData.name === name) found.push(n); });
  assert.equal(found.length, 1, `unique node required: ${name}`);
  return found[0]!;
}
export function uniqueClip(clips: readonly THREE.AnimationClip[], name: string) {
  const found = clips.filter(c => c.name === name);
  assert.equal(found.length, 1, `unique clip required: ${name}`);
  assert.ok(Number.isFinite(found[0]!.duration) && found[0]!.duration > 0, 'positive clip duration');
  return found[0]!;
}
export function inspectDocument(doc: Document) {
  const parents = new Map<number, number>();
  for (const [parent, node] of doc.nodes.entries()) for (const child of node.children ?? []) {
    assert.ok(child >= 0 && child < doc.nodes.length && !parents.has(child), 'unique valid parent');
    parents.set(child, parent);
  }
  return {
    asset: doc.asset,
    nodes: doc.nodes.map((n, index) => ({ index, name: n.name ?? null, parent: parents.get(index) ?? null,
      mesh: n.mesh ?? null, skin: n.skin ?? null, children: n.children ?? [] })),
    meshes: (doc.meshes ?? []).map((m, index) => ({ index, name: m.name ?? null,
      primitives: m.primitives.map(p => ({ material: p.material ?? null, attributes: p.attributes })) })),
    materials: (doc.materials ?? []).map((m, index) => ({ index, name: m.name ?? null })),
    skins: doc.skins ?? [],
    animations: (doc.animations ?? []).map(a => ({ name: a.name ?? null, channels: a.channels.length })),
  };
}
export function samplePose(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[], name: string, phase: number) {
  assert.ok(Number.isFinite(phase) && phase >= 0 && phase <= 1, 'phase 0..1');
  const clip = uniqueClip(clips, name);
  const nodes = POINTS.map(n => uniqueNode(scene, n));
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  mixer.setTime(phase * clip.duration);
  scene.updateWorldMatrix(true, true);
  const points = Object.fromEntries(nodes.map((n, index) => {
    const p = n.getWorldPosition(new THREE.Vector3()).toArray();
    assert.ok(p.every(Number.isFinite), 'finite world position');
    return [POINTS[index]!, { loadedName: n.name, worldPosition: p }];
  }));
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  return { phase, timeSeconds: phase * clip.duration, points };
}
export async function diagnose(directory: string) {
  assert.ok(directory, 'sample directory required');
  const sources: Record<string, ReturnType<typeof inspectDocument>> = {};
  let knightBytes: Buffer | undefined;
  for (const [name, hash] of Object.entries(INPUTS)) {
    const bytes = await readFile(path.join(directory, name + '.glb'));
    sources[name] = inspectDocument(verifiedDocument(bytes, hash));
    if (name === 'Knight') knightBytes = bytes;
  }
  const loaded = await new GLTFLoader().register(() => ({ name: 'cpu-texture-omission', loadTexture: async () => new THREE.Texture() }))
    .parseAsync(Uint8Array.from(knightBytes!).buffer, '');
  // Fixed reviewed inventory: Knight has armour, shields and swords; the motion
  // package has no meshes. No rifle/magazine geometry has been identified. Names
  // alone are not a general-purpose weapon classifier.
  const meshNodes = sources.Knight!.nodes.filter(n => n.mesh !== null).map(n => n.name);
  assert.deepEqual(meshNodes, ['1H_Sword_Offhand','Badge_Shield','Rectangle_Shield','Round_Shield','Spike_Shield',
    '1H_Sword','2H_Sword','Knight_Helmet','Knight_Cape','Knight_ArmLeft','Knight_ArmRight',
    'Knight_Body','Knight_Head','Knight_LegLeft','Knight_LegRight'], 'fixed inventory changed; re-review roles');
  assert.equal(sources.Med_CombatRanged!.meshes.length, 0, 'motion package geometry changed');
  const samples = CLIPS.map(name => ({ name, durationSeconds: uniqueClip(loaded.animations, name).duration,
    samples: [0, .25, .5, .75, 1].map(phase => samplePose(loaded.scene, loaded.animations, name, phase)) }));
  return { schema: 1, evidence: 'fixed GLB CPU inventory and world-space bone/slot positions, not rendered contact',
    sourceHashes: INPUTS, units: { declaredFormat: 'glTF 2.0 uses metres', actualAuthoredScale: 'not independently verified' },
    sources, samples, contact: { rifleNode: null, magazineNode: null, handToRifleAabbDistance: null,
      handToMagazineAabbDistance: null, reason: 'No independently identified rifle or magazine geometry in the fixed inputs; swords and shields are not firearm contact proxies.' },
    decision: '缺独立物件需选择配套物件',
    next: 'Select a licensed rifle with a separate magazine and an explicit grip/magazine mount contract; then inspect real scene poses. Do not treat handslot bones as a gun, or AABB distance as palm contact.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  diagnose(process.argv[2] ?? '').then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
