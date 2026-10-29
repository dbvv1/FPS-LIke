export type Vec3 = { x: number; y: number; z: number };
export type Side = 'attack' | 'defend';
export type Team = 'amber' | 'blue';
export type WeaponId = 'rifle' | 'pistol';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Input = { x: number; z: number; walk: boolean; crouch: boolean; interact: boolean };
export type Actor = {
  id: string; team: Team; side: Side; hp: number; position: Vec3;
  velocity?: { x: number; z: number };
  yaw: number; pitch: number; input: Input; weapon: WeaponId;
  weapons: Record<WeaponId, { ammo: number; reserve: number; shots: number; lastShot: number }>;
  reload: { weapon: WeaponId; end: number } | null;
  nextShot: number; nextFootstep: number;
  bot: Difficulty | null;
};
export type Command = { actorId: string; at?: number } & (
  | { type: 'move'; x: number; z: number; walk?: boolean; crouch?: boolean }
  | { type: 'aim'; yaw: number; pitch: number }
  | { type: 'shoot'; yaw: number; pitch: number; targetId?: string }
  | { type: 'reload' }
  | { type: 'switch'; weapon: WeaponId }
  | { type: 'interact'; held: boolean }
);
export type RoundResult = { winner: Side; team: Team; reason: 'elimination' | 'timeout' | 'explosion' | 'defuse'; time: number };
export type Sound = { id: number; actorId: string; position: Vec3; kind: 'shot' | 'step' | 'reload' | 'plant'; radius: number; time: number };
export type ShotImpact = { origin: Vec3; end: Vec3; kind: 'actor' | 'world' | 'range'; killed: boolean };
// Optional read-only presentation facts: old command tapes/snapshots remain readable.
export type Shot = { actorId: string; weapon: WeaponId; time: number; yaw: number; pitch: number; hit: string | null; part: 'head' | 'body' | null; damage: number; visible: boolean; targetId: string | null; targetVisible: boolean; impact?: ShotImpact };
export type GameState = {
  seed: number; random: number; tick: number; time: number; round: number; roundEndsAt: number;
  phase: 'live' | 'over'; score: Record<Team, number>; actors: Actor[];
  bomb: { carrier: string | null; position: Vec3; planted: boolean; explodeAt: number | null };
  interaction: { actorId: string; kind: 'plant' | 'defuse'; since: number } | null;
  result: RoundResult | null; shots: Shot[]; sounds: Sound[]; soundSequence: number;
};
export type PlayerSpec = { id: string; team: Team; bot?: Difficulty; position?: Vec3 };
export type Rules = { roundTicks: number; plantTicks: number; defuseTicks: number; bombTicks: number; swapEvery: number };
export const HZ = 60;
export const SUBTICKS = 1000;
export const SECOND = HZ * SUBTICKS;
