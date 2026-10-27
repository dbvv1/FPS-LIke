import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, validateContentSet } from '../validate.mjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';

const HERE = dirname(fileURLToPath(import.meta.url));
const SET = resolve(HERE, '..');
const ROOT = resolve(SET, '..', '..');
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function loadGlb(file) {
  const buf = readFileSync(join(SET, 'dist', file));
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
}

test('committed manifest, GLBs, palette and contracts validate', () => {
  const result = validateContentSet();
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
});

test('rebuild is deterministic and stays inside every budget', () => {
  const run = spawnSync(process.execPath, [join(SET, 'build.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /ok\s+fp-arms-rx24/);
});

test('variant report proves a second palette/scale pass rebuilt every piece', () => {
  const report = read('asset-pipeline/content-set/variant-report.json');
  assert.equal(report.allPiecesRebuilt, true);
  assert.equal(report.scale, 0.95);
  assert.equal(report.pieces.length, 4);
  for (const piece of report.pieces) {
    assert.equal(piece.changed, true, piece.id);
    assert.notEqual(piece.baseSha256, piece.variantSha256, piece.id);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(piece.boundsAfter.min[axis] - piece.boundsBefore.min[axis] * 0.95) < 0.002, `${piece.id} min ${axis}`);
      assert.ok(Math.abs(piece.boundsAfter.max[axis] - piece.boundsBefore.max[axis] * 0.95) < 0.002, `${piece.id} max ${axis}`);
    }
  }
});

test('variant rebuild keeps every translation track at the scaled rest pose', () => {
  // build.mjs asserts in addAnimation that a translation track starts at the
  // node's rest translation; running the 0.95 pass proves tracks and rests are
  // scaled together instead of snapping on frame 0.
  const run = spawnSync(process.execPath, [join(SET, 'build.mjs'), '--variant'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /variant: 4 pieces rebuilt/);
  const report = read('asset-pipeline/content-set/variant-report.json');
  assert.equal(report.allPiecesRebuilt, true);
  const manifest = read('asset-pipeline/content-set/content-set.json');
  for (const piece of report.pieces) {
    assert.equal(piece.baseSha256, manifest.pieces.find((p) => p.id === piece.id).sha256, piece.id);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(piece.boundsAfter.min[axis] - piece.boundsBefore.min[axis] * 0.95) < 0.002, `${piece.id} min ${axis}`);
      assert.ok(Math.abs(piece.boundsAfter.max[axis] - piece.boundsBefore.max[axis] * 0.95) < 0.002, `${piece.id} max ${axis}`);
    }
  }
});

test('first-person piece carries arms, hands, magazine and bolt with action clips', () => {
  const manifest = read('asset-pipeline/content-set/content-set.json');
  const piece = manifest.pieces.find((p) => p.id === 'fp-arms-rx24');
  assert.ok(piece);
  assert.ok(piece.nodeNames.includes('support-hand'));
  assert.ok(piece.nodeNames.includes('trigger-hand'));
  assert.ok(piece.nodeNames.includes('rifle-magazine'));
  assert.ok(piece.nodeNames.includes('rifle-bolt'));
  assert.ok(piece.animations.includes('fire'));
  assert.ok(piece.animations.includes('reload-magazine'));
  assert.ok(piece.animations.includes('reload-bolt'));
  const contract = read('asset-pipeline/content-set/contracts/fp-arms-rx24.actions.json');
  const reload = contract.actions.find((a) => a.name === 'reload');
  assert.equal(reload.status, 'contract-only');
  assert.deepEqual(reload.movingNodes, ['rifle-magazine', 'rifle-bolt', 'support-hand']);
  assert.equal(reload.phases.length, 5);
  const source = read('assets/weapons/rx24-rifle.json');
  const grip = piece.bounds;
  assert.ok(grip.min[2] <= source.muzzle[2] + 0.01, 'muzzle must remain the farthest forward point');
  // The contract must name the delivered palm contact point, not the raw rifle surface.
  const built = parseGlb(readFileSync(join(SET, 'dist', 'fp-arms-rx24.glb'))).json;
  const gripNode = built.nodes.find((node) => node.name === 'grip');
  assert.ok(gripNode?.translation);
  for (let axis = 0; axis < 3; axis++) {
    const delivered = source.grip.surface[axis] + source.grip.palmOffset[axis];
    assert.ok(Math.abs(contract.space.gripSurface[axis] - delivered) < 1e-9, `gripSurface axis ${axis} must be surface + palmOffset`);
    assert.ok(Math.abs(gripNode.translation[axis] - contract.space.gripSurface[axis]) < 1e-3, `gripSurface axis ${axis} must match the GLB grip node`);
  }
  assert.notDeepEqual(contract.space.gripSurface, source.grip.surface, 'gripSurface must not fall back to the raw rifle surface');
});

