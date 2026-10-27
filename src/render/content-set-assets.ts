import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SECOND, type Actor, type GameState } from '../sim/types.js';
import { type ShotEffect } from './feedback.js';
import { toThree } from './coordinates.js';
import { weaponParts, weaponPartPosition, weaponMesh, type weaponPose } from './weapon.js';

export const CONTENT_SOURCE = 'b198df62a56f4c520716fbc9cb4afac47dd62213';
export const CONTENT_PIECES = {
  'fp-arms-rx24': { url: new URL('../../assets/content-set/fp-arms-rx24.glb', import.meta.url).href, bytes: 188088, sha256: 'e672d06e30262f2575076f759645aa3d82d6734f0c26ef280a2a36870549b9e1' },
  'enemy-relay-guard': { url: new URL('../../assets/content-set/enemy-relay-guard.glb', import.meta.url).href, bytes: 40388, sha256: '5b316a139cf48b21a6d6b7328ac1c8b58a73c4f41ce1a0de24f2a8ca74afbd74' },
} as const;
export type ContentPiece = keyof typeof CONTENT_PIECES;
type Pose = ReturnType<typeof weaponPose>;
export function contentSetEnabled(search: string) {
  const values = new URLSearchParams(search).getAll('contentSet');
  return values.length === 1 && values[0] === 'characters-v1';
}

// Read-only diagnostics: expected source identity is not evidence of adoption.
// Ready means verified-loaded; active additionally requires a successful View render.
export function contentSetDiagnostics(search: string, backend: string, info?: { contentSet?: { status: string; error: string | null; active?: boolean }; memory?: unknown; calls?: number }) {
  if (!contentSetEnabled(search)) return {};
  const current = backend === 'three-webgl2' && info?.contentSet ? info.contentSet
    : { status: 'fallback', active: false, error: backend === 'three-webgl2' ? 'Content state unavailable' : 'Character content requires WebGL2; procedural Canvas fallback is active' };
  return { contentSet: { requested: 'characters-v1', status: current.status, error: current.error,
    active: current.status === 'ready' && current.active === true, sourceCommit: CONTENT_SOURCE,
    assets: Object.entries(CONTENT_PIECES).map(([id, piece]) => ({ id, bytes: piece.bytes, sha256: piece.sha256 })),
  } };
}

