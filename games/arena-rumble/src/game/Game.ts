import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { Environment } from '../render/Environment';
import { AssetManager } from '../assets/AssetManager';
import { CharacterLoader } from '../assets/CharacterLoader';
import { WeaponLoader } from '../assets/WeaponLoader';
import { ArenaManager } from '../arena/ArenaManager';
import { InputManager } from '../player/InputManager';
import { PlayerController } from '../player/PlayerController';
import { PlayerManager } from '../player/PlayerManager';
import { FirstPersonCamera } from '../camera/FirstPersonCamera';
import { ThirdPersonSpectatorCamera } from '../camera/ThirdPersonSpectatorCamera';
import { SpectatorController } from '../spectator/SpectatorController';
import { WeaponSystem } from '../combat/WeaponSystem';
import { CombatSystem } from '../combat/CombatSystem';
import { UIManager } from '../ui/UIManager';
import { AudioManager } from '../audio/AudioManager';
import { WebRTCManager } from '../network/WebRTCManager';
import { HostAuthority } from '../network/HostAuthority';
import { MatchManager } from './MatchManager';
import { GameState, MatchPhase, PlayerState } from './GameState';
import { GAME_CONFIG } from '../config/gameConfig';
import { ARENAS, arenaById } from '../config/arenas';
import { CHARACTERS } from '../config/characters';
import { weaponById } from '../config/weapons';
import { roomCode } from '../core/Random';
import { now } from '../core/MathUtils';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type HostMessage,
} from '../network/NetworkMessages';

/**
 * Wires everything together and owns the frame loop.
 *
 * The same class runs on the host and on a client. The only difference is that
 * on the host a `MatchManager` + `HostAuthority` also exist and messages are
 * dispatched to them locally as well as over the network — so the host walks
 * exactly the same presentation code path as everybody else.
 */
export class Game {
  private renderer: Renderer;
  private environment: Environment;
  private assets = new AssetManager();
  private characters: CharacterLoader;
  private weaponLoader: WeaponLoader;
  private arena: ArenaManager;
  private input: InputManager;
  private firstPerson: FirstPersonCamera;
  private thirdPerson: ThirdPersonSpectatorCamera;
  private controller: PlayerController;
  private players: PlayerManager;
  private spectator: SpectatorController;
  private weapons: WeaponSystem;
  private combat: CombatSystem;
  private audio = new AudioManager();
  private ui: UIManager;
  private net = new WebRTCManager();

  /** Mirror of the host's state. On the host this *is* the host's state. */
  private state = new GameState();
  private match: MatchManager | null = null;
  private authority: HostAuthority | null = null;

  private localId: string | null = null;
  private characterId = CHARACTERS[0].id;

  private lastFrame = now();
  private inputAccumulator = 0;
  private inputSequence = 0;
  private running = false;
  private loadedArenaId: string | null = null;
  private lastCountdownBeep = -1;
  private appliedLocalState: PlayerState | null = null;
  private equippedWeaponId: string | null = null;
  private lastLookDelta = { x: 0, y: 0 };

  constructor(viewport: HTMLElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(viewport);
    this.environment = new Environment(this.renderer.scene);
    this.characters = new CharacterLoader(this.assets);
    this.weaponLoader = new WeaponLoader(this.assets);
    this.arena = new ArenaManager(this.renderer.scene, this.assets, this.environment);

    this.input = new InputManager(this.renderer.renderer.domElement);
    this.firstPerson = new FirstPersonCamera(this.renderer.camera);
    this.thirdPerson = new ThirdPersonSpectatorCamera(
      this.renderer.camera,
      this.arena.collision,
    );
    this.controller = new PlayerController(
      this.input,
      this.firstPerson,
      this.arena.collision,
    );
    this.players = new PlayerManager(
      this.renderer.scene,
      this.characters,
      this.weaponLoader,
      () => this.localId,
    );
    this.spectator = new SpectatorController(this.thirdPerson, this.input, this.players);
    this.weapons = new WeaponSystem(this.renderer.camera, this.weaponLoader);
    this.combat = new CombatSystem(this.renderer.scene);

    this.ui = new UIManager(uiRoot, {
      onCreateRoom: (name) => void this.createRoom(name),
      onJoinRoom: (name, code) => void this.joinRoom(name, code),
      onStart: () => this.requestStart(),
      onLeave: () => this.leave(),
      onBackToLobby: () => this.returnToLobby(),
    });

    this.spectator.onTargetChanged = (name) => this.ui.spectator.setTarget(name);

    this.input.onPointerLockChange((locked) => {
      this.ui.setPrompt(locked || !this.inWorld ? null : 'Click to look around');
    });
    this.renderer.renderer.domElement.addEventListener('click', () => {
      this.audio.unlock();
      if (this.inWorld) this.input.requestLock();
    });

    this.net.events.on('message', ({ from, message }) => this.onNetMessage(from, message));
    this.net.events.on('peer:close', ({ peerId }) => this.onPeerClosed(peerId));
    this.net.events.on('disconnected', ({ reason }) => this.onDisconnected(reason));
    this.net.events.on('reconnecting', ({ attempt }) =>
      this.ui.hud.toast(`Reconnecting… (${attempt})`, 'warn'),
    );
    this.net.events.on('error', ({ error }) => {
      console.error('[Net]', error);
      this.ui.menu.showError(error.message);
    });

    window.addEventListener('beforeunload', () => this.net.close());
  }

