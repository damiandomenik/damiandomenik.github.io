import * as THREE from 'three';
import { CONFIG as C, COLORS, PLAYER_COLORS } from './Config.js';
import { GameState, Phase } from './GameState.js';
import { Input, isTyping } from './Input.js';
import { PhysicsWorld } from './Physics.js';
import { uid, randomRoomCode, formatTime } from './Utils.js';
import { DungeonGenerator } from '../dungeon/DungeonGenerator.js';
import { LocalPlayer } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { AbilityManager } from '../gameplay/AbilityManager.js';
import { MatchManager } from '../gameplay/MatchManager.js';
import { RaceManager } from '../gameplay/RaceManager.js';
import { NetworkManager } from '../multiplayer/NetworkManager.js';
import { RemotePlayer } from '../multiplayer/RemotePlayer.js';
import { HUD } from '../ui/HUD.js';
import { LobbyUI } from '../ui/LobbyUI.js';
import { ResultsUI } from '../ui/ResultsUI.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.selfId = uid();
    this.color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];

    // ---------- Renderer / Scene ----------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.setClearColor(COLORS.bg, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.012);
    this.camera = new THREE.PerspectiveCamera(C.CAM_FOV, innerWidth / innerHeight, 0.1, 500);

    const amb = new THREE.AmbientLight(0x5c7ba8, 0.75);
    const dir = new THREE.DirectionalLight(0xbcd4ff, 1.05);
    dir.position.set(30, 60, 20);
    const hemi = new THREE.HemisphereLight(0x6f7bff, 0x0a0e18, 0.5);
    this.scene.add(amb, dir, hemi);

    // ---------- Systeme ----------
    this.physics = new PhysicsWorld();
    this.dungeon = new DungeonGenerator(this.scene, this.physics);
    this.state = new GameState();
    this.input = new Input(canvas);
    this.race = new RaceManager(this);
    this.match = new MatchManager(this);
    this.network = new NetworkManager();
    this.remotePlayers = new Map();

    this.localPlayer = new LocalPlayer(this.scene, this.physics, {
      id: this.selfId, name: 'Runner', color: this.color,
    });
    this.controller = new PlayerController(this.localPlayer, this.camera, this.input, this.physics);
    this.abilities = new AbilityManager(this);

    // ---------- UI ----------
    this.hud = new HUD();
    this.lobbyUI = new LobbyUI();
    this.resultsUI = new ResultsUI(this.lobbyUI);
    this.clickToPlay = document.getElementById('click-to-play');
    this.ui = {
      showWorld: () => {
        this.lobbyUI.hideOverlay();
        this.hud.show();
        // Ohne User-Geste (Match vom Host gestartet) greift Pointer Lock nicht
        this.clickToPlay.classList.toggle('hidden', this.input.locked);
      },
      showLobby: () => { this.hud.hide(); this.lobbyUI.showLobby(); this.clickToPlay.classList.add('hidden'); },
      showResults: (r) => { this.hud.hide(); this.resultsUI.show(r, this.selfId, this.network.isHost || this.state.solo); },
      showMenu: () => { this.hud.hide(); this.lobbyUI.showMenu(); this.clickToPlay.classList.add('hidden'); },
    };

    this._wireUI();
    this._wireNetwork();
    this._wirePlayer();
    this._wireWindow();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
  }

  start() {
    this.ui.showMenu();
    this.renderer.setAnimationLoop(this._loop);
  }

  // ================================================================ UI
  _wireUI() {
    const L = this.lobbyUI;
    L.on('create', ({ name, url }) => this.createLobby(name, url));
    L.on('join', ({ name, url, code }) => this.joinLobby(name, url, code));
    L.on('solo', ({ name }) => this.startSolo(name));
    L.on('ready', (r) => this.network.setReady(r));
    L.on('start', () => this.match.requestStart());
    L.on('leave', () => this.leave());
    L.on('manualPaste', (txt) => {
      const sig = this.network.signaling;
      if (sig?.receiveBlob) {
        const ok = sig.receiveBlob(txt);
        this.hud.toast(ok ? 'Code übernommen' : 'Ungültiger Code');
      }
    });
    L.on('resume', () => { this.state.set(this.state.prevPhase); this.ui.showWorld(); this.input.requestLock(); });
    L.on('quit', () => this.leave());

    this.resultsUI.on('rematch', () => this.match.requestStart());
    this.resultsUI.on('toLobby', () => (this.state.solo ? this.leave() : this.match.toLobby()));

    this.clickToPlay.onclick = () => this.input.requestLock();
    this.input.on('lock', () => this.clickToPlay.classList.add('hidden'));
    this.input.on('unlock', () => {
      if (this.state.phase === Phase.RUNNING || this.state.phase === Phase.COUNTDOWN) {
        this.clickToPlay.classList.remove('hidden');
      }
    });
  }

  _wireWindow() {
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });
    addEventListener('keydown', (e) => {
      if (isTyping(e.target) && e.code !== 'Escape') return;
      if (e.code === 'Escape' && this.state.inWorld && this.state.phase !== Phase.RESULTS) {
        this.state.set(Phase.PAUSED);
        this.input.exitLock();
        this.clickToPlay.classList.add('hidden');
        this.lobbyUI.showPause();
      }
      if (e.code === 'KeyR' && this.state.running) {
        this.localPlayer.respawnAt(this.dungeon.checkpointPosition(this.localPlayer.checkpoint));
      }
    });
    addEventListener('beforeunload', () => this.network.disconnect());
  }

  // ================================================================ Netzwerk
  _wireNetwork() {
    const n = this.network;
    n.onPlayerJoin = (id, profile) => {
      let rp = this.remotePlayers.get(id);
      if (!rp) {
        rp = new RemotePlayer(this.scene, { id, name: profile.name, color: profile.color });
        this.remotePlayers.set(id, rp);
      } else rp.setProfile(profile);
      this.race.add({ id, name: profile.name || 'Runner', color: profile.color || 0x888888 });
      this._refreshLobby();
    };
    n.onPlayerLeave = (id) => {
      this.remotePlayers.get(id)?.dispose();
      this.remotePlayers.delete(id);
      this.race.remove(id);
      this._maybeMigrateHost();
      this._refreshLobby();
    };
    n.onState = (id, msg) => this.remotePlayers.get(id)?.push(msg);
    n.onEvent = (id, e) => this._onNetEvent(id, e);
    n.onStart = (msg) => this.match.beginMatch(msg.seed, msg.countdown, msg.elapsed || 0);
    n.getMatchInfo = () => (this.state.running
      ? { seed: this.state.seed, elapsed: this.state.elapsedMs }
      : null);
    n.onRosterChange = () => this._refreshLobby();
    n.onStatus = (s) => { if (C.DEBUG) console.log('[net]', s); };
    n.onError = (err) => this.hud.toast(err.message || 'Netzwerkfehler', 2500);
  }

  _onNetEvent(fromId, e) {
    switch (e.t) {
      case 'hit':
        // wird gezielt an genau diesen Client geschickt
        if (this.state.running) {
          this.localPlayer.applyKnockback(e.kx, e.ky, e.kz);
          this.controller.addShake(0.9);
          this.hud.toast('GETROFFEN!');
        }
        break;
      case 'switch':
        this.dungeon.openDoor(e.doorId);
        break;
      case 'finish': {
        this.race.setFinish(fromId, e.time);
        const rp = this.remotePlayers.get(fromId);
        if (rp) { rp.finished = true; rp.finishTime = e.time; }
        const entry = this.race.get(fromId);
        this.hud.toast(`${entry?.name || 'Spieler'} im Ziel — ${formatTime(e.time)}`, 2000);
        break;
      }
      case 'cp': {
        const rp = this.remotePlayers.get(fromId);
        if (rp) rp.checkpoint = e.i;
        break;
      }
    }
  }

  /**
   * Verlässt der Host das Match, übernimmt der Spieler mit der kleinsten ID.
   * Ohne das wäre die Lobby danach handlungsunfähig (kein Start/Rematch).
   */
  _maybeMigrateHost() {
    const n = this.network;
    if (this.state.solo || n.isHost || !n.connected) return;
    if ([...n.roster.values()].some((p) => p.host)) return;      // Host noch da
    const ids = [this.selfId, ...n.roster.keys()].sort();
    if (ids[0] !== this.selfId) return;
    n.isHost = true;
    n.updateProfile({});
    this.lobbyUI.setLobby({ ...this._lobbyInfo, isHost: true });
    this.hud.toast('DU BIST JETZT HOST', 2500);
  }

  _refreshLobby() {
    const players = this.state.solo
      ? [{ id: this.selfId, name: this.localPlayer.name, color: this.color, ready: true, host: true }]
      : this.network.allPlayers();
    this.lobbyUI.setPlayers(players, this.selfId);
    this.hud.setPeers(this.network.peerCount);
  }

  // ================================================================ Player Events
  _wirePlayer() {
    const p = this.localPlayer;
    p.events.checkpoint = (i) => {
      this.network.sendEvent({ t: 'cp', i });
      this.hud.toast(`CHECKPOINT ${i}`);
    };
    p.events.switch = (doorId) => {
      this.network.sendEvent({ t: 'switch', doorId });
      this.hud.toast('SCHALTER AKTIVIERT');
    };
    p.events.finish = () => {
      const time = this.state.elapsedMs;
      this.race.setFinish(this.selfId, time);
      this.network.sendEvent({ t: 'finish', time });
      this.hud.toast(`ZIEL! ${formatTime(time)}`, 2500);
    };
    p.events.death = () => this.controller.addShake(0.6);
  }

  // ================================================================ Flow
  async createLobby(name, url) {
    const code = randomRoomCode();
    await this._connect({ name, url, code, isHost: true });
  }

  async joinLobby(name, url, code) {
    if (!code && url) { this.hud.toast('Room Code fehlt'); return; }
    await this._connect({ name, url, code: code || 'MANUAL', isHost: false });
  }

  async _connect({ name, url, code, isHost }) {
    this.localPlayer.name = name;
    this.state.solo = false;
    try {
      await this.network.connect({
        code, url, selfId: this.selfId, isHost,
        profile: { name, color: this.color, ready: false },
      });
    } catch (err) {
      this.hud.show();
      this.hud.toast('Signaling fehlgeschlagen: ' + err.message, 3000);
      setTimeout(() => this.hud.hide(), 3200);
      return;
    }
    const sig = this.network.signaling;
    this._lobbyInfo = { code, transport: sig.label, isHost };
    this.lobbyUI.setLobby(this._lobbyInfo);
    if (this.network.isManual) {
      this.lobbyUI.setManual(true, '');
      sig.onLocalBlob = (blob) => this.lobbyUI.setManual(true, blob);
      if (sig._lastBlob) this.lobbyUI.setManual(true, sig._lastBlob);
    } else this.lobbyUI.setManual(false);

    this.state.set(Phase.LOBBY);
    this.ui.showLobby();
    this._refreshLobby();
  }

  startSolo(name) {
    this.localPlayer.name = name;
    this.state.solo = true;
    this.network.selfId = this.selfId;
    this.network.isHost = true;
    this._lobbyInfo = { code: 'SOLO', transport: 'lokal', isHost: true };
    this.lobbyUI.setLobby(this._lobbyInfo);
    this.lobbyUI.setManual(false);
    this.state.set(Phase.LOBBY);
    this.ui.showLobby();
    this._refreshLobby();
  }

  leave() {
    this.network.disconnect();
    for (const rp of this.remotePlayers.values()) rp.dispose();
    this.remotePlayers.clear();
    this.race.entries.clear();
    this.state.solo = false;
    this.state.set(Phase.MENU);
    this.input.exitLock();
    this.ui.showMenu();
  }

  buildDungeon(seed) {
    this.dungeon.generate(seed, C.ROOM_COUNT);
  }

  resetPlayersForRun() {
    this.dungeon.resetDynamics();
    this.localPlayer.reset(this.dungeon.spawn);
    for (const rp of this.remotePlayers.values()) {
      rp.finished = false; rp.checkpoint = 0; rp.buffer.length = 0;
    }
    const players = this.state.solo
      ? [{ id: this.selfId, name: this.localPlayer.name, color: this.color, self: true }]
      : this.network.allPlayers().map((p) => ({
          id: p.id, name: p.name, color: p.color || 0x888888, self: p.id === this.selfId,
        }));
    this.race.reset(players);
  }

  // ================================================================ Loop
  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const st = this.state;

    if (st.inWorld) {
      const frozen = st.phase !== Phase.RUNNING;
      const paused = st.phase === Phase.PAUSED;

      if (!paused) {
        if (st.running) st.matchTime = st.elapsedMs / 1000;

        // Reihenfolge: erst Welt (bewegliche Plattformen), dann Spieler.
        // Nur so stimmt das "Mitgenommen-Werden" auf Plattformen exakt.
        this.dungeon.update(dt, st.matchTime, this.localPlayer.state.pos);

        const cmd = this.controller.buildCommand(frozen);
        this.localPlayer.update(dt, cmd, this.dungeon, st.running);

        if (st.running && this.input.punchPressed && this.input.locked) {
          const ab = this.abilities.get('punch');
          if (ab.trigger()) this.localPlayer.punchCooldown = ab.cooldown;
        }
        this.abilities.update(dt);
        for (const rp of this.remotePlayers.values()) {
          rp.update(dt);
          this.race.updateRemote(rp);
        }
        this.controller.updateCamera(dt);

        if (!st.solo) this.network.tickState(dt, this.localPlayer.netState());
        this.race.updateLocal(this.localPlayer, st.elapsedMs);
        this.match.update(dt);
        this._updateHud();
      }
    }

    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  _updateHud() {
    const st = this.state;
    const p = this.localPlayer;
    this.hud.setTime(st.running || st.phase === Phase.RESULTS ? st.elapsedMs : 0);
    this.hud.setCheckpoint(p.checkpoint, Math.max(0, this.dungeon.checkpointCount - 1));
    this.hud.setBoard(this.race.standings(), this.selfId);
    this.hud.setState(p.state.state, p.state.speed);
    this.hud.setPeers(this.network.peerCount);
    const ab = this.abilities.get('punch');
    this.hud.setCooldowns({
      dash: p.state.dashCooldown / C.DASH_COOLDOWN,
      punch: ab ? ab.ratio : 0,
      jump: p.state.grounded ? 0 : (p.state.jumpsLeft > 0 ? 0 : 1),
    });
  }
}
