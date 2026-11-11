import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Cross-rig clips retain the verified parent-coordinate contract.
export const KAYKIT_ACTIONS = {
  'reload-one-hand': 'Rig_Medium|Ranged_1H_Reload',
  'reload-two-hand': 'Rig_Medium|Ranged_2H_Reload',
} as const;
export const KAYKIT_NATIVE_ACTIONS = {
  'native-aim-two-hand': '2H_Ranged_Aiming',
  'native-fire-two-hand': '2H_Ranged_Shoot',
  'native-reload-two-hand': '2H_Ranged_Reload',
} as const;
export const KAYKIT_LOOP_ACTIONS = {
  'run-rifle': 'Rig_Medium|Running_HoldingRifle',
} as const;
export type KayKitLoopAction = keyof typeof KAYKIT_LOOP_ACTIONS;
export type KayKitAction = keyof typeof KAYKIT_ACTIONS | keyof typeof KAYKIT_NATIVE_ACTIONS | KayKitLoopAction;
export interface KayKitSources {
  character: THREE.Object3D;
  motion: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
  /** Explicit opt-in: clips from the exact character GLB, never another rig. */
  nativeAnimations?: readonly THREE.AnimationClip[];
  /** Separate fixed MovementAdvanced source; omitted callers keep their old clips. */
  rifleMovement?: { motion: THREE.Object3D; animations: readonly THREE.AnimationClip[] };
}
function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function unique(scene: THREE.Object3D, name: string) {
  const matches: THREE.Object3D[] = [];
  scene.traverse(node => { if (node.name === name) matches.push(node); });
  requireThat(matches.length === 1, `Unique node required: ${name}`);
  return matches[0]!;
}
// Port of the accepted fixed-sample adapter, not general retargeting. No source
// updateMatrix/updateMatrixWorld calls: even source transform caches stay intact.
export function remapKayKitParent(source: THREE.Object3D, target: THREE.Object3D, clip: THREE.AnimationClip) {
  const a = unique(source, 'Rig_Medium'), b = unique(target, 'Rig');
  requireThat(a.parent === source && b.parent === target, 'Rig must be a scene child');
  for (const scene of [source, target]) {
    requireThat(new THREE.Matrix4().compose(scene.position, scene.quaternion, scene.scale).equals(new THREE.Matrix4())
      && (scene.matrixAutoUpdate || scene.matrix.equals(new THREE.Matrix4())), 'Scene transforms must be identity');
  }
  requireThat(unique(source, 'root').parent === a && unique(target, 'root').parent === b, 'Root parent mismatch');
  const names = new Set<string>(), nodes = new Set<string>();
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name), name = parsed.nodeName;
    requireThat(name && track.name === `${name}.${parsed.propertyName}`
      && ['position', 'quaternion', 'scale'].includes(parsed.propertyName), 'Direct transform tracks required');
    requireThat(!names.has(track.name), 'Duplicate track'); names.add(track.name); nodes.add(name);
    const from = unique(source, name), to = unique(target, name === 'Rig_Medium' ? 'Rig' : name);
    requireThat((from instanceof THREE.Bone) === (to instanceof THREE.Bone), 'Node kind mismatch');
    if (from !== a) requireThat(to.parent?.name === (from.parent === a ? 'Rig' : from.parent?.name), 'Bone hierarchy mismatch');
    requireThat(track.validate() && Array.from(track.values).every(Number.isFinite), 'Invalid track');
  }
  requireThat(nodes.has('Rig_Medium'), 'Parent track required');
  for (const name of nodes) for (const property of ['position', 'quaternion', 'scale'])
    requireThat(names.has(`${name}.${property}`), 'Complete transform channels required');
  const result = clip.clone();
  for (const track of result.tracks) if (track.name.startsWith('Rig_Medium.')) track.name = `Rig.${track.name.slice(11)}`;
  return result;
}

/** Same-rig playback needs no parent rename or retarget. Reject missing/ambiguous
 * bindings instead of silently accepting a partial pose. Borrowed clips stay intact.
 */
