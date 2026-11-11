import * as THREE from 'three';

/** A location on a particular skinned glove triangle, not an anatomical label.
 * Vertex weights are evaluated on every pose; a bone-space offset is insufficient.
 */
export interface GloveSurfaceAnchor {
  mesh: string;
  hand: string;
  slot: string;
  triangle: number;
  vertices: [number, number, number];
  barycentric: [number, number, number];
}
function unique(root: THREE.Object3D, name: string): THREE.Object3D {
  const found: THREE.Object3D[] = [];
  root.traverse(node => { if (node.name === name) found.push(node); });
  if (found.length !== 1) throw new Error(`Unique node required: ${name}`);
  return found[0]!;
}
function skin(root: THREE.Object3D, name: string): THREE.SkinnedMesh {
  const node = unique(root, name);
  if (!(node instanceof THREE.SkinnedMesh)) throw new Error(`Skinned glove required: ${name}`);
  return node;
}
function worldVertex(mesh: THREE.SkinnedMesh, vertex: number): THREE.Vector3 {
  const count = mesh.geometry.getAttribute('position')?.count ?? 0;
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= count) throw new Error('Invalid surface vertex');
  const value = mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  if (!value.toArray().every(Number.isFinite)) throw new Error('Nonfinite skinned surface');
  return value;
}
function triangle(mesh: THREE.SkinnedMesh, vertices: readonly number[]): THREE.Triangle {
  const value = new THREE.Triangle(...vertices.map(i => worldVertex(mesh, i)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
  if (value.getArea() <= 1e-12) throw new Error('Degenerate glove surface');
  return value;
}

/** Pick the closest real triangle to the authored handslot in the held-aim pose.
 * Restrict all three vertices to majority hand influence; this is a geometric
 * filter, not proof of palm/sleeve anatomy.
 * The result is only a repeatable fitting candidate; it does not identify a palm.
 */
export function locateGloveSurface(root: THREE.Object3D, meshName: string, handName: string, slotName: string): GloveSurfaceAnchor {
  root.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true); // refresh SkinnedMesh attached bind inverse as well as ancestors
  const mesh = skin(root, meshName), hand = unique(root, handName), slot = unique(root, slotName);
  if (!(hand instanceof THREE.Bone) || slot.parent !== hand) throw new Error('Hand/slot hierarchy mismatch');
  const handIndex = mesh.skeleton.bones.indexOf(hand);
  if (handIndex < 0) throw new Error('Hand absent from skin');
  const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
  if (!indices || !weights || indices.count !== weights.count || indices.itemSize !== 4 || weights.itemSize !== 4) throw new Error('Four skin influences required');
  const weight = (vertex: number) => [0, 1, 2, 3].reduce((sum, component) => sum +
    (indices.getComponent(vertex, component) === handIndex ? weights.getComponent(vertex, component) : 0), 0);
  const index = mesh.geometry.index, count = index?.count ?? indices.count;
  if (count % 3 !== 0) throw new Error('Triangular glove required');
  const origin = slot.getWorldPosition(new THREE.Vector3());
  let best: GloveSurfaceAnchor | null = null, distance = Infinity;
  for (let start = 0; start < count; start += 3) {
    const vertices = [0, 1, 2].map(offset => index ? index.getX(start + offset) : start + offset) as [number, number, number];
    if (vertices.some(i => !(weight(i) > .5))) continue;
    const surface = triangle(mesh, vertices), point = surface.closestPointToPoint(origin, new THREE.Vector3());
    const candidateDistance = point.distanceToSquared(origin);
    if (candidateDistance < distance) {
      const bary = surface.getBarycoord(point, new THREE.Vector3());
      if (!bary || !bary.toArray().every(v => Number.isFinite(v) && v >= -1e-8 && v <= 1 + 1e-8)) throw new Error('Invalid nearest surface');
      // Roundoff at an edge must not turn the recorded point into extrapolation.
      bary.set(Math.max(0, bary.x), Math.max(0, bary.y), Math.max(0, bary.z)); bary.divideScalar(bary.x + bary.y + bary.z);
      best = { mesh: meshName, hand: handName, slot: slotName, triangle: start / 3, vertices, barycentric: bary.toArray() };
      distance = candidateDistance;
    }
  }
  if (!best) throw new Error('No majority-hand surface');
  return best;
}

export function sampleGloveSurface(root: THREE.Object3D, anchor: GloveSurfaceAnchor) {
  root.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true); // refresh SkinnedMesh attached bind inverse as well as ancestors
  const mesh = skin(root, anchor.mesh), weights = anchor.barycentric;
  if (weights.length !== 3 || weights.some(w => !Number.isFinite(w) || w < 0 || w > 1)
    || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-8) throw new Error('Invalid barycentric weights');
  const index = mesh.geometry.index, start = anchor.triangle * 3;
  if (!Number.isInteger(anchor.triangle) || start < 0 || start + 2 >= (index?.count ?? mesh.geometry.getAttribute('position').count)
    || anchor.vertices.length !== 3 || anchor.vertices.some((v, i) => v !== (index ? index.getX(start + i) : start + i))) throw new Error('Surface topology changed');
  const surface = triangle(mesh, anchor.vertices);
  const point = surface.a.clone().multiplyScalar(weights[0]).addScaledVector(surface.b, weights[1]).addScaledVector(surface.c, weights[2]);
  return { point, normal: surface.getNormal(new THREE.Vector3()), slot: unique(root, anchor.slot).getWorldPosition(new THREE.Vector3()) };
}

/** A rigid transform preserves point separation. This is the best possible
 * two-point residual, independent of roll; it does not test surface contact.
 */
export function rigidPairResidual(characterSeparation: number, weaponSeparation: number) {
  if (![characterSeparation, weaponSeparation].every(v => Number.isFinite(v) && v > 0)) throw new Error('Positive finite separations required');
  const mismatch = Math.abs(characterSeparation - weaponSeparation);
  return { separationMismatch: mismatch, withPrimaryFixedSupportError: mismatch, bestEqualErrorPerHand: mismatch / 2 };
}
