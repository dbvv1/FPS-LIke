import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SECOND, type Actor, type GameState } from '../../src/candidates/offline-training-v1/sim/types.js';
import { RESULT_HOLD_MS, type ShotEffect } from '../../src/candidates/offline-training-v1/render/feedback.js';
import { toThree } from '../../src/candidates/offline-training-v1/render/coordinates.js';

// Accepted bytes of the character used by the old 1v1 candidate. This adapter
// never rebuilds or recolours the source: it samples the five exported rigid
// clips against the current offline-training-v1 read-only state contract.
export const TRAINING_CHARACTER_SOURCE = {
  id: 'enemy-relay-guard',
  sourceCommit: 'b198df62a56f4c520716fbc9cb4afac47dd62213',
  url: new URL('../../assets/content-set/enemy-relay-guard.glb', import.meta.url).href,
  bytes: 40388,
  sha256: '5b316a139cf48b21a6d6b7328ac1c8b58a73c4f41ce1a0de24f2a8ca74afbd74',
} as const;

export const TRAINING_CLIPS = ['idle', 'walk', 'fire', 'hit', 'death'] as const;
export type TrainingClip = (typeof TRAINING_CLIPS)[number];

const TRAINING_NODES = ['enemy-root', 'spine', 'head', 'leg-l', 'leg-r', 'weapon'] as const;
const MOVING_EPSILON = 0.01;

export type CharacterMotion = { clip: TrainingClip; seconds: number; loop: boolean };
export type TrainingCharacterSource = { readonly id: string; readonly bytes: number; readonly sha256: string; readonly url?: string };
export type TrainingCharacterFetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

type TrackBinding = { node: THREE.Object3D; property: 'position' | 'quaternion'; interpolant: THREE.Interpolant };
type ClipData = { duration: number; bindings: TrackBinding[] };
type RestTransform = { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

// GLTFLoader can suffix a node when its scene/mesh has the same raw name.
export function trainingNode(scene: THREE.Object3D, name: string): THREE.Object3D {
  const matches: THREE.Object3D[] = [];
  scene.traverse(node => {
    if (node !== scene && (node.name === name || new RegExp(`^${name}_[0-9]+$`).test(node.name))) matches.push(node);
  });
  if (matches.length !== 1) throw new Error(`Training character node ${name}: expected one, got ${matches.length}`);
  return matches[0]!;
}

// Template resources are owned by the loaded template, never by its clones.
export function disposeTrainingCharacter(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
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

export async function parseTrainingCharacter(
  bytes: ArrayBuffer,
  source: TrainingCharacterSource = TRAINING_CHARACTER_SOURCE,
  signal?: AbortSignal,
): Promise<GLTF> {
  signal?.throwIfAborted();
  if (bytes.byteLength !== source.bytes) throw new Error(`Training character ${source.id}: expected ${source.bytes} bytes, got ${bytes.byteLength}`);
  if (await sha256Hex(bytes) !== source.sha256) throw new Error(`Training character ${source.id}: source integrity mismatch`);
  signal?.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  try {
    signal?.throwIfAborted();
    const metadata = gltf.scene.userData as Record<string, unknown>;
    if (metadata.id !== source.id || metadata.units !== 'metres' || metadata.up !== '+Y' || metadata.forward !== '-Z') {
      throw new Error(`Training character ${source.id}: scene metadata mismatch`);
    }
    gltf.scene.traverse(node => { if (node instanceof THREE.SkinnedMesh) throw new Error('Training character must stay rigid; a skin is not accepted'); });
    // Validate nodes and clips before the caller can activate the template.
    new TrainingCharacter(gltf).detach();
    return gltf;
  } catch (error) {
    disposeTrainingCharacter(gltf.scene);
    throw error;
  }
}

export async function loadTrainingCharacter(
  signal: AbortSignal,
  fetchImpl: TrainingCharacterFetch = fetch,
  source: TrainingCharacterSource = TRAINING_CHARACTER_SOURCE,
): Promise<GLTF> {
  const response = await fetchImpl(source.url ?? TRAINING_CHARACTER_SOURCE.url, { signal });
  if (!response.ok) throw new Error(`Training character ${source.id}: HTTP ${response.status}`);
  return parseTrainingCharacter(await response.arrayBuffer(), source, signal);
}

export function movementAmount(actor: Pick<Actor, 'velocity' | 'input'>): number {
  return actor.velocity ? Math.hypot(actor.velocity.x, actor.velocity.z) : Math.hypot(actor.input.x, actor.input.z);
}

// Live and paused rounds read the simulation age. A settled round reuses the
// existing Feedback event age, which already carries its bounded 700 ms tail.
export function presentationAgeMs(state: Pick<GameState, 'phase' | 'time'>, effect: Pick<ShotEffect, 'age' | 'shot'>): number {
  if (state.phase === 'over') return Math.min(RESULT_HOLD_MS, Math.max(0, effect.age));
  return Math.max(0, (state.time - effect.shot.time) / SECOND * 1000);
}

function latestEffect(effects: readonly ShotEffect[], actorId: string, killed: boolean): ShotEffect | undefined {
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index]!;
    if (effect.shot.hit !== actorId) continue;
    if (Boolean(effect.shot.impact?.killed) !== killed) continue;
    return effect;
  }
  return undefined;
}

