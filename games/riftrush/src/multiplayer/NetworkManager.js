import { CONFIG as C } from '../core/Config.js';
import { createSignaling } from './SignalingManager.js';
import { WebRTCManager } from './WebRTCManager.js';

/**
 * Protokoll-Schicht über WebRTC.
 *
 *  reliable  : profile | roster | start | event
 *  unreliable: s (State-Snapshot, NET_TICK_RATE Hz)
 *
 * Autorität (Prototyp):
 *   - Host bestimmt Dungeon-Seed und Match-Start
 *   - jeder Client kontrolliert sein eigenes Movement
 *   - Treffer werden vom Ziel-Client angewendet (kein Cheat-Schutz, bewusst)
 */
export class NetworkManager {
  constructor() {
    this.selfId = null;
    this.isHost = false;
    this.code = '';
    this.connected = false;
    this.profile = { name: 'Runner', color: 0x38f2c8, ready: false };
    this.roster = new Map();      // peerId -> { id, name, color, ready, connected }
    this.signaling = null;
    this.rtc = null;
    this._accum = 0;
    this._lastSent = 0;

    // Callbacks (vom Game gesetzt)
    this.onPlayerJoin = () => {};
    this.onPlayerLeave = () => {};
    this.onState = () => {};
    this.onEvent = () => {};
    this.onStart = () => {};
    this.onRosterChange = () => {};
    this.onStatus = () => {};
    this.onError = () => {};
    // liefert { seed, elapsed }, wenn gerade ein Match läuft (nur Host relevant)
    this.getMatchInfo = () => null;
  }

  get peerCount() { return this.rtc ? this.rtc.openCount : 0; }
  get isManual() { return this.signaling && this.signaling.needsBundledIce; }

  async connect({ code, url, selfId, isHost, profile }) {
    this.selfId = selfId;
    this.isHost = isHost;
    this.code = code;
    this.profile = { ...this.profile, ...profile };

    this.signaling = createSignaling({ url, selfId, room: code, isHost });
    this.signaling.onStatus = (s) => this.onStatus(s);
    this.signaling.onError = (e) => this.onError(e);

    this.rtc = new WebRTCManager(this.signaling);
    this.rtc.onStatus = (s) => this.onStatus(s);
    this.rtc.onOpen = (id) => this._onPeerOpen(id);
    this.rtc.onClose = (id) => this._onPeerClose(id);
    this.rtc.onMessage = (id, msg) => this._onMessage(id, msg);

    await this.signaling.start();
    this.connected = true;
    return this;
  }

  disconnect() {
    this.rtc?.closeAll();
    this.signaling?.stop();
    this.rtc = null;
    this.signaling = null;
    this.connected = false;
    this.roster.clear();
    this.onRosterChange();
  }

  // ---------------------------------------------------------------- intern
  _onPeerOpen(id) {
    if (!this.roster.has(id)) this.roster.set(id, { id, name: 'Runner', color: 0x888888, ready: false, connected: true });
    else this.roster.get(id).connected = true;
    this.rtc.send(id, { t: 'profile', ...this.profile, host: this.isHost }, true);
    // Läuft bereits ein Match, holt der Host den neuen Spieler direkt hinein
    const mi = this.isHost ? this.getMatchInfo() : null;
    if (mi) this.rtc.send(id, { t: 'start', seed: mi.seed, countdown: 0, elapsed: mi.elapsed }, true);
    this.onStatus(`Peer verbunden: ${id}`);
    this.onPlayerJoin(id, this.roster.get(id));
    this.onRosterChange();
  }

  _onPeerClose(id) {
    this.roster.delete(id);
    this.onPlayerLeave(id);
    this.onRosterChange();
  }

  _onMessage(id, msg) {
    switch (msg.t) {
      case 'profile': {
        const p = this.roster.get(id) || { id, connected: true };
        p.name = msg.name; p.color = msg.color; p.ready = !!msg.ready; p.host = !!msg.host;
        this.roster.set(id, p);
        this.onPlayerJoin(id, p);
        this.onRosterChange();
        break;
      }
      case 'ready': {
        const p = this.roster.get(id);
        if (p) { p.ready = !!msg.ready; this.onRosterChange(); }
        break;
      }
      case 'start':
        this.onStart(msg);
        break;
      case 's':
        this.onState(id, msg);
        break;
      case 'event':
        this.onEvent(id, msg.e);
        break;
    }
  }

  // ---------------------------------------------------------------- senden
  updateProfile(patch) {
    Object.assign(this.profile, patch);
    this.rtc?.broadcast({ t: 'profile', ...this.profile, host: this.isHost }, true);
    this.onRosterChange();
  }

  setReady(ready) {
    this.profile.ready = ready;
    this.rtc?.broadcast({ t: 'ready', ready }, true);
    this.onRosterChange();
  }

  startMatch(seed, countdownMs) {
    const msg = { t: 'start', seed, countdown: countdownMs };
    this.rtc?.broadcast(msg, true);
    return msg;
  }

  sendEvent(e) {
    this.rtc?.broadcast({ t: 'event', e }, true);
  }

  /**
   * Event gezielt an einen Peer.
   * Wichtig für Treffer: im manuellen Modus sind die Peer-IDs lokale Aliase
   * ("host"/"guest"), ein Abgleich über die eigene ID würde fehlschlagen.
   */
  sendEventTo(id, e) {
    this.rtc?.send(id, { t: 'event', e }, true);
  }

  /** State-Snapshot mit fester Tickrate (nicht jeden Frame!). */
  tickState(dt, netState) {
    if (!this.rtc) return;
    this._accum += dt;
    const interval = 1 / C.NET_TICK_RATE;
    if (this._accum < interval) return;
    this._accum = 0;
    netState.t = 's';
    netState.ts = performance.now();
    this.rtc.broadcast(netState, false);
  }

  /** Alle bekannten Spieler inkl. sich selbst. */
  allPlayers() {
    const list = [{ id: this.selfId, ...this.profile, self: true, host: this.isHost }];
    for (const p of this.roster.values()) list.push(p);
    return list;
  }
}
