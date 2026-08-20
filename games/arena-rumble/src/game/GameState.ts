/**
 * The single source of truth for a match.
 *
 * The host owns an instance of this. Clients keep a mirror that is only ever
 * written from host messages — a client never promotes itself to FIGHTER or
 * decides that somebody died.
 */

export enum PlayerState {
  /** In the room, not yet spawned into the world. */
  CONNECTED = 'CONNECTED',
  /** Alive, walking around the grandstand in first person. */
  ALIVE_SPECTATOR = 'ALIVE_SPECTATOR',
  /** Alive, inside the arena, first person, holding this round's weapon. */
  FIGHTER = 'FIGHTER',
  /** Out of the match for good. Watches in third person. */
  ELIMINATED = 'ELIMINATED',
}

export enum MatchPhase {
  /** Waiting in the room for players / for the host to start. */
  LOBBY = 'LOBBY',
  /** Arena + grandstand are being built. */
  LOADING = 'LOADING',
  /** Fight card is on screen, fighters are already teleported. */
  ROUND_INTRO = 'ROUND_INTRO',
  /** 3 - 2 - 1. Fighters cannot move or shoot yet. */
  COUNTDOWN = 'COUNTDOWN',
  /** Live. */
  FIGHTING = 'FIGHTING',
  /** Somebody died, showing the result. */
  ROUND_END = 'ROUND_END',
  /** One player left standing. */
  CHAMPION = 'CHAMPION',
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerRecord {
  id: string;
  name: string;
  characterId: string;
  state: PlayerState;
  eliminated: boolean;
  health: number;
  /** Rounds this player has won. */
  wins: number;
  isHost: boolean;
  connected: boolean;

  // --- transform, mirrored from the owner and validated by the host
  position: Vec3;
  yaw: number;
  pitch: number;
  /** Horizontal speed, used to pick a locomotion animation for remote bodies. */
  speed: number;
  grounded: boolean;

  // --- combat, host authoritative
  ammo: number;
  reloadEndsAt: number;
  lastFireAt: number;
}

export interface RoundRecord {
  index: number;
  arenaId: string;
  weaponId: string;
  fighterA: string | null;
  fighterB: string | null;
  winnerId: string | null;
  loserId: string | null;
  /** Wall clock (host performance.now) at which the current phase ends. */
  phaseEndsAt: number;
  startedAt: number;
}

export interface MatchSnapshot {
  phase: MatchPhase;
  round: RoundRecord;
  players: PlayerRecord[];
  championId: string | null;
  previousArenaId: string | null;
}

export function createPlayerRecord(
  id: string,
  name: string,
  isHost: boolean,
  characterId: string,
): PlayerRecord {
  return {
    id,
    name,
    characterId,
    state: PlayerState.CONNECTED,
    eliminated: false,
    health: 100,
    wins: 0,
    isHost,
    connected: true,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    speed: 0,
    grounded: true,
    ammo: 0,
    reloadEndsAt: 0,
    lastFireAt: 0,
  };
}

export function createRoundRecord(): RoundRecord {
  return {
    index: 0,
    arenaId: '',
    weaponId: '',
    fighterA: null,
    fighterB: null,
    winnerId: null,
    loserId: null,
    phaseEndsAt: 0,
    startedAt: 0,
  };
}

/**
 * The mirror clients keep. Deliberately a plain object so it can be replaced
 * wholesale by an incoming snapshot without any reconciliation logic.
 */
export class GameState {
  phase: MatchPhase = MatchPhase.LOBBY;
  round: RoundRecord = createRoundRecord();
  players = new Map<string, PlayerRecord>();
  championId: string | null = null;
  previousArenaId: string | null = null;

  get list(): PlayerRecord[] {
    return [...this.players.values()];
  }

  get alive(): PlayerRecord[] {
    return this.list.filter((p) => !p.eliminated && p.connected);
  }

  get fighters(): PlayerRecord[] {
    return this.list.filter((p) => p.state === PlayerState.FIGHTER);
  }

  player(id: string | null | undefined): PlayerRecord | undefined {
    return id ? this.players.get(id) : undefined;
  }

  /** Players an eliminated spectator is allowed to follow. */
  spectatableIds(): string[] {
    const fighting = this.list
      .filter((p) => p.state === PlayerState.FIGHTER && p.connected)
      .map((p) => p.id);
    if (fighting.length) return fighting;
    return this.list
      .filter((p) => !p.eliminated && p.connected)
      .map((p) => p.id);
  }

  toSnapshot(): MatchSnapshot {
    return {
      phase: this.phase,
      round: { ...this.round },
      players: this.list.map((p) => ({ ...p, position: { ...p.position } })),
      championId: this.championId,
      previousArenaId: this.previousArenaId,
    };
  }

  applySnapshot(snapshot: MatchSnapshot): void {
    this.phase = snapshot.phase;
    this.round = { ...snapshot.round };
    this.championId = snapshot.championId;
    this.previousArenaId = snapshot.previousArenaId;

    const seen = new Set<string>();
    for (const incoming of snapshot.players) {
      seen.add(incoming.id);
      const existing = this.players.get(incoming.id);
      if (existing) {
        Object.assign(existing, incoming, { position: { ...incoming.position } });
      } else {
        this.players.set(incoming.id, {
          ...incoming,
          position: { ...incoming.position },
        });
      }
    }
    for (const id of [...this.players.keys()]) {
      if (!seen.has(id)) this.players.delete(id);
    }
  }
}