  // -------------------------------------------------------------- getters

  get scene(): THREE.Scene {
    return this.renderer.scene;
  }

  get matchManager(): MatchManager | null {
    return this.match;
  }

  get gameState(): GameState {
    return this.state;
  }

  get isHost(): boolean {
    return this.net.isHost;
  }

  private get inWorld(): boolean {
    return this.state.phase !== MatchPhase.LOBBY && this.localId !== null;
  }

  private get localRecord() {
    return this.state.player(this.localId);
  }

  // ------------------------------------------------------------ lifecycle

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = now();
    requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);

    const time = now();
    const dt = Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;

    this.update(dt, time);
    this.renderer.render();
  };

  private update(dt: number, time: number): void {
    // The host advances the authoritative simulation first.
    this.match?.update(dt);

    this.applyLocalState();

    const record = this.localRecord;
    const isEliminated = record?.state === PlayerState.ELIMINATED;

    if (record && !isEliminated) {
      const canAct =
        this.state.phase === MatchPhase.FIGHTING ||
        record.state === PlayerState.ALIVE_SPECTATOR;
      this.controller.movementEnabled = canAct && this.input.isLocked;

      this.lastLookDelta = { x: this.input.mouseDeltaX, y: this.input.mouseDeltaY };
      this.controller.update(dt);
      this.handleLocalCombat(time);
    } else if (isEliminated) {
      this.spectator.update(this.state, dt);
    }

    this.weapons.update(
      dt,
      time,
      this.controller.horizontalSpeed,
      this.lastLookDelta.x,
      this.lastLookDelta.y,
    );
    this.players.update(time, dt);
    this.combat.update(dt);
    this.environment.followCamera(this.renderer.camera.position);

    // Host writes its own body straight into the authoritative record.
    if (this.match && this.localId) {
      const own = this.match.state.player(this.localId);
      if (own && own.state !== PlayerState.ELIMINATED) {
        own.position = {
          x: this.controller.position.x,
          y: this.controller.position.y,
          z: this.controller.position.z,
        };
        own.yaw = this.firstPerson.yaw;
        own.pitch = this.firstPerson.pitch;
        own.speed = this.controller.horizontalSpeed;
        own.grounded = this.controller.grounded;
      }
    } else if (this.net.role === 'client') {
      this.inputAccumulator += dt;
      if (this.inputAccumulator >= 1 / GAME_CONFIG.inputRate) {
        this.inputAccumulator = 0;
        this.sendInput();
      }
    }

    this.updateHud(time);
  }

  // ---------------------------------------------------------- local combat

  private handleLocalCombat(time: number): void {
    const record = this.localRecord;
    if (!record || record.state !== PlayerState.FIGHTER) return;
    if (this.state.phase !== MatchPhase.FIGHTING) return;

    if (this.input.movement.reload) {
      this.input.movement.reload = false;
      if (this.weapons.beginReload(time)) {
        this.send({ type: 'reload_request' });
      }
    }

    if (!this.input.movement.fire) return;
    if (!this.weapons.canFire(time)) return;

    const weapon = this.weapons.current;
    if (!weapon) return;

    const origin = this.controller.eyePosition;
    const direction = this.firstPerson.forward();

    this.weapons.registerFire(time);
    this.firstPerson.addRecoil(weapon.recoil);
    this.audio.playWeapon(weapon);

    // Semi-automatic weapons need the trigger released between shots.
    if (weapon.fireRate < 5) this.input.movement.fire = false;

    this.send({
      type: 'fire_request',
      sequence: ++this.inputSequence,
      weaponId: weapon.id,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    });
  }

  private sendInput(): void {
    const move = this.input.movement;
    this.net.sendToHost({
      type: 'player_input',
      sequence: ++this.inputSequence,
      movement: {
        forward: move.forward,
        backward: move.backward,
        left: move.left,
        right: move.right,
      },
      jump: move.jump,
      sprint: move.sprint,
      rotation: { yaw: this.firstPerson.yaw, pitch: this.firstPerson.pitch },
      position: {
        x: this.controller.position.x,
        y: this.controller.position.y,
        z: this.controller.position.z,
      },
      speed: this.controller.horizontalSpeed,
      grounded: this.controller.grounded,
      fire: false,
      reload: false,
    });
  }

  /** Client sends over the wire; host feeds its own authority directly. */
  private send(message: ClientMessage): void {
    if (this.match && this.authority && this.localId) {
      this.authority.handle(this.localId, this.localId, message);
    } else {
      this.net.sendToHost(message);
    }
  }

  // ------------------------------------------------------- state machine

  /** Reacts to the local player's authoritative state changing. */
  private applyLocalState(): void {
    const record = this.localRecord;
    if (!record) return;

    if (record.state !== this.appliedLocalState) {
      const previous = this.appliedLocalState;
      this.appliedLocalState = record.state;

      switch (record.state) {
        case PlayerState.FIGHTER:
          this.spectator.disable();
          this.ui.setSpectatorVisible(false);
          this.ui.setHudVisible(true);
          this.ui.hud.setFighterMode(true);
          this.weapons.setVisible(true);
          break;

        case PlayerState.ALIVE_SPECTATOR:
          this.spectator.disable();
          this.ui.setSpectatorVisible(false);
          this.ui.setHudVisible(true);
          this.ui.hud.setFighterMode(false);
          this.weapons.setVisible(false);
          void this.weapons.equip(null);
          this.equippedWeaponId = null;
          break;

        case PlayerState.ELIMINATED:
          this.weapons.setVisible(false);
          void this.weapons.equip(null);
          this.equippedWeaponId = null;
          this.ui.hud.setFighterMode(false);
          this.spectator.enable();
          this.spectator.refreshTargets(this.state);
          this.ui.setSpectatorVisible(true);
          if (previous === PlayerState.FIGHTER) {
            this.ui.show('eliminated');
            this.ui.elimination.show(record.name);
            this.audio.playElimination();
            window.setTimeout(() => {
              if (this.ui.screen === 'eliminated') this.ui.show('none');
            }, 2600);
          }
          break;

        default:
          break;
      }
    }

    // Equip this round's weapon once the round has one.
    if (record.state === PlayerState.FIGHTER) {
      const weaponId = this.state.round.weaponId;
      if (weaponId && weaponId !== this.equippedWeaponId) {
        this.equippedWeaponId = weaponId;
        void this.weapons.equip(weaponById(weaponId) ?? null);
      }
    }
  }

  private updateHud(time: number): void {
    const record = this.localRecord;
    if (!record) return;

    if (record.state === PlayerState.FIGHTER) {
      this.ui.hud.setHealth(record.health);
      const opponentId =
        this.state.round.fighterA === record.id
          ? this.state.round.fighterB
          : this.state.round.fighterA;
      const opponent = this.state.player(opponentId);
      this.ui.hud.setOpponent(opponent?.name ?? null, opponent?.health ?? 0);

      const weapon = this.weapons.current;
      if (weapon) {
        this.ui.hud.setWeapon(
          weapon.name,
          this.weapons.ammo,
          weapon.magazineSize,
          this.weapons.reloading,
        );
      }
    }

    if (this.state.phase === MatchPhase.COUNTDOWN) {
      const remaining = (this.state.round.phaseEndsAt - time) / 1000;
      this.ui.card.setCountdown(remaining);
      const whole = Math.ceil(remaining);
      if (whole !== this.lastCountdownBeep && whole >= 0) {
        this.lastCountdownBeep = whole;
        this.audio.playCountdownBeep(whole <= 0);
      }
    }
  }

  // ---------------------------------------------------------- room setup

  private async createRoom(name: string): Promise<void> {
    this.ui.menu.setBusy(true, 'Opening room…');
    const code = roomCode(GAME_CONFIG.network.codeAlphabet, GAME_CONFIG.network.codeLength);

    try {
      await this.net.host(code);
    } catch (err) {
      this.ui.menu.setBusy(false);
      this.ui.menu.showError((err as Error).message);
      return;
    }

    this.localId = 'host';
    this.match = new MatchManager(
      (message, toPeerId) => this.dispatchAsHost(message, toPeerId),
      {
        loadArena: (arenaId) => this.loadArena(arenaId),
        spawns: () => this.arena.spawns,
        now,
      },
    );
    this.authority = new HostAuthority(
      this.match,
      () => this.arena.collision,
      (message, toPeerId) => this.dispatchAsHost(message, toPeerId),
      now,
    );
    // The host is a player like anyone else.
    this.state = this.match.state;
    this.match.addPlayer('host', name, true, this.characterId);

    this.ui.menu.setBusy(false);
    this.ui.lobby.setRoomCode(code);
    this.ui.lobby.setHostControls(true);
    this.ui.show('lobby');
    this.refreshLobby();
    this.audio.unlock();
  }

  private async joinRoom(name: string, code: string): Promise<void> {
    this.ui.menu.setBusy(true, 'Connecting…');

    try {
      await this.net.join(code);
    } catch (err) {
      this.ui.menu.setBusy(false);
      this.ui.menu.showError((err as Error).message);
      return;
    }

    this.net.sendToHost({
      type: 'join_request',
      name,
      characterId: this.characterId,
      protocol: PROTOCOL_VERSION,
    });
    this.ui.menu.setBusy(true, 'Joining the room…');
    this.ui.lobby.setRoomCode(code);
    this.ui.lobby.setHostControls(false);
    this.audio.unlock();
  }

  private requestStart(): void {
    this.audio.playUi();
    if (this.match?.canStart()) this.match.startMatch();
  }

  private leave(): void {
    this.net.close();
    window.location.reload();
  }

  private returnToLobby(): void {
    if (!this.match) return;
    this.match.state.phase = MatchPhase.LOBBY;
    this.match.state.championId = null;
    for (const player of this.match.state.list) {
      player.eliminated = false;
      player.wins = 0;
      player.state = PlayerState.CONNECTED;
      player.health = GAME_CONFIG.player.maxHealth;
    }
    this.match.pushMatchUpdate();
    this.input.releaseLock();
    this.ui.show('lobby');
    this.refreshLobby();
  }

  // ------------------------------------------------------- host dispatch

  /**
   * Host side fan-out: send to every client *and* run the same message through
   * the local presentation path, so the host sees exactly what clients see.
   */
  private dispatchAsHost(message: HostMessage, toPeerId?: string): void {
    if (toPeerId) {
      this.net.sendTo(toPeerId, message);
      return;
    }
    this.net.broadcast(message);
    this.onHostMessage(message);
  }

  private onNetMessage(from: string, message: ClientMessage | HostMessage): void {
    if (this.net.isHost) {
      const playerId = this.state.player(from) ? from : null;
      this.authority?.handle(from, playerId, message as ClientMessage);
    } else {
      this.onHostMessage(message as HostMessage);
    }
  }

  private onPeerClosed(peerId: string): void {
    if (!this.net.isHost || !this.match) return;
    this.authority?.forget(peerId);
    this.match.removePlayer(peerId);
    this.refreshLobby();
  }

  private onDisconnected(reason: string): void {
    this.input.releaseLock();
    this.ui.setHudVisible(false);
    this.ui.setSpectatorVisible(false);
    this.ui.show('menu');
    this.ui.menu.setBusy(false);
    this.ui.menu.showError(reason);
  }

  // -------------------------------------------------- host message router

  private onHostMessage(message: HostMessage): void {
    switch (message.type) {
      case 'join_accepted':
        this.localId = message.playerId;
        this.state.applySnapshot(message.snapshot);
        this.ui.menu.setBusy(false);
        this.ui.show('lobby');
        this.refreshLobby();
        break;

      case 'join_rejected':
        this.net.close();
        this.ui.menu.setBusy(false);
        this.ui.menu.showError(message.message);
        this.ui.show('menu');
        break;

      case 'match_update':
        if (!this.net.isHost) this.state.applySnapshot(message.snapshot);
        this.players.sync(this.state);
        void this.players.syncWeapons(this.state);
        this.refreshLobby();
        this.onPhase(this.state.phase);
        break;

      case 'world_snapshot':
        this.players.applySnapshot(message.players, now());
        if (!this.net.isHost) this.mergeSnapshotIntoState(message.players);
        break;

      case 'player_state':
        this.onPlayerStateMessage(message);
        break;

      case 'round_event':
        void this.onRoundEvent(message);
        break;

      case 'fire_event':
        this.onFireEvent(message);
        break;

      case 'damage_event':
        this.onDamageEvent(message);
        break;

      case 'ammo_update':
        if (message.playerId === this.localId) {
          this.weapons.syncAmmo(message.ammo, message.reloadEndsAt, now());
        }
        break;

      case 'system':
        this.ui.hud.toast(message.message, message.tone);
        break;

      case 'host_closing':
        this.onDisconnected('The host ended the match.');
        break;

      default:
        break;
    }
  }

  private mergeSnapshotIntoState(
    players: Array<{ id: string; p: [number, number, number]; y: number; h: number; st: PlayerState }>,
  ): void {
    for (const entry of players) {
      const record = this.state.player(entry.id);
      if (!record) continue;
      record.health = entry.h;
      record.state = entry.st;
      if (entry.id === this.localId) continue; // never let the host move us mid-frame
      record.position = { x: entry.p[0], y: entry.p[1], z: entry.p[2] };
      record.yaw = entry.y;
    }
  }

  private onPlayerStateMessage(message: {
    playerId: string;
    state: PlayerState;
    position: { x: number; y: number; z: number };
    yaw: number;
  }): void {
    const record = this.state.player(message.playerId);
    if (record) {
      record.state = message.state;
      record.position = { ...message.position };
      record.yaw = message.yaw;
    }

    const position = new THREE.Vector3(message.position.x, message.position.y, message.position.z);
    if (message.playerId === this.localId) {
      this.controller.teleport(position, message.yaw);
    } else {
      this.players.snapTo(message.playerId, position, message.yaw);
    }
  }

  private async onRoundEvent(message: {
    event: string;
    arenaId: string;
    weaponId: string;
    roundIndex: number;
    fighterA: string | null;
    fighterB: string | null;
    winnerId: string | null;
    loserId: string | null;
  }): Promise<void> {
    switch (message.event) {
      case 'loading':
        this.ui.setHudVisible(false);
        this.ui.setSpectatorVisible(false);
        this.ui.show('loading');
        this.ui.loading.set(0, arenaById(message.arenaId)?.name ?? '');
        // Clients load the arena themselves; the host is already doing it.
        if (!this.net.isHost) await this.loadArena(message.arenaId);
        break;

      case 'intro': {
        const arena = arenaById(message.arenaId);
        const weapon = weaponById(message.weaponId);
        this.ui.card.showCard({
          roundIndex: message.roundIndex,
          fighterA: this.state.player(message.fighterA)?.name ?? '—',
          fighterB: this.state.player(message.fighterB)?.name ?? '—',
          arenaName: arena?.name ?? '—',
          weaponName: weapon?.name ?? '—',
        });
        this.ui.show('card');
        this.ui.setFaded(false);
        this.audio.setCrowdIntensity(0.5);
        break;
      }

      case 'countdown':
        this.lastCountdownBeep = -1;
        this.ui.show('card');
        break;

      case 'fight':
        this.ui.card.clearCountdown();
        this.ui.show('none');
        this.ui.setHudVisible(true);
        this.audio.setCrowdIntensity(1);
        this.audio.crowdSwell();
        if (this.localRecord?.state !== PlayerState.ELIMINATED) this.input.requestLock();
        break;

      case 'end': {
        this.ui.setHudVisible(false);
        this.ui.result.show({
          winnerName: this.state.player(message.winnerId)?.name ?? '—',
          loserName: this.state.player(message.loserId)?.name ?? '—',
          isFinalRound: this.state.alive.length <= 1,
        });
        this.ui.show('result');
        this.audio.setCrowdIntensity(0.6);
        break;
      }

      case 'champion': {
        const champion = this.state.player(message.winnerId);
        this.ui.setHudVisible(false);
        this.ui.setSpectatorVisible(false);
        this.input.releaseLock();
        this.ui.victory.show(
          champion?.name ?? '—',
          champion?.wins ?? 0,
          message.roundIndex,
          this.net.isHost,
        );
        this.ui.show('champion');
        this.audio.playChampion();
        break;
      }

      default:
        break;
    }
  }

  private onFireEvent(message: {
    shooterId: string;
    weaponId: string;
    origin: { x: number; y: number; z: number };
    hits: Array<{ point: { x: number; y: number; z: number }; targetId: string | null }>;
  }): void {
    const weapon = weaponById(message.weaponId);
    if (!weapon) return;

    const origin = new THREE.Vector3(message.origin.x, message.origin.y, message.origin.z);
    const hits = message.hits.map((hit) => ({
      point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
      targetId: hit.targetId,
    }));
    this.combat.showShot(weapon, origin, hits);

    // The shooter already heard their own weapon locally.
    if (message.shooterId !== this.localId) this.audio.playWeapon(weapon);
    if (message.shooterId === this.localId && hits.some((hit) => hit.targetId)) {
      this.ui.hud.showHitmarker();
      this.audio.playHit();
    }
  }

  private onDamageEvent(message: {
    targetId: string;
    attackerId: string;
    healthAfter: number;
    fatal: boolean;
  }): void {
    const record = this.state.player(message.targetId);
    if (record) record.health = message.healthAfter;

    if (message.targetId === this.localId) {
      this.ui.hud.flashDamage();
      this.ui.hud.setHealth(message.healthAfter);
      this.audio.playHurt();
    }
    if (message.fatal) this.spectator.refreshTargets(this.state);
  }

  private onPhase(phase: MatchPhase): void {
    if (phase === MatchPhase.LOBBY) {
      this.input.releaseLock();
      this.ui.setHudVisible(false);
      this.ui.setSpectatorVisible(false);
      this.audio.setCrowdIntensity(0.15);
      if (this.ui.screen !== 'lobby') this.ui.show('lobby');
    }
    this.input.setEnabled(phase !== MatchPhase.LOBBY);
  }

  private refreshLobby(): void {
    const players = this.state.list.filter((p) => p.connected);
    this.ui.lobby.update(players, this.net.isHost && (this.match?.canStart() ?? false));
    this.ui.lobby.setRoomCode(this.net.roomCode || '------');
    this.ui.lobby.setHostControls(this.net.isHost);
  }

  // ------------------------------------------------------------- loading

  /** Loads an arena and rebuilds the world around it. */
  private async loadArena(arenaId: string): Promise<void> {
    if (this.loadedArenaId === arenaId) return;

    const definition = arenaById(arenaId) ?? ARENAS[0];
    this.ui.show('loading');
    this.combat.clear();

    await this.arena.loadArena(definition, (fraction, label) => {
      this.ui.loading.set(fraction, label);
    });

    this.loadedArenaId = definition.id;
    this.thirdPerson.reset();
  }

  /** Debug helper: load an arena outside a match. */
  async debugLoadArena(arenaId: string): Promise<void> {
    await this.loadArena(arenaId);
    const spawn = this.arena.spawns.fighterPair()[0];
    this.controller.teleport(spawn.position, spawn.yaw);
    this.ui.show('none');
    this.input.setEnabled(true);
    this.input.requestLock();
  }

  debugStats(): Record<string, string> {
    return {
      role: this.net.role,
      players: String(this.state.list.length),
      phase: this.state.phase,
      arena: this.loadedArenaId ?? '—',
      weapon: this.state.round.weaponId || '—',
      spawns: String(this.arena.spawns.fighterSpawnCount),
      draws: String(this.renderer.drawCalls),
    };
  }

  get audioManager(): AudioManager {
    return this.audio;
  }
}