test('enemy piece is a full body at source scale with all applicable actions', () => {
  const manifest = read('asset-pipeline/content-set/content-set.json');
  const piece = manifest.pieces.find((p) => p.id === 'enemy-relay-guard');
  assert.ok(piece);
  assert.ok(Math.abs(piece.bounds.min[1]) < 0.001, 'feet stay on y=0');
  assert.ok(Math.abs(piece.bounds.max[1] - 1.765) < 0.01, 'height stays 1.765 m');
  for (const clip of ['idle', 'walk', 'fire', 'hit', 'death']) assert.ok(piece.animations.includes(clip), clip);
  const contract = read('asset-pipeline/content-set/contracts/enemy-relay-guard.actions.json');
  const byName = Object.fromEntries(contract.actions.map((a) => [a.name, a]));
  for (const action of ['idle', 'move', 'fire', 'hit', 'death']) assert.equal(byName[action].status, 'exported', action);
  assert.equal(byName.reload.status, 'contract-only');
  assert.match(byName.reload.notes, /no separate magazine node/i);
});

test('GLTFLoader parses every piece at its authored rest pose', async () => {
  const manifest = read('asset-pipeline/content-set/content-set.json');
  for (const piece of manifest.pieces) {
    const gltf = await loadGlb(piece.file);
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    const boxMin = box.min.toArray(), boxMax = box.max.toArray();
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(boxMin[axis] - piece.bounds.min[axis]) < 0.01, `${piece.id} loaded min ${axis}: ${boxMin[axis]} vs ${piece.bounds.min[axis]}`);
      assert.ok(Math.abs(boxMax[axis] - piece.bounds.max[axis]) < 0.01, `${piece.id} loaded max ${axis}: ${boxMax[axis]} vs ${piece.bounds.max[axis]}`);
    }
    gltf.scene.traverse((node) => {
      assert.equal(node.userData.pivot, undefined, `${piece.id}: ${node.name} still carries the GLTFLoader-reserved extras.pivot`);
    });
  }

  // The loader used to subtract a root pivot and zero this child's translation,
  // dropping the head to the feet. Assert the real loader keeps it at neck height.
  const enemy = await loadGlb('enemy-relay-guard.glb');
  enemy.scene.updateMatrixWorld(true);
  const head = enemy.scene.getObjectByName('head');
  assert.ok(head, 'head node is loaded');
  const raw = parseGlb(readFileSync(join(SET, 'dist', 'enemy-relay-guard.glb'))).json.nodes.find((node) => node.name === 'head');
  assert.ok(raw.translation);
  const world = new Vector3().setFromMatrixPosition(head.matrixWorld);
  assert.deepEqual(head.position.toArray().map((v) => Number(v.toFixed(4))), raw.translation);
  assert.ok(world.y > 1.4, `loaded head world y ${world.y}`);
  const box = new Box3().setFromObject(enemy.scene);
  assert.ok(box.min.y > -0.01 && box.min.y < 0.01, `enemy feet stay on y=0, got ${box.min.y}`);
  assert.ok(Math.abs(box.max.y - 1.765) < 0.01, `enemy height ${box.max.y}`);});

test('passage has a 12 m corridor, a passable doorway and cover collision', () => {
  const contract = read('asset-pipeline/content-set/contracts/passage-cover.actions.json');
  assert.equal(contract.dimensions.corridorLengthM, 12);
  assert.equal(contract.dimensions.doorwayClearWidthM, 1.2);
  assert.equal(contract.dimensions.doorwayClearHeightM, 2.2);
  assert.ok(contract.dimensions.corridorClearWidthM >= 3.0);
  assert.ok(contract.collision.length >= 10);
  assert.ok(contract.collision.some((box) => box.module === 'cover-halfwall'));
  assert.ok(contract.collision.some((box) => box.module === 'cover-crate'));
  const manifest = read('asset-pipeline/content-set/content-set.json');
  const piece = manifest.pieces.find((p) => p.id === 'passage-cover');
  assert.ok(piece.triangles <= 1500);
  assert.ok(piece.drawCalls <= 3);
});

test('hit feedback separates body, head, kill and miss rules', () => {
  const contract = read('asset-pipeline/content-set/contracts/hit-feedback.actions.json');
  const byName = Object.fromEntries(contract.actions.map((a) => [a.name, a]));
  for (const name of ['hit-body', 'hit-head', 'hit-kill']) assert.equal(byName[name].status, 'exported', name);
  assert.equal(byName.miss.status, 'not-applicable');
  assert.match(byName.miss.colorRole, /none/i);
  assert.equal(byName.friendly.status, 'contract-only');
  const manifest = read('asset-pipeline/content-set/content-set.json');
  const piece = manifest.pieces.find((p) => p.id === 'hit-feedback');
  assert.ok(piece.animations.includes('hit-body'));
  assert.ok(piece.animations.includes('hit-kill'));
  assert.ok(piece.animations.includes('impact'));
});