export class TrainingCharacter {
  readonly mount = new THREE.Group();
  readonly scene: THREE.Group;
  private readonly stance = new THREE.Group();
  private readonly root: THREE.Object3D;
  private readonly rests: RestTransform[] = [];
  private readonly clips = new Map<string, ClipData>();

  constructor(gltf: GLTF) {
    this.scene = gltf.scene.clone(true);
    this.mount.add(this.scene);
    this.root = trainingNode(this.scene, 'enemy-root');
    // Crouch scales authored geometry before the foot-origin fall, matching
    // targetVertices. World placement and yaw stay outside both transforms.
    this.stance.add(...this.root.children);
    this.root.add(this.stance);
    for (const name of TRAINING_NODES) trainingNode(this.scene, name);
    this.scene.traverse(node => this.rests.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
    for (const clip of gltf.animations) {
      if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0 || this.clips.has(clip.name)) {
        throw new Error(`Invalid or duplicate rigid clip ${clip.name}`);
      }
      if ((clip.name === 'hit' || clip.name === 'death') && clip.duration > RESULT_HOLD_MS / 1000) {
        throw new Error(`Rigid clip ${clip.name} exceeds Feedback retention`);
      }
      const bindings = clip.tracks.map(track => {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        if ((parsed.propertyName !== 'position' && parsed.propertyName !== 'quaternion') || track.getInterpolation() !== THREE.InterpolateLinear) {
          throw new Error(`Unsupported rigid track ${track.name}`);
        }
        const node = this.scene.getObjectByName(parsed.nodeName);
        if (!node) throw new Error(`Missing loaded track target ${track.name}`);
        return { node, property: parsed.propertyName, interpolant: track.InterpolantFactoryMethodLinear() } as TrackBinding;
      });
      this.clips.set(clip.name, { duration: clip.duration, bindings });
    }
    for (const name of TRAINING_CLIPS) if (!this.clips.has(name)) throw new Error(`Missing rigid clip ${name}`);
  }

  get clipDurations(): ReadonlyMap<string, number> {
    const durations = new Map<string, number>();
    for (const [name, clip] of this.clips) durations.set(name, clip.duration);
    return durations;
  }

  private duration(name: TrainingClip): number {
    return this.clips.get(name)!.duration;
  }

  private sample(name: TrainingClip, seconds: number, loop: boolean): void {
    const clip = this.clips.get(name)!;
    const time = loop ? ((seconds % clip.duration) + clip.duration) % clip.duration : Math.min(clip.duration, Math.max(0, seconds));
    for (const binding of clip.bindings) binding.node[binding.property].fromArray(binding.interpolant.evaluate(time));
  }

