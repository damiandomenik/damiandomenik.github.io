import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import { MatchPhase, PlayerState } from '../game/GameState';
import type { MatchManager } from '../game/MatchManager';
import { weaponById } from '../config/weapons';
import type { CollisionWorld } from '../arena/CollisionWorld';
import {
  applySpread,
  resolveMelee,
  resolvePellet,
  type HitCandidate,
} from '../combat/HitDetection';
import type {
  ClientMessage,
  FireRequest,
  HostMessage,
  PlayerInput,
} from './NetworkMessages';
import { PROTOCOL_VERSION } from './NetworkMessages';

/**
 * The trust boundary.
 *
 * Everything a client sends passes through here. Movement is accepted but
 * plausibility-checked; shooting is *requested*, never asserted — the host
 * re-runs the raycast itself and is the only thing that can produce damage.
 */
export class HostAuthority {
  private lastPositionTime = new Map<string, number>();
  private strikes = new Map<string, number>();

  constructor(
    private match: MatchManager,
    private collision: () => CollisionWorld,
    private dispatch: (message: HostMessage, toPeerId?: string) => void,
    private now: () => number,
  ) {}

  // -------------------------------------------------------------- routing

  handle(peerId: string, playerId: string | null, message: ClientMessage): void {
    switch (message.type) {
      case 'join_request':
        this.handleJoin(peerId, message.name, message.characterId, message.protocol);
        break;
      case 'player_input':
        if (playerId) this.handleInput(playerId, message);
        break;
      case 'fire_request':
        if (playerId) this.handleFire(playerId, message);
        break;
      case 'reload_request':
        if (playerId) this.handleReload(playerId);
        break;
      case 'start_match_request':
        // Only the host can start a match; a client asking is simply ignored.
        break;
      case 'ping':
        this.dispatch({ type: 'pong', t: message.t }, peerId);
        break;
      default:
        break;
    }
  }

  // ----------------------------------------------------------------- join

  private handleJoin(
    peerId: string,
    name: string,
    characterId: string,
    protocol: number,
  ): void {
    if (protocol !== PROTOCOL_VERSION) {
      this.dispatch(
        {
          type: 'join_rejected',
          reason: 'protocol',
          message: 'Your version of the game is out of date. Reload the page.',
        },
        peerId,
      );
      return;
    }

    const connected = this.match.state.list.filter((p) => p.connected).length;
    if (connected >= GAME_CONFIG.maxPlayers) {
      this.dispatch(
        { type: 'join_rejected', reason: 'full', message: 'This room is full (8 players).' },
        peerId,
      );
      return;
    }

    if (this.match.state.phase !== MatchPhase.LOBBY) {
      this.dispatch(
        {
          type: 'join_rejected',
          reason: 'in_progress',
          message: 'That match has already started. Wait for the next one.',
        },
        peerId,
      );
      return;
    }

    const record = this.match.addPlayer(peerId, name, false, characterId);
    this.dispatch(
      {
        type: 'join_accepted',
        playerId: record.id,
        hostId: 'host',
        protocol: PROTOCOL_VERSION,
        snapshot: this.match.state.toSnapshot(),
      },
      peerId,
    );
    this.match.systemMessage(`${record.name} joined.`, 'info');
    this.match.pushMatchUpdate();
  }

  // ------------------------------------------------------------ movement

  /**
   * Accepts the client's own position after checking it could plausibly have
   * got there. A player who teleports gets snapped back and, after repeated
   * offences, is simply left where the host last believed they were.
   */
  handleInput(playerId: string, input: PlayerInput): void {
    const player = this.match.state.player(playerId);
    if (!player || !player.connected) return;

    const now = this.now();
    const previousTime = this.lastPositionTime.get(playerId) ?? now;
    const elapsed = Math.max(0.016, (now - previousTime) / 1000);
    this.lastPositionTime.set(playerId, now);

    const proposed = new THREE.Vector3(input.position.x, input.position.y, input.position.z);
    const current = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
    const travelled = proposed.distanceTo(current);
    // Generous allowance: max speed plus a fall, times the real elapsed time.
    const allowed = GAME_CONFIG.player.maxValidatedSpeed * elapsed + 3.5;

    if (travelled > allowed) {
      const strikes = (this.strikes.get(playerId) ?? 0) + 1;
      this.strikes.set(playerId, strikes);
      if (strikes % 20 === 1) {
        console.warn(
          `[HostAuthority] rejected a ${travelled.toFixed(1)} m step from ${player.name}`,
        );
      }
      // Refuse the move; the client will be corrected by the next snapshot.
      this.dispatch({
        type: 'player_state',
        playerId,
        state: player.state,
        position: { ...player.position },
        yaw: player.yaw,
      });
      return;
    }

    player.position = { x: proposed.x, y: proposed.y, z: proposed.z };
    player.yaw = input.rotation.yaw;
    player.pitch = input.rotation.pitch;
    player.speed = Math.min(input.speed, GAME_CONFIG.player.maxValidatedSpeed);
    player.grounded = input.grounded;
  }

  // ------------------------------------------------------------- shooting