export function validateKayKitNative(character: THREE.Object3D, input: THREE.AnimationClip) {
  requireThat(Number.isFinite(input.duration) && input.duration > 0, 'Positive clip duration required');
  requireThat(input.tracks.length > 0, 'Native tracks required');
  const names = new Set<string>();
  for (const track of input.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name), name = parsed.nodeName;
    requireThat(name && track.name === `${name}.${parsed.propertyName}`
      && ['position', 'quaternion', 'scale'].includes(parsed.propertyName), 'Direct transform tracks required');
    unique(character, name);
    requireThat(!names.has(track.name), 'Duplicate native track'); names.add(track.name);
    requireThat(track.validate() && Array.from(track.values).every(Number.isFinite), 'Invalid native track');
  }
  return input.clone();
}

/** Instance bones, skeleton palettes, mixer and clips are private to this actor.
 * Geometry/material/texture resources are borrowed and MUST remain immutable and
 * alive until every actor is disposed. This class never disposes borrowed data.
 */
export class KayKitSkinnedCharacter {
  readonly scene: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<KayKitAction, THREE.AnimationAction>();
  private active: KayKitAction | null = null;
  private ended = false;
  private readonly skins: THREE.SkinnedMesh[] = [];
  private readonly rest: { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  constructor(sources: KayKitSources) {
    const clips: (readonly [KayKitAction, THREE.AnimationClip])[] = (Object.keys(KAYKIT_ACTIONS) as (keyof typeof KAYKIT_ACTIONS)[]).map(name => {
      const matches = sources.animations.filter(clip => clip.name === KAYKIT_ACTIONS[name]);
      requireThat(matches.length === 1, `Unique clip required: ${KAYKIT_ACTIONS[name]}`);
      const clip = remapKayKitParent(sources.motion, sources.character, matches[0]!);
      requireThat(Number.isFinite(clip.duration) && clip.duration > 0, 'Positive clip duration required');
      clip.name = name;
      return [name, clip] as const;
    });
    if (sources.nativeAnimations !== undefined) {
      for (const name of Object.keys(KAYKIT_NATIVE_ACTIONS) as (keyof typeof KAYKIT_NATIVE_ACTIONS)[]) {
        const matches = sources.nativeAnimations.filter(clip => clip.name === KAYKIT_NATIVE_ACTIONS[name]);
        requireThat(matches.length === 1, `Unique native clip required: ${KAYKIT_NATIVE_ACTIONS[name]}`);
        const clip = validateKayKitNative(sources.character, matches[0]!); clip.name = name;
        clips.push([name, clip]);
      }
    }
    if (sources.rifleMovement !== undefined) {
      for (const name of Object.keys(KAYKIT_LOOP_ACTIONS) as KayKitLoopAction[]) {
        const matches = sources.rifleMovement.animations.filter(clip => clip.name === KAYKIT_LOOP_ACTIONS[name]);
        requireThat(matches.length === 1, `Unique movement clip required: ${KAYKIT_LOOP_ACTIONS[name]}`);
        const clip = remapKayKitParent(sources.rifleMovement.motion, sources.character, matches[0]!);
        requireThat(Number.isFinite(clip.duration) && clip.duration > 0, 'Positive clip duration required');
        clip.name = name; clips.push([name, clip]);
      }
    }
    const contained = new Set<THREE.Object3D>(); sources.character.traverse(node => contained.add(node));
    let skins = 0;
    sources.character.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      skins++;
      requireThat(node.skeleton.bones.length > 0 && node.skeleton.bones.every(bone => contained.has(bone)), 'Skin bones must belong to character');
    });
    requireThat(skins > 0, 'Skinned character required');
    this.scene = clone(sources.character);
    // Skeleton.clone shares inverse-bind matrices; isolate these too so no
    // actor-side skeleton work can mutate the source or a sibling actor.
    this.scene.traverse(node => {
      if (node instanceof THREE.SkinnedMesh) {
        node.skeleton.boneInverses = node.skeleton.boneInverses.map(matrix => matrix.clone());
        this.skins.push(node);
      }
      this.rest.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
    });
    this.mixer = new THREE.AnimationMixer(this.scene);
    for (const [name, clip] of clips) {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
      this.actions.set(name, action);
    }
    this.refreshPoseBounds();
  }
  private refreshPoseBounds() {
    // Refresh ancestors too: the caller owns the actor placement container.
    this.scene.updateWorldMatrix(true, false);
    this.scene.updateMatrixWorld(true);
    // SkinnedMesh bounds are instance-local. Geometry bounds are shared rest
    // data and cannot be used (or mutated) for animated frustum culling.
    for (const skin of this.skins) {
      skin.computeBoundingBox();
      skin.computeBoundingSphere();
    }
  }
  get currentAction() { return this.active; }
  duration(name: KayKitAction): number | null { return this.actions.get(name)?.getClip().duration ?? null; }
  get disposed() { return this.ended; }
  play(name: KayKitAction): boolean {
    if (this.ended) return false;
    const action = this.actions.get(name);
    if (!action) return false;
    // Deterministic hard switch; crossfade/locomotion layers are not accepted yet.
    this.mixer.stopAllAction(); action.reset().play(); this.active = name;
    this.mixer.update(0); this.refreshPoseBounds();
    return true;
  }
  /** Absolute source-clip phase, independent of render frame rate or missed frames. */
  sample(name: KayKitAction, progress: number): boolean {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Invalid action progress');
    if (this.ended) return false;
    const action = this.actions.get(name);
    if (!action) return false;
    // Reset even after a clamped finish, allowing replay rewind and a new reload.
    this.mixer.stopAllAction(); action.reset().play(); this.active = name;
    action.time = action.getClip().duration * progress;
    this.mixer.update(0); this.refreshPoseBounds();
    return true;
  }
  /** Absolute loop time from the caller's locomotion clock, never wall time.
   * This does not infer movement from input, set actor speed, or blend actions.
   * sample(name, 1) still exposes the original endpoint; this method wraps it.
   */
  sampleLoop(name: KayKitLoopAction, elapsedSeconds: number): boolean {
    requireThat(Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0, 'Finite nonnegative loop time required');
    if (this.ended || !Object.hasOwn(KAYKIT_LOOP_ACTIONS, name)) return false;
    const duration = this.duration(name);
    if (duration === null) return false;
    return this.sample(name, (elapsedSeconds % duration) / duration);
  }
  update(deltaSeconds: number) {
    if (this.ended) return;
    requireThat(Number.isFinite(deltaSeconds) && deltaSeconds >= 0, 'Finite nonnegative delta required');
    this.mixer.update(deltaSeconds); this.refreshPoseBounds();
  }
  stop() {
    if (this.ended) return;
    this.mixer.stopAllAction(); this.active = null;
    for (const { node, position, quaternion, scale } of this.rest) {
      node.position.copy(position); node.quaternion.copy(quaternion); node.scale.copy(scale);
    }
    this.refreshPoseBounds();
  }
  dispose() {
    if (this.ended) return;
    this.stop(); this.mixer.uncacheRoot(this.scene); this.actions.clear();
    const skeletons = new Set<THREE.Skeleton>();
    this.scene.traverse(node => { if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    this.scene.removeFromParent(); this.ended = true;
  }
}

/** Loader retains ownership of parsed sources; callers keep the rigid fallback
 * visible unless status is ready. No default loading, URLs or asset publication.
 */
export class KayKitCharacterSlot {
  status: 'off' | 'loading' | 'ready' | 'fallback' | 'disposed' = 'off';
  error: string | null = null;
  character: KayKitSkinnedCharacter | null = null;
  private readonly abort = new AbortController();
  async load(loader: (signal: AbortSignal) => Promise<KayKitSources | null>) {
    if (this.status !== 'off') return;
    this.status = 'loading';
    try {
      const sources = await loader(this.abort.signal);
      if (this.abort.signal.aborted) return;
      requireThat(sources, 'Missing character sources');
      this.character = new KayKitSkinnedCharacter(sources); this.status = 'ready';
    } catch (error) {
      if (this.abort.signal.aborted) return;
      this.error = error instanceof Error ? error.message : String(error); this.status = 'fallback';
    }
  }
  dispose() {
    if (this.status === 'disposed') return;
    this.abort.abort(); this.character?.dispose(); this.character = null; this.status = 'disposed';
  }
}
