/**
 * RoomRegistry — modulare Room-Typen.
 * Jeder Room beginnt lokal bei (0,0,0) (Oberkante Eingangsplattform)
 * und endet bei (0, exitY, -length).
 */

function entryPad(c, w = 9, d = 7) {
  c.plat(0, 0, -d / 2 + 1, w, d, 'accent');
  c.light(0, 3, -2, 0x38f2c8, 1.1, 20);
}
function exitPad(c, y, z, w = 9, d = 7) {
  c.plat(0, y, z + d / 2 - 1, w, d, 'accent');
}
function rails(c, len, y = 0, halfW = 7) {
  c.box(-halfW, y - 0.8, -len / 2, 0.6, 1.4, len, 'solid');
  c.box(halfW, y - 0.8, -len / 2, 0.6, 1.4, len, 'solid');
}
function pit(c, len, w = 26, y = -4) {
  c.hazard(0, y, -len / 2, w, 1.6, len);
}

export const ROOMS = [
  // ---------------------------------------------------------------- START
  {
    id: 'start', name: 'Rift Gate', length: 26, exitY: 0, weight: 0, tag: 'start',
    build(c) {
      c.plat(0, 0, -8, 16, 18, 'accent');
      c.wall(-8, 0, -8, 1, 6, 18);
      c.wall(8, 0, -8, 1, 6, 18);
      c.wall(0, 0, 1.2, 16, 6, 1);
      for (let i = 0; i < 4; i++) c.box(-6 + i * 4, 0, -17, 1.2, 5, 1.2, 'solid');
      c.light(0, 6, -8, 0x6f7bff, 1.6, 32);
      exitPad(c, 0, -26);
      c.plat(0, 0, -21, 9, 6, 'solid');
    },
  },

  // ---------------------------------------------------------------- PARKOUR
  {
    id: 'parkour_bridges', name: 'Bridge Run', length: 62, exitY: 2, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 62);
      let z = -10, y = 0;
      let side = rng.chance(0.5) ? 1 : -1;
      while (z > -54) {
        const gap = rng.range(4.6, 6.6);
        z -= gap;
        y += rng.range(-0.8, 1.6);
        const x = side * rng.range(0.5, 4.5);
        const w = rng.range(3.2, 5.0);
        c.plat(x, y, z, w, rng.range(3.0, 4.6), rng.chance(0.25) ? 'accent' : 'solid');
        if (rng.chance(0.35)) c.plat(-x * 0.8, y + rng.range(1, 3), z - 2.4, 2.6, 2.6, 'solid');
        side *= rng.chance(0.65) ? -1 : 1;
      }
      c.plat(0, 2, -58, 7, 5, 'solid');
      exitPad(c, 2, -62);
    },
  },

  {
    id: 'parkour_pillars', name: 'Pillar Field', length: 56, exitY: 0, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 56, 30, -6);
      // Garantierter Hauptpfad (immer erreichbar)
      let py = 0.6;
      for (let i = 0; i < 8; i++) {
        py = Math.max(0.4, Math.min(3.2, py + rng.range(-1.0, 1.2)));
        c.box(rng.range(-3, 3), py - 8, -12 - i * 5, 3.0, 8, 3.0, i % 3 === 0 ? 'accent' : 'solid');
      }
      // Zusätzliche Säulen als Risiko/Abkürzung
      for (let i = 0; i < 12; i++) {
        const z = -10 - i * 3.4 - rng.range(0, 1.2);
        const x = (rng.chance(0.5) ? 1 : -1) * rng.range(3.5, 6.0);
        const h = rng.range(1.0, 4.0);
        c.box(x, h - 8, z, rng.range(1.8, 2.6), 8, rng.range(1.8, 2.6), rng.chance(0.25) ? 'accent' : 'solid');
      }
      c.plat(0, 0, -52, 8, 5, 'solid');
      exitPad(c, 0, -56);
    },
  },

  // ---------------------------------------------------------------- VERTICAL
  {
    id: 'vertical_shaft', name: 'Vertical Shaft', length: 30, exitY: 20, weight: 2,
    build(c, rng) {
      entryPad(c);
      // Schacht-Wände (Wallrun)
      c.wall(-7.5, -2, -16, 1.2, 34, 26);
      c.wall(7.5, -2, -16, 1.2, 34, 26);
      c.wall(0, -2, -29.5, 15, 21.4, 1.2);   // Oberkante = Ausgangshöhe, sonst versiegelt die Wand den Room
      pit(c, 30, 18, -8);
      let y = 1.6, side = -1;
      for (let i = 0; i < 9; i++) {
        y += rng.range(2.0, 2.9);
        c.plat(side * rng.range(3.5, 5.5), y, -10 - rng.range(0, 12), rng.range(3.0, 4.2), 3.2,
          i % 3 === 0 ? 'accent' : 'solid');
        side *= -1;
      }
      c.light(0, 12, -16, 0x6f7bff, 2.0, 34);
      c.plat(0, 20, -26, 8, 6, 'accent');
      exitPad(c, 20, -30);
    },
  },

  {
    id: 'wall_corridor', name: 'Wallrun Corridor', length: 62, exitY: 0, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 62, 20, -5);
      c.wall(-4.6, -1, -34, 1.2, 12, 52);
      c.wall(4.6, -1, -34, 1.2, 12, 52);
      c.plat(0, 0, -12, 6, 6, 'solid');
      const zs = [-20, -28, -36, -44];
      for (let i = 0; i < zs.length; i++) {
        const s = i % 2 === 0 ? -1 : 1;
        c.plat(s * 2.6, rng.range(0.4, 2.2), zs[i], 2.6, 3.0, 'accent');
      }
      c.plat(0, 0, -54, 7, 6, 'solid');
      c.light(0, 6, -32, 0x38f2c8, 1.5, 34);
      exitPad(c, 0, -62);
    },
  },

  // ---------------------------------------------------------------- TRAPS
  {
    id: 'trap_blinkers', name: 'Phase Traps', length: 56, exitY: 0, weight: 2,
    build(c, rng) {
      entryPad(c); pit(c, 56, 26, -4);
      for (let i = 0; i < 11; i++) {
        const z = -11 - i * 3.9;
        const x = (i % 3 - 1) * 3.4 + rng.range(-0.6, 0.6);
        c.blinker(x, rng.range(0, 1.4), z, 3.4, 3.4, { period: rng.range(2.6, 4.0), phase: rng(), onRatio: 0.62 });
        if (i % 4 === 2) c.plat(-x, rng.range(0.5, 2.0), z - 1.5, 2.6, 2.6, 'solid');
      }
      c.plat(0, 0, -52, 8, 5, 'solid');
      exitPad(c, 0, -56);
    },
  },

  {
    id: 'gauntlet', name: 'Blade Gauntlet', length: 60, exitY: 0, weight: 2,
    build(c, rng) {
      entryPad(c); pit(c, 60, 26, -5);
      c.plat(0, 0, -32, 8, 48, 'solid');
      rails(c, 48, 0, 4.4);
      for (let i = 0; i < 7; i++) {
        const z = -13 - i * 6.5;
        c.moving(0, 0.2, z, 3.2, 3.0, 1.0, {
          axis: 'x', amp: rng.range(3.2, 5.0), speed: rng.range(0.28, 0.5), phase: rng(), kind: 'hazard',
        });
      }
      c.light(0, 5, -30, 0xff4d6d, 1.6, 30);
      exitPad(c, 0, -60);
    },
  },

  // ---------------------------------------------------------------- SPEED
  {
    id: 'speed_room', name: 'Speedway', length: 78, exitY: -2, weight: 2,
    build(c, rng) {
      entryPad(c);
      c.plat(0, 0, -38, 11, 64, 'solid');
      rails(c, 64, 0, 5.6);
      for (let i = 0; i < 9; i++) {
        const z = -12 - i * 6.6;
        const x = rng.range(-3.6, 3.6);
        c.box(x, 0, z, 3.0, 1.3, 1.0, 'accent');
        if (rng.chance(0.4)) c.hazard(-x, 0.05, z - 3.0, 2.4, 1.0, 1.0);
      }
      c.plat(0, -2, -72, 10, 10, 'accent');
      c.light(0, 5, -40, 0x4cc9f0, 1.4, 40);
      exitPad(c, -2, -78);
    },
  },

  // ---------------------------------------------------------------- SPLIT
  {
    id: 'split_path', name: 'Split Path', length: 66, exitY: 1.6, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 66, 34, -6);
      // SAFE (links, breit, langsamer)
      c.plat(-7, 0, -14, 7, 12, 'safe');
      c.plat(-11, 0.6, -26, 6, 14, 'safe');
      c.plat(-8, 1.2, -38, 7, 12, 'safe');
      c.plat(-4, 1.4, -48, 7, 10, 'safe');
      // RISK (rechts, schmale Beams, schneller)
      const beams = [[6, 0.4, -16, 1.6, 12], [7.5, 1.2, -28, 1.4, 10], [6.5, 2.0, -39, 1.3, 10], [4.5, 2.4, -49, 1.6, 10]];
      for (const [x, y, z, w, d] of beams) c.plat(x, y, z, w, d, 'risk');
      c.plat(9.4, 3.2, -33, 1.6, 1.6, 'accent');
      c.light(-8, 4, -30, 0x4cc9f0, 1.2, 26);
      c.light(7, 4, -30, 0xff9f1c, 1.2, 26);
      c.plat(0, 1.6, -58, 10, 8, 'solid');
      exitPad(c, 1.6, -66);
    },
  },

  // ---------------------------------------------------------------- SWITCH
  {
    id: 'switch_room', name: 'Switch Vault', length: 52, exitY: 0, weight: 2,
    build(c, rng, roomIndex) {
      entryPad(c); pit(c, 52, 30, -6);
      c.plat(0, 0, -22, 16, 26, 'solid');
      const doorId = `door_${roomIndex}`;
      c.door(0, 0, -40, 12, 8, 1.2, doorId);
      c.plat(0, 0, -44, 10, 8, 'solid');
      // Schalter oben rechts, kleiner Kletterpfad
      c.plat(7.5, 1.9, -16, 3.6, 3.6, 'accent');
      c.plat(9.5, 3.6, -21, 3.4, 3.4, 'accent');
      c.plat(7.5, 5.2, -26, 4.2, 4.2, 'accent');
      c.switchPad(7.5, 5.2, -26, doorId);
      c.light(7.5, 8, -26, 0xff9f1c, 1.6, 24);
      exitPad(c, 0, -52);
    },
  },

  // ---------------------------------------------------------------- MOVING
  {
    id: 'moving_platforms', name: 'Drift Platforms', length: 62, exitY: 4, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 62, 30, -6);
      for (let i = 0; i < 7; i++) {
        const z = -13 - i * 6.4;
        const vertical = i % 3 === 2;
        c.moving(rng.range(-2, 2), 0.4 + i * 0.55, z, 4.2, 0.7, 4.2, {
          axis: vertical ? 'y' : 'x',
          amp: vertical ? rng.range(1.6, 3.0) : rng.range(3.0, 5.4),
          speed: rng.range(0.16, 0.3), phase: rng(),
        });
      }
      c.plat(0, 4, -56, 8, 6, 'solid');
      c.light(0, 8, -30, 0x6f7bff, 1.4, 34);
      exitPad(c, 4, -62);
    },
  },

  // ---------------------------------------------------------------- CHASE
  {
    id: 'chase_room', name: 'Rift Collapse', length: 72, exitY: 0, weight: 2,
    build(c, rng) {
      entryPad(c); pit(c, 72, 26, -6);
      c.plat(0, 0, -36, 9, 60, 'solid');
      for (let i = 0; i < 8; i++) {
        const z = -13 - i * 7;
        const x = rng.range(-3, 3);
        if (rng.chance(0.5)) c.box(x, 0, z, 2.6, 1.6, 1.2, 'accent');
        else c.hazard(x, 0.05, z, 3.0, 1.0, 1.2);
      }
      c.chaseWall(-4, 22, 16, 12.5, -70);
      c.light(0, 6, -20, 0xff4d6d, 1.8, 30);
      exitPad(c, 0, -72);
    },
  },

  // ---------------------------------------------------------------- PVP
  {
    id: 'pvp_arena', name: 'Clash Arena', length: 48, exitY: 0, weight: 2, tag: 'pvp',
    build(c, rng) {
      entryPad(c); pit(c, 48, 40, -7);
      c.plat(0, 0, -24, 26, 26, 'solid');
      c.box(0, 0, -24, 5, 2.4, 5, 'accent');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.box(Math.cos(a) * 9, 0, -24 + Math.sin(a) * 9, 1.6, 4.0, 1.6, 'solid');
      }
      c.plat(0, 0, -42, 6, 10, 'solid');
      c.light(0, 8, -24, 0xff4d6d, 1.4, 34);
      exitPad(c, 0, -48);
    },
  },

  // ---------------------------------------------------------------- DESCENT
  {
    id: 'descent', name: 'Deep Descent', length: 46, exitY: -14, weight: 2,
    build(c, rng) {
      entryPad(c);
      c.wall(-9, -22, -22, 1.2, 30, 34);
      c.wall(9, -22, -22, 1.2, 30, 34);
      pit(c, 46, 22, -26);
      let y = -1.5;
      for (let i = 0; i < 7; i++) {
        y -= rng.range(1.6, 2.6);
        c.plat((i % 2 === 0 ? -1 : 1) * rng.range(1.5, 3.5), y, -10 - i * 4.4, rng.range(3.6, 4.8), 3.8,
          i % 3 === 1 ? 'accent' : 'solid');
      }
      c.plat(0, -14, -42, 9, 8, 'solid');
      exitPad(c, -14, -46);
    },
  },

  // ---------------------------------------------------------------- FINAL
  {
    id: 'final_room', name: 'Rift Core', length: 58, exitY: 8, weight: 0, tag: 'final',
    build(c, rng) {
      entryPad(c); pit(c, 58, 40, -8);
      c.plat(0, 0, -16, 20, 18, 'solid');
      c.box(0, 0, -30, 6, 22, 6, 'accent');           // Kern-Säule
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        c.moving(Math.cos(a) * 6, 1.2 + i * 1.4, -30 + Math.sin(a) * 6, 4.6, 0.7, 4.6, {
          axis: 'x', amp: 3.4, speed: 0.2 + i * 0.02, phase: i / 6,
        });
      }
      c.moving(0, 3.0, -22, 3.4, 3.4, 1.0, { axis: 'x', amp: 6, speed: 0.35, kind: 'hazard' });
      c.plat(0, 8, -44, 12, 16, 'accent');
      c.light(0, 10, -30, 0x38f2c8, 2.4, 40);
      exitPad(c, 8, -58);
    },
  },

  // ---------------------------------------------------------------- FINISH
  {
    id: 'finish', name: 'Extraction', length: 22, exitY: 0, weight: 0, tag: 'finish',
    build(c) {
      c.plat(0, 0, -11, 14, 24, 'goal');
      c.wall(-7, 0, -11, 1, 8, 24);
      c.wall(7, 0, -11, 1, 8, 24);
      c.wall(0, 0, -22.5, 14, 8, 1);
      c.box(0, 0, -18, 10, 0.3, 1.0, 'goal');
      c.light(0, 6, -14, 0xffd166, 2.6, 34);
      c.trigger(0, 0, -16, 13, 6, 8, { type: 'finish' });
    },
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const PLAYABLE_ROOMS = ROOMS.filter((r) => r.weight > 0);
