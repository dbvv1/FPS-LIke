// Candidate `guard-materials=continuous-v2`: semantic waist/hip and upper-leg
// material groups for the relay-guard body. Pure classification and colour
// tables only; geometry, pose, collision, lighting and source assets stay put.
export const GUARD_MATERIALS_ID = 'continuous-v2';
export function guardMaterialsEnabled(search: string) {
  // One exact opt-in. Missing, unknown, repeated or differently cased values
  // keep the original target colours.
  const values = new URLSearchParams(search).getAll('guard-materials');
  return values.length === 1 && values[0] === GUARD_MATERIALS_ID;
}

// Boundaries are each source triangle's mean vertex height in metres.
// Below 0.3 m are feet/boots; at or above 1.05 m the existing torso carrier,
// helmet and detail rules keep ownership. Only [0.3, 1.05) enters this pass.
export const GUARD_LEG_MIN = 0.3;
export const GUARD_HIP_MIN = 0.8;
export const GUARD_TOP = 1.05;

export type GuardZone = 'hip' | 'leg-armor' | 'equipment' | 'cloth';
export type GuardFace = { part: string; region: string; color: number; height: number };

// Source face colours in this range. Armor shades reuse the existing carrier
// family; equipment and bright cloth already have team mappings in targetColor.
const ARMOR_SHADES = [0x1c1c1c, 0x222222, 0x2b2b2b, 0x333333, 0x4c4c4c, 0x5c5c5c, 0x707070] as const;
const ARMOR_SHADE_INDEX = new Map<number, number>(ARMOR_SHADES.map((color, index) => [color, index]));
const EQUIPMENT_SHADE = 0x6b624b;
const CLOTH_LIGHT = 0xcfaf7c;
const CLOTH_DARK = 0x211d1e;

// Existing friendly-cool / enemy-warm carrier values, repeated here so this
// module stays free of renderer imports. Tests pin them to targetColor.
const FRIENDLY_ARMOR = [0x487d79, 0x548b86, 0x629992, 0x72a59e, 0x83b1a8, 0x91bdb4, 0xa0c9c1] as const;
const ENEMY_ARMOR = [0x936540, 0xa57348, 0xb68152, 0xc18d5e, 0xc99b6e, 0xd3aa7f, 0xddbc96] as const;
const EQUIPMENT = { friend: 0x426f6b, enemy: 0x775142 } as const;
const CLOTH_LIGHT_TEAM = { friend: 0x75b9b0, enemy: 0xc46d4e } as const;
// Dark cloth was the other half of the merged black block. These values keep
// the team hue while sitting darker than armor/equipment and clearly above the
// source near-black value.
const CLOTH_DARK_TEAM = { friend: 0x2e666e, enemy: 0x7c3a2a } as const;

export const GUARD_PALETTES = Object.freeze({
  armor: Object.freeze({ friend: FRIENDLY_ARMOR, enemy: ENEMY_ARMOR }),
  equipment: EQUIPMENT,
  clothLight: CLOTH_LIGHT_TEAM,
  clothDark: CLOTH_DARK_TEAM,
});

/**
 * Zone priority (highest first):
 * 1. non-body parts and existing helmet/carrier regions are untouched;
 * 2. out-of-band heights are untouched;
 * 3. equipment webbing reads over hip/leg armor;
 * 4. cloth reads over hip/leg armor;
 * 5. armor splits into leg armor below 0.8 m and hip at/above it.
 */
export function guardZone(face: GuardFace): GuardZone | null {
  if (face.part !== 'body' || face.region !== 'detail') return null;
  if (!(face.height >= GUARD_LEG_MIN && face.height < GUARD_TOP)) return null;
  if (face.color === EQUIPMENT_SHADE) return 'equipment';
  if (face.color === CLOTH_LIGHT || face.color === CLOTH_DARK) return 'cloth';
  if (!ARMOR_SHADE_INDEX.has(face.color)) return null;
  return face.height < GUARD_HIP_MIN ? 'leg-armor' : 'hip';
}

/** Team-coloured replacement for an already classified source face. */
export function guardColor(color: number, friend: boolean, zone: GuardZone): number {
  const team = friend ? 'friend' : 'enemy';
  if (zone === 'hip' || zone === 'leg-armor') {
    const index = ARMOR_SHADE_INDEX.get(color);
    return index === undefined ? color : (friend ? FRIENDLY_ARMOR : ENEMY_ARMOR)[index]!;
  }
  if (zone === 'equipment') return color === EQUIPMENT_SHADE ? EQUIPMENT[team] : color;
  if (color === CLOTH_LIGHT) return CLOTH_LIGHT_TEAM[team];
  if (color === CLOTH_DARK) return CLOTH_DARK_TEAM[team];
  return color;
}
