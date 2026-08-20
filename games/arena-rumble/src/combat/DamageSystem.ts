import type { GameState, PlayerRecord } from '../game/GameState';
import { PlayerState } from '../game/GameState';

export interface DamageResult {
  targetId: string;
  attackerId: string;
  amount: number;
  healthAfter: number;
  fatal: boolean;
}

/**
 * The only place health is ever written. Runs on the host, never on a client:
 * a client saying "I killed player 4" has no effect anywhere in the codebase.
 */
export class DamageSystem {
  constructor(private state: GameState) {}

  apply(targetId: string, attackerId: string, amount: number): DamageResult | null {
    const target = this.state.player(targetId);
    if (!target) return null;
    if (target.state !== PlayerState.FIGHTER) return null; // spectators are untouchable
    if (target.health <= 0) return null;
    if (targetId === attackerId) return null; // no self damage in the MVP

    const damage = Math.max(0, Math.round(amount));
    target.health = Math.max(0, target.health - damage);

    return {
      targetId,
      attackerId,
      amount: damage,
      healthAfter: target.health,
      fatal: target.health <= 0,
    };
  }

  reset(player: PlayerRecord, maxHealth: number): void {
    player.health = maxHealth;
  }
}
