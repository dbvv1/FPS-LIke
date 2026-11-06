import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { CONTENT_PIECES, ContentRifle, contentNode, disposeContent, loadContentPiece } from '../../../render/content-set-assets.js';
import type { weaponPose } from './weapon.js';

type Pose = ReturnType<typeof weaponPose>;
type Track = { duration: number; origin: number; interpolant: THREE.Interpolant; axis: number; travel: number; start: number; returning: number };
export type RifleReloadReceipt = { active: boolean; progress: number; reloadEnd: number | null; weaponGeneration?: number; cuePhases: { out: number; in: number; bolt: number } | null };
export const RIFLE_RELOAD_SOURCE = { id: 'fp-arms-rx24', ...CONTENT_PIECES['fp-arms-rx24'], clips: ['reload-magazine', 'reload-bolt'] } as const;

// These are two accepted rigid component tracks, not a skeleton animation or
// a full reload/switch performance. Sample their displacement from their first
// key so the source's rounded node rest coordinates cannot offset the grip.
function reloadTrack(gltf: GLTF, clipName: string, nodeName: string, axis: number, travel: number): Track {
  const clips = gltf.animations.filter(clip => clip.name === clipName);
  if (clips.length !== 1) throw new Error(`Expected one source clip ${clipName}`);
  const clip = clips[0]!;
  if (clip.tracks.length !== 1 || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`Invalid source clip ${clipName}`);
  const track = clip.tracks[0]!, binding = THREE.PropertyBinding.parseTrackName(track.name);
  const node = contentNode(gltf.scene, nodeName);
  if (binding.nodeName !== node.name || binding.propertyName !== 'position' || track.getValueSize() !== 3 || track.getInterpolation() !== THREE.InterpolateLinear) throw new Error(`Unsupported source binding ${clipName}`);
  if (track.times.length < 2 || track.times[0] !== 0 || track.times.at(-1) !== clip.duration) throw new Error(`Invalid source timing ${clipName}`);
  const first = Array.from(track.values.slice(0, 3)), last = Array.from(track.values.slice(-3));
  for (let index = 0; index < track.times.length; index++) {
    if (!Number.isFinite(track.times[index]) || (index > 0 && track.times[index]! <= track.times[index - 1]!)) throw new Error(`Invalid source keys ${clipName}`);
    for (let component = 0; component < 3; component++) {
      const delta = track.values[index * 3 + component]! - first[component]!;
      if (!Number.isFinite(delta) || (component !== axis && Math.abs(delta) > 1e-6) || (component === axis && (delta / travel < -1e-6 || delta / travel > 1 + 1e-6))) throw new Error(`Unexpected source travel ${clipName}`);
    }
  }
  const phases = Array.from(track.times, (_, index) => (track.values[index * 3 + axis]! - first[axis]!) / travel);
  const moving = phases.findIndex((value, index) => index > 0 && value > phases[index - 1]! + 1e-6);
  const returning = phases.findIndex((value, index) => index > 0 && value < phases[index - 1]! - 1e-6);
  if (moving < 1 || returning < 1 || Math.max(...phases) < 1 - 1e-5) throw new Error(`Incomplete source travel ${clipName}`);
  if (first.some((value, index) => Math.abs(value - last[index]!) > 1e-6)) throw new Error(`Source clip does not return to rest: ${clipName}`);
  return { duration: clip.duration, origin: first[axis]!, interpolant: track.InterpolantFactoryMethodLinear(), axis, travel, start: track.times[moving - 1]! / clip.duration, returning: track.times[returning - 1]! / clip.duration };
}

export class TrainingRifle {
  readonly model: ContentRifle;
  private readonly magazine: Track;
  private readonly bolt: Track;
  constructor(gltf: GLTF) {
    this.magazine = reloadTrack(gltf, 'reload-magazine', 'rifle-magazine', 1, -.18);
    this.bolt = reloadTrack(gltf, 'reload-bolt', 'rifle-bolt', 2, .065);
    this.model = new ContentRifle(gltf);
  }
  get cuePhases() { return { out: this.magazine.start, in: this.magazine.returning, bolt: this.bolt.start }; }
  get scene() { return this.model.scene; }
  pose(base: Pose): Pose {
    const sample = (track: Track) => {
      const value = track.interpolant.evaluate(Math.max(0, Math.min(1, base.progress)) * track.duration)[track.axis]!;
      return Math.max(0, Math.min(1, (value - track.origin) / track.travel));
    };
    const pose = { ...base, magazine: sample(this.magazine), bolt: sample(this.bolt) };
    // Root recoil/lowering is applied once by View. Palm and procedural sleeves
    // receive this same sampled displacement, never the old magazine envelope.
    this.model.pose(pose);
    return pose;
  }
}

export type TrainingRifleLoader = (signal: AbortSignal) => Promise<GLTF>;
export class TrainingRifleAssets {
  status: 'off' | 'loading' | 'ready' | 'fallback' | 'disposed' = 'off';
  error: string | null = null;
  rifle: TrainingRifle | null = null;
  private template: GLTF | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private readonly load: TrainingRifleLoader = signal => loadContentPiece('fp-arms-rx24', signal)) {}
  async start(): Promise<void> {
    if (this.status === 'disposed') return;
    const generation = ++this.generation;
    this.controller?.abort(); this.release();
    const controller = this.controller = new AbortController();
    this.status = 'loading'; this.error = null;
    let gltf: GLTF;
    try { gltf = await this.load(controller.signal); }
    catch (error) {
      if (generation !== this.generation) return;
      this.status = 'fallback'; this.error = error instanceof Error ? error.message : String(error); return;
    }
    if (generation !== this.generation) { disposeContent(gltf.scene); return; }
    try {
      this.template = gltf;
      this.rifle = new TrainingRifle(gltf);
      this.status = 'ready';
    } catch (error) {
      this.release(); this.status = 'fallback'; this.error = error instanceof Error ? error.message : String(error);
    }
  }
  reset() { this.rifle?.scene.removeFromParent(); }
  private release() {
    this.reset(); this.rifle = null;
    if (this.template) disposeContent(this.template.scene);
    this.template = null;
  }
  dispose() {
    if (this.status === 'disposed') return;
    ++this.generation; this.controller?.abort(); this.controller = null;
    this.release(); this.status = 'disposed';
  }
}
