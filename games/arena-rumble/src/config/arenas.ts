import { asset } from '../core/paths';

/** Which weapons a round in this arena is allowed to roll. */
export type WeaponClass = 'melee' | 'ranged' | 'any';

export interface ArenaDefinition {
  id: string;
  name: string;
  /** Path relative to public/. Resolved through `asset()` for GitHub Pages. */
  model: string;
  /** Uniform scale applied to the loaded GLB. */
  scale: number;
  /** Only weapons of this class are rolled when this arena is picked. */
  weaponClass: WeaponClass;
  /** Sky / fog tint. Keeps every arena from looking like the same grey box. */
  mood: {
    sky: number;
    horizon: number;
    ground: number;
    fog: number;
    fogDensity: number;
    sunColor: number;
    sunIntensity: number;
    ambientIntensity: number;
    /** Direction the key light comes from. */
    sunDirection: [number, number, number];
  };
  /**
   * Optional manual floor height. Normally the loader finds the floor by
   * casting rays down through the middle of the arena, which is what makes it
   * possible to drop in a brand new GLB without touching any code.
   */
  floorY?: number;
}

export const ARENAS: ArenaDefinition[] = [
  {
    id: 'foundry',
    name: 'The Foundry',
    model: 'assets/arenas/arena_foundry.glb',
    scale: 1.0,
    weaponClass: 'melee', // tight quarters, no line of sight worth a rifle
    mood: {
      sky: 0x1a1206,
      horizon: 0x2e1c08,
      ground: 0x110c07,
      fog: 0x1d1408,
      fogDensity: 0.014,
      sunColor: 0xffb257,
      sunIntensity: 2.1,
      ambientIntensity: 0.55,
      sunDirection: [0.5, 0.72, -0.42],
    },
  },
  {
    id: 'ruins',
    name: 'Shuret Ruins',
    model: 'assets/arenas/arena_ruins.glb',
    scale: 1.0,
    weaponClass: 'melee',
    mood: {
      sky: 0x0a1018,
      horizon: 0x152436,
      ground: 0x0a0d12,
      fog: 0x101a26,
      fogDensity: 0.012,
      sunColor: 0x9fc6ff,
      sunIntensity: 1.5,
      ambientIntensity: 0.62,
      sunDirection: [-0.42, 0.68, 0.55],
    },
  },
  {
    id: 'neon_yard',
    name: 'Neon Yard',
    model: 'assets/arenas/arena_neon_yard.glb',
    scale: 1.0,
    weaponClass: 'any',
    mood: {
      sky: 0x080a14,
      horizon: 0x161a35,
      ground: 0x07080e,
      fog: 0x11142a,
      fogDensity: 0.011,
      sunColor: 0xc0cdff,
      sunIntensity: 1.35,
      ambientIntensity: 0.7,
      sunDirection: [0.3, 0.82, 0.48],
    },
  },
  {
    id: 'crossfire',
    name: 'Crossfire Deck',
    model: 'assets/arenas/arena_crossfire.glb',
    scale: 1.0,
    weaponClass: 'ranged',
    mood: {
      sky: 0x0b1014,
      horizon: 0x1d2a2e,
      ground: 0x0a0f11,
      fog: 0x141d21,
      fogDensity: 0.009,
      sunColor: 0xffe3bd,
      sunIntensity: 1.9,
      ambientIntensity: 0.6,
      sunDirection: [-0.55, 0.7, -0.45],
    },
  },
  {
    id: 'district',
    name: 'Sector District',
    model: 'assets/arenas/arena_district.glb',
    scale: 1.0,
    weaponClass: 'ranged',
    mood: {
      sky: 0x101520,
      horizon: 0x27354a,
      ground: 0x0d1017,
      fog: 0x1a2231,
      fogDensity: 0.0075,
      sunColor: 0xfff0d4,
      sunIntensity: 2.3,
      ambientIntensity: 0.66,
      sunDirection: [0.62, 0.66, 0.42],
    },
  },
];

export function arenaById(id: string): ArenaDefinition | undefined {
  return ARENAS.find((a) => a.id === id);
}

export function arenaUrl(a: ArenaDefinition): string {
  return asset(a.model);
}