// Resources belong to the loaded templates, never their shared-geometry clones.
export function disposeContent(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  root.removeFromParent();
  for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
}
export function contentNode(scene: THREE.Object3D, name: string) {
  // GLTFLoader can suffix a node when its scene/mesh has the same raw name.
  const matches: THREE.Object3D[] = [];
  scene.traverse(node => { if (node !== scene && (node.name === name || new RegExp(`^${name}_[0-9]+$`).test(node.name))) matches.push(node); });
  if (matches.length !== 1) throw new Error(`Content node ${name}: expected one, got ${matches.length}`);
  return matches[0]!;
}
export async function loadContentPiece(id: ContentPiece, signal: AbortSignal): Promise<GLTF> {
  const spec = CONTENT_PIECES[id];
  const response = await fetch(spec.url, { signal });
  if (!response.ok) throw new Error(`Content ${id}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  if (bytes.byteLength !== spec.bytes || hash !== spec.sha256) throw new Error(`Content ${id}: source integrity mismatch`);
  signal.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  try {
    signal.throwIfAborted();
    const metadata = gltf.scene.userData;
    if (metadata.id !== id || metadata.units !== 'metres' || metadata.up !== '+Y' || metadata.forward !== '-Z') throw new Error(`Content ${id}: scene metadata mismatch`);
    gltf.scene.traverse(node => { if (node instanceof THREE.SkinnedMesh) throw new Error('Rigid content must not introduce a skin'); });
    return gltf;
  } catch (error) { disposeContent(gltf.scene); throw error; }
}

function orderedPoints(points: number[][]) { return [...points].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!); }
function triangleKey(points: number[][]) { return points.map(point => point.map(n => n.toFixed(5)).join(',')).sort().join('|'); }
// Source geometry, not a colour heuristic: remove exactly the original rest
// sleeve triangles from each merged GLB hand, keeping its palm/wrist/fingers.
// Existing arm.ts remains the only sleeve deformation authority.
export function excludeMergedSleeve(mesh: THREE.Mesh, sleeveId: string) {
  const part = weaponParts('rifle').find(p => p.id === sleeveId)!;
  const data = weaponMesh(part), expected = new Map<string, number[][]>();
  const consumed = new Set<string>();
  for (const face of data.faces) for (let i = 1; i < face.length - 1; i++) {
    const points = [face[0]!, face[i]!, face[i + 1]!].map(index => data.vertices[index]!.map((n, axis) => n + part.position[axis]!));
    const key = triangleKey(points);
    if (expected.has(key)) throw new Error('Ambiguous duplicate source sleeve triangle');
    expected.set(key, orderedPoints(points));
  }
  if (mesh.quaternion.angleTo(new THREE.Quaternion()) > 1e-12 || !mesh.scale.equals(new THREE.Vector3(1, 1, 1))) throw new Error('Sleeve transform mismatch');
  const geometry = mesh.geometry, position = geometry.getAttribute('position'), keep: number[] = [];
  if (geometry.index) throw new Error('Accepted sleeve adapter expects non-indexed source triangles');
  let removed = 0;
  for (let i = 0; i < position.count; i += 3) {
    const indices = [i, i + 1, i + 2];
    const points = indices.map(index => [position.getX(index) + mesh.position.x, position.getY(index) + mesh.position.y, position.getZ(index) + mesh.position.z]);
    const key = triangleKey(points), match = expected.get(key);
    if (match) {
      if (consumed.has(key)) throw new Error('Ambiguous duplicate loaded sleeve triangle');
      if (orderedPoints(points).some((point, i) => point.some((n, axis) => Math.abs(n - match[i]![axis]!) > 1e-7))) throw new Error('Sleeve coordinate precision mismatch');
      consumed.add(key); removed++;
    } else keep.push(...indices);
  }
  if (removed !== 140 || consumed.size !== expected.size) throw new Error(`Content sleeve ${sleeveId}: source triangle contract mismatch (${removed})`);
  geometry.setIndex(keep);
  return removed;
}

export class ContentRifle {
  readonly scene: THREE.Group;
  readonly root: THREE.Object3D;
  private magazine: THREE.Object3D;
  private bolt: THREE.Object3D;
  private support: THREE.Object3D;
  private rests: Map<THREE.Object3D, THREE.Vector3>;
  private palm = weaponParts('rifle').find(part => part.id === 'support-palm')!;
  constructor(gltf: GLTF) {
    this.scene = gltf.scene;
    if (JSON.stringify(this.scene.userData.restMount) !== JSON.stringify({ translation: [.29, -.28, -.32], pitch: 0, roll: 0, verticalFovDeg: 80 })) throw new Error('Content rifle rest mount mismatch');
    this.root = contentNode(this.scene, 'rx24-root');
    this.magazine = contentNode(this.scene, 'rifle-magazine');
    this.bolt = contentNode(this.scene, 'rifle-bolt');
    this.support = contentNode(this.scene, 'support-hand');
    const trigger = contentNode(this.scene, 'trigger-hand');
    if (!(this.support instanceof THREE.Mesh) || !(trigger instanceof THREE.Mesh)) throw new Error('Content hand mesh contract mismatch');
    excludeMergedSleeve(this.support, 'support-sleeve'); excludeMergedSleeve(trigger, 'trigger-sleeve');
    contentNode(this.scene, 'rifle-static'); contentNode(this.scene, 'muzzle'); contentNode(this.scene, 'grip');
    this.rests = new Map([this.magazine, this.bolt, this.support].map(node => [node, node.position.clone()]));
  }
  pose(pose: Pose) {
    // Parent weapon group applies weaponPose once. Do not play GLB idle/fire or
    // reload clips on top of procedural recoil, root lowering and support IK.
    this.root.position.set(0, 0, 0); this.root.quaternion.identity();
    for (const [node, rest] of this.rests) node.position.copy(rest);
    this.magazine.position.y -= pose.magazine * .18;
    this.bolt.position.z += pose.bolt * .065;
    const palm = weaponPartPosition(this.palm, pose);
    this.support.position.x += palm[0] - this.palm.position[0];
    this.support.position.y += palm[1] - this.palm.position[1];
    this.support.position.z += palm[2] - this.palm.position[2];
  }
}

type TrackBinding = { node: THREE.Object3D; property: 'position' | 'quaternion'; interpolant: THREE.Interpolant };
export class ContentOpponent {
  readonly mount = new THREE.Group();
  readonly scene: THREE.Group;
  private stance = new THREE.Group();
  private root: THREE.Object3D;
  private rests: { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }[] = [];
  private clips = new Map<string, { duration: number; bindings: TrackBinding[] }>();
  constructor(gltf: GLTF) {
    this.scene = gltf.scene.clone(true); this.mount.add(this.scene);
    this.root = contentNode(this.scene, 'enemy-root');
    // Stance scales authored geometry before the foot-origin fall, matching
    // targetVertices. World placement and yaw are outside both transforms.
    this.stance.add(...this.root.children); this.root.add(this.stance);
    for (const name of ['head', 'spine', 'leg-l', 'leg-r', 'weapon']) contentNode(this.scene, name);
    this.scene.traverse(node => this.rests.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone() }));
    for (const clip of gltf.animations) {
      const bindings = clip.tracks.map(track => {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        if ((parsed.propertyName !== 'position' && parsed.propertyName !== 'quaternion') || track.getInterpolation() !== THREE.InterpolateLinear) throw new Error(`Unsupported rigid track ${track.name}`);
        const node = this.scene.getObjectByName(parsed.nodeName);
        if (!node) throw new Error(`Missing loaded track target ${track.name}`);
        return { node, property: parsed.propertyName, interpolant: track.InterpolantFactoryMethodLinear() } as TrackBinding;
      });
      this.clips.set(clip.name, { duration: clip.duration, bindings });
    }
    for (const name of ['idle', 'walk', 'fire', 'hit', 'death']) if (!this.clips.has(name)) throw new Error(`Missing rigid clip ${name}`);
  }
  private sample(name: string, seconds: number, loop = false) {
    const clip = this.clips.get(name)!;
    const time = loop ? ((seconds % clip.duration) + clip.duration) % clip.duration : Math.min(clip.duration, Math.max(0, seconds));
    for (const binding of clip.bindings) binding.node[binding.property].fromArray(binding.interpolant.evaluate(time));
  }
  pose(state: GameState, actor: Actor, effects: readonly ShotEffect[], visible: boolean) {
    for (const rest of this.rests) { rest.node.position.copy(rest.position); rest.node.quaternion.copy(rest.quaternion); }
    this.mount.position.set(...toThree(actor.position)); this.mount.rotation.set(0, -actor.yaw, 0);
    this.stance.scale.set(1, actor.input.crouch ? .65 : 1, 1); this.mount.visible = visible;
    const time = state.time / SECOND;
    const hit = [...effects].reverse().find(effect => effect.shot.hit === actor.id);
    if (actor.hp <= 0) { if (hit?.shot.impact?.killed) this.sample('death', hit.age / 1000); return; }
    this.sample('idle', time, true);
    if (Math.hypot(actor.input.x, actor.input.z) > .01) this.sample('walk', time, true);
    const shot = [...state.shots].reverse().find(shot => shot.actorId === actor.id && shot.weapon === actor.weapon && shot.time <= state.time);
    if (shot && !actor.reload && state.phase === 'live' && time - shot.time / SECOND < .12) this.sample('fire', time - shot.time / SECOND);
    if (hit && hit.age < 180 && !hit.shot.impact?.killed) this.sample('hit', hit.age / 1000);
  }
  detach() { this.mount.removeFromParent(); }
}

export type PieceLoader = (id: ContentPiece, signal: AbortSignal) => Promise<GLTF>;
// One generation owns two templates. An obsolete async completion is disposed,
// never attached; failure leaves the old procedural renderer available.
export class ContentSetAssets {
  status: 'off' | 'loading' | 'ready' | 'fallback' | 'disposed' = 'off';
  error: string | null = null;
  rifle: ContentRifle | null = null;
  private opponent: GLTF | null = null;
  private templates: GLTF[] = [];
  private generation = 0;
  private controller: AbortController | null = null;
  private opponents = new Map<string, ContentOpponent>();
  constructor(private load: PieceLoader = loadContentPiece) {}
  async start() {
    if (this.status === 'disposed') return;
    const generation = ++this.generation;
    this.controller?.abort(); this.release();
    const controller = this.controller = new AbortController();
    this.status = 'loading'; this.error = null;
    const results = await Promise.allSettled((Object.keys(CONTENT_PIECES) as ContentPiece[]).map(async id => {
      try { return await this.load(id, controller.signal); } catch (error) { controller.abort(); throw error; }
    }));
    const loaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (generation !== this.generation) { for (const gltf of loaded) disposeContent(gltf.scene); return; }
    try {
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      this.templates = loaded;
      this.rifle = new ContentRifle(loaded[0]!);
      this.opponent = loaded[1]!;
      // Validate clips/names before atomically enabling either replacement.
      new ContentOpponent(this.opponent).detach();
      this.status = 'ready';
    } catch (error) {
      this.templates = loaded; this.release(); this.status = 'fallback';
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
  actor(id: string) {
    if (this.status !== 'ready' || !this.opponent) return null;
    let opponent = this.opponents.get(id);
    if (!opponent) { opponent = new ContentOpponent(this.opponent); this.opponents.set(id, opponent); }
    return opponent;
  }
  retainActors(ids: ReadonlySet<string>) {
    for (const [id, actor] of this.opponents) if (!ids.has(id)) { actor.detach(); this.opponents.delete(id); }
  }
  reset() { this.retainActors(new Set()); }
  private release() {
    this.reset(); this.rifle = null; this.opponent = null;
    for (const gltf of this.templates) disposeContent(gltf.scene);
    this.templates = [];
  }
  dispose() {
    if (this.status === 'disposed') return;
    ++this.generation; this.controller?.abort(); this.controller = null;
    this.release(); this.status = 'disposed';
  }
}
