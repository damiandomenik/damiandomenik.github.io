import type { MatchSnapshot, PlayerState, Vec3 } from '../game/GameState';

/**
 * Host <-> client wire format.
 *
 * Everything is JSON. With 8 players at 20 Hz that is a few kB/s per peer,
 * which a DataChannel handles comfortably; a binary format would be premature
 * optimisation at this scale.
 */

// ---------------------------------------------------------------- client -> host

export interface JoinRequest {
  type: 'join_request';
  name: string;
  characterId: string;
  protocol: number;
}

/**
 * The client simulates its own movement and reports the result. The host
 * validates plausibility (see HostAuthority.validateMove) rather than
 * re-simulating, which keeps the MVP honest about what it does: the host is
 * authoritative over the *match*, and treats movement as untrusted-but-checked.
 */
export interface PlayerInput {
  type: 'player_input';
  sequence: number;
  movement: { forward: boolean; backward: boolean; left: boolean; right: boolean };
  jump: boolean;
  sprint: boolean;
  rotation: { yaw: number; pitch: number };
  position: Vec3;
  speed: number;
  grounded: boolean;
  fire: boolean;
  reload: boolean;
}

export interface FireRequest {
  type: 'fire_request';
  sequence: number;
  origin: Vec3;
  direction: Vec3;
  /** Which weapon the client thinks it is holding — the host checks this. */
  weaponId: string;
}

export interface ReloadRequest {
  type: 'reload_request';
}

export interface StartMatchRequest {
  type: 'start_match_request';
}

export interface PingMessage {
  type: 'ping';
  t: number;
}

// ---------------------------------------------------------------- host -> client

export interface JoinAccepted {
  type: 'join_accepted';
  playerId: string;
  hostId: string;
  protocol: number;
  snapshot: MatchSnapshot;
}

export interface JoinRejected {
  type: 'join_rejected';
  reason: 'full' | 'in_progress' | 'protocol' | 'duplicate';
  message: string;
}

/** Full match state. Sent on every important transition. */
export interface MatchUpdate {
  type: 'match_update';
  snapshot: MatchSnapshot;
  /** Host clock at send time, so clients can align phase timers. */
  serverTime: number;
}

/** High frequency transform-only update. */
export interface WorldSnapshot {
  type: 'world_snapshot';
  tick: number;
  serverTime: number;
  players: Array<{
    id: string;
    p: [number, number, number];
    y: number;
    pi: number;
    s: number;
    g: boolean;
    h: number;
    st: PlayerState;
  }>;
}

export interface FireEvent {
  type: 'fire_event';
  shooterId: string;
  weaponId: string;
  origin: Vec3;
  /** One entry per pellet, already resolved by the host. */
  hits: Array<{ point: Vec3; targetId: string | null }>;
}

export interface DamageEvent {
  type: 'damage_event';
  targetId: string;
  attackerId: string;
  amount: number;
  healthAfter: number;
  fatal: boolean;
}

export interface AmmoUpdate {
  type: 'ammo_update';
  playerId: string;
  ammo: number;
  reloadEndsAt: number;
  serverTime: number;
}

export interface RoundEvent {
  type: 'round_event';
  event: 'intro' | 'countdown' | 'fight' | 'end' | 'champion' | 'loading';
  roundIndex: number;
  arenaId: string;
  weaponId: string;
  fighterA: string | null;
  fighterB: string | null;
  winnerId: string | null;
  loserId: string | null;
  durationMs: number;
}

export interface PlayerStateChanged {
  type: 'player_state';
  playerId: string;
  state: PlayerState;
  position: Vec3;
  yaw: number;
}

export interface ChatOrSystem {
  type: 'system';
  message: string;
  tone: 'info' | 'kill' | 'warn';
}

export interface PongMessage {
  type: 'pong';
  t: number;
}

export interface HostClosing {
  type: 'host_closing';
  reason: string;
}

export type ClientMessage =
  | JoinRequest
  | PlayerInput
  | FireRequest
  | ReloadRequest
  | StartMatchRequest
  | PingMessage;

export type HostMessage =
  | JoinAccepted
  | JoinRejected
  | MatchUpdate
  | WorldSnapshot
  | FireEvent
  | DamageEvent
  | AmmoUpdate
  | RoundEvent
  | PlayerStateChanged
  | ChatOrSystem
  | PongMessage
  | HostClosing;

export type NetMessage = ClientMessage | HostMessage;

/** Bump when the message shape changes so old tabs get a clear rejection. */
export const PROTOCOL_VERSION = 3;