  handleFire(playerId: string, request: FireRequest): void {
    const player = this.match.state.player(playerId);
    if (!player) return;

    // Only live fighters, only while the round is live.
    if (player.state !== PlayerState.FIGHTER) return;
    if (!this.match.combatLive) return;
    if (player.health <= 0) return;

    const weapon = weaponById(this.match.state.round.weaponId);
    if (!weapon) return;

    // The client does not get to choose its weapon.
    if (request.weaponId !== weapon.id) return;

    const now = this.now();
    if (now < player.reloadEndsAt) return;

    const interval = 1000 / weapon.fireRate;
    // 12% tolerance absorbs jitter without allowing a rapid fire script.
    if (now - player.lastFireAt < interval * 0.88) return;

    if (weapon.magazineSize > 0 && player.ammo <= 0) return;

    // The shot has to start near where the host thinks the player is.
    const origin = new THREE.Vector3(request.origin.x, request.origin.y, request.origin.z);
    const eye = new THREE.Vector3(
      player.position.x,
      player.position.y + GAME_CONFIG.player.eyeHeight,
      player.position.z,
    );
    if (origin.distanceTo(eye) > 2.0) return;

    const direction = new THREE.Vector3(
      request.direction.x,
      request.direction.y,
      request.direction.z,
    );
    if (direction.lengthSq() < 0.01) return;
    direction.normalize();

    player.lastFireAt = now;
    if (weapon.magazineSize > 0) player.ammo = Math.max(0, player.ammo - 1);

    const candidates = this.hitCandidates(playerId);
    const hits: Array<{ point: THREE.Vector3; targetId: string | null }> = [];
    let totalDamage = 0;
    let victimId: string | null = null;

    if (weapon.kind === 'melee') {
      const hit = resolveMelee(eye, direction, weapon, candidates);
      if (hit) {
        hits.push({ point: hit.point, targetId: hit.targetId });
        if (hit.targetId) {
          totalDamage += weapon.damage;
          victimId = hit.targetId;
        }
      } else {
        hits.push({
          point: eye.clone().addScaledVector(direction, weapon.range * 0.8),
          targetId: null,
        });
      }
    } else {
      const collision = this.collision();
      for (let pellet = 0; pellet < weapon.pellets; pellet++) {
        const spread = applySpread(direction, weapon.spread, Math.random);
        const shot = resolvePellet(eye, spread, weapon.range, collision, candidates);
        hits.push({ point: shot.point, targetId: shot.targetId });
        if (shot.targetId) {
          totalDamage += weapon.damage;
          victimId = shot.targetId;
        }
      }
    }

    this.dispatch({
      type: 'fire_event',
      shooterId: playerId,
      weaponId: weapon.id,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      hits: hits.map((hit) => ({
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        targetId: hit.targetId,
      })),
    });

    this.dispatch({
      type: 'ammo_update',
      playerId,
      ammo: player.ammo,
      reloadEndsAt: player.reloadEndsAt,
      serverTime: now,
    });

    if (victimId && totalDamage > 0) {
      const result = this.match.damage.apply(victimId, playerId, totalDamage);
      if (!result) return;

      this.dispatch({
        type: 'damage_event',
        targetId: result.targetId,
        attackerId: result.attackerId,
        amount: result.amount,
        healthAfter: result.healthAfter,
        fatal: result.fatal,
      });

      if (result.fatal) {
        const victim = this.match.state.player(victimId);
        const killer = this.match.state.player(playerId);
        this.match.systemMessage(
          `${killer?.name ?? 'Someone'} eliminated ${victim?.name ?? 'someone'}.`,
          'kill',
        );
        this.match.concludeRound(victimId);
      }
    }

    // Auto reload when the magazine runs dry.
    if (weapon.magazineSize > 0 && player.ammo === 0) this.handleReload(playerId);
  }

  handleReload(playerId: string): void {
    const player = this.match.state.player(playerId);
    if (!player || player.state !== PlayerState.FIGHTER) return;

    const weapon = weaponById(this.match.state.round.weaponId);
    if (!weapon || weapon.magazineSize === 0) return;

    const now = this.now();
    if (now < player.reloadEndsAt) return;
    if (player.ammo >= weapon.magazineSize) return;

    player.reloadEndsAt = now + weapon.reloadTime * 1000;
    window.setTimeout(
      () => {
        const still = this.match.state.player(playerId);
        if (!still) return;
        if (still.state !== PlayerState.FIGHTER) return;
        still.ammo = weapon.magazineSize;
        still.reloadEndsAt = 0;
        this.dispatch({
          type: 'ammo_update',
          playerId,
          ammo: still.ammo,
          reloadEndsAt: 0,
          serverTime: this.now(),
        });
      },
      weapon.reloadTime * 1000,
    );

    this.dispatch({
      type: 'ammo_update',
      playerId,
      ammo: player.ammo,
      reloadEndsAt: player.reloadEndsAt,
      serverTime: now,
    });
  }

  /** Only the opposing fighter can be shot; spectators are not targets. */
  private hitCandidates(shooterId: string): HitCandidate[] {
    return this.match.state.list
      .filter(
        (p) =>
          p.id !== shooterId &&
          p.state === PlayerState.FIGHTER &&
          p.connected &&
          p.health > 0,
      )
      .map((p) => ({
        id: p.id,
        position: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
        radius: GAME_CONFIG.player.radius + 0.08,
        height: GAME_CONFIG.player.height,
      }));
  }

  forget(playerId: string): void {
    this.lastPositionTime.delete(playerId);
    this.strikes.delete(playerId);
  }
}
