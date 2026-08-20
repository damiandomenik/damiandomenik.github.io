import { ARENAS, arenaById, type ArenaDefinition } from '../config/arenas';
import { weaponsForClass, type WeaponDefinition } from '../config/weapons';
import { GAME_CONFIG } from '../config/gameConfig';
import { Random } from '../core/Random';
import { MatchPhase, PlayerState, type GameState, type PlayerRecord } from './GameState';

export interface RoundPlan {
  arena: ArenaDefinition;
  weapon: WeaponDefinition;
  fighters: [PlayerRecord, PlayerRecord];
}

/**
 * Picks what happens next. Host only.
 *
 * The MVP draw is pure random over everyone still in the match, exactly as
 * specified — including the case where the previous winner is drawn again
 * immediately. `fighterWeight` exists so a "cool down after fighting" rule can
 * be added later without touching the selection code itself.
 */
export class RoundManager {
  private random: Random;

  constructor(
    private state: GameState,
    seed?: number,
  ) {
    this.random = new Random(seed);
  }

  /** Everyone who may still be drawn. */
  eligible(): PlayerRecord[] {
    return this.state.list.filter((p) => !p.eliminated && p.connected);
  }

  canStartRound(): boolean {
    return this.eligible().length >= GAME_CONFIG.minPlayersToStart;
  }

  /** Exactly one player left standing means the match is over. */
  championId(): string | null {
    const remaining = this.eligible();
    return remaining.length === 1 ? remaining[0].id : null;
  }

  plan(): RoundPlan | null {
    const pool = this.eligible();
    if (pool.length < 2) return null;

    const arena = this.pickArena();
    const weapon = this.pickWeapon(arena);
    const fighters = this.pickFighters(pool);
    return { arena, weapon, fighters };
  }

  private pickArena(): ArenaDefinition {
    const previous = this.state.previousArenaId;
    const options = ARENAS.length > 1 ? ARENAS.filter((a) => a.id !== previous) : ARENAS;
    return this.random.pick(options.length ? options : ARENAS);
  }

  private pickWeapon(arena: ArenaDefinition): WeaponDefinition {
    const pool = weaponsForClass(arena.weaponClass);
    const options = pool.length ? pool : weaponsForClass('any');
    // Avoid repeating the same weapon back to back when there is a choice.
    const filtered = options.filter((w) => w.id !== this.state.round.weaponId);
    return this.random.pick(filtered.length ? filtered : options);
  }

  private pickFighters(pool: PlayerRecord[]): [PlayerRecord, PlayerRecord] {
    const first = this.random.pickWeighted(pool, fighterWeight);
    const rest = pool.filter((p) => p.id !== first.id);
    const second = this.random.pickWeighted(rest, fighterWeight);
    return [first, second];
  }

  /** Apply a plan to the state. Does not move anybody; the caller spawns them. */
  beginRound(plan: RoundPlan, now: number): void {
    const round = this.state.round;
    this.state.previousArenaId = round.arenaId || null;

    round.index += 1;
    round.arenaId = plan.arena.id;
    round.weaponId = plan.weapon.id;
    round.fighterA = plan.fighters[0].id;
    round.fighterB = plan.fighters[1].id;
    round.winnerId = null;
    round.loserId = null;
    round.startedAt = now;
    round.phaseEndsAt = now + GAME_CONFIG.round.introSeconds * 1000;

    for (const player of this.state.list) {
      if (player.eliminated) {
        player.state = PlayerState.ELIMINATED;
        continue;
      }
      const isFighter = player.id === round.fighterA || player.id === round.fighterB;
      player.state = isFighter ? PlayerState.FIGHTER : PlayerState.ALIVE_SPECTATOR;
      player.health = GAME_CONFIG.player.maxHealth;
      player.ammo = isFighter ? plan.weapon.magazineSize : 0;
      player.reloadEndsAt = 0;
      player.lastFireAt = 0;
    }

    this.state.phase = MatchPhase.ROUND_INTRO;
  }

  /** Records the outcome and eliminates the loser. */
  finishRound(loserId: string, now: number): { winnerId: string | null } {
    const round = this.state.round;
    const loser = this.state.player(loserId);
    const winnerId = round.fighterA === loserId ? round.fighterB : round.fighterA;
    const winner = this.state.player(winnerId);

    if (loser) {
      loser.eliminated = true;
      loser.state = PlayerState.ELIMINATED;
      loser.health = 0;
    }
    if (winner) {
      winner.wins += 1;
      winner.state = PlayerState.ALIVE_SPECTATOR;
      winner.health = GAME_CONFIG.player.maxHealth;
      winner.ammo = 0;
    }

    round.loserId = loserId;
    round.winnerId = winnerId ?? null;
    round.phaseEndsAt = now + GAME_CONFIG.round.roundEndSeconds * 1000;
    this.state.phase = MatchPhase.ROUND_END;

    return { winnerId: winnerId ?? null };
  }

  /** Arena definition for whatever round is current. */
  currentArena(): ArenaDefinition | undefined {
    return arenaById(this.state.round.arenaId);
  }
}

/**
 * Pure random for the MVP: every eligible player has the same weight.
 * A future rule ("just fought" -> 0.4) plugs in right here.
 */
function fighterWeight(_player: PlayerRecord): number {
  return 1;
}
