import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { environmentEnabled } from './environment-kit.js';

export const ART_ID = 'standards-v1';
export const ART_PIECES = [
  { id: 'center-dogleg', url: new URL('../../../../assets/environment/standards-v1/models/wall-center-dogleg.glb', import.meta.url).href, bytes: 76776, dimensions: [2.2, 3.4, 1.2] },
  { id: 'site-cover', url: new URL('../../../../assets/environment/standards-v1/models/low-cover-site.glb', import.meta.url).href, bytes: 36492, dimensions: [2.2, .8, 1.1] },
  { id: 'lamp-existing', url: new URL('../../../../assets/environment/standards-v1/models/lamp-existing.glb', import.meta.url).href, bytes: 10336, dimensions: [.8, 5, .35] },
] as const;
export function artEnabled(search: string) {
  const p = new URLSearchParams(search);
  return environmentEnabled(search) && p.getAll('art').length === 1 && p.get('art') === ART_ID;
}
export type ArtSlot = { id: string; position: readonly number[]; fallback: THREE.Object3D[] };
type Load = (piece: typeof ART_PIECES[number], signal: AbortSignal) => Promise<THREE.Object3D>;
export async function loadArt(piece: typeof ART_PIECES[number], signal: AbortSignal) {
  const response = await fetch(piece.url, { signal });
  if (!response.ok) throw new Error('asset-http');
  const data = await response.arrayBuffer();
  if (data.byteLength !== piece.bytes) throw new Error('asset-size');
  // The fixed, self-contained authored GLBs have no external image/buffer requests.
  return (await new GLTFLoader().parseAsync(data, '')).scene;
}
function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  return { geometries, materials };
}
export function releaseArt(root: THREE.Object3D) {
  root.removeFromParent(); const r = resources(root);
  for (const g of r.geometries) g.dispose();
  for (const m of r.materials) m.dispose();
}
function validate(root: THREE.Object3D, piece: typeof ART_PIECES[number]) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const expected = piece.dimensions;
  if ([size.x, size.y, size.z].some((v, i) => Math.abs(v - expected[i]!) > .0001) || Math.abs(box.min.y) > .0001 || Math.abs(box.min.x + box.max.x) > .0001 || Math.abs(box.min.z + box.max.z) > .0001) throw new Error('asset-contract');
  let triangles = 0, calls = 0;
  root.traverse(o => { if (o instanceof THREE.Mesh) {
    triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    calls += Math.max(1, o.geometry.groups.length);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.transparent || m.side !== THREE.FrontSide || Object.values(m).some(v => v instanceof THREE.Texture)) throw new Error('asset-material');
    }
  }});
  if (triangles > 2000 || calls > 2) throw new Error('asset-budget');
  return { triangles, calls };
}
// One lifetime for exactly three authored standards, not a general asset manager.
export class ArtStandards {
  private controller = new AbortController();
  private disposed = false;
  private roots: THREE.Object3D[] = [];
  private detach: Array<() => void> = [];
  private detachSurfaces() { for (const release of this.detach) release(); this.detach = []; }
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private state = 'idle';
  private budget = { triangles: 0, calls: 0, bytes: 123604 };
  get info() { return { id: ART_ID, state: this.state, pieces: this.roots.length, budget: { ...this.budget }, evidence: 'runtime-geometry-only' }; }
  constructor(private scene: THREE.Object3D, private slots: ArtSlot[], private load: Load = loadArt, private timeoutMs = 12000, private registerSurface?: (id: string, root: THREE.Object3D) => () => void) {}
  async start() {
    if (this.started || this.disposed) return;
    this.started = true; this.state = 'loading';
    this.timer = setTimeout(() => { this.controller.abort(); this.detachSurfaces(); for (const root of this.roots) releaseArt(root); this.roots = []; this.budget.triangles = 0; this.budget.calls = 0; this.state = this.disposed ? 'disposed' : 'fallback'; }, this.timeoutMs);
    try {
      for (const piece of ART_PIECES) {
        const root = await this.load(piece, this.controller.signal);
        if (this.disposed || this.controller.signal.aborted) { releaseArt(root); throw new Error('asset-cancelled'); }
        this.roots.push(root);
        const count = validate(root, piece);
        this.budget.triangles += count.triangles; this.budget.calls += count.calls;
      }
      const slots = ART_PIECES.map(piece => {
        const matches = this.slots.filter(slot => slot.id === piece.id);
        if (matches.length !== 1) throw new Error('asset-slot');
        return matches[0]!;
      });
      // Commit all three together. Original objects are retained for failure/teardown.
      this.roots.forEach((root, i) => { const slot = slots[i]!; root.position.set(slot.position[0]!, slot.position[1]!, slot.position[2]!); this.scene.add(root); if (this.registerSurface) this.detach.push(this.registerSurface(slot.id, root)); });
      for (const slot of slots) for (const old of slot.fallback) old.visible = false;
      this.state = 'ready';
    } catch {
      this.detachSurfaces();
      for (const root of this.roots) releaseArt(root);
      this.roots = []; this.budget.triangles = 0; this.budget.calls = 0;
      this.state = this.disposed ? 'disposed' : 'fallback';
    } finally { if (this.timer) clearTimeout(this.timer); }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.controller.abort(); if (this.timer) clearTimeout(this.timer);
    this.detachSurfaces();
    for (const root of this.roots) releaseArt(root);
    this.roots = []; this.budget.triangles = 0; this.budget.calls = 0;
    for (const slot of this.slots) for (const old of slot.fallback) old.visible = true;
    this.state = 'disposed';
  }
}
