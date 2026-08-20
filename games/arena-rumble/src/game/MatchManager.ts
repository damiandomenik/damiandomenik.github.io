import * as THREE from 'three';
import {
  GameState,
  MatchPhase,
  PlayerState,
  createPlayerRecord,
  type PlayerRecord,
} from './GameState';
import { RoundManager } from './RoundManager';
import { DamageSystem } from '../combat/DamageSystem';
import { GAME_CONFIG } from '../config/gameConfig';
import { arenaById } from '../config/arenas';
import { weaponById } from '../config/weapons';
import type { HostMessage } from '../network/NetworkMessages';
import type { SpawnManager } from '../arena/SpawnManager';

export type Dispatch = (message: HostMessage, toPeerId?: string) => void;

export interface MatchHooks {
  /** Ask the presentation layer to load an arena; resolves when it is ready. */
  loadArena: (arenaId: string) => Promise<void>;
  /** Where players should be placed once the world exists. */
  spawns: () => SpawnManager;
  now: () => number;
}

/**
 * The host's brain.
 *
 * Owns the authoritative `GameState`, walks the phase machine, and is the only
 * thing in the codebase allowed to change who is a FIGHTER, who is
 * ELIMINATED, and how much health anybody has.
 */
export class MatchManager {
  readonly state = new GameState();
  readonly rounds: RoundManager;
  readonly damage: DamageSystem;

  private loading = false;
  private tickAccumulator = 0;
  private snapshotAccumulator = 0;
  private tickCount = 0;

  constructor(
    private dispatch: Dispatch,
    private hooks: MatchHooks,
    seed?: number,
  ) {
    this.rounds = new RoundManager(this.state, seed);
    this.damage = new DamageSystem(this.state);
  }

  // ------------------------------------------------------------- roster

  addPlayer(id: string, name: string, isHost: boolean, characterId: string): PlayerRecord {
    const record = createPlayerRecord(id, uniqueName(this.state, name), isHost, characterId);
    this.state.players.set(id, record);
    return record;
  }

  removePlayer(id: string): void {
    const record = this.state.player(id);
    if (!record) return;

    record.connected = false;

    if (this.state.phase === MatchPhase.LOBBY) {
      this.state.players.delete(id);
      this.pushMatchUpdate();
      return;
    }

    // Leaving mid match counts as elimination, otherwise the round can never
    // resolve and the match would stall forever.
    if (!record.eliminated) {
      record.eliminated = true;
      record.state = PlayerState.ELIMINATED;
      this.systemMessage(`${record.name} left the match.`, 'warn');
      if (this.isFighter(id) && this.state.phase === MatchPhase.FIGHTING) {
        this.concludeRound(id);
        return;
      }
    }
    this.pushMatchUpdate();
  }

  private isFighter(id: string): boolean {
    return this.state.round.fighterA === id || this.state.round.fighterB === id;
  }

  // -------------------------------------------------------------- start

  canStart(): boolean {
    return (
      this.state.phase === MatchPhase.LOBBY &&
      this.state.list.filter((p) => p.connected).length >= GAME_CONFIG.minPlayersToStart
    );
  }

  startMatch(): void {
    if (!this.canStart()) return;
    for (const player of this.state.list) {
      player.eliminated = false;
      player.wins = 0;
      player.health = GAME_CONFIG.player.maxHealth;
      player.state = PlayerState.ALIVE_SPECTATOR;
    }
    this.state.championId = null;
    this.state.round.index = 0;
    void this.beginNextRound();
  }

  /** Debug hook: force a specific arena / weapon next round. */
  forceNextRound(arenaId?: string, weaponId?: string): void {
    if (arenaId) this.state.previousArenaId = null;
    void this.beginNextRound(arenaId, weaponId);
  }

  // ------------------------------------------------------------- rounds

