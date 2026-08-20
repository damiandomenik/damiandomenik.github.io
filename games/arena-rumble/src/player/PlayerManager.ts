import * as THREE from 'three';
import { Player, makeNameplate } from './Player';
import type { CharacterLoader } from '../assets/CharacterLoader';
import type { WeaponLoader } from '../assets/WeaponLoader';
import type { GameState, PlayerRecord } from '../game/GameState';
import { PlayerState } from '../game/GameState';
import { weaponById } from '../config/weapons';
import { GAME_CONFIG } from '../config/gameConfig';

/**
 * Keeps the scene's set of remote bodies in sync with the authoritative player
 * list. The local player is deliberately excluded — they are always in first
 * person and would only ever see the inside of their own head.
 */
export class PlayerManager {
  private players = new Map<string, Player>();
  private pending = new Set<string>();
  private equippedWeapon = new Map<string, string>();

  constructor(
    private scene: THREE.Scene,
    private characters: CharacterLoader,
    private weapons: WeaponLoader,
    private localId: () => string | null,
  ) {}

  get all(): Player[] {
    return [...this.players.values()];
  }

  get(id: string): Player | undefined {
    return this.players.get(id);
  }

  /** Reconciles the avatar set against the authoritative records. */
  sync(state: GameState): void {
    const local = this.localId();

    for (const record of state.list) {
      if (record.id === local) continue;
      if (this.players.has(record.id) || this.pending.has(record.id)) {
        const player = this.players.get(record.id);
        if (player) {
          player.name = record.name;
          player.state = record.state;
          player.health = record.health;
          player.setVisible(record.connected);
        }
        continue;
      }
      void this.spawn(record);
    }

    for (const [id, player] of [...this.players]) {
      if (!state.players.has(id) || id === local) {
        player.dispose();
        this.players.delete(id);
        this.equippedWeapon.delete(id);
      }
    }
  }

  private async spawn(record: PlayerRecord): Promise<void> {
    this.pending.add(record.id);
    try {
      const player = new Player(record.id, record.name);
      const character = await this.characters.create(record.characterId);
      player.attachCharacter(character);
      player.attachNameplate(makeNameplate(record.name));
      player.state = record.state;
      player.snapTo(
        new THREE.Vector3(record.position.x, record.position.y, record.position.z),
        record.yaw,
      );

      this.scene.add(player.root);
      this.players.set(record.id, player);
    } catch (err) {
      console.error('[PlayerManager] could not spawn', record.name, err);
    } finally {
      this.pending.delete(record.id);
    }
  }

  /** Give the two fighters this round's weapon, take it away from everyone else. */
  async syncWeapons(state: GameState): Promise<void> {
    const weaponId = state.round.weaponId;
    for (const player of this.players.values()) {
      const record = state.player(player.id);
      const shouldHold =
        record?.state === PlayerState.FIGHTER && weaponId ? weaponId : null;

      if (this.equippedWeapon.get(player.id) === shouldHold) continue;
      this.equippedWeapon.set(player.id, shouldHold ?? '');

      if (!shouldHold) {
        player.setWeapon(null);
        continue;
      }
      const definition = weaponById(shouldHold);
      if (!definition) continue;
      try {
        const model = await this.weapons.create(definition, false);
        model.scale.setScalar(1);
        player.setWeapon(model);
      } catch (err) {
        console.warn('[PlayerManager] weapon load failed', shouldHold, err);
      }
    }
  }

  /** Feed a world snapshot into the interpolation buffers. */
  applySnapshot(
    players: Array<{
      id: string;
      p: [number, number, number];
      y: number;
      s: number;
      g: boolean;
      h: number;
      st: PlayerState;
    }>,
    receivedAt: number,
  ): void {
    const local = this.localId();
    for (const entry of players) {
      if (entry.id === local) continue;
      const player = this.players.get(entry.id);
      if (!player) continue;
      player.health = entry.h;
      player.state = entry.st;
      player.pushSample(
        receivedAt,
        new THREE.Vector3(entry.p[0], entry.p[1], entry.p[2]),
        entry.y,
        entry.s,
        entry.g,
      );
    }
  }

  snapTo(id: string, position: THREE.Vector3, yaw: number): void {
    this.players.get(id)?.snapTo(position, yaw);
  }

  update(now: number, dt: number): void {
    const renderTime = now - GAME_CONFIG.interpolationDelayMs;
    for (const player of this.players.values()) player.update(renderTime, dt);
  }

  clear(): void {
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
    this.equippedWeapon.clear();
  }
}
