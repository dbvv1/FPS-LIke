import { squadPlan } from './squads.js';
import { DIFFICULTIES } from '../content/difficulty.js';
import { MAP } from '../content/map.js';
import { WEAPONS } from '../content/weapons.js';
import { angles, flatDistance, nextRandom } from './math.js';
import { eye } from './physics.js';
import type { Navigation } from './navigation.js';
import type { Observation } from './game.js';
import { SECOND, type Command, type Difficulty, type Vec3, type WeaponId } from './types.js';
export class Bot {
  private round = 0;
  private random: { random: number };
  private target: string | null = null;
  private seenAt = 0;
  private reactionDelay = 0;
  private lastClue: { position: Vec3; time: number } | null = null;
  private lastSound = -1;
  private route: Vec3[];
  private routeIndex = 0;
  private path: Vec3[] = [];
  private goal: Vec3 | null = null;
  private nextPathAt = 0;
  private aim = { yaw: 0, pitch: 0 };
  private reactionRecorded = false;
  readonly reactions: number[] = [];
  constructor(readonly id: string, readonly difficulty: Difficulty, seed: number, private nav: Navigation, private preferredWeapon: WeaponId = 'rifle', private squadSlot?: number) {
    this.random = { random: Math.imul(seed || 1, 2654435761) >>> 0 };
    this.route = MAP.routes[Math.floor(nextRandom(this.random) * MAP.routes.length)]!.map(p => ({ ...p }));
  }
  // This controller receives only filtered observations, never a GameState or hidden enemy positions.
  commands(o: Observation): Command[] {
    const self = o.self;
    if (this.round !== o.round) {
      if (this.round !== 0) this.route = MAP.routes[Math.floor(nextRandom(this.random) * MAP.routes.length)]!.map(p => ({ ...p }));
      this.round = o.round; this.target = null; this.lastClue = null; this.lastSound = -1;
      this.routeIndex = 0; this.path = []; this.goal = null; this.nextPathAt = 0;
    }
    if (self.hp <= 0 || o.phase !== 'live') return [];
    if (self.weapon !== this.preferredWeapon) return [{ actorId: this.id, type: 'switch', weapon: this.preferredWeapon }];
    const plan = this.squadSlot === undefined ? null : squadPlan(o, this.squadSlot, this.routeIndex);
    if (plan) this.routeIndex = plan.routeIndex;
    const commands: Command[] = [];
    type BotAction = Command extends infer C ? C extends Command ? Omit<C, 'actorId'> : never : never;
    const emit = (c: BotAction) => commands.push({ ...c, actorId: this.id });
    const visible = [...o.enemies].sort((a, b) => flatDistance(self.position, a.position) - flatDistance(self.position, b.position))[0];
    const config = DIFFICULTIES[this.difficulty];
    for (const sound of o.sounds) if (sound.id > this.lastSound) {
      this.lastSound = sound.id;
      // A sound is a last-known location, not a live reference to its producer.
      this.lastClue = { position: { ...sound.position }, time: sound.time };
    }
    if (visible) {
      this.lastClue = { position: { ...visible.position }, time: o.time };
      if (this.target !== visible.id) {
        this.target = visible.id; this.seenAt = o.time; this.reactionRecorded = false;
        this.reactionDelay = (config.reactionSeconds + nextRandom(this.random) * config.reactionJitterSeconds) * SECOND;
        this.aim = { yaw: (nextRandom(this.random) * 2 - 1) * config.aimError, pitch: (nextRandom(this.random) * 2 - 1) * config.aimError };
      }
      const target = { ...visible.position, y: visible.position.y + ((config.headAim || !o.bodyVisibleIds.includes(visible.id)) ? visible.crouch ? 1.02 : 1.62 : visible.crouch ? 0.53 : 0.82) };
      const view = angles(eye(self), target);
      const weapon = WEAPONS[self.weapon], mag = self.weapons[self.weapon];
      const index = o.time - mag.lastShot > 0.3 * SECOND ? 0 : mag.shots % weapon.recoil.length;
      const recoil = weapon.recoil[index]!;
      const yaw = view.yaw + this.aim.yaw - recoil[0] * config.recoilControl;
      const pitch = view.pitch + this.aim.pitch - recoil[1] * config.recoilControl;
      emit({ type: 'move', x: 0, z: 0 });
      emit({ type: 'interact', held: false });
      emit({ type: 'aim', yaw, pitch });
      if (mag.ammo === 0) emit({ type: 'reload' });
      else if (!self.reload && o.time >= self.nextShot && o.time - this.seenAt >= this.reactionDelay) {
        emit({ type: 'shoot', yaw, pitch, targetId: visible.id });
        this.aim = { yaw: (nextRandom(this.random) * 2 - 1) * config.aimError, pitch: (nextRandom(this.random) * 2 - 1) * config.aimError };
        if (!this.reactionRecorded) { this.reactions.push((o.time - this.seenAt) / SECOND); this.reactionRecorded = true; }
      }
      return commands;
    }
    this.target = null;
    if (self.weapons[self.weapon].ammo < 5 && !self.reload) emit({ type: 'reload' });
    let goal: Vec3;
    const canInteract = plan ? plan.interact : (o.bomb.planted && self.side === 'defend' && flatDistance(self.position, o.bomb.position) < 1.4) || (!o.bomb.planted && o.bomb.carrier === self.id && flatDistance(self.position, MAP.site) < 1.7);
    if (canInteract) {
      emit({ type: 'move', x: 0, z: 0 });
      emit({ type: 'interact', held: true });
      emit({ type: 'aim', yaw: self.yaw + (plan ? 0 : 0.012), pitch: 0 });
      return commands;
    }
    emit({ type: 'interact', held: false });
    if (plan) goal = plan.goal;
    else if (o.bomb.planted) goal = self.side === 'defend' ? o.bomb.position : { x: 0, y: 0, z: 9 };
    else if (this.lastClue && o.time - this.lastClue.time < 4 * SECOND) goal = this.lastClue.position;
    else if (self.side === 'attack') {
      if (!o.bomb.carrier) goal = o.bomb.position;
      else {
        while (this.routeIndex < this.route.length - 1 && flatDistance(self.position, this.route[this.routeIndex]!) < 0.6) this.routeIndex++;
        goal = this.route[this.routeIndex]!;
      }
    } else goal = { x: 0, y: 0, z: 9.5 };
    if (!this.goal || flatDistance(this.goal, goal) > 0.5 || o.time >= this.nextPathAt) {
      this.path = this.nav.path(self.position, goal).slice(1); this.goal = { ...goal }; this.nextPathAt = o.time + SECOND;
    }
    while (this.path.length && flatDistance(self.position, this.path[0]!) < 0.2) this.path.shift();
    const waypoint = this.path[0];
    if (!waypoint || flatDistance(self.position, goal) < 0.35) {
      emit({ type: 'move', x: 0, z: 0 });
      emit({ type: 'aim', yaw: self.yaw + 0.02, pitch: 0 });
    } else {
      const d = flatDistance(self.position, waypoint);
      emit({ type: 'move', x: (waypoint.x - self.position.x) / d, z: (waypoint.z - self.position.z) / d });
      emit({ type: 'aim', ...angles(eye(self), { ...waypoint, y: eye(self).y }) });
    }
    return commands;
  }
}
