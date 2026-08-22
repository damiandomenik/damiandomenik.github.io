import * as THREE from 'three';

/**
 * Wiederverwendbares Spielerfarben-System.
 * Die Palette ist beliebig erweiterbar; Zuweisung wahlweise über einen Index
 * (Beitrittsreihenfolge) oder deterministisch über die Spieler-ID.
 */
export const PLAYER_PALETTE = [
  { key: 'blue',   primary: 0x4c9dff },
  { key: 'orange', primary: 0xff9f2e },
  { key: 'purple', primary: 0xb388ff },
  { key: 'green',  primary: 0x5ce68a },
  { key: 'cyan',   primary: 0x38f2c8 },
  { key: 'pink',   primary: 0xff6ba8 },
  { key: 'yellow', primary: 0xffd34d },
  { key: 'red',    primary: 0xff5a5a },
];

export function playerColorByIndex(i) {
  return PLAYER_PALETTE[((i % PLAYER_PALETTE.length) + PLAYER_PALETTE.length) % PLAYER_PALETTE.length].primary;
}

export function playerColorForId(id) {
  let h = 2166136261 >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return playerColorByIndex(h >>> 0);
}

/** Freie Farbe wählen, die noch niemand benutzt (für lokale Eindeutigkeit). */
export function pickFreeColor(usedColors, preferred) {
  const used = new Set(usedColors);
  if (preferred != null && !used.has(preferred)) return preferred;
  for (const p of PLAYER_PALETTE) if (!used.has(p.primary)) return p.primary;
  return preferred ?? playerColorByIndex(used.size);
}

const _c = new THREE.Color();

/**
 * Leitet aus einer Primärfarbe die komplette Material-Palette einer Figur ab:
 * dunkler Sekundärton, heller Visor, Energiekern und Rim-Akzent.
 */
export function derivePalette(primary) {
  _c.set(primary);
  const hsl = { h: 0, s: 0, l: 0 };
  _c.getHSL(hsl);
  const suit = new THREE.Color().setHSL(hsl.h, hsl.s * 0.85, Math.min(0.62, hsl.l));
  const dark = new THREE.Color().setHSL(hsl.h, hsl.s * 0.35, 0.11);
  const visor = new THREE.Color().setHSL((hsl.h + 0.02) % 1, Math.min(1, hsl.s * 1.1 + 0.15), 0.62);
  const core = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.2), 0.66);
  const rim = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.1), 0.55);
  return { primary: suit, dark, visor, core, rim, raw: primary };
}
