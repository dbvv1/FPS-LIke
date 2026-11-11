import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KayKitSkinnedCharacter, KAYKIT_NATIVE_ACTIONS } from '../src/render/kaykit-skinned-character.js';
import { locateGloveSurface, sampleGloveSurface, rigidPairResidual } from '../asset-pipeline/kaykit-rx24/knight-contact.js';
import { buildAnchors } from '../asset-pipeline/kaykit-rx24/anchors.js';
const sample = process.argv[2];
if (!sample || process.argv.length !== 3) { console.error('Usage: node --import tsx tools/check-kaykit-rx24-contact.ts <fixed-sample-directory>'); process.exit(2); }
const hashes = { Knight: '60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168', Med_CombatRanged: '08de5a5fd14dcc7c404b14f7c6ff962f8959503bf70bc00cbf258dbd0187c48d' };
async function load(name: keyof typeof hashes) {
  const bytes = await readFile(path.join(sample!, `${name}.glb`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hashes[name], `${name} fixed hash`);
  return new GLTFLoader().register(() => ({ name: 'cpu-texture-omission', loadTexture: async () => new THREE.Texture() }))
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const target = await load('Knight'), motion = await load('Med_CombatRanged');
const character = new KayKitSkinnedCharacter({ character: target.scene, motion: motion.scene, animations: motion.animations, nativeAnimations: target.animations });
character.sample('native-aim-two-hand', 1);
const left = locateGloveSurface(character.scene, 'Knight_ArmLeft', 'handl', 'handslotl');
const right = locateGloveSurface(character.scene, 'Knight_ArmRight', 'handr', 'handslotr');
const heldLeft = sampleGloveSurface(character.scene, left), heldRight = sampleGloveSurface(character.scene, right);
const weapon = await buildAnchors(await readFile('assets/content-set/fp-arms-rx24.glb'));
const weaponPoints = weapon.points;
const primary = new THREE.Vector3(...weaponPoints['primary-palm-center']);
const support = new THREE.Vector3(...weaponPoints['idle-support-palm-center']);
const weaponSeparation = primary.distanceTo(support);
const binding = [left, right].map(anchor => {
  const hand = character.scene.getObjectByName(anchor.hand)!;
  return sampleGloveSurface(character.scene, anchor).point.clone().applyMatrix4(hand.matrixWorld.clone().invert());
});
const poses = [];
for (const action of Object.keys(KAYKIT_NATIVE_ACTIONS) as (keyof typeof KAYKIT_NATIVE_ACTIONS)[]) for (const phase of [0, .25, .5, .75, 1]) {
  assert.equal(character.sample(action, phase), true);
  const surfaces = [left, right].map(anchor => sampleGloveSurface(character.scene, anchor));
  poses.push({ action, phase, left: surfaces[0]!.point.toArray(), right: surfaces[1]!.point.toArray(),
    surfaceNormals: surfaces.map(s => s.normal.toArray()),
    slotToSurface: surfaces.map(s => s.point.distanceTo(s.slot)),
    frozenBoneOffsetError: surfaces.map((s, i) => s.point.distanceTo(binding[i]!.clone().applyMatrix4(character.scene.getObjectByName([left, right][i]!.hand)!.matrixWorld))),
    separation: surfaces[0]!.point.distanceTo(surfaces[1]!.point) });
}
console.log(JSON.stringify({ schema: 1, units: 'metres', inputs: hashes,
  calibration: { action: 'native-aim-two-hand', phase: 1, selection: 'nearest majority-hand skinned triangle to source handslot', left, right,
    anatomicalPalmIdentification: null, weaponRoll: null, contactTolerance: null },
  heldAim: { left: heldLeft.point.toArray(), right: heldRight.point.toArray(),
    slotToSurface: [heldLeft.point.distanceTo(heldLeft.slot), heldRight.point.distanceTo(heldRight.slot)],
    characterSeparation: heldLeft.point.distanceTo(heldRight.point), weaponSeparation,
    ...rigidPairResidual(heldLeft.point.distanceTo(heldRight.point), weaponSeparation) }, poses,
  decision: 'Reject this source-slot-nearest surface pair for an unscaled RX24 rigid two-hand mount. This does not prove every possible palm selection incompatible.',
  browser: false, gpu: false, textureDecoded: false, inGame: false }, null, 2));
character.dispose();
