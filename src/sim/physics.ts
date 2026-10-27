import RAPIER from '@dimforge/rapier3d-compat';
import { MAP } from '../content/map.js';
import { direction, distance } from './math.js';
import type { Actor, Vec3 } from './types.js';
let initialization: Promise<void> | undefined;
export const initPhysics = () => initialization ??= RAPIER.init();
export const eye = (actor: Actor): Vec3 => ({ ...actor.position, y: actor.position.y + (actor.input.crouch ? 1.02 : 1.62) });
// Keep the flat-floor capsule just outside the controller's 0.02 margin (float32).
const FLOOR_CLEARANCE = 0.001;
const rotation = { x: 0, y: 0, z: 0, w: 1 };
export class Physics {
  private world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  private walls: RAPIER.Collider[] = [];
  private bodies = new Map<string, { move: RAPIER.Collider; body: RAPIER.Collider; head: RAPIER.Collider; crouch: boolean }>();
  private controller = this.world.createCharacterController(0.02);
  constructor(actors: Actor[]) {
    this.walls.push(this.world.createCollider(RAPIER.ColliderDesc.cuboid(13, 0.1, 18).setTranslation(0, -0.1, 0)));
    for (const box of MAP.walls) this.walls.push(this.world.createCollider(RAPIER.ColliderDesc.cuboid(box.half.x, box.half.y, box.half.z).setTranslation(box.center.x, box.center.y, box.center.z)));
    this.controller.enableAutostep(0.25, 0.2, false);
    this.controller.enableSnapToGround(0.2);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    for (const actor of actors) {
      this.bodies.set(actor.id, {
        move: this.world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3)),
        body: this.world.createCollider(RAPIER.ColliderDesc.capsule(0.4, 0.28).setSensor(true)),
        head: this.world.createCollider(RAPIER.ColliderDesc.ball(0.22).setSensor(true)), crouch: false,
      });
      this.sync(actor);
    }
    this.world.step();
  }
  sync(actor: Actor) {
    const b = this.bodies.get(actor.id)!;
    const crouch = actor.input.crouch;
    if (b.crouch !== crouch) {
      b.move.setShape(new RAPIER.Capsule(crouch ? 0.25 : 0.55, 0.3));
      b.body.setShape(new RAPIER.Capsule(crouch ? 0.18 : 0.4, 0.28));
      b.crouch = crouch;
    }
    b.move.setTranslation({ ...actor.position, y: actor.position.y + (crouch ? 0.57 : 0.87) + FLOOR_CLEARANCE });
    b.body.setTranslation({ ...actor.position, y: actor.position.y + (crouch ? 0.53 : 0.82) });
    b.head.setTranslation({ ...actor.position, y: actor.position.y + (crouch ? 1.02 : 1.62) });
    for (const c of [b.move, b.body, b.head]) c.setEnabled(actor.hp > 0);
  }
  canStand(actor: Actor) {
    const pos = { ...actor.position, y: actor.position.y + 0.87 + FLOOR_CLEARANCE };
    return !this.walls.some(w => w.intersectsShape(new RAPIER.Capsule(0.55, 0.3), pos, rotation));
  }
  captureMotion(actors: Actor[]) {
    return actors.map(actor => ({ id: actor.id, position: { ...actor.position }, velocity: { ...actor.velocity } }));
  }
  restoreMotion(actors: Actor[], checkpoint: ReturnType<Physics['captureMotion']>) {
    for (const saved of checkpoint) {
      const actor = actors.find(actor => actor.id === saved.id)!;
      actor.position = { ...saved.position }; actor.velocity = { ...saved.velocity };
      this.sync(actor);
    }
  }
  move(actor: Actor, translation: Vec3) {
    this.sync(actor);
    this.world.step();
    // The authored yard has an exact y=0 floor. Do not repeatedly push its capsule
    // into that plane: tiny downward sweeps can produce spurious floor normals and
    // timestep-dependent lateral drag. Elevated actors still use ground snapping.
    const desired = actor.position.y === 0 && translation.y < 0 ? { ...translation, y: 0 } : translation;
    this.controller.computeColliderMovement(this.bodies.get(actor.id)!.move, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = this.controller.computedMovement();
    actor.position = { x: actor.position.x + m.x, y: Math.max(0, actor.position.y + m.y), z: actor.position.z + m.z };
    // Remove only velocity into a blocking wall/actor. Keep tangential motion.
    // Reading contact normals avoids treating acceleration's average displacement as terminal speed.
    let blocked = false;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const collision = this.controller.computedCollision(i)!;
      if (collision.collider === this.walls[0]) continue; // The known flat floor never brakes sideways.
      let normal = collision.normal1;
      // Axis-aligned yard walls have exact face normals; discard solver roundoff,
      // not the actual rounded normals of another actor or a cover corner.
      if (this.walls.includes(collision.collider!)) {
        if (Math.abs(normal.x) > .999) normal = { x: Math.sign(normal.x), y: 0, z: 0 };
        else if (Math.abs(normal.z) > .999) normal = { x: 0, y: 0, z: Math.sign(normal.z) };
      }
      const lengthSquared = normal.x * normal.x + normal.z * normal.z;
      if (lengthSquared < 0.5) continue; // Floor/step support does not brake planar movement.
      const into = actor.velocity.x * normal.x + actor.velocity.z * normal.z;
      if (into < 0) {
        blocked = true;
        actor.velocity.x -= normal.x * into / lengthSquared;
        actor.velocity.z -= normal.z * into / lengthSquared;
      }
    }
    // Rapier's capsule normals can leave sub-millimetre/second tangential residue.
    // Only clean it after a blocking contact, not during free acceleration.
    if (blocked && Math.hypot(actor.velocity.x, actor.velocity.z) < 0.001) actor.velocity = { x: 0, z: 0 };
    this.sync(actor);
  }
  wallDistance(origin: Vec3, dir: Vec3, max = 100) {
    const ray = new RAPIER.Ray(origin, dir);
    let nearest = max;
    for (const wall of this.walls) {
      const t = wall.castRay(ray, max, true);
      if (t >= 0 && t < nearest) nearest = t;
    }
    return nearest;
  }
  visiblePoint(from: Vec3, to: Vec3) {
    const d = distance(from, to);
    return d > 0 && this.wallDistance(from, { x: (to.x - from.x) / d, y: (to.y - from.y) / d, z: (to.z - from.z) / d }, d) >= d - 0.001;
  }
  visible(from: Actor, target: Actor) {
    if (from.hp <= 0 || target.hp <= 0) return false;
    return this.visiblePoint(eye(from), eye(target));
  }
  trace(from: Actor, actors: Actor[], yaw: number, pitch: number) {
    return this.traceDetailed(from, actors, yaw, pitch).hit;
  }
  traceDetailed(from: Actor, actors: Actor[], yaw: number, pitch: number) {
    const origin = eye(from), dir = direction(yaw, pitch), ray = new RAPIER.Ray(origin, dir);
    let nearest = this.wallDistance(origin, dir);
    let hit: { actor: Actor; part: 'head' | 'body' } | null = null;
    for (const actor of actors) {
      if (actor.id === from.id || actor.hp <= 0) continue;
      const b = this.bodies.get(actor.id)!;
      for (const part of ['head', 'body'] as const) {
        const t = b[part].castRay(ray, 100, true);
        if (t >= 0 && t < nearest) { nearest = t; hit = { actor, part }; }
      }
    }
    return { hit, origin, end: { x: origin.x + dir.x * nearest, y: origin.y + dir.y * nearest, z: origin.z + dir.z * nearest }, kind: hit ? 'actor' as const : nearest < 100 ? 'world' as const : 'range' as const };
  }
  dispose() { this.world.free(); }
}