  private async beginNextRound(forceArenaId?: string, forceWeaponId?: string): Promise<void> {
    if (this.loading) return;

    const champion = this.rounds.championId();
    if (champion && this.state.round.index > 0) {
      this.declareChampion(champion);
      return;
    }

    const plan = this.rounds.plan();
    if (!plan) {
      this.state.phase = MatchPhase.LOBBY;
      this.systemMessage('Not enough players left to run a round.', 'warn');
      this.pushMatchUpdate();
      return;
    }

    if (forceArenaId) {
      const arena = arenaById(forceArenaId);
      if (arena) plan.arena = arena;
    }
    if (forceWeaponId) {
      const weapon = weaponById(forceWeaponId);
      if (weapon) plan.weapon = weapon;
    }

    this.loading = true;
    this.state.phase = MatchPhase.LOADING;
    this.pushMatchUpdate();
    this.dispatch({
      type: 'round_event',
      event: 'loading',
      roundIndex: this.state.round.index + 1,
      arenaId: plan.arena.id,
      weaponId: plan.weapon.id,
      fighterA: plan.fighters[0].id,
      fighterB: plan.fighters[1].id,
      winnerId: null,
      loserId: null,
      durationMs: 0,
    });

    try {
      await this.hooks.loadArena(plan.arena.id);
    } catch (err) {
      console.error('[MatchManager] arena load failed', err);
      this.systemMessage(`Could not load ${plan.arena.name}.`, 'warn');
      this.loading = false;
      this.state.phase = MatchPhase.LOBBY;
      this.pushMatchUpdate();
      return;
    }
    this.loading = false;

    const now = this.hooks.now();
    this.rounds.beginRound(plan, now);
    this.placeEveryone();
    this.pushMatchUpdate();

    this.dispatch({
      type: 'round_event',
      event: 'intro',
      roundIndex: this.state.round.index,
      arenaId: plan.arena.id,
      weaponId: plan.weapon.id,
      fighterA: plan.fighters[0].id,
      fighterB: plan.fighters[1].id,
      winnerId: null,
      loserId: null,
      durationMs: GAME_CONFIG.round.introSeconds * 1000,
    });
  }

  /** Puts fighters in the arena and everybody else on the terraces. */
  private placeEveryone(): void {
    const spawns = this.hooks.spawns();
    const [spawnA, spawnB] = spawns.fighterPair();

    let terraceIndex = 0;
    for (const player of this.state.list) {
      if (player.id === this.state.round.fighterA) {
        applySpawn(player, spawnA.position, spawnA.yaw);
      } else if (player.id === this.state.round.fighterB) {
        applySpawn(player, spawnB.position, spawnB.yaw);
      } else {
        const spawn = spawns.spectatorSpawn(terraceIndex++);
        applySpawn(player, spawn.position, spawn.yaw);
      }
      this.dispatch({
        type: 'player_state',
        playerId: player.id,
        state: player.state,
        position: { ...player.position },
        yaw: player.yaw,
      });
    }
  }

  private declareChampion(championId: string): void {
    this.state.championId = championId;
    this.state.phase = MatchPhase.CHAMPION;
    const champion = this.state.player(championId);
    this.pushMatchUpdate();
    this.dispatch({
      type: 'round_event',
      event: 'champion',
      roundIndex: this.state.round.index,
      arenaId: this.state.round.arenaId,
      weaponId: this.state.round.weaponId,
      fighterA: null,
      fighterB: null,
      winnerId: championId,
      loserId: null,
      durationMs: 0,
    });
    if (champion) this.systemMessage(`${champion.name} is the champion.`, 'info');
  }

  /** Ends the round because `loserId` died or left. */
  concludeRound(loserId: string): void {
    if (this.state.phase !== MatchPhase.FIGHTING && this.state.phase !== MatchPhase.COUNTDOWN) {
      return;
    }
    const now = this.hooks.now();
    const { winnerId } = this.rounds.finishRound(loserId, now);

    this.pushMatchUpdate();
    this.dispatch({
      type: 'round_event',
      event: 'end',
      roundIndex: this.state.round.index,
      arenaId: this.state.round.arenaId,
      weaponId: this.state.round.weaponId,
      fighterA: this.state.round.fighterA,
      fighterB: this.state.round.fighterB,
      winnerId,
      loserId,
      durationMs: GAME_CONFIG.round.roundEndSeconds * 1000,
    });
  }

  // ---------------------------------------------------------------- tick

