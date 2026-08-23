import * as THREE from 'three';
import { CONFIG as C, COLORS } from './Config.js';
import { playerColorForId, pickFreeColor } from '../player/PlayerColors.js';
import { GameState, Phase } from './GameState.js';
import { Input, isTyping } from './Input.js';
import { PhysicsWorld } from './Physics.js';
import { uid, randomRoomCode, formatTime } from './Utils.js';
import { DungeonGenerator } from '../dungeon/DungeonGenerator.js';
import { LocalPlayer } from '../player/Player.js';
import { CharacterFx } from '../player/CharacterFx.js';
import { preloadPlayerModel } from '../player/ModelLibrary.js';
import { BossFight } from '../boss/BossFight.js';
import { AudioHooks } from './AudioHooks.js';
import { Environment } from './Environment.js';
import { PlayerController } from '../player/PlayerController.js';
import { AbilityManager } from '../gameplay/AbilityManager.js';
import { MatchManager } from '../gameplay/MatchManager.js';
import { RaceManager } from '../gameplay/RaceManager.js';
import { NetworkManager } from '../multiplayer/NetworkManager.js';
import { RemotePlayer } from '../multiplayer/RemotePlayer.js';
import { LobbyBrowser } from '../multiplayer/LobbyBrowser.js';
import { HUD } from '../ui/HUD.js';
import { LobbyUI } from '../ui/LobbyUI.js';
import { ResultsUI } from '../ui/ResultsUI.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.selfId = uid();
    this.color = playerColorForId(this.selfId);

    // ---------- Renderer / Scene ----------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.setClearColor(COLORS.bg, 1);

    this.scene = new THREE.Scene();
    // Nebelfarbe = Horizontfarbe des Himmels, dadurch verschwindet entfernte
    // Geometrie im Horizont statt in einer schwarzen Wand.
    this.scene.fog = new THREE.FogExp2(0x121a2e, 0.0105);
    this.camera = new THREE.PerspectiveCamera(C.CAM_FOV, innerWidth / innerHeight, 0.3, 400);
    this.env = new Environment(this.scene, this.renderer);
    // 'YXZ' ist Pflicht: nur in dieser Reihenfolge ist rotation.z ein echter Roll
    // um die Blickachse. Mit der Standardordnung 'XYZ' zerstört das Setzen von
    // rotation.z die von lookAt() berechnete Ausrichtung -> Kamera überschlägt sich.
    this.camera.rotation.order = 'YXZ';

    const amb = new THREE.AmbientLight(0x5c7ba8, 0.62);
    const dir = new THREE.DirectionalLight(0xbcd4ff, 1.15);
    dir.position.set(30, 60, 20);
    const hemi = new THREE.HemisphereLight(0x6f7bff, 0x0a0e18, 0.5);
    this.scene.add(amb, dir, hemi, dir.target);
    this.sun = dir;

    // Weiche Schatten: die Shadow-Kamera folgt dem Spieler, damit eine kleine
    // Map über den ganzen (sehr langen) Dungeon reicht.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = C.SHADOWS;
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const sc = dir.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24;
    sc.near = 1; sc.far = 170;
    sc.updateProjectionMatrix();
    dir.shadow.bias = -0.0004;
    dir.shadow.normalBias = 0.06;

    // ---------- Systeme ----------
    this.physics = new PhysicsWorld();
    this.dungeon = new DungeonGenerator(this.scene, this.physics);
    this.state = new GameState();
    this.input = new Input(canvas);
    this.audio = new AudioHooks();
    this.boss = null;
    this.race = new RaceManager(this);
    this.match = new MatchManager(this);
    this.network = new NetworkManager();
    this.browser = new LobbyBrowser();
    this.remotePlayers = new Map();

    this.fx = new CharacterFx(this.scene, 320);
    this.localPlayer = new LocalPlayer(this.scene, this.physics, {
      id: this.selfId, name: 'Runner', color: this.color,
    }, this.fx);
    this.localPlayer.character.setShadows(C.SHADOWS);
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
    // Charaktermodell im Hintergrund laden; schlägt es fehl, bleibt die
    // prozedurale Figur aktiv (das Spiel startet in jedem Fall sofort).
    if (C.CHARACTER_MODEL === 'glb') {
      preloadPlayerModel().then((r) => {
        if (r.ok) this._rebuildAllCharacters();
      });
    }
    // Lobby-Liste im Menü live halten
    this.browser.start(document.getElementById('input-signal')?.value || '');
    this.renderer.setAnimationLoop(this._loop);
  }

  // ================================================================ UI
  _wireUI() {
    const L = this.lobbyUI;
    this.browser.onUpdate = (b) => this.lobbyUI.setLobbyList(b);
    L.on('refreshLobbies', () => this.browser.refresh());
    L.on('signalChanged', (url) => this.browser.start(url));
    L.on('joinLobby', (code) => {
      const name = (document.getElementById('input-name').value.trim() || 'Runner').slice(0, 14);
      const url = document.getElementById('input-signal').value.trim();
      this.joinLobby(name, url, code);
    });
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
      const color = this._uniqueColor(id, profile.color);
      if (!rp) {
        rp = new RemotePlayer(this.scene, { id, name: profile.name, color }, this.fx);
        rp.character.setShadows(C.SHADOWS);
        this.remotePlayers.set(id, rp);
      } else rp.setProfile({ name: profile.name, color });
      this.race.add({ id, name: profile.name || 'Runner', color });
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
    n.onStart = (msg) => {
      this.match.beginMatch(msg.seed, msg.countdown, msg.elapsed || 0);
      if (msg.boss) this.boss?.applySnapshot(msg.boss);
    };
    n.getMatchInfo = () => (this.state.running
      ? { seed: this.state.seed, elapsed: this.state.elapsedMs, boss: this.boss?.snapshot() }
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
      case 'boss': {
        this.boss?.applyEvent(e.e, fromId);
        break;
      }
      case 'punch': {
        this.remotePlayers.get(fromId)?.character.punch();
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
    this.boss?.setHost(true);
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
    p.events.bossMech = (i) => {
      if (this.boss?.activateMechanism(i, this.selfId)) {
        const n = this.boss.mechanisms.filter(Boolean).length;
        this.hud.toast(`MECHANISMUS ${n}/3`, 1400);
      }
    };
    p.events.bossPortal = () => {
      const spawn = this.boss?.enterPortal(this.selfId, this.state.elapsedMs);
      if (!spawn) return;
      // Ab durchs Portal: Position, Tempo und Checkpoint auf die Endstrecke
      const s = p.state;
      s.pos.x = spawn.x; s.pos.y = spawn.y; s.pos.z = spawn.z;
      s.vel.x = s.vel.y = s.vel.z = 0;
      s.wallrunning = false; s.dashing = false; s.sliding = false;
      const idx = this.dungeon.bossArena?.exitRoomIndex;
      if (idx != null && idx > p.checkpoint) {
        p.checkpoint = idx;
        this.dungeon.checkpoints[idx]?.activate();
        this.network.sendEvent({ t: 'cp', i: idx });
      }
      this.controller.resetCamera();
      this.controller.addShake(0.8);
      this.hud.toast('DURCHS PORTAL — ENDSTRECKE!', 2400);
    };
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
    this.localPlayer.setName(name);
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

    this.browser.stop();
    this.state.set(Phase.LOBBY);
    this.ui.showLobby();
    this._refreshLobby();
  }

  startSolo(name) {
    this.localPlayer.setName(name);
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
    this.boss?.dispose();
    this.boss = null;
    this.network.disconnect();
    for (const rp of this.remotePlayers.values()) rp.dispose();
    this.remotePlayers.clear();
    this.race.entries.clear();
    this.state.solo = false;
    this.state.set(Phase.MENU);
    this.input.exitLock();
    this.ui.showMenu();
    this.browser.start(document.getElementById('input-signal')?.value || '');
  }

  buildDungeon(seed) {
    this.boss?.dispose();
    this.boss = null;
    this.dungeon.generate(seed, C.ROOM_COUNT);
    if (this.dungeon.bossArena) {
      this.boss = new BossFight({
        scene: this.scene, dungeon: this.dungeon, arena: this.dungeon.bossArena,
        fx: this.fx, audio: this.audio, seed,
      });
      this.boss.setHost(this.network.isHost || this.state.solo);
      this.boss.onEvent = (e) => this.network.sendEvent({ t: 'boss', e });
    }
    this._bossBonusFor = null;
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
    this.boss?.setHost(this.network.isHost || this.state.solo);
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
        this.localPlayer.update(dt, cmd, this.dungeon, st.running, this.camera);

        if (st.running && this.input.punchPressed && this.input.locked) {
          const ab = this.abilities.get('punch');
          if (ab.trigger()) this.localPlayer.punchCooldown = ab.cooldown;
        }
        this.abilities.update(dt);
        if (this.boss && st.running) {
          this.boss.update(dt, {
            localPlayer: this.localPlayer,
            remotePlayers: this.remotePlayers,
            controller: this.controller,
            onHit: (label) => this.hud.toast(`${label} — ZURÜCK ZUM CHECKPOINT`, 1600),
            onKill: () => {
              const cp = this.dungeon.checkpointPosition(this.localPlayer.checkpoint);
              this.localPlayer.respawnAt(cp);
            },
          });
          this._checkBossBonus();
        }
        for (const rp of this.remotePlayers.values()) {
          rp.update(dt, this.camera);
          this.race.updateRemote(rp);
        }
        this.fx.update(dt);
        this.env.update(dt, this.camera, this.localPlayer.state.pos.y);
        this._followSun();
        this.controller.updateCamera(dt);
        // Kamera an einer Wand ganz nah dran -> sonst steckt sie im eigenen Kopf
        if (this.controller.camDist < 2.0) this.localPlayer.character.setVisible(false);

        if (!st.solo) this.network.tickState(dt, this.localPlayer.netState());
        this.race.updateLocal(this.localPlayer, st.elapsedMs);
        this.match.update(dt);
        this._updateHud();
      }
    }

    if (!st.inWorld) this.env.update(dt, this.camera, 0);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  /** Schatten-Kamera dem Spieler nachführen. */
  _followSun() {
    const p = this.localPlayer.state.pos;
    this.sun.position.set(p.x + 26, p.y + 44, p.z + 18);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.target.updateMatrixWorld();
  }

  /** Bildhelligkeit zur Laufzeit (RIFTRUSH.setExposure(1.4)). */
  setExposure(v) {
    this.renderer.toneMappingExposure = Math.max(0.4, Math.min(2.5, v));
    this.hud.toast(`BELICHTUNG ${this.renderer.toneMappingExposure.toFixed(2)}`);
  }

  /** Statur der prozeduralen Figur: 'runner' | 'agile' | 'heavy'. */
  setBuild(name) {
    C.CHARACTER_BUILD = name;
    C.CHARACTER_MODEL = 'procedural';
    this._rebuildAllCharacters();
    this.hud.toast(`STATUR: ${name.toUpperCase()}`);
  }

  /** Zwischen GLB-Modell und prozeduraler Figur wechseln. */
  setCharacterModel(kind) {
    C.CHARACTER_MODEL = kind === 'glb' ? 'glb' : 'procedural';
    this._rebuildAllCharacters();
    this.hud.toast(`FIGUR: ${C.CHARACTER_MODEL.toUpperCase()}`);
  }

  _rebuildAllCharacters() {
    this.localPlayer.rebuildCharacter();
    for (const rp of this.remotePlayers.values()) {
      rp.rebuildCharacter();
      rp.character.setShadows(C.SHADOWS);
    }
  }

  /** Schatten zur Laufzeit umschalten (Performance-Notausgang). */
  setShadows(on) {
    C.SHADOWS = !!on;
    this.renderer.shadowMap.enabled = C.SHADOWS;
    this.localPlayer.character.setShadows(C.SHADOWS);
    for (const rp of this.remotePlayers.values()) rp.character.setShadows(C.SHADOWS);
    this.dungeon.setShadows(C.SHADOWS);
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  /** Verhindert, dass zwei Spieler lokal dieselbe Farbe tragen. */
  _uniqueColor(id, preferred) {
    const used = [this.color];
    for (const [pid, rp] of this.remotePlayers) if (pid !== id) used.push(rp.color);
    return pickFreeColor(used, preferred);
  }

  /** Der erste Treffer am Kern bringt eine kleine Zeitgutschrift. */
  _checkBossBonus() {
    const id = this.boss?.portalFirstBy;
    if (!id || id === this._bossBonusFor) return;
    // Korrigierbar: trifft später eine kleinere Rennzeit ein, wandert der Bonus
    if (this._bossBonusFor) this.race.setBonus(this._bossBonusFor, 0);
    this._bossBonusFor = id;
    this.race.setBonus(id, -C.BOSS_TIME_BONUS);
    const who = this.race.get(id);
    this.hud.toast(id === this.selfId
      ? `ERSTER DURCHS PORTAL — ${(C.BOSS_TIME_BONUS / 1000).toFixed(1)}s GUTSCHRIFT`
      : `${who?.name || 'Spieler'} ist zuerst durchs Portal`, 2600);
  }

  _updateHud() {
    const st = this.state;
    const p = this.localPlayer;
    this.hud.setTime(st.running || st.phase === Phase.RESULTS ? st.elapsedMs : 0);
    this.hud.setCheckpoint(p.checkpoint, Math.max(0, this.dungeon.checkpointCount - 1));
    this.hud.setBoard(this.race.standings(), this.selfId);
    this.hud.setState(p.state.state, p.state.speed);
    this.hud.setBoss(this.boss ? this.boss.hud : null);
    this.hud.setPeers(this.network.peerCount);
    const ab = this.abilities.get('punch');
    this.hud.setCooldowns({
      dash: p.state.dashCooldown / C.DASH_COOLDOWN,
      punch: ab ? ab.ratio : 0,
      jump: p.state.grounded ? 0 : (p.state.jumpsLeft > 0 ? 0 : 1),
    });
  }
}
