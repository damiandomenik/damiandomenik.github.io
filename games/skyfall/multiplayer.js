// SKYFALL — multiplayer.js
//
// Signaling laeuft ueber die oeffentliche PeerJS-Cloud (kein eigener Server noetig,
// daher GitHub-Pages-tauglich). Der Host registriert eine feste Peer-ID der Form
// "skyfall-X7K2P" — der hintere Teil IST der Room-Code, den der Host weitergibt.
// Danach laeuft das gesamte Gameplay P2P ueber WebRTC-DataChannels.
//
// Topologie: Stern. Alle Clients haben genau eine Verbindung zum Host.
// Der Host ist Autorität für Core-HP, Schaden, Tod, Respawn und Match-State.
// Clients besitzen nur ihre eigene Transform-Information.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I,O,0,1
const PREFIX = 'skyfall-';

function makeCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

let nextLocalId = 1;

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.conns = new Map();       // peerId -> DataConnection (nur Host)
    this.hostConn = null;         // nur Client
    this.players = new Map();     // id -> {id,name,team,ready,craft,host}
    this.handlers = {};
    this.started = false;
    this.lastSent = 0;
    this.sendRate = 1 / 20;       // 20 Hz Transform-Updates
    this.stats = { in: 0, out: 0, ping: 0 };
    this._pingT = 0;
  }

  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(type, data) { (this.handlers[type] || []).forEach(f => f(data)); }

  /* ---------------------------------------------------------------- *
   *  Verbindungsaufbau
   * ---------------------------------------------------------------- */

  _newPeer(id) {
    if (typeof Peer === 'undefined') {
      this.emit('error', 'PeerJS wurde nicht geladen. Ohne Internetverbindung ist nur das Solo-Training moeglich.');
      return null;
    }
    return new Peer(id, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
  }

  // Raum eroeffnen. Bei Kollision der ID wird ein neuer Code gezogen.
  createRoom(name, attempt = 0) {
    if (attempt > 5) { this.emit('error', 'Kein freier Room-Code gefunden. Bitte erneut versuchen.'); return; }
    const code = makeCode();
    const peer = this._newPeer(PREFIX + code);
    if (!peer) return;
    this.peer = peer;
    this.isHost = true;

    peer.on('open', (id) => {
      this.code = code;
      this.myId = id;
      this.players.set(id, { id, name, team: 'blue', ready: false, craft: 'striker', host: true });
      this.emit('open', { code, id, host: true });
      this._pushLobby();
    });

    peer.on('connection', (conn) => this._acceptConn(conn));

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer.destroy();
        this.createRoom(name, attempt + 1);
      } else {
        this.emit('error', this._explain(err));
      }
    });
  }

  joinRoom(code, name) {
    code = (code || '').trim().toUpperCase();
    if (code.length < 4) { this.emit('error', 'Room-Code ist zu kurz.'); return; }
    const peer = this._newPeer(undefined);
    if (!peer) return;
    this.peer = peer;
    this.isHost = false;
    this.code = code;

    peer.on('open', (id) => {
      this.myId = id;
      const conn = peer.connect(PREFIX + code, { reliable: true, metadata: { name } });
      this.hostConn = conn;

      const timeout = setTimeout(() => {
        if (!conn.open) this.emit('error', `Kein Raum mit Code ${code} erreichbar.`);
      }, 9000);

      conn.on('open', () => {
        clearTimeout(timeout);
        conn.send({ t: 'hello', name });
        this.emit('open', { code, id, host: false });
      });
      conn.on('data', (m) => { this.stats.in++; this._onClientData(m); });
      conn.on('close', () => this.emit('disconnected', 'Verbindung zum Host verloren.'));
      conn.on('error', () => this.emit('error', 'Verbindungsfehler zum Host.'));
    });

    peer.on('error', (err) => this.emit('error', this._explain(err)));
  }

  _explain(err) {
    switch (err.type) {
      case 'peer-unavailable': return `Kein Raum mit Code ${this.code} gefunden.`;
      case 'network':          return 'Signaling-Server nicht erreichbar. Internetverbindung pruefen.';
      case 'browser-incompatible': return 'Dieser Browser unterstuetzt WebRTC nicht.';
      case 'webrtc':           return 'WebRTC-Verbindung fehlgeschlagen (evtl. blockiert ein Firewall/VPN den Traffic).';
      default:                 return 'Netzwerkfehler: ' + err.type;
    }
  }

  _acceptConn(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
    });
    conn.on('data', (m) => { this.stats.in++; this._onHostData(conn.peer, m); });
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      const p = this.players.get(conn.peer);
      this.players.delete(conn.peer);
      if (p) this.emit('peerLeave', p);
      this._pushLobby();
      this.publish({ t: 'leave', id: conn.peer });   // auch der Host muss aufraeumen
    });
    conn.on('error', () => this.conns.delete(conn.peer));
  }

  leave() {
    try { this.peer && this.peer.destroy(); } catch (e) { /* egal */ }
    this.peer = null; this.conns.clear(); this.hostConn = null;
    this.players.clear(); this.started = false;
  }

  /* ---------------------------------------------------------------- *
   *  Senden
   * ---------------------------------------------------------------- */

  broadcast(msg, exceptId = null) {
    if (!this.isHost) return;
    for (const [id, c] of this.conns) {
      if (id === exceptId || !c.open) continue;
      try { c.send(msg); this.stats.out++; } catch (e) { /* Kanal weg */ }
    }
  }

  // Nachricht an die Autorität. Beim Host ist das die lokale Verarbeitung.
  toHost(msg) {
    if (this.isHost) this._onHostData(this.myId, msg);
    else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); this.stats.out++; } catch (e) { /* Kanal weg */ }
    }
  }

  // Gezielt an einen einzelnen Peer (fuer Spaetzugang).
  sendTo(id, msg) {
    if (id === this.myId) { this._onClientData(msg); return; }
    const c = this.conns.get(id);
    if (c && c.open) { try { c.send(msg); this.stats.out++; } catch (e) { /* Kanal weg */ } }
  }

  // Host sendet an alle inkl. sich selbst.
  publish(msg) {
    this.broadcast(msg);
    this._onClientData(msg);
  }

  // Host leitet eine Client-Nachricht weiter — an alle ausser den Absender,
  // und an sich selbst, sofern er nicht der Absender ist.
  relay(msg, exceptId) {
    this.broadcast(msg, exceptId);
    if (exceptId !== this.myId) this._onClientData(msg);
  }

  /* ---------------------------------------------------------------- *
   *  Lobby (Host-Logik)
   * ---------------------------------------------------------------- */

  _lobbySnapshot() {
    return {
      t: 'lobby',
      code: this.code,
      hostId: this.myId,
      players: [...this.players.values()]
    };
  }

  _pushLobby() {
    if (!this.isHost) return;
    const snap = this._lobbySnapshot();
    this.broadcast(snap);
    this._onClientData(snap);
  }

  teamCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  canStart() {
    if (!this.isHost) return false;
    const all = [...this.players.values()];
    if (all.length < 1) return false;
    return all.every(p => p.ready);
  }

  startMatch(weather) {
    if (!this.isHost) return;
    this.started = true;
    this.publish({
      t: 'start',
      weather,
      seed: Math.floor(Math.random() * 1e9),
      players: [...this.players.values()]
    });
  }

  /* ---------------------------------------------------------------- *
   *  Empfang
   * ---------------------------------------------------------------- */

  // Host empfaengt von Client (oder von sich selbst ueber toHost).
  _onHostData(from, m) {
    if (!this.isHost) return;
    switch (m.t) {
      case 'hello': {
        // Automatisch in das kleinere Team einsortieren
        const team = this.teamCount('blue') <= this.teamCount('red') ? 'blue' : 'red';
        this.players.set(from, {
          id: from, name: (m.name || 'PILOT').slice(0, 14), team,
          ready: false, craft: 'striker', host: false
        });
        this.emit('peerJoin', this.players.get(from));
        this._pushLobby();
        if (this.started) {
          // Spaetzugang: aktuellen Matchstand nachreichen
          this.emit('lateJoin', from);
        }
        break;
      }
      case 'team': {
        const p = this.players.get(from);
        if (p && (m.team === 'blue' || m.team === 'red')) { p.team = m.team; p.ready = false; this._pushLobby(); }
        break;
      }
      case 'craft': {
        const p = this.players.get(from);
        if (p && ['interceptor', 'striker', 'bomber'].includes(m.craft)) { p.craft = m.craft; this._pushLobby(); }
        break;
      }
      case 'ready': {
        const p = this.players.get(from);
        if (p) { p.ready = !!m.v; this._pushLobby(); }
        break;
      }
      case 'st':
        // Transform eines Clients: unveraendert weiterreichen, aber Absender-ID
        // erzwingen, damit sich niemand als jemand anderes ausgeben kann.
        m.id = from;
        this.broadcast(m, from);
        if (from !== this.myId) this._onClientData(m);
        break;
      case 'ping':
        if (from !== this.myId) {
          const c = this.conns.get(from);
          if (c && c.open) c.send({ t: 'pong', a: m.a });
        }
        break;
      default:
        // Alle uebrigen Nachrichten (Schuesse, Trefferansprueche, Effekte)
        // wertet die Spiellogik im Host aus.
        m.from = from;
        this.emit('hostMsg', m);
    }
  }

  // Client (und Host lokal) empfaengt autoritative Nachrichten.
  _onClientData(m) {
    switch (m.t) {
      case 'lobby':
        this.players.clear();
        for (const p of m.players) this.players.set(p.id, p);
        this.code = m.code;
        this.hostId = m.hostId;
        this.emit('lobby', m);
        break;
      case 'start':
        this.started = true;
        this.players.clear();
        for (const p of m.players) this.players.set(p.id, p);
        this.emit('start', m);
        break;
      case 'leave':
        this.players.delete(m.id);
        this.emit('leave', m);
        break;
      case 'pong':
        this.stats.ping = Math.round(performance.now() - m.a);
        break;
      default:
        this.emit('msg', m);
    }
  }

  measurePing() {
    if (this.isHost || !this.hostConn || !this.hostConn.open) return;
    const now = performance.now();
    if (now - this._pingT < 2000) return;
    this._pingT = now;
    this.hostConn.send({ t: 'ping', a: now });
  }

  get me() { return this.players.get(this.myId); }
  get playerCount() { return this.players.size; }
}

export const net = new Net();