test('every standard piece has a CC0 source identity and processing trail', () => {
  const spec = read('asset-pipeline/content-set/spec.json');
  for (const piece of spec.pieces) {
    assert.equal(piece.license, 'CC0-1.0');
    assert.ok(piece.sources.length >= 1, piece.id);
    assert.ok(piece.derivation.length >= 1, piece.id);
    for (const source of piece.sources) {
      assert.equal(source.license, 'CC0-1.0');
      assert.match(source.url, /^https:\/\//);
      if (source.path) assert.match(source.sha256, /^[0-9a-f]{64}$/);
      else assert.ok(source.origin);
      assert.ok(source.identity.length > 20);
    }
  }
});

test('no artifact leaks a local absolute path', () => {
  const files = [
    'asset-pipeline/content-set/content-set.json',
    'asset-pipeline/content-set/palette.json',
    'asset-pipeline/content-set/palette.svg',
    'asset-pipeline/content-set/spec.json',
    'asset-pipeline/content-set/variant-report.json',
    'asset-pipeline/content-set/wiring.json',
    ...readdirSync(join(SET, 'contracts')).map((name) => 'asset-pipeline/content-set/contracts/' + name),
  ];
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /[A-Za-z]:\\|\/Users\/|\/home\/|\/opt\//, file);
  }
});

test('dist contains exactly the four declared GLBs', () => {
  const spec = read('asset-pipeline/content-set/spec.json');
  const expected = spec.pieces.map((p) => p.file).sort();
  const actual = readdirSync(join(SET, 'dist')).filter((name) => name.endsWith('.glb')).sort();
  assert.deepEqual(actual, expected);
  const manifest = read('asset-pipeline/content-set/content-set.json');
  for (const file of actual) {
    const buf = readFileSync(join(SET, 'dist', file));
    const entry = manifest.pieces.find((p) => p.file === file);
    assert.equal(sha256(buf), entry.sha256, file);
    const { json } = parseGlb(buf);
    assert.ok(json.nodes.length > 0);
  }
});

test('wiring names a consumer for every standard piece', () => {
  const spec = read('asset-pipeline/content-set/spec.json');
  const manifest = read('asset-pipeline/content-set/content-set.json');
  const wiring = read('asset-pipeline/content-set/wiring.json');
  assert.equal(wiring.pieces.length, spec.pieces.length);
  for (const piece of spec.pieces) {
    const entry = wiring.pieces.find((w) => w.id === piece.id);
    assert.ok(entry, piece.id);
    assert.ok(entry.consumer.length >= 1, piece.id);
    const built = manifest.pieces.find((p) => p.id === piece.id);
    assert.ok(built.nodeNames.includes(entry.rootNode), `${piece.id} root ${entry.rootNode}`);
  }
});

test('palette sheet and material families are locked', () => {
  const spec = read('asset-pipeline/content-set/spec.json');
  const palette = read('asset-pipeline/content-set/palette.json');
  assert.equal(palette.tileMetres, 2);
  assert.equal(palette.colors.find((c) => c.role === 'faction-warm').hex, '#c76844');
  assert.equal(palette.colors.find((c) => c.role === 'faction-cool').hex, '#54c9c0');
  assert.equal(palette.colors.find((c) => c.role === 'marker-white').hex, '#f4f1e8');
  assert.ok(palette.materialFamilies.length >= 6);
  assert.deepEqual(palette.materialFamilies, spec.materialFamilies);
  const families = new Map(spec.materialFamilies.map((entry) => [entry.id, entry]));
  for (const piece of spec.pieces) {
    const { json } = parseGlb(readFileSync(join(SET, 'dist', piece.file)));
    for (const material of json.materials ?? []) {
      const family = families.get(material.extras?.family);
      assert.ok(family, `${piece.id}: ${material.name} has unknown family`);
      assert.equal(material.pbrMetallicRoughness.roughnessFactor, family.roughness, `${piece.id}: ${material.name} roughness`);
      assert.equal(material.pbrMetallicRoughness.metallicFactor, family.metalness, `${piece.id}: ${material.name} metalness`);
    }
  }
  assert.ok(existsSync(join(SET, 'palette.svg')));
});

test('README byte table matches the manifest', () => {
  const manifest = read('asset-pipeline/content-set/content-set.json');
  const readme = readFileSync(join(SET, 'README.md'), 'utf8');
  const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const asNumber = (cell) => Number(cell.replace(/[^0-9]/g, ''));
  for (const piece of manifest.pieces) {
    const line = readme.split('\n').find((row) => row.includes(`dist/${piece.id}.glb`));
    assert.ok(line, `${piece.id}: README row missing`);
    assert.equal(asNumber(cells(line)[2]), piece.bytes, `${piece.id}: README bytes`);
    assert.equal(asNumber(cells(line)[3]), piece.triangles, `${piece.id}: README triangles`);
  }
  const totalLine = readme.split('\n').find((row) => row.startsWith('| **Set**'));
  assert.ok(totalLine, 'README set row missing');
  assert.equal(asNumber(cells(totalLine)[2]), manifest.totals.bytes, 'README set bytes');
  assert.equal(asNumber(cells(totalLine)[3]), manifest.totals.triangles, 'README set triangles');
});
