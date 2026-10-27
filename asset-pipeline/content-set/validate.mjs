#!/usr/bin/env node
// Structural and budget validation for the Relay Yard content set.
// No renderer, no browser, no network: it parses the committed GLBs and the
// authored contracts and checks the parts a runtime would rely on.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

export function parseGlb(buf) {
  if (buf.length < 20) throw new Error('GLB is too short');
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('bad GLB magic');
  if (buf.readUInt32LE(4) !== 2) throw new Error('bad GLB version');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('GLB header length does not match file size');
  let offset = 12, json = null, bin = null, chunks = 0;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) throw new Error('truncated GLB chunk header');
    const len = buf.readUInt32LE(offset), type = buf.readUInt32LE(offset + 4);
    if (offset + 8 + len > buf.length) throw new Error('truncated GLB chunk');
    const chunk = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a && json === null) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942 && bin === null) bin = chunk;
    else throw new Error('unexpected GLB chunk order or duplicate chunk');
    offset += 8 + len;
    chunks++;
  }
  if (!json) throw new Error('missing JSON chunk');
  if (chunks !== 2) throw new Error(`expected 2 GLB chunks, got ${chunks}`);
  return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const WIDTH = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function accessorFits(json, bin, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  if (!acc) return `accessor ${accessorIndex} is missing`;
  const view = json.bufferViews[acc.bufferView];
  if (!view) return `accessor ${accessorIndex} references a missing bufferView`;
  const stride = WIDTH[acc.componentType] * COMPONENTS[acc.type];
  const end = view.byteOffset + (acc.count - 1) * stride + stride;
  if (end > view.byteOffset + view.byteLength) return `accessor ${accessorIndex} overruns its bufferView`;
  if (end > bin.length) return `accessor ${accessorIndex} overruns the binary chunk`;
  return null;
}

function checkNodeGraph(json, failures, piece) {
  const nodes = json.nodes ?? [];
  const names = new Set();
  for (const node of nodes) {
    if (!node.name) failures.push(`${piece}: unnamed node`);
    if (names.has(node.name)) failures.push(`${piece}: duplicate node name ${node.name}`);
    names.add(node.name);
  }
  if (!json.scenes?.[json.scene ?? 0]) failures.push(`${piece}: missing scene`);
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (roots.length !== 1 || roots[0] !== 0) failures.push(`${piece}: scene must have exactly node 0 as its root`);
  const seen = new Set();
  const visit = (index, path) => {
    if (!nodes[index]) { failures.push(`${piece}: child index ${index} is missing`); return; }
    if (path.has(index)) { failures.push(`${piece}: node cycle at ${index}`); return; }
    seen.add(index);
    const next = new Set(path).add(index);
    for (const child of nodes[index].children ?? []) visit(child, next);
  };
  visit(0, new Set());
  if (seen.size !== nodes.length) failures.push(`${piece}: ${nodes.length - seen.size} nodes are not reachable from root`);
  for (const node of nodes) if (node.mesh !== undefined && !json.meshes?.[node.mesh]) failures.push(`${piece}: node ${node.name} has a missing mesh`);
}

function readFloatAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const width = COMPONENTS[acc.type];
  const offset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return Array.from({ length: acc.count }, (_, row) =>
    Array.from({ length: width }, (_, column) => bin.readFloatLE(offset + (row * width + column) * 4)));
}

function checkAnimations(json, bin, failures, piece) {
  const nodes = new Set((json.nodes ?? []).map((n) => n.name));
  for (const anim of json.animations ?? []) {
    if (!anim.name) failures.push(`${piece}: unnamed animation`);
    for (const sampler of anim.samplers) {
      const input = json.accessors[sampler.input], output = json.accessors[sampler.output];
      if (!input || !output) { failures.push(`${piece}/${anim.name}: missing sampler accessor`); continue; }
      if (input.type !== 'SCALAR') failures.push(`${piece}/${anim.name}: sampler input is not SCALAR`);
      if (input.min?.[0] !== 0) failures.push(`${piece}/${anim.name}: clip does not start at 0`);
      if (input.count !== output.count) failures.push(`${piece}/${anim.name}: input/output counts differ`);
      const inputError = accessorFits(json, bin, sampler.input);
      if (inputError) failures.push(`${piece}/${anim.name}: ${inputError}`);
      const outputError = accessorFits(json, bin, sampler.output);
      if (outputError) failures.push(`${piece}/${anim.name}: ${outputError}`);
    }
    for (const channel of anim.channels) {
      const node = json.nodes[channel.target.node];
      if (!node) failures.push(`${piece}/${anim.name}: channel targets a missing node`);
      else if (!nodes.has(node.name)) failures.push(`${piece}/${anim.name}: unknown target node`);
      if (!['translation', 'rotation', 'scale'].includes(channel.target.path)) failures.push(`${piece}/${anim.name}: bad channel path`);
      if (channel.sampler >= anim.samplers.length) failures.push(`${piece}/${anim.name}: bad sampler index`);
      // A translation track that does not start at the node rest pose snaps the
      // node on the first frame; variant rebuilds scale both or neither.
      if (node && channel.target.path === 'translation' && anim.samplers[channel.sampler]) {
        const output = anim.samplers[channel.sampler].output;
        if (json.accessors[output]?.componentType === 5126) {
          const start = readFloatAccessor(json, bin, output)[0] ?? [];
          const rest = node.translation ?? [0, 0, 0];
          if ([0, 1, 2].some((axis) => Math.abs((start[axis] ?? 0) - rest[axis]) > 1e-3)) {
            failures.push(`${piece}/${anim.name}: ${node.name} translation track starts at ${start} but rest is ${rest}`);
          }
        }
      }
    }
  }
}

