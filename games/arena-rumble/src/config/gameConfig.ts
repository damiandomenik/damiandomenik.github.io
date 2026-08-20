/**
 * Every number a designer might want to touch lives here.
 * Nothing in the rendering or networking layer hard codes these values.
 */
export const GAME_CONFIG = {
  /** Hard player ceiling. The whole netcode is tuned for this number. */
  maxPlayers: 8,
  minPlayersToStart: 2,

  /** Simulation. */
  tickRate: 30, // authoritative host ticks per second
  snapshotRate: 20, // world snapshots sent to clients per second
  inputRate: 30, // client -> host state messages per second
  interpolationDelayMs: 110, // render remote players this far in the past

  player: {
    maxHealth: 100,
    eyeHeight: 1.62,
    height: 1.8,
    radius: 0.34,
    walkSpeed: 5.2,
    sprintSpeed: 8.0,
    airControl: 0.32,
    acceleration: 60,
    friction: 11,
    jumpVelocity: 6.4,
    gravity: -21.0,
    /** Anything faster than this over one network step is rejected by the host. */
    maxValidatedSpeed: 14.0,
    mouseSensitivity: 0.0022,
  },

  round: {
    introSeconds: 4.5, // fight card is on screen
    countdownSeconds: 3,
    roundEndSeconds: 5,
    transitionSeconds: 1.0,
    /** Safety valve so a stalemate cannot hang the match forever. */
    maxRoundSeconds: 240,
  },

  spectator: {
    followDistance: 5.2,
    followHeight: 2.1,
    smoothing: 6.5,
    minDistance: 1.1,
  },

  grandstand: {
    tiers: 7,
    stepHeight: 0.62,
    stepDepth: 1.15,
    /** Gap between the arena bounds and the first barrier. */
    margin: 3.4,
    seatSpacing: 1.05,
    barrierHeight: 2.2,
  },

  network: {
    /** Room codes are generated from this alphabet (no look-alike glyphs). */
    codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    codeLength: 6,
    /** Prefix keeps us from colliding with other apps on the public broker. */
    peerPrefix: 'arena-rumble-',
    reconnectAttempts: 4,
    reconnectDelayMs: 1200,
    connectionTimeoutMs: 15000,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;
