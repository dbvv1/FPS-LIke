import { integrateMovement } from './movement.js';
import { shootingState } from './shooting.js';
import { MAP } from '../content/map.js';
import { WEAPONS } from '../content/weapons.js';
import { distance, flatDistance, hash, nextRandom } from './math.js';
import { Physics, eye, initPhysics } from './physics.js';
import { SECOND, SUBTICKS, type Actor, type Command, type GameState, type PlayerSpec, type Rules, type Side, type Sound, type Team, type Vec3, type WeaponId } from './types.js';
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({ roundTicks: 60 * 70, plantTicks: 60 * 3, defuseTicks: 60 * 5, bombTicks: 60 * 25, swapEvery: 3 });
export type VisibleEnemy = Pick<Actor, 'id' | 'team' | 'side' | 'position'> & { crouch: boolean };
export type Observation = {
  time: number; round: number; phase: GameState['phase']; self: Actor;
  enemies: VisibleEnemy[]; bodyVisibleIds: string[]; sounds: Sound[];
  bomb: { planted: boolean; position: Vec3; carrier: string | null };
};
export class Game {
  private current: GameState;
  private physics: Physics;
  private disposed = false;
  private motionTime = 0;
  private motionCheckpoint: ReturnType<Physics['captureMotion']> = [];
  private readonly ruleSet: Readonly<Rules>;
  get rules(): Readonly<Rules> { return this.ruleSet; }
  private readonly specs: PlayerSpec[];
  static async create(seed = 1, specs: PlayerSpec[] = [{ id: 'amber-1', team: 'amber' }, { id: 'blue-1', team: 'blue' }], rules: Partial<Rules> = {}) {
    await initPhysics();
    return new Game(seed, specs, rules);
  }
  private constructor(seed: number, specs: PlayerSpec[], rules: Partial<Rules>) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be a uint32');
    if (specs.length < 2 || specs.length > 6 || new Set(specs.map(s => s.id)).size !== specs.length || specs.some(s => typeof s.id !== 'string' || !s.id || !['amber', 'blue'].includes(s.team)) || !specs.some(s => s.team === 'amber') || !specs.some(s => s.team === 'blue') || ['amber', 'blue'].some(t => specs.filter(s => s.team === t).length > 3)) throw new Error('Use unique player IDs and 1–3 actors on each team');
    for (const p of specs) if (p.position && (![p.position.x, p.position.y, p.position.z].every(Number.isFinite) || Math.abs(p.position.x) > 12 || Math.abs(p.position.z) > 17 || p.position.y !== 0)) throw new Error('Invalid spawn');
    for (const p of specs) {
      if (p.bot !== undefined && !['easy', 'normal', 'hard'].includes(p.bot)) throw new Error('Invalid bot difficulty');
      if (p.position && MAP.walls.some(w => Math.abs(p.position!.x - w.center.x) < w.half.x + 0.3 && Math.abs(p.position!.z - w.center.z) < w.half.z + 0.3)) throw new Error('Spawn intersects solid cover');
    }
    this.ruleSet = Object.freeze({ ...DEFAULT_RULES, ...rules });
    if (Object.values(this.rules).some(v => !Number.isSafeInteger(v) || v <= 0)) throw new Error('Rules must be positive integer tick counts');
    this.specs = structuredClone(specs).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    this.current = {
      gameplayVersion: 2, seed, random: seed || 0x6d2b79f5, tick: 0, time: 0, round: 1, roundEndsAt: this.rules.roundTicks * SUBTICKS, phase: 'live', score: { amber: 0, blue: 0 }, actors: [],
      bomb: { carrier: null, position: { ...MAP.spawns.attack }, planted: false, explodeAt: null },
      interaction: null, result: null, shots: [], sounds: [], soundSequence: 0,
    };
    this.resetActors();
    this.physics = new Physics(this.current.actors);
  }
  get state(): GameState { return structuredClone(this.current); }
  get stateHash() {
    // Version 2 includes velocity/recoil gameplay state. Presentation facts are derived from the
    // same trace, not input/state used by future gameplay, and are excluded.
    const state = { ...this.current, shots: this.current.shots.map(({ impact: _impact, ...shot }) => shot) };
    return hash({ state, rules: this.rules });
  }
  private resetActors() {
    const swapped = Math.floor((this.current.round - 1) / this.rules.swapEvery) % 2 === 1;
    const counts = { attack: 0, defend: 0 };
    this.current.actors = this.specs.map(spec => {
      const side: Side = (spec.team === 'amber') !== swapped ? 'attack' : 'defend';
      const position = this.current.round === 1 && spec.position ? { ...spec.position } : { ...MAP.spawns[side], x: MAP.spawns[side].x + counts[side] * 1.1 };
      counts[side]++;
      const weapons = Object.fromEntries((['rifle', 'pistol'] as const).map(id => [id, { ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve, shots: 0, lastShot: -SECOND, recoil: 0 }])) as Actor['weapons'];
      return { id: spec.id, team: spec.team, side, hp: 100, position, velocity: { x: 0, z: 0 }, yaw: side === 'attack' ? 0 : Math.PI, pitch: 0, input: { x: 0, z: 0, walk: false, crouch: false, interact: false }, weapon: 'rifle', weapons, reload: null, nextShot: 0, nextFootstep: 0, bot: spec.bot ?? null };
    });
    const carrier = this.current.actors.find(a => a.side === 'attack')!;
    this.current.bomb = { carrier: carrier.id, position: { ...carrier.position }, planted: false, explodeAt: null };
  }
  nextRound() {
    this.assertAlive();
    if (this.current.phase !== 'over') throw new Error('Current round is still live');
    this.physics.dispose();
    this.current.round++; this.current.phase = 'live'; this.current.result = null;
    this.current.interaction = null; this.current.sounds = []; this.current.shots = [];
    this.current.time = this.current.tick * SUBTICKS;
    this.current.roundEndsAt = this.current.time + this.rules.roundTicks * SUBTICKS;
    this.resetActors();
    this.physics = new Physics(this.current.actors);
  }
  private checkpointMotion() {
    this.motionTime = this.current.time;
    this.motionCheckpoint = this.physics.captureMotion(this.current.actors);
  }
  private assertAlive() { if (this.disposed) throw new Error('Game has been disposed'); }
  step(commands: readonly Command[] = []) {
    this.assertAlive();
    for (const c of commands) this.validate(c);
    if (this.current.phase === 'over') return;
    const start = this.current.tick * SUBTICKS;
    this.checkpointMotion();
    const tickPositions = this.current.actors.map(actor => ({ ...actor.position }));
    const sorted = commands.map((c, i) => ({ c, i })).sort((a, b) => (a.c.at ?? 0) - (b.c.at ?? 0) || a.i - b.i);
    for (const { c } of sorted) {
      this.advance(start + (c.at ?? 0));
      if (this.current.phase !== 'live') break;
      this.command(c);
      this.settle(c.type === 'interact' && c.held ? c.actorId : false);
    }
    this.advance(start + SUBTICKS);
    // Footstep events are consumed once per fixed tick, never during a motion query.
    for (const [i, actor] of this.current.actors.entries()) {
      if (actor.hp > 0 && !actor.input.walk && !actor.input.crouch && flatDistance(tickPositions[i]!, actor.position) > 0.001 && this.current.time >= actor.nextFootstep) {
        this.sound(actor, 'step', 13); actor.nextFootstep = this.current.time + 0.35 * SECOND;
      }
    }
    this.current.tick++;
    // Ended rounds stop on the exact decisive sub-tick, not on a later rendered frame.
    if (this.current.phase === 'live') this.current.time = this.current.tick * SUBTICKS;
    this.current.sounds = this.current.sounds.filter(s => this.current.time - s.time <= 2 * SECOND);
  }
  private validate(c: Command) {
    if (!c || typeof c !== 'object' || !this.current.actors.some(a => a.id === c.actorId)) throw new Error('Unknown actor');
    if (!Number.isInteger(c.at ?? 0) || (c.at ?? 0) < 0 || (c.at ?? 0) >= SUBTICKS) throw new Error('at must be an integer sub-tick in [0,999]');
    if (c.type === 'move') {
      if (![c.x, c.z].every(Number.isFinite) || (c.walk !== undefined && typeof c.walk !== 'boolean') || (c.crouch !== undefined && typeof c.crouch !== 'boolean')) throw new Error('Invalid movement');
    } else if (c.type === 'aim' || c.type === 'shoot') {
      if (![c.yaw, c.pitch].every(Number.isFinite) || Math.abs(c.pitch) > Math.PI / 2) throw new Error('Invalid view angles');
    } else if (c.type === 'switch') {
      if (!Object.hasOwn(WEAPONS, c.weapon)) throw new Error('Unknown weapon');
    } else if (c.type === 'interact') {
      if (typeof c.held !== 'boolean') throw new Error('Invalid interaction');
    } else if (c.type !== 'reload') throw new Error('Unknown command type');
  }
  private command(c: Command) {
    const actor = this.current.actors.find(a => a.id === c.actorId)!;
    if (actor.hp <= 0) return;
    if (c.type === 'move') {
      const previous = { ...actor.input };
      const scale = Math.max(1, Math.hypot(c.x, c.z));
      actor.input.x = c.x / scale; actor.input.z = c.z / scale;
      actor.input.walk = c.walk ?? false;
      actor.input.crouch = (c.crouch ?? false) || (actor.input.crouch && !this.physics.canStand(actor));
      this.physics.sync(actor);
      if (previous.x !== actor.input.x || previous.z !== actor.input.z || previous.walk !== actor.input.walk || previous.crouch !== actor.input.crouch) this.checkpointMotion();
    } else if (c.type === 'aim') { actor.yaw = c.yaw; actor.pitch = c.pitch; }
    else if (c.type === 'switch') { if (c.weapon !== actor.weapon) { actor.weapon = c.weapon; actor.reload = null; actor.input.interact = false; actor.nextShot = Math.max(actor.nextShot, this.current.time + 12 * SUBTICKS); } }
    else if (c.type === 'reload') {
      const mag = actor.weapons[actor.weapon];
      if (!actor.reload && mag.ammo < WEAPONS[actor.weapon].magazine && mag.reserve > 0) {
        actor.reload = { weapon: actor.weapon, end: this.current.time + WEAPONS[actor.weapon].reload * SUBTICKS };
        actor.input.interact = false; this.sound(actor, 'reload', 9);
      }
    } else if (c.type === 'interact') actor.input.interact = c.held;
    else if (c.type === 'shoot') this.shoot(actor, c.yaw, c.pitch, c.targetId);
  }
  private shoot(actor: Actor, yaw: number, pitch: number, targetId?: string) {
    const now = this.current.time, weapon = WEAPONS[actor.weapon], mag = actor.weapons[actor.weapon];
    actor.yaw = yaw; actor.pitch = pitch;
    if (actor.reload || now < actor.nextShot || mag.ammo <= 0) return;
    const target = this.current.actors.find(a => a.id === targetId);
    // Revalidate a bot's queued target after earlier same-frame actions; players can still shoot blind.
    if ((actor.bot || targetId !== undefined) && (!target || target.hp <= 0 || !this.physics.visible(actor, target))) return;
    actor.input.interact = false;
    const accuracy = shootingState(actor, now);
    const shotYaw = yaw + accuracy.recoilYaw + (nextRandom(this.current) * 2 - 1) * accuracy.spread;
    const shotPitch = pitch + accuracy.recoilPitch + (nextRandom(this.current) * 2 - 1) * accuracy.spread;
    mag.ammo--; mag.shots = accuracy.recoilIndex > 0 ? mag.shots + 1 : 1;
    mag.recoil = Math.min(weapon.recoil.length - 1, accuracy.recoilIndex + 1);
    mag.lastShot = now; actor.nextShot = now + weapon.interval * SUBTICKS;
    const trace = this.physics.traceDetailed(actor, this.current.actors, shotYaw, shotPitch), hit = trace.hit;
    const damage = hit ? weapon.damage * (hit.part === 'head' ? weapon.headMultiplier : 1) : 0;
    const targetVisible = target ? this.physics.visible(actor, target) : false;
    const visible = hit ? this.physics.visible(actor, hit.actor) : true;
    if (hit) {
      hit.actor.hp = Math.max(0, hit.actor.hp - damage);
      if (hit.actor.hp === 0) {
        hit.actor.reload = null; hit.actor.input.interact = false;
        hit.actor.velocity = { x: 0, z: 0 };
        for (const mag of Object.values(hit.actor.weapons)) { mag.recoil = 0; mag.shots = 0; }
        if (this.current.bomb.carrier === hit.actor.id) { this.current.bomb.carrier = null; this.current.bomb.position = { ...hit.actor.position }; }
        this.physics.sync(hit.actor);
        this.checkpointMotion();
      }
    }
    this.current.shots.push({ actorId: actor.id, weapon: actor.weapon, time: now, yaw: shotYaw, pitch: shotPitch, hit: hit?.actor.id ?? null, part: hit?.part ?? null, damage, visible, targetId: targetId ?? null, targetVisible, impact: { origin: trace.origin, end: trace.end, kind: trace.kind, killed: !!hit && hit.actor.hp === 0 } });
    this.sound(actor, 'shot', 40);
  }
  private sound(actor: Actor, kind: Sound['kind'], radius: number) {
    this.current.sounds.push({ id: this.current.soundSequence++, actorId: actor.id, position: { ...actor.position }, kind, radius, time: this.current.time });
  }
  private advance(to: number) {
    while (this.current.time < to && this.current.phase === 'live') {
      this.settle();
      if (this.current.phase !== 'live') break;
      let end = to;
      for (const actor of this.current.actors) if (actor.reload) end = Math.min(end, actor.reload.end);
      const interaction = this.current.interaction;
      if (interaction) end = Math.min(end, interaction.since + this.rules[interaction.kind === 'plant' ? 'plantTicks' : 'defuseTicks'] * SUBTICKS);
      end = Math.min(end, this.current.bomb.explodeAt ?? this.current.roundEndsAt);
      if (end <= this.current.time) throw new Error('Timer failed to advance');
      // Re-query from the fixed tick/real input-change checkpoint. A subtick aim,
      // shot or timer sample must not become another acceleration/collision step.
      // Otherwise even an unrelated actor's aim events can change which side of
      // a cover corner this actor slides around.
      const elapsed = (end - this.motionTime) / SECOND;
      this.physics.restoreMotion(this.current.actors, this.motionCheckpoint);
      for (const actor of this.current.actors) {
        if (actor.hp <= 0) continue;
        const motion = integrateMovement(actor.velocity, actor.input, elapsed);
        actor.velocity = motion.velocity;
        if (Math.hypot(motion.translation.x, motion.translation.z) > 1e-12) this.physics.move(actor, motion.translation);
      }
      this.current.time = end;
      this.settle(end % SUBTICKS === 0);
    }
  }
  // An explicit interact command may start at its exact timestamp. Automatic
  // eligibility (coasting to rest / pickup) is sampled once per fixed tick;
  // otherwise an unrelated aim query could start a plant or fuse earlier.
  private settle(startInteraction: boolean | string = false) {
    const s = this.current;
    for (const a of s.actors) if (a.reload && a.reload.end <= s.time) {
      const mag = a.weapons[a.reload.weapon];
      const load = Math.min(WEAPONS[a.reload.weapon].magazine - mag.ammo, mag.reserve);
      mag.ammo += load; mag.reserve -= load; a.reload = null;
    }
    if (startInteraction === true && !s.bomb.planted && !s.bomb.carrier) {
      const pickup = s.actors.find(a => a.hp > 0 && a.side === 'attack' && flatDistance(a.position, s.bomb.position) <= 1);
      if (pickup) s.bomb.carrier = pickup.id;
    }
    if (s.bomb.carrier) s.bomb.position = { ...s.actors.find(a => a.id === s.bomb.carrier)!.position };
    const eligible = s.actors.filter(a => a.hp > 0 && a.input.interact && !a.reload && Math.hypot(a.input.x, a.input.z) < 0.01 && Math.hypot(a.velocity.x, a.velocity.z) < 0.01 && (
      s.bomb.planted ? a.side === 'defend' && flatDistance(a.position, s.bomb.position) <= 1.6 : a.id === s.bomb.carrier && flatDistance(a.position, MAP.site) <= MAP.siteRadius
    ));
    // A real interruption (release, death, movement) still hands a held teammate
    // a fresh timer immediately; only newly gained passive eligibility waits.
    const interrupted = !!s.interaction && !eligible.some(a => a.id === s.interaction!.actorId);
    const candidate = eligible.find(a => a.id === s.interaction?.actorId) ?? eligible.find(a => interrupted || startInteraction === true || a.id === startInteraction);
    if (!candidate) s.interaction = null;
    else {
      const kind = s.bomb.planted ? 'defuse' : 'plant';
      if (!s.interaction || s.interaction.actorId !== candidate.id || s.interaction.kind !== kind) s.interaction = { actorId: candidate.id, kind, since: s.time };
      const required = this.rules[kind === 'plant' ? 'plantTicks' : 'defuseTicks'] * SUBTICKS;
      if (s.time - s.interaction.since >= required) {
        if (kind === 'defuse') { this.finish('defend', 'defuse'); return; }
        s.bomb = { planted: true, carrier: null, position: { ...candidate.position }, explodeAt: s.time + this.rules.bombTicks * SUBTICKS };
        s.interaction = null; candidate.input.interact = false; this.sound(candidate, 'plant', 50);
      }
    }
    if (s.bomb.planted && s.time >= s.bomb.explodeAt!) this.finish('attack', 'explosion');
    else if (!s.actors.some(a => a.side === 'defend' && a.hp > 0)) this.finish('attack', 'elimination');
    else if (!s.bomb.planted && !s.actors.some(a => a.side === 'attack' && a.hp > 0)) this.finish('defend', 'elimination');
    else if (!s.bomb.planted && s.time >= this.current.roundEndsAt) this.finish('defend', 'timeout');
  }
  private finish(winner: Side, reason: NonNullable<GameState['result']>['reason']) {
    if (this.current.phase !== 'live') return;
    const team = this.current.actors.find(a => a.side === winner)!.team;
    this.current.phase = 'over'; this.current.result = { winner, team, reason, time: this.current.time };
    this.current.score[team]++; this.current.interaction = null;
  }
  observe(actorId: string): Observation {
    this.assertAlive();
    const actor = this.current.actors.find(a => a.id === actorId);
    if (!actor) throw new Error('Unknown observer');
    const enemies = this.current.actors.filter(a => a.team !== actor.team && this.physics.visible(actor, a) && Math.cos(Math.atan2(a.position.x - actor.position.x, a.position.z - actor.position.z) - actor.yaw) >= Math.cos(Math.PI * 0.55));
    const bodyVisibleIds = enemies.filter(a => this.physics.visiblePoint(eye(actor), { ...a.position, y: a.position.y + (a.input.crouch ? 0.53 : 0.82) })).map(a => a.id);
    const sounds = this.current.sounds.filter(s => {
      if (this.current.actors.find(a => a.id === s.actorId)?.team === actor.team) return false;
      const d = distance(actor.position, s.position);
      if (d > s.radius) return false;
      const origin = eye(actor), target = { ...s.position, y: s.position.y + 1 };
      const length = distance(origin, target);
      const blocked = length > 0 && this.physics.wallDistance(origin, { x: (target.x - origin.x) / length, y: (target.y - origin.y) / length, z: (target.z - origin.z) / length }, length) < length - 0.01;
      return d <= s.radius * (blocked ? 0.45 : 1);
    });
    // Unplanted enemy carrier location is private. Public site knowledge is not enemy tracking.
    const bomb = this.current.bomb;
    return structuredClone({ time: this.current.time, round: this.current.round, phase: this.current.phase, self: actor, enemies: enemies.map(a => ({ id: a.id, team: a.team, side: a.side, position: a.position, crouch: a.input.crouch })), bodyVisibleIds, sounds, bomb: { planted: bomb.planted, position: bomb.planted || actor.side === 'attack' ? bomb.position : MAP.site, carrier: actor.side === 'attack' ? bomb.carrier : null } });
  }
  dispose() { if (!this.disposed) { this.physics.dispose(); this.disposed = true; } }
}
