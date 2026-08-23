import { buildBossArena, ARENA } from '../boss/BossArena.js';

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
      /* Die seitliche Versetzung ist begrenzt, damit der Sprung zur nächsten
       * Plattform nie an der Reichweite scheitert: bei 1,1 m Anstieg bleiben
       * rechnerisch gut 6 m Weite. */
      let z = -3.5, y = 0, x = 0;   // erste Plattform dicht an der Eingangsfläche
      while (z > -50) {
        const rise = rng.range(-0.8, 1.1);
        const nx = Math.max(-4.2, Math.min(4.2, x + rng.range(-2.6, 2.6)));
        z -= rng.range(4.2, 5.4) - Math.max(0, rise) + 5.4;   // grössere Luecken: der Grundsprung soll knapp sein
        y += rise;
        c.plat(nx, y, z, rng.range(3.8, 5.2), rng.range(3.4, 4.6),
          rng.chance(0.25) ? 'accent' : 'solid');
        if (rng.chance(0.3)) c.plat(nx + (nx > 0 ? -2.8 : 2.8), y + rng.range(1.0, 1.8), z - 2.0, 2.6, 2.6, 'solid');
        x = nx;
      }
      c.plat(0, 2, -56, 9, 8, 'solid');
      exitPad(c, 2, -62);
    },
  },

  {
    id: 'parkour_pillars', name: 'Pillar Field', length: 70, exitY: 0, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 70, 30, -6);
      // Garantierter Hauptpfad (immer erreichbar)
      // Hauptpfad: jede Säule ist von der vorherigen sicher erreichbar
      let py = 0.6, px = 0;
      const path = [];
      for (let i = 0; i < 10; i++) {
        py = Math.max(0.4, Math.min(2.2, py + rng.range(-0.8, 0.9)));
        px = Math.max(-3.5, Math.min(3.5, px + rng.range(-2.0, 2.0)));
        const z = -11 - i * 5.6;
        c.box(px, py - 8, z, 3.6, 8, 3.6, i % 3 === 0 ? 'accent' : 'solid');
        path.push({ x: px, y: py, z });
      }
      // Nebensäulen als Abkürzung, immer direkt neben dem Hauptpfad
      for (const node of path) {
        if (!rng.chance(0.6)) continue;
        const side = node.x > 0 ? -1 : 1;
        c.box(node.x + side * rng.range(2.8, 4.0), node.y + rng.range(-0.6, 0.8) - 8,
          node.z - rng.range(1.0, 2.6), 2.6, 8, 2.6, rng.chance(0.3) ? 'accent' : 'solid');
      }
      c.plat(0, 0, -66, 8, 5, 'solid');
      exitPad(c, 0, -70);
    },
  },

  // ---------------------------------------------------------------- VERTICAL
  {
    id: 'vertical_shaft', name: 'Vertical Shaft', length: 30, exitY: 18, weight: 2,
    build(c, rng) {
      entryPad(c);
      // Schacht-Wände (Wallrun)
      c.runWall(-7.5, -2, -16, 1.2, 34, 26);
      c.runWall(7.5, -2, -16, 1.2, 34, 26);
      c.wall(0, -2, -29.5, 15, 19.4, 1.2);   // Oberkante = Ausgangshöhe, sonst versiegelt die Wand den Room
      pit(c, 30, 18, -8);
      // Stufen moderat: mit Doppelsprung sicher, mit Wallrun schneller.
      let y = 1.4, side = -1;
      for (let i = 0; i < 10; i++) {
        y += rng.range(1.35, 1.75);
        const z = -9 - ((i * 1.7 + rng.range(0, 1.4)) % 14);
        c.plat(side * rng.range(2.6, 3.8), y, z, rng.range(3.8, 4.8), 3.8,
          i % 3 === 0 ? 'accent' : 'solid');
        side *= -1;
      }
      c.light(0, 12, -16, 0x6f7bff, 2.0, 34);
      c.plat(0, 18, -26, 9, 7, 'accent');
      exitPad(c, 18, -30);
    },
  },

  {
    id: 'wall_corridor', name: 'Wallrun Corridor', length: 60, exitY: 0, weight: 2,
    build(c) {
      entryPad(c); pit(c, 60, 22, -5);
      // Zwei Abschnitte à ~20 m über dem Abgrund: nur per Wallrun zu schaffen.
      c.runWall(-5.2, -1, -17, 1.3, 12, 24);
      c.runWall(5.2, -1, -17, 1.3, 12, 24);
      c.plat(0, 0.6, -26, 5.5, 5, 'accent');          // Zwischenlandung
      c.runWall(-5.2, -0.4, -39, 1.3, 12, 24);
      c.runWall(5.2, -0.4, -39, 1.3, 12, 24);
      c.plat(0, 0, -52, 7, 7, 'solid');
      c.light(0, 6, -20, 0xb388ff, 1.6, 32);
      c.light(0, 6, -42, 0xb388ff, 1.6, 32);
      exitPad(c, 0, -60);
    },
  },

  // ------------------------------------------------------ WALLRUN: SEITENWAHL
  {
    id: 'wall_gap', name: 'Rift Span', length: 62, exitY: 0, weight: 2,
    build(c) {
      entryPad(c); pit(c, 62, 32, -6);
      // Links ODER rechts — die Zwischentritte liegen versetzt, man muss
      // also mindestens einmal die Seite wechseln.
      c.runWall(-6.0, -1, -30, 1.3, 13, 42);
      c.runWall(6.0, -1, -30, 1.3, 13, 42);
      c.plat(-4.4, 1.2, -24, 2.4, 2.4, 'accent');
      c.plat(4.4, 1.5, -36, 2.4, 2.4, 'accent');
      c.plat(0, 0, -54, 8, 8, 'solid');
      c.light(0, 7, -30, 0xb388ff, 1.8, 36);
      exitPad(c, 0, -62);
    },
  },

  // ---------------------------------------------------------------- TRAPS
  {
    id: 'trap_blinkers', name: 'Phase Traps', length: 56, exitY: 0, weight: 2,
    build(c, rng) {
      entryPad(c); pit(c, 56, 26, -4);
      for (let i = 0; i < 12; i++) {
        const z = -10 - i * 3.5;
        const x = (i % 3 - 1) * 2.6 + rng.range(-0.4, 0.4);
        c.blinker(x, rng.range(0, 1.0), z, 3.8, 3.8, { period: rng.range(2.8, 4.2), phase: rng(), onRatio: 0.68 });
        if (i % 4 === 2) c.plat(-x * 0.8, rng.range(0.4, 1.4), z - 1.4, 3.0, 3.0, 'solid');
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
      c.plat(7.5, 1.5, -15, 4.0, 4.0, 'accent');
      c.plat(9.2, 2.9, -20, 3.8, 3.8, 'accent');
      c.plat(7.5, 4.2, -25, 4.4, 4.4, 'accent');
      c.switchPad(7.5, 4.2, -25, doorId);
      c.light(7.5, 7, -25, 0xff9f1c, 1.6, 24);
      exitPad(c, 0, -52);
    },
  },

  // ---------------------------------------------------------------- MOVING
  {
    id: 'moving_platforms', name: 'Drift Platforms', length: 62, exitY: 3.4, weight: 3,
    build(c, rng) {
      entryPad(c); pit(c, 62, 30, -6);
      for (let i = 0; i < 8; i++) {
        const z = -12 - i * 5.4;
        const vertical = i % 3 === 2;
        c.moving(rng.range(-1.5, 1.5), 0.4 + i * 0.42, z, 4.8, 0.7, 4.8, {
          axis: vertical ? 'y' : 'x',
          amp: vertical ? rng.range(1.0, 1.8) : rng.range(1.8, 3.2),
          speed: rng.range(0.14, 0.26), phase: rng(),
        });
      }
      c.plat(0, 3.4, -56, 9, 8, 'solid');
      c.light(0, 8, -30, 0x6f7bff, 1.4, 34);
      exitPad(c, 3.4, -62);
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
      c.chaseWall(6, 22, 16, 12.5, -70, -12);   // parkt hinter dem Eingang, startet ab z -12
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
        y -= rng.range(1.2, 2.0);
        c.plat((i % 2 === 0 ? -1 : 1) * rng.range(1.5, 3.5), y, -10 - i * 4.4, rng.range(3.6, 4.8), 3.8,
          i % 3 === 1 ? 'accent' : 'solid');
      }
      c.plat(0, -14, -42, 9, 8, 'solid');
      exitPad(c, -14, -46);
    },
  },

  // ---------------------------------------------------------------- FINAL
  {
    id: 'final_room', name: 'Rift Core', length: 58, exitY: 8, weight: 1,
    build(c, rng) {
      entryPad(c); pit(c, 58, 40, -8);
      c.plat(0, 0, -16, 20, 18, 'solid');
      c.box(0, 0, -30, 6, 22, 6, 'accent');           // Kern-Säule
      for (let i = 0; i < 7; i++) {
        const a = i * 0.78;
        c.moving(Math.cos(a) * 4.4, 1.0 + i * 0.95, -30 + Math.sin(a) * 4.4, 5.2, 0.7, 5.2, {
          axis: 'x', amp: 2.0, speed: 0.18 + i * 0.02, phase: i / 7,
        });
      }
      c.moving(0, 3.0, -22, 3.4, 3.4, 1.0, { axis: 'x', amp: 6, speed: 0.35, kind: 'hazard' });
      c.plat(0, 8, -44, 13, 17, 'accent');
      c.light(0, 10, -30, 0x38f2c8, 2.4, 40);
      exitPad(c, 8, -58);
    },
  },

  // ---------------------------------------------------------------- BOSS
  {
    id: 'boss_arena', name: 'Rift Guardian', length: ARENA.length, exitY: 0, weight: 0, tag: 'boss',
    build(c) { return buildBossArena(c); },
  },

  // ------------------------------------------------- ENDSTRECKE (nach dem Portal)
  {
    id: 'final_run', name: 'Rift Descent', length: 104, exitY: 0, weight: 0, tag: 'final_run',
    build(c, rng) {
      entryPad(c, 11, 9);
      pit(c, 104, 34, -6);
      c.light(0, 6, -6, 0xb388ff, 1.8, 30);

      // 1) Bewegliche Plattformen über dem Abgrund
      for (let i = 0; i < 3; i++) {
        c.moving(i % 2 === 0 ? -3.5 : 3.5, 0.4, -14 - i * 8.5, 5.0, 0.7, 5.0,
          { axis: 'x', amp: 4.2, speed: 0.24, phase: i * 0.33 });
      }
      c.plat(0, 0.8, -42, 8, 7, 'accent');

      // 2) Schwingende Gefahrenbalken über einem schmalen Steg
      c.plat(0, 0.8, -54, 6.5, 20, 'solid');
      for (let i = 0; i < 3; i++) {
        c.moving(0, 1.0, -48 - i * 6, 3.0, 2.8, 1.0,
          { axis: 'x', amp: 4.0, speed: 0.32 + i * 0.05, phase: i * 0.4, kind: 'hazard' });
      }

      // 3) Wallrun-Passage über einer Lücke
      c.runWall(-4.6, 0, -72, 1.3, 12, 18);
      c.runWall(4.6, 0, -72, 1.3, 12, 18);
      c.plat(0, 1.4, -84, 6, 6, 'accent');
      c.light(0, 6, -72, 0xb388ff, 1.6, 28);

      // 4) Verschwindende Platten auf die Zielgerade
      for (let i = 0; i < 4; i++) {
        c.blinker((i % 2 === 0 ? -2.6 : 2.6), 1.6, -90 - i * 3.6, 3.2, 3.2,
          { period: 2.8 + i * 0.3, phase: rng(), onRatio: 0.66 });
      }
      c.plat(0, 1.6, -100, 9, 8, 'solid');
      exitPad(c, 0, -104);
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