  update(dt: number): void {
    const now = this.hooks.now();

    this.tickAccumulator += dt;
    const tickInterval = 1 / GAME_CONFIG.tickRate;
    while (this.tickAccumulator >= tickInterval) {
      this.tickAccumulator -= tickInterval;
      this.tickCount++;
      this.advancePhase(now);
    }

    this.snapshotAccumulator += dt;
    const snapshotInterval = 1 / GAME_CONFIG.snapshotRate;
    if (this.snapshotAccumulator >= snapshotInterval) {
      this.snapshotAccumulator = 0;
      this.broadcastWorldSnapshot(now);
    }
  }

  private advancePhase(now: number): void {
    const round = this.state.round;

    switch (this.state.phase) {
      case MatchPhase.ROUND_INTRO:
        if (now >= round.phaseEndsAt) {
          this.state.phase = MatchPhase.COUNTDOWN;
          round.phaseEndsAt = now + GAME_CONFIG.round.countdownSeconds * 1000;
          this.pushMatchUpdate();
          this.dispatch(this.roundEvent('countdown', GAME_CONFIG.round.countdownSeconds * 1000));
        }
        break;

      case MatchPhase.COUNTDOWN:
        if (now >= round.phaseEndsAt) {
          this.state.phase = MatchPhase.FIGHTING;
          round.startedAt = now;
          round.phaseEndsAt = now + GAME_CONFIG.round.maxRoundSeconds * 1000;
          this.pushMatchUpdate();
          this.dispatch(this.roundEvent('fight', 0));
        }
        break;

      case MatchPhase.FIGHTING: {
        // Safety valve: if two people hide from each other forever, the player
        // with less health loses so the show goes on.
        if (now >= round.phaseEndsAt) {
          const a = this.state.player(round.fighterA);
          const b = this.state.player(round.fighterB);
          if (a && b) {
            this.systemMessage('Time limit reached.', 'warn');
            this.concludeRound(a.health <= b.health ? a.id : b.id);
          }
        }
        break;
      }

      case MatchPhase.ROUND_END:
        if (now >= round.phaseEndsAt) {
          const champion = this.rounds.championId();
          if (champion) this.declareChampion(champion);
          else void this.beginNextRound();
        }
        break;

      default:
        break;
    }
  }

  private roundEvent(
    event: 'intro' | 'countdown' | 'fight' | 'end' | 'champion' | 'loading',
    durationMs: number,
  ): HostMessage {
    const round = this.state.round;
    return {
      type: 'round_event',
      event,
      roundIndex: round.index,
      arenaId: round.arenaId,
      weaponId: round.weaponId,
      fighterA: round.fighterA,
      fighterB: round.fighterB,
      winnerId: round.winnerId,
      loserId: round.loserId,
      durationMs,
    };
  }

  private broadcastWorldSnapshot(now: number): void {
    this.dispatch({
      type: 'world_snapshot',
      tick: this.tickCount,
      serverTime: now,
      players: this.state.list.map((player) => ({
        id: player.id,
        p: [player.position.x, player.position.y, player.position.z],
        y: player.yaw,
        pi: player.pitch,
        s: player.speed,
        g: player.grounded,
        h: player.health,
        st: player.state,
      })),
    });
  }

  pushMatchUpdate(toPeerId?: string): void {
    this.dispatch(
      {
        type: 'match_update',
        snapshot: this.state.toSnapshot(),
        serverTime: this.hooks.now(),
      },
      toPeerId,
    );
  }

  systemMessage(message: string, tone: 'info' | 'kill' | 'warn'): void {
    this.dispatch({ type: 'system', message, tone });
  }

  /** True while the fighters are allowed to act. */
  get combatLive(): boolean {
    return this.state.phase === MatchPhase.FIGHTING;
  }
}

function applySpawn(player: PlayerRecord, position: THREE.Vector3, yaw: number): void {
  player.position = { x: position.x, y: position.y, z: position.z };
  player.yaw = yaw;
  player.pitch = 0;
  player.speed = 0;
  player.grounded = true;
}

function uniqueName(state: GameState, wanted: string): string {
  const base = wanted.trim().slice(0, 14) || 'Player';
  const taken = new Set(state.list.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 20; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Math.floor(Math.random() * 900 + 100)}`;
}
