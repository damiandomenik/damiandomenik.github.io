/**
 * Zentrale Konfiguration.
 * Alle Movement-Werte sind hier gebündelt und können live getunt werden
 * (window.RIFT_CONFIG im Browser).
 */
export const CONFIG = {
  // ---------- Player Dimensionen ----------
  PLAYER_RADIUS: 0.40,
  PLAYER_HEIGHT: 1.80,
  CROUCH_HEIGHT: 1.05,

  // ---------- Movement ----------
  PLAYER_SPEED: 9.5,
  SPRINT_SPEED: 15.0,
  CROUCH_SPEED: 4.5,
  ACCEL_GROUND: 95,
  ACCEL_AIR: 44,          // wird mit AIR_CONTROL skaliert
  FRICTION_GROUND: 11,
  FRICTION_SLIDE: 1.35,
  FRICTION_AIR: 0.35,

  JUMP_FORCE: 11.4,
  DOUBLE_JUMP_FORCE: 10.2,
  GRAVITY: 30.0,
  MAX_FALL_SPEED: 60,
  COYOTE_TIME: 0.12,
  JUMP_BUFFER: 0.14,

  WALLRUN_SPEED: 15.5,
  WALLRUN_GRAVITY: 4.5,
  WALLRUN_MAX_TIME: 1.7,
  WALLRUN_MIN_SPEED: 5.0,
  WALLRUN_STICK: 7.0,
  WALLRUN_UPKICK: 3.2,
  WALLRUN_COOLDOWN: 0.22,

  WALLJUMP_FORCE: 11.5,
  WALLJUMP_PUSH: 11.0,
  WALLJUMP_LOCK: 0.22,    // Luftsteuerung kurz gedämpft, sonst hebt sie den Absprung auf

  DASH_FORCE: 34.0,
  DASH_TIME: 0.16,
  DASH_COOLDOWN: 1.35,
  DASH_AIR_CHARGES: 1,

  AIR_CONTROL: 0.85,      // Anteil der Luft-Beschleunigung (Richtungskontrolle)
  SLIDE_SPEED: 19.0,
  SLIDE_TIME: 1.15,
  SLIDE_MIN_SPEED: 7.5,
  SLIDE_COOLDOWN: 0.35,
  SLIDE_SLOPE_BOOST: 8.0,

  // ---------- Kampf / Abilities ----------
  PUNCH_RANGE: 3.0,
  PUNCH_ARC: 0.72,          // dot-Threshold (cos)
  PUNCH_COOLDOWN: 1.2,
  PUNCH_KNOCKBACK: 15.0,
  PUNCH_KNOCKBACK_UP: 5.5,
  PUNCH_STUN: 0.22,

  // ---------- Welt ----------
  KILL_Y: -30,            // relativ zum letzten Checkpoint (Dungeon kann absteigen!)
  RESPAWN_TIME: 0.7,

  // ---------- Kamera ----------
  CAM_DISTANCE: 5.4,       // näher dran: die Figur soll lesbar animiert sein
  CAM_HEIGHT: 1.55,
  CAM_LERP: 14,
  CAM_FOLLOW_Y: 16,        // nur die Höhe wird geglättet; X/Z folgen starr
  CAM_MIN_DISTANCE: 1.1,
  CAM_FOV: 72,
  CAM_FOV_SPRINT: 84,
  CAM_FOV_DASH: 92,
  MOUSE_SENSITIVITY: 0.0023,
  PITCH_MIN: -1.15,
  PITCH_MAX: 1.05,

  // ---------- Netzwerk ----------
  NET_TICK_RATE: 20,        // State-Pakete pro Sekunde
  NET_INTERP_DELAY: 0.12,   // Snapshot-Interpolation Buffer (s)
  NET_SNAPSHOT_BUFFER: 24,
  MAX_PLAYERS: 8,

  // ---------- Match ----------
  COUNTDOWN_SECONDS: 3,
  BOSS_TIME_BONUS: 2500,   // Zeitgutschrift für den ersten Treffer am Boss-Kern
  FINISH_GRACE_SECONDS: 45,   // Nachlaufzeit, nachdem der erste Spieler im Ziel ist
  ROOM_COUNT: 9,            // Anzahl Rooms zwischen Start und Finish

  // ---------- Licht ----------
  // three.js r155+ rechnet physikalisch korrekt: PointLight-Intensitäten sind
  // Candela und fallen quadratisch ab. Die Room-Werte werden damit skaliert,
  // sonst sind die Lichter faktisch unsichtbar.
  LIGHT_POWER: 25,
  MAX_POINT_LIGHTS: 10,
  CHARACTER_BUILD: 'runner',  // 'runner' | 'agile' | 'heavy'
  GROUND_RING: false,         // Leuchtring unter der Figur  // 'runner' | 'agile' | 'heavy'
  SHADOWS: true,           // weiche Schatten (RIFT_CONFIG.SHADOWS + game.setShadows())

  // ---------- Debug ----------
  DEBUG: false,
};

export const COLORS = {
  bg: 0x05070d,
  fog: 0x070b14,
  solid: 0x2b3550,
  accent: 0x38f2c8,
  accent2: 0x6f7bff,
  danger: 0xff4d6d,
  checkpoint: 0x38f2c8,
  goal: 0xffd166,
  switchOn: 0x38f2c8,
  switchOff: 0xff9f1c,
  risk: 0xff9f1c,
  safe: 0x4cc9f0,
};

// Spielerfarben liegen in player/PlayerColors.js (PLAYER_PALETTE) —
// dort auch die Ableitung von Anzug-, Visor- und Kernfarbe.

if (typeof window !== 'undefined') window.RIFT_CONFIG = CONFIG;
