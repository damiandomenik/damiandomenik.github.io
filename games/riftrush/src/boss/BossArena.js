/**
 * Baut die Boss-Arena mit dem normalen RoomContext, damit sie sich physikalisch,
 * visuell und netzwerkseitig exakt wie jeder andere Room verhält.
 *
 * Aufbau (lokale Koordinaten, Laufrichtung -Z):
 *
 *        ┌──────────── Arena 46 x 44 ────────────┐
 *   Ein- │  [P]        MECH        [P]           │  [P] = Hochplattform
 *   gang │        ╔═══ BOSS ═══╗                 │  Kern auf ~15 m
 *        │  MECH  ║  Sockel    ║   MECH          │
 *        │  [P]        ROUTE        [P]──▶ Kern  │
 *        └───────────── Tür ──▶ Ausgang ─────────┘
 *
 * Der Arenaboden besteht aus acht steuerbaren Kacheln rund um den Sockel —
 * so kann die Einsturzphase einzelne Felder wegnehmen.
 */
export const ARENA = {
  length: 92,
  centerZ: -46,
  halfX: 23,
  floorY: 0,
  pedestalTop: 3,
  coreY: 15.4,
  walkwayY: 12.5,
  exitZ: -72,
};

export function buildBossArena(c) {
  const O = c.origin;
  const w = (x, y, z) => ({ x: x + O.x, y: y + O.y, z: z + O.z });
  const CZ = ARENA.centerZ;

  // ---------- Zugang ----------
  c.plat(0, 0, -3.5, 9, 7, 'accent');          // Eingangspodest
  c.plat(0, 0, -15, 12, 16, 'solid');          // Anlaufkorridor
  c.hazard(0, -7, CZ, 60, 2, 60);              // Abgrund unter der Arena

  // ---------- Arenaboden: 8 Kacheln um den Sockel ----------
  const tiles = [];
  const gx = [-15, 0, 15], gz = [CZ + 15, CZ, CZ - 15];
  for (const x of gx) {
    for (const z of gz) {
      if (x === 0 && z === CZ) continue;        // Mitte = Bosssockel
      const t = c.tile(x, 0, z, 15, 15);
      t.role = 'floor';
      // Die mittlere Spur bleibt immer stehen, sonst wäre der Ausgang
      // nach dem Einsturz unerreichbar.
      t.collapsible = x !== 0;
      t.world = w(x, 0, z);
      tiles.push(t);
    }
  }

  // ---------- Bosssockel ----------
  c.box(0, 0, CZ, 13, ARENA.pedestalTop, 13, 'accent');
  c.light(0, 8, CZ, 0x38f2c8, 2.6, 46);

  // ---------- Außenwände ----------
  c.wall(-ARENA.halfX - 1, -1, CZ, 1.4, 18, 46);
  c.wall(ARENA.halfX + 1, -1, CZ, 1.4, 18, 46);
  c.wall(0, -1, CZ - 23, 48, 18, 1.4);
  c.wall(-16, -1, CZ + 23, 16, 18, 1.4);
  c.wall(16, -1, CZ + 23, 16, 18, 1.4);

  // ---------- Vier Hochplattformen ----------
  const corners = [
    { x: -15.5, y: 6.0, z: CZ + 13 },
    { x: 15.5, y: 6.0, z: CZ + 13 },
    { x: -15.5, y: 6.6, z: CZ - 13 },
    { x: 15.5, y: 6.6, z: CZ - 13 },
  ];
  const platforms = [];
  for (const p of corners) {
    const t = c.tile(p.x, p.y, p.z, 10, 10);
    t.role = 'platform';
    t.collapsible = true;
    t.world = w(p.x, p.y, p.z);
    tiles.push(t);
    platforms.push(t);
  }

  // ---------- Aufstiege (Rampen / Sprungplattformen) ----------
  const climbs = [
    [-9.5, 2.2, CZ + 19], [-13.5, 4.2, CZ + 17.5],
    [9.5, 2.2, CZ + 19], [13.5, 4.2, CZ + 17.5],
    [-9.5, 2.6, CZ - 19], [-13.5, 4.6, CZ - 17.5],
    [9.5, 2.6, CZ - 19], [13.5, 4.6, CZ - 17.5],
  ];
  for (const [x, y, z] of climbs) c.plat(x, y, z, 4.2, 4.2, 'accent');

  // ---------- Mechanismen auf drei der vier Plattformen ----------
  const mechanisms = [];
  for (let i = 0; i < 3; i++) {
    const p = corners[i];
    const pad = c.tile(p.x, p.y + 1.0, p.z, 3.6, 3.6, { thickness: 1.0 });
    pad.role = 'mech';
    pad.world = w(p.x, p.y + 1.0, p.z);
    const trg = c.trigger(p.x, p.y, p.z, 4.4, 4.0, 4.4, { type: 'boss_mech', index: i });
    c.box(p.x, p.y + 1.0, p.z, 0.5, 3.0, 0.5, 'switch');
    c.light(p.x, p.y + 4, p.z, 0xff9f1c, 1.4, 22);
    mechanisms.push({ index: i, pad, trigger: trg, world: w(p.x, p.y, p.z) });
  }

  // ---------- Kern-Route: Wallrun -> Sprung -> bewegliche Plattform ----------
  // Startet auf der vierten Plattform (rechts hinten)
  c.runWall(ARENA.halfX - 1.2, 0, CZ - 4, 1.3, 18, 26);
  c.runWall(-ARENA.halfX + 1.2, 0, CZ - 4, 1.3, 18, 26);
  c.plat(14.5, 9.6, CZ - 2, 4.6, 4.6, 'accent');
  c.plat(-14.5, 9.6, CZ - 2, 4.6, 4.6, 'accent');
  c.plat(12.8, 10.9, CZ + 3.5, 3.4, 3.4, 'accent');
  c.plat(-12.8, 10.9, CZ + 3.5, 3.4, 3.4, 'accent');
  const lift = c.moving(10.5, 11.4, CZ + 1, 4.4, 0.7, 4.4, { axis: 'y', amp: 1.6, speed: 0.22 });
  const lift2 = c.moving(-10.5, 11.4, CZ + 1, 4.4, 0.7, 4.4, { axis: 'y', amp: 1.6, speed: 0.22, phase: 0.5 });

  // Laufsteg um den Kern
  const W = ARENA.walkwayY;
  c.plat(8.0, W, CZ, 5.5, 5.5, 'goal');
  c.plat(-8.0, W, CZ, 5.5, 5.5, 'goal');
  c.plat(0, W, CZ + 8.0, 5.5, 5.5, 'goal');
  c.plat(0, W, CZ - 8.0, 5.5, 5.5, 'goal');

  // Kern-Trigger (nur in der verwundbaren Phase aktiv)
  const coreTrigger = c.trigger(0, W + 0.5, CZ, 13, 5, 13, { type: 'boss_core' });
  coreTrigger.active = false;

  // ---------- Ausgang: Tür öffnet erst in der Fluchtphase ----------
  const doorId = 'boss_exit';
  c.plat(0, 0, ARENA.exitZ - 8, 11, 20, 'solid');
  c.door(0, 0, ARENA.exitZ, 12, 9, 1.3, doorId);
  c.wall(-8.5, 0, ARENA.exitZ - 8, 1.2, 8, 20);
  c.wall(8.5, 0, ARENA.exitZ - 8, 1.2, 8, 20);
  c.plat(0, 0, -88, 10, 10, 'accent');
  c.light(0, 6, ARENA.exitZ - 10, 0xffd166, 1.8, 30);

  return {
    center: w(0, ARENA.pedestalTop, CZ),
    bossPos: w(0, ARENA.pedestalTop, CZ),
    floorY: O.y,
    coreY: O.y + ARENA.coreY,
    walkwayY: O.y + ARENA.walkwayY,
    laserY: O.y + 1.5,
    radius: 26,
    minZ: O.z + CZ - 24, maxZ: O.z + CZ + 24,
    minX: O.x - 24, maxX: O.x + 24,
    tiles, platforms, mechanisms, coreTrigger, doorId,
    lifts: [lift, lift2],
    entranceZ: O.z - 8,
  };
}