  // Presentation only. Inputs are never mutated and no clock or timer is kept:
  // death > hit > fire > walk > idle, and every clip length comes from the GLB.
  selectMotion(state: GameState, actor: Actor, effects: readonly ShotEffect[]): CharacterMotion | null {
    const death = latestEffect(effects, actor.id, true);
    if (actor.hp <= 0) {
      if (!death) return null;
      const age = presentationAgeMs(state, death);
      return age < RESULT_HOLD_MS ? { clip: 'death', seconds: age / 1000, loop: false } : null;
    }
    const hit = latestEffect(effects, actor.id, false);
    if (hit) {
      const age = presentationAgeMs(state, hit);
      if (age < this.duration('hit') * 1000) return { clip: 'hit', seconds: age / 1000, loop: false };
    }
    if (state.phase === 'live' && !actor.reload) {
      let shot: GameState['shots'][number] | undefined;
      for (let index = state.shots.length - 1; index >= 0; index--) {
        const candidate = state.shots[index]!;
        if (candidate.actorId === actor.id && candidate.weapon === actor.weapon && candidate.time <= state.time) { shot = candidate; break; }
      }
      if (shot) {
        const seconds = (state.time - shot.time) / SECOND;
        if (seconds < this.duration('fire')) return { clip: 'fire', seconds, loop: false };
      }
    }
    if (movementAmount(actor) > MOVING_EPSILON) return { clip: 'walk', seconds: state.time / SECOND, loop: true };
    return { clip: 'idle', seconds: state.time / SECOND, loop: true };
  }

  visible(state: GameState, actor: Actor, effects: readonly ShotEffect[]): boolean {
    if (actor.hp > 0) return true;
    const death = latestEffect(effects, actor.id, true);
    return !!death && presentationAgeMs(state, death) < RESULT_HOLD_MS;
  }

  pose(state: GameState, actor: Actor, effects: readonly ShotEffect[], visible = true): void {
    // Restore every authored TRS first: clips are absolute samples, never deltas.
    for (const rest of this.rests) {
      rest.node.position.copy(rest.position);
      rest.node.quaternion.copy(rest.quaternion);
      rest.node.scale.copy(rest.scale);
    }
    this.stance.scale.set(1, actor.input.crouch ? .65 : 1, 1);
    this.mount.position.set(...toThree(actor.position));
    this.mount.rotation.set(0, -actor.yaw, 0);
    this.mount.visible = visible && this.visible(state, actor, effects);
    const motion = this.selectMotion(state, actor, effects);
    if (motion) this.sample(motion.clip, motion.seconds, motion.loop);
  }

  detach(): void {
    this.mount.removeFromParent();
  }
}

export type TrainingCharacterLoader = (signal: AbortSignal) => Promise<GLTF>;

// One View owns one template. Instances share its geometry/material, so reset
// only detaches them; the template is disposed exactly once by this owner.
export class TrainingCharacterSet {
  status: 'off' | 'loading' | 'ready' | 'fallback' | 'disposed' = 'off';
  error: string | null = null;
  private template: GLTF | null = null;
  private readonly characters = new Map<string, TrainingCharacter>();
  private generation = 0;
  private controller: AbortController | null = null;

  constructor(private readonly load: TrainingCharacterLoader = signal => loadTrainingCharacter(signal)) {}

  async start(): Promise<void> {
    if (this.status === 'disposed') return;
    const generation = ++this.generation;
    this.controller?.abort();
    this.releaseTemplate();
    const controller = this.controller = new AbortController();
    this.status = 'loading';
    this.error = null;
    let gltf: GLTF;
    try {
      gltf = await this.load(controller.signal);
    } catch (error) {
      if (generation !== this.generation) return;
      this.status = 'fallback';
      this.error = error instanceof Error ? error.message : String(error);
      return;
    }
    if (generation !== this.generation) {
      disposeTrainingCharacter(gltf.scene);
      return;
    }
    try {
      new TrainingCharacter(gltf).detach();
      this.template = gltf;
      this.status = 'ready';
    } catch (error) {
      disposeTrainingCharacter(gltf.scene);
      this.status = 'fallback';
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  character(id: string): TrainingCharacter | null {
    if (this.status !== 'ready' || !this.template) return null;
    let character = this.characters.get(id);
    if (!character) {
      character = new TrainingCharacter(this.template);
      this.characters.set(id, character);
    }
    return character;
  }

  retainActors(ids: ReadonlySet<string>): void {
    for (const [id, character] of this.characters) {
      if (ids.has(id)) continue;
      character.detach();
      this.characters.delete(id);
    }
  }

  reset(): void {
    this.retainActors(new Set());
  }

  private releaseTemplate(): void {
    this.reset();
    if (this.template) disposeTrainingCharacter(this.template.scene);
    this.template = null;
  }

  dispose(): void {
    if (this.status === 'disposed') return;
    ++this.generation;
    this.controller?.abort();
    this.controller = null;
    this.releaseTemplate();
    this.status = 'disposed';
  }
}