function checkPivotMetadata(json, failures, piece) {
  // three's GLTFLoader treats extras.pivot on a node with children as a
  // GLTFExporter pivot container: it subtracts the pivot from the node position
  // and zeroes the first child's translation. Only the exporter's own layout is
  // safe there; authored pieces must use a non-reserved key such as pivotM.
  for (const node of json.nodes ?? []) {
    const pivot = node.extras?.pivot;
    if (pivot === undefined || !(node.children?.length)) continue;
    const child = json.nodes[node.children[0]];
    const position = node.translation ?? [0, 0, 0];
    const childPosition = child?.translation ?? [0, 0, 0];
    const containerLayout = Array.isArray(pivot) && pivot.length === 3
      && Array.isArray(child?.translation)
      && [0, 1, 2].every((axis) => Math.abs(childPosition[axis] + pivot[axis]) < 1e-3);
    if (!containerLayout) failures.push(`${piece}: node ${node.name} uses reserved extras.pivot on a parent but is not a GLTFExporter pivot container`);
    if (!Array.isArray(position) || position.length !== 3) failures.push(`${piece}: pivot container ${node.name} needs a translation`);
  }
}

function textHasLocalPath(text) {
  return /[A-Za-z]:\\|C:\/|\/Users\/|\/home\/|\/opt\/|\\\\[A-Za-z0-9_.-]+\\/.test(text);
}

