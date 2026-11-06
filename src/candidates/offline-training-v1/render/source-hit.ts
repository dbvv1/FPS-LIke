import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { contentNode, disposeContent, loadVerifiedContent } from '../../../render/content-set-assets.js';
import type { Actor, GameState } from '../sim/types.js';
import { RESULT_HOLD_MS, type ShotEffect } from './feedback.js';
import { impactAppearance } from './combat-feedback.js';

export const HIT_SOURCE = {
  id: 'hit-feedback',
  url: new URL('../../../../assets/content-set/hit-feedback.glb', import.meta.url).href,
  bytes: 6760,
  sha256: '80155733647ffadb61cc7b1890ad1fc18818faa97448457b7ddc9ee2dfd56edd',
} as const;
export type MarkerKind = 'body' | 'head' | 'kill' | 'friendly';
export type MarkerReceipt = { ownsMarker: boolean; kind: MarkerKind | null; round: number; shotTime: number | null };
type ScaleClip = { duration: number; sample: THREE.Interpolant };

// Geometry and pop keys are the accepted standard piece. The consumer owns
// screen placement, unlit UI materials and the existing 320 ms body/head hold.
// The source impact burst is deliberately not adopted: it duplicates the
// existing octahedral world impact rather than adding a new feedback channel.
export class TrainingHitMarker {
  readonly mount = new THREE.Group();
  readonly marker: THREE.Object3D;
  private core: THREE.Mesh;
  private accent: THREE.Mesh;
  private coreMaterial: THREE.MeshBasicMaterial;
  private accentMaterial: THREE.MeshBasicMaterial;
  private clips = new Map<string, ScaleClip>();
  private colors: Record<MarkerKind, string>;
  constructor(gltf: GLTF) {
    const marker = contentNode(gltf.scene, 'hit-marker');
    const metadata = gltf.scene.userData;
    if (metadata.markerScreen?.billboardPlaneM !== .5 || metadata.markerOuterM !== .0054) throw new Error('Source marker screen contract mismatch');
    this.colors = metadata.colors;
    for (const kind of ['body', 'head', 'kill', 'friendly'] as const) {
      if (!/^#[0-9a-f]{6}$/i.test(this.colors?.[kind] ?? '')) throw new Error('Source marker palette missing');
    }
    for (const name of ['hit-body', 'hit-head', 'hit-kill']) {
      const matches = gltf.animations.filter(clip => clip.name === name), clip = matches[0];
      if (matches.length !== 1 || !clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.duration * 1000 > RESULT_HOLD_MS + .001 || clip.tracks.length !== 1) throw new Error(`Invalid source marker clip ${name}`);
      const track = clip.tracks[0]!, binding = THREE.PropertyBinding.parseTrackName(track.name);
      if (binding.nodeName !== marker.name || binding.propertyName !== 'scale' || track.getValueSize() !== 3 || track.getInterpolation() !== THREE.InterpolateLinear || track.times[0] !== 0 || track.times.at(-1) !== clip.duration) throw new Error(`Invalid source marker binding ${name}`);
      if (Array.from(track.values).some(value => !Number.isFinite(value) || value <= 0) || Array.from(track.times).some((value, index) => !Number.isFinite(value) || (index > 0 && value <= track.times[index - 1]!))) throw new Error(`Invalid source marker keys ${name}`);
      this.clips.set(name, { duration: clip.duration, sample: track.InterpolantFactoryMethodLinear() });
    }
    this.marker = marker.clone(true);
    const core = contentNode(this.marker, 'marker-core'), accent = contentNode(this.marker, 'marker-accent');
    if (!(core instanceof THREE.Mesh) || !(accent instanceof THREE.Mesh)) throw new Error('Source marker meshes missing');
    this.core = core; this.accent = accent;
    const options = { depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide };
    this.coreMaterial = new THREE.MeshBasicMaterial(options);
    this.accentMaterial = new THREE.MeshBasicMaterial({ ...options, color: this.colors.head });
    core.material = this.coreMaterial; accent.material = this.accentMaterial;
    core.renderOrder = accent.renderOrder = 110;
    this.mount.userData.lightingCue = true;
    this.mount.position.z = -.5;
    this.mount.add(this.marker); this.mount.visible = false;
  }
  update(state: GameState, player: Actor | null, effects: readonly ShotEffect[]): MarkerKind | null {
    this.mount.visible = false; this.accent.visible = false;
    if (!player) return null;
    const latest = [...state.shots].reverse().find(shot => shot.actorId === player.id);
    // A newer miss/legacy record must cancel a prior success, never revive it.
    if (!latest?.impact) return null;
    const event = [...effects].reverse().find(effect => effect.shot.actorId === player.id && effect.shot.time === latest.time);
    if (!event || !Number.isFinite(event.age) || event.age < 0) return null;
    const appearance = impactAppearance(state, player, event);
    const kind = appearance.kind === 'friendly' ? 'friendly' : appearance.kind === 'enemy-kill' ? 'kill' : appearance.kind === 'enemy-head' ? 'head' : appearance.kind === 'enemy-body' ? 'body' : null;
    if (!kind) return null;
    const clip = this.clips.get(`hit-${kind === 'friendly' ? 'body' : kind}`)!;
    const hold = kind === 'kill' ? Math.min(RESULT_HOLD_MS, clip.duration * 1000) : 320;
    if (event.age >= hold) return null;
    this.marker.scale.fromArray(clip.sample.evaluate(Math.min(clip.duration, event.age / 1000)));
    this.coreMaterial.color.set(kind === 'head' ? this.colors.body : this.colors[kind]);
    this.accent.visible = kind === 'head' || kind === 'kill';
    this.mount.visible = true;
    return kind;
  }
  reset() { this.mount.visible = false; this.accent.visible = false; this.marker.scale.set(1, 1, 1); this.mount.removeFromParent(); }
  dispose() { this.reset(); this.coreMaterial.dispose(); this.accentMaterial.dispose(); }
}

export type HitLoader = (signal: AbortSignal) => Promise<GLTF>;
export class TrainingHitAssets {
  status: 'off' | 'loading' | 'ready' | 'fallback' | 'disposed' = 'off';
  error: string | null = null;
  marker: TrainingHitMarker | null = null;
  private template: GLTF | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private load: HitLoader = signal => loadVerifiedContent(HIT_SOURCE.id, HIT_SOURCE, signal)) {}
  async start() {
    if (this.status === 'disposed') return;
    const generation = ++this.generation;
    this.controller?.abort(); this.release();
    const controller = this.controller = new AbortController();
    this.status = 'loading'; this.error = null;
    let gltf: GLTF;
    try { gltf = await this.load(controller.signal); }
    catch (error) {
      if (generation === this.generation) { this.status = 'fallback'; this.error = error instanceof Error ? error.message : String(error); }
      return;
    }
    if (generation !== this.generation) { disposeContent(gltf.scene); return; }
    this.template = gltf;
    try { this.marker = new TrainingHitMarker(gltf); this.status = 'ready'; }
    catch (error) { this.release(); this.status = 'fallback'; this.error = error instanceof Error ? error.message : String(error); }
  }
  reset() { this.marker?.reset(); }
  private release() {
    this.marker?.dispose(); this.marker = null;
    if (this.template) disposeContent(this.template.scene);
    this.template = null;
  }
  dispose() {
    if (this.status === 'disposed') return;
    ++this.generation; this.controller?.abort(); this.controller = null;
    this.release(); this.status = 'disposed';
  }
}
