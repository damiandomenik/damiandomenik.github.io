import { asset } from '../core/paths';

export type WeaponKind = 'hitscan' | 'melee';

export interface WeaponDefinition {
  id: string;
  name: string;
  kind: WeaponKind;
  model: string;

  /** Damage per hit (per pellet for shotguns). */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Maximum effective distance in metres. */
  range: number;
  /** Pellets fired per trigger pull. */
  pellets: number;
  /** Cone half angle in radians applied to every pellet. */
  spread: number;
  /** Extra recoil kick applied to the view, in radians. */
  recoil: number;

  magazineSize: number; // 0 = no reload (melee)
  reloadTime: number;

  /** Where the model sits relative to the camera in first person. */
  view: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  };

  audio: {
    /** Rough character of the synthesised shot / swing. */
    tone: 'crack' | 'boom' | 'thump' | 'whoosh';
    pitch: number;
  };
}

export const WEAPONS: WeaponDefinition[] = [
  // ------------------------------------------------------------- firearms
  {
    id: 'pistol',
    name: 'Sidearm',
    kind: 'hitscan',
    model: 'assets/weapons/wpn_pistol.glb',
    damage: 26,
    fireRate: 4.5,
    range: 70,
    pellets: 1,
    spread: 0.006,
    recoil: 0.016,
    magazineSize: 12,
    reloadTime: 1.4,
    view: { position: [0.19, -0.19, -0.34], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'crack', pitch: 1.15 },
  },
  {
    id: 'revolver',
    name: 'Magnum',
    kind: 'hitscan',
    model: 'assets/weapons/wpn_revolver.glb',
    damage: 52,
    fireRate: 1.6,
    range: 80,
    pellets: 1,
    spread: 0.004,
    recoil: 0.05,
    magazineSize: 6,
    reloadTime: 2.4,
    view: { position: [0.2, -0.2, -0.36], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'boom', pitch: 1.0 },
  },
  {
    id: 'smg',
    name: 'Submachine Gun',
    kind: 'hitscan',
    model: 'assets/weapons/wpn_smg.glb',
    damage: 13,
    fireRate: 11,
    range: 55,
    pellets: 1,
    spread: 0.019,
    recoil: 0.009,
    magazineSize: 32,
    reloadTime: 1.9,
    view: { position: [0.2, -0.2, -0.36], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'crack', pitch: 1.3 },
  },
  {
    id: 'rifle',
    name: 'Assault Rifle',
    kind: 'hitscan',
    model: 'assets/weapons/wpn_rifle.glb',
    damage: 21,
    fireRate: 8,
    range: 95,
    pellets: 1,
    spread: 0.012,
    recoil: 0.014,
    magazineSize: 30,
    reloadTime: 2.2,
    view: { position: [0.2, -0.21, -0.3], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'crack', pitch: 1.0 },
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    kind: 'hitscan',
    model: 'assets/weapons/wpn_shotgun.glb',
    damage: 11,
    fireRate: 1.1,
    range: 26,
    pellets: 9,
    spread: 0.055,
    recoil: 0.06,
    magazineSize: 6,
    reloadTime: 2.8,
    view: { position: [0.2, -0.21, -0.28], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'boom', pitch: 0.85 },
  },
  {
    id: 'sniper',
    name: 'Bolt Rifle',
    kind: 'hitscan',
    model: 'assets/weapons/wpn_sniper.glb',
    damage: 88,
    fireRate: 0.8,
    range: 220,
    pellets: 1,
    spread: 0.0015,
    recoil: 0.075,
    magazineSize: 5,
    reloadTime: 3.0,
    view: { position: [0.2, -0.2, -0.26], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'boom', pitch: 1.2 },
  },
  {
    id: 'launcher',
    name: 'Recoilless',
    kind: 'hitscan',
    // No projectile physics in the MVP: this is a heavy, slow, very punishing
    // single shot rather than a real rocket. Splash damage is a later feature.
    model: 'assets/weapons/wpn_launcher.glb',
    damage: 95,
    fireRate: 0.55,
    range: 120,
    pellets: 1,
    spread: 0.01,
    recoil: 0.1,
    magazineSize: 3,
    reloadTime: 3.6,
    view: { position: [0.22, -0.19, -0.22], rotation: [0, 0, 0], scale: 1 },
    audio: { tone: 'boom', pitch: 0.7 },
  },

  // ---------------------------------------------------------------- melee
  {
    id: 'sword',
    name: 'Glass Sword',
    kind: 'melee',
    model: 'assets/weapons/wpn_sword.glb',
    damage: 45,
    fireRate: 1.7,
    range: 2.6,
    pellets: 1,
    spread: 0.14, // becomes the swing arc for melee
    recoil: 0.03,
    magazineSize: 0,
    reloadTime: 0,
    view: { position: [0.26, -0.42, -0.44], rotation: [-0.42, 0.22, 0.12], scale: 1 },
    audio: { tone: 'whoosh', pitch: 1.1 },
  },
  {
    id: 'greatsword',
    name: 'Glass Greatsword',
    kind: 'melee',
    model: 'assets/weapons/wpn_greatsword.glb',
    damage: 68,
    fireRate: 1.0,
    range: 3.1,
    pellets: 1,
    spread: 0.17,
    recoil: 0.05,
    magazineSize: 0,
    reloadTime: 0,
    view: { position: [0.28, -0.5, -0.5], rotation: [-0.46, 0.2, 0.14], scale: 1 },
    audio: { tone: 'whoosh', pitch: 0.85 },
  },
  {
    id: 'battleaxe',
    name: 'Battle Axe',
    kind: 'melee',
    model: 'assets/weapons/wpn_battleaxe.glb',
    damage: 58,
    fireRate: 1.2,
    range: 2.7,
    pellets: 1,
    spread: 0.16,
    recoil: 0.045,
    magazineSize: 0,
    reloadTime: 0,
    view: { position: [0.27, -0.45, -0.46], rotation: [-0.4, 0.24, 0.1], scale: 1 },
    audio: { tone: 'thump', pitch: 0.95 },
  },
  {
    id: 'warhammer',
    name: 'War Hammer',
    kind: 'melee',
    model: 'assets/weapons/wpn_warhammer.glb',
    damage: 72,
    fireRate: 0.9,
    range: 2.5,
    pellets: 1,
    spread: 0.15,
    recoil: 0.06,
    magazineSize: 0,
    reloadTime: 0,
    view: { position: [0.28, -0.46, -0.46], rotation: [-0.38, 0.22, 0.1], scale: 1 },
    audio: { tone: 'thump', pitch: 0.75 },
  },
  {
    id: 'mace',
    name: 'Mace',
    kind: 'melee',
    model: 'assets/weapons/wpn_mace.glb',
    damage: 40,
    fireRate: 1.9,
    range: 2.3,
    pellets: 1,
    spread: 0.14,
    recoil: 0.03,
    magazineSize: 0,
    reloadTime: 0,
    view: { position: [0.26, -0.4, -0.42], rotation: [-0.36, 0.22, 0.1], scale: 1 },
    audio: { tone: 'thump', pitch: 1.05 },
  },
  {
    id: 'dagger',
    name: 'Glass Dagger',
    kind: 'melee',
    model: 'assets/weapons/wpn_dagger.glb',
    damage: 27,
    fireRate: 3.4,
    range: 2.0,
    pellets: 1,
    spread: 0.11,
    recoil: 0.015,
    magazineSize: 0,
    reloadTime: 0,
    view: { position: [0.24, -0.34, -0.4], rotation: [-0.34, 0.24, 0.1], scale: 1 },
    audio: { tone: 'whoosh', pitch: 1.4 },
  },
];

export function weaponById(id: string): WeaponDefinition | undefined {
  return WEAPONS.find((w) => w.id === id);
}

export function weaponUrl(w: WeaponDefinition): string {
  return asset(w.model);
}

export function weaponsForClass(cls: 'melee' | 'ranged' | 'any'): WeaponDefinition[] {
  if (cls === 'any') return WEAPONS;
  if (cls === 'melee') return WEAPONS.filter((w) => w.kind === 'melee');
  return WEAPONS.filter((w) => w.kind === 'hitscan');
}