export function validateContentSet() {
  const failures = [];
  const spec = readJson('asset-pipeline/content-set/spec.json');
  const manifest = readJson('asset-pipeline/content-set/content-set.json');
  const palette = readJson('asset-pipeline/content-set/palette.json');
  const wiring = readJson('asset-pipeline/content-set/wiring.json');
  const families = new Map(spec.materialFamilies.map((entry) => [entry.id, entry]));
  const paletteRoles = new Set(spec.palette.map((entry) => entry.role));
  for (const family of spec.materialFamilies) {
    for (const role of family.paletteRoles ?? []) {
      if (!paletteRoles.has(role)) failures.push(`material family ${family.id} names unknown palette role ${role}`);
    }
  }
  const disk = new Map();
  if (wiring.pieces.length !== spec.pieces.length) failures.push('wiring piece count does not match spec');
  for (const pieceSpec of spec.pieces) {
    if (!wiring.pieces.some((entry) => entry.id === pieceSpec.id)) failures.push(`wiring is missing ${pieceSpec.id}`);
  }

  if (manifest.id !== spec.id) failures.push('manifest id does not match spec');
  if (manifest.baseRef !== spec.baseRef) failures.push('manifest baseRef does not match spec');
  if (manifest.pieces.length !== spec.pieces.length) failures.push('piece count does not match spec');

  let totalBytes = 0, totalTriangles = 0;
  for (const pieceSpec of spec.pieces) {
    const entry = manifest.pieces.find((p) => p.id === pieceSpec.id);
    if (!entry) { failures.push(`missing manifest entry ${pieceSpec.id}`); continue; }
    const path = join(ROOT, 'asset-pipeline/content-set/dist', pieceSpec.file);
    if (!existsSync(path)) { failures.push(`${pieceSpec.id}: missing dist/${pieceSpec.file}`); continue; }
    const buf = readFileSync(path);
    const hash = sha256(buf);
    disk.set(pieceSpec.id, buf.length);
    if (hash !== entry.sha256) failures.push(`${pieceSpec.id}: sha256 mismatch`);
    if (buf.length !== entry.bytes) failures.push(`${pieceSpec.id}: byte count mismatch`);
    totalBytes += buf.length;

    let parsed;
    try { parsed = parseGlb(buf); } catch (error) { failures.push(`${pieceSpec.id}: ${error.message}`); continue; }
    const { json, bin } = parsed;
    if (json.asset?.version !== '2.0') failures.push(`${pieceSpec.id}: asset version is not 2.0`);
    if ((json.images ?? []).length || (json.textures ?? []).length) failures.push(`${pieceSpec.id}: unexpected embedded texture`);
    for (const view of json.bufferViews ?? []) if (view.byteOffset + view.byteLength > bin.length) failures.push(`${pieceSpec.id}: bufferView overruns BIN`);
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) if (resource.uri) failures.push(`${pieceSpec.id}: external resource URI found`);
    checkNodeGraph(json, failures, pieceSpec.id);
    checkPivotMetadata(json, failures, pieceSpec.id);
    checkAnimations(json, bin, failures, pieceSpec.id);
    const text = JSON.stringify(json);
    if (textHasLocalPath(text)) failures.push(`${pieceSpec.id}: GLB extras contain a local absolute path`);

    let triangles = 0, primitives = 0;
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        primitives++;
        const attrs = prim.attributes;
        for (const [name, index] of Object.entries(attrs)) {
          const error = accessorFits(json, bin, index);
          if (error) failures.push(`${pieceSpec.id}: ${name} ${error}`);
          const acc = json.accessors[index];
          if (name === 'NORMAL' && (acc.componentType !== 5120 || acc.normalized !== true)) failures.push(`${pieceSpec.id}: NORMAL is not normalised int8`);
          if (name === 'COLOR_0' && (acc.componentType !== 5121 || acc.normalized !== true)) failures.push(`${pieceSpec.id}: COLOR_0 is not normalised uint8`);
          if (name === 'POSITION' && acc.componentType !== 5126) failures.push(`${pieceSpec.id}: POSITION is not float32`);
          if (name === 'POSITION' && (!acc.min || !acc.max)) failures.push(`${pieceSpec.id}: POSITION is missing min/max`);
        }
        triangles += json.accessors[attrs.POSITION].count / 3;
        if (prim.mode !== undefined && prim.mode !== 4) failures.push(`${pieceSpec.id}: primitive is not triangles`);
      }
    }
    totalTriangles += triangles;
    if (triangles !== entry.triangles) failures.push(`${pieceSpec.id}: triangle count mismatch`);
    if (primitives !== entry.drawCalls) failures.push(`${pieceSpec.id}: draw-call count mismatch`);
    const budget = spec.budgets.pieces[pieceSpec.id];
    if (buf.length > budget.maxBytes) failures.push(`${pieceSpec.id}: ${buf.length} bytes over ${budget.maxBytes} budget`);
    if (triangles > budget.maxTriangles) failures.push(`${pieceSpec.id}: ${triangles} triangles over ${budget.maxTriangles} budget`);
    if ((json.materials ?? []).length > budget.maxMaterials) failures.push(`${pieceSpec.id}: too many materials`);
    if (primitives > budget.maxDrawCalls) failures.push(`${pieceSpec.id}: too many draw calls`);

    for (const material of json.materials ?? []) {
      const familyId = material.extras?.family;
      if (!familyId) { failures.push(`${pieceSpec.id}: material ${material.name} has no extras.family`); continue; }
      const family = families.get(familyId);
      if (!family) { failures.push(`${pieceSpec.id}: material ${material.name} names unknown family ${familyId}`); continue; }
      const pbr = material.pbrMetallicRoughness ?? {};
      const roughness = pbr.roughnessFactor ?? 1;
      const metalness = pbr.metallicFactor ?? 1;
      if (Math.abs(roughness - family.roughness) > 1e-6) failures.push(`${pieceSpec.id}: material ${material.name} roughness ${roughness} != family ${familyId} ${family.roughness}`);
      if (Math.abs(metalness - family.metalness) > 1e-6) failures.push(`${pieceSpec.id}: material ${material.name} metalness ${metalness} != family ${familyId} ${family.metalness}`);
      for (const role of family.paletteRoles ?? []) {
        if (!paletteRoles.has(role)) failures.push(`${pieceSpec.id}: material ${material.name} family ${familyId} names unknown palette role ${role}`);
      }
    }

    for (const nodeName of pieceSpec.requiredNodes) {
      if (!(json.nodes ?? []).some((node) => node.name === nodeName)) failures.push(`${pieceSpec.id}: missing required node ${nodeName}`);
    }
    const contract = readJson('asset-pipeline/content-set/' + pieceSpec.actionFile);
    for (const action of pieceSpec.requiredActions) {
      if (!contract.actions?.some((entry) => entry.name === action)) failures.push(`${pieceSpec.id}: missing action contract ${action}`);
    }
    if (pieceSpec.id === 'passage-cover') {
      const sceneExtras = json.scenes?.[json.scene ?? 0]?.extras ?? {};
      if (!Array.isArray(sceneExtras.collision) || sceneExtras.collision.length !== 13) failures.push('passage-cover: scene extras must carry 13 collision boxes');
      if (JSON.stringify(sceneExtras.collision) !== JSON.stringify(contract.collision)) failures.push('passage-cover: scene collision boxes drift from the contract');
      if (JSON.stringify(sceneExtras.modules) !== JSON.stringify(contract.modules)) failures.push('passage-cover: scene module list drifts from the contract');
      if (JSON.stringify(sceneExtras.dimensions) !== JSON.stringify(contract.dimensions)) failures.push('passage-cover: scene dimensions drift from the contract');
    }
    if (pieceSpec.id === 'hit-feedback') {
      const colors = (json.scenes?.[json.scene ?? 0]?.extras ?? {}).colors ?? {};
      const paletteByRole = new Map(spec.palette.map((entry) => [entry.role, entry.hex]));
      const expected = { body: 'marker-white', head: 'signal', kill: 'signal-hot', friendly: 'faction-cool' };
      for (const [slot, role] of Object.entries(expected)) {
        if (colors[slot] !== paletteByRole.get(role)) failures.push(`hit-feedback: ${slot} colour must be palette role ${role}`);
      }
    }
    const clips = new Set((json.animations ?? []).map((a) => a.name));
    for (const clip of contract.clips ?? []) {
      if (clip.name && !clips.has(clip.name)) failures.push(`${pieceSpec.id}: missing exported clip ${clip.name}`);
    }
    for (const source of pieceSpec.sources) {
      if (source.path) {
        const sourcePath = join(ROOT, source.path);
        if (!existsSync(sourcePath)) { failures.push(`${pieceSpec.id}: missing source ${source.path}`); continue; }
        if (sha256(readFileSync(sourcePath)) !== source.sha256) failures.push(`${pieceSpec.id}: source hash mismatch ${source.path}`);
      } else if (!source.origin) {
        failures.push(`${pieceSpec.id}: source entry has neither path nor origin`);
      }
      if (!source.license || !source.url || !source.identity) failures.push(`${pieceSpec.id}: incomplete source metadata ${source.path ?? source.origin}`);
    }
  }
  if (!disk.has('fp-arms-rx24')) failures.push('fp-arms-rx24 was not checked');
  if (totalBytes !== manifest.totals.bytes) failures.push('total byte count does not match manifest');
  if (totalTriangles !== manifest.totals.triangles) failures.push('total triangle count does not match manifest');
  if (totalBytes > spec.budgets.set.maxBytes) failures.push(`set is over ${spec.budgets.set.maxBytes} bytes`);
  if (totalTriangles > spec.budgets.set.maxTriangles) failures.push(`set is over ${spec.budgets.set.maxTriangles} triangles`);
  if (manifest.totals.newTextureBytes !== 0) failures.push('new texture bytes must stay zero');

  if (palette.colors.length !== spec.palette.length) failures.push('palette role count mismatch');
  if (JSON.stringify(palette.materialFamilies) !== JSON.stringify(spec.materialFamilies)) failures.push('palette material families drift from spec');
  if (palette.measuredConcreteAverage !== '#788982') failures.push('measured concrete average changed');
  if (palette.colors.find((c) => c.role === 'concrete-mid')?.hex !== palette.measuredConcreteAverage) failures.push('concrete-mid is not the measured average');
  for (const file of ['palette.json', 'palette.svg', 'content-set.json', 'wiring.json']) {
    const text = readFileSync(join(HERE, file), 'utf8');
    if (textHasLocalPath(text)) failures.push(`${file} contains a local absolute path`);
  }
  const svg = readFileSync(join(HERE, 'palette.svg'), 'utf8');
  if (/href\s*=/.test(svg)) failures.push('palette.svg contains an external reference');
  if (!/RELAY YARD/.test(svg)) failures.push('palette.svg is missing its label');

  return { ok: failures.length === 0, failures, totals: { bytes: totalBytes, triangles: totalTriangles } };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = validateContentSet();
  if (!result.ok) {
    for (const failure of result.failures) console.error('FAIL', failure);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${result.totals.bytes} bytes, ${result.totals.triangles} triangles, palette and contracts valid`);
  }
}
