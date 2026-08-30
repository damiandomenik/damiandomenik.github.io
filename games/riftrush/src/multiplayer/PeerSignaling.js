/**
 * Verbindung über einen öffentlichen PeerServer-Vermittler.
 *
 * Warum überhaupt ein Vermittler: WebRTC verbindet direkt von Rechner zu
 * Rechner, aber die beiden Seiten müssen sich erst finden. Eine kurze Zahl
 * allein reicht dafür nie — irgendwo muss hinterlegt sein, welche Zahl zu
 * welchem Rechner gehört. Der Unterschied zu vorher ist nur, dass diese Stelle
 * bereits öffentlich betrieben wird und niemand etwas einrichten muss.
 *
 * Ablauf:
 *   Host meldet sich unter der ID "riftrush-482913" an (die 482913 sieht der
 *   Spieler). Wer beitritt, meldet sich unter einer eigenen ID an und schickt
 *   sein Angebot an die Host-ID. Der Vermittler reicht nur diese Nachrichten
 *   durch; danach läuft alles direkt zwischen den Spielern.
 *
 * Für ein vollständiges Netz teilt der Host die IDs aller Verbundenen über den
 * bereits bestehenden Datenkanal mit (siehe NetworkManager), sodass sich auch
 * die Gäste untereinander verbinden.
 */
/* Muss zur Version des offiziellen PeerJS-Clients passen — der Vermittler
 * kann abweichende Versionen ablehnen. Abgeglichen mit peerjs 1.5.5:
 *   wss://0.peerjs.com:443/peerjs?key=peerjs&id=<ID>&token=<TOKEN>&version=1.5.5
 * Nachrichten: OPEN | ID-TAKEN | ERROR | OFFER | ANSWER | CANDIDATE | LEAVE
 *              | EXPIRE, dazu HEARTBEAT alle 5 s vom Client. */
const PROTOCOL_VERSION = '1.5.5';

/* Eigenständig statt von SignalingManager abgeleitet: sonst importieren sich
 * die beiden Dateien gegenseitig und die Klasse existiert beim Erben noch
 * nicht. Die Schnittstelle ist identisch. */
export class PeerSignaling {
  constructor({ selfId, room, isHost, url, urls, key = 'peerjs', name = 'Runner' }) {
    this.selfId = selfId;
    this.room = room;
    this.isHost = isHost;
    this.needsBundledIce = false;
    this.onPeerJoined = () => {};
    this.onPeerLeft = () => {};
    this.onSignal = () => {};
    this.onStatus = () => {};
    this.onError = () => {};
    const list = (urls && urls.length ? urls : [url || 'wss://0.peerjs.com'])
      .filter(Boolean).map((u) => String(u).replace(/\/+$/, ''));
    this.urls = list;
    this.url = list[0];
    this.attempt = 0;
    this.key = key;
    this.name = name;
    this.code = String(room || '').replace(/\D/g, '');
    this.peerId = isHost ? hostIdFor(this.code) : guestIdFor(this.code);
    this.hostPeerId = hostIdFor(this.code);
    this.ws = null;
    this.opened = false;
    this._hb = null;
    this._closedByUser = false;
    this.onCodeTaken = () => {};
  }

  get label() { return 'Code'; }

  /** Probiert die Vermittler der Reihe nach durch. */
  async start() {
    let last = null;
    for (let i = 0; i < this.urls.length; i++) {
      this.attempt = i;
      this.url = this.urls[i];
      try {
        await this._connectTo(this.url);
        return;
      } catch (e) {
        last = e;
        if (e && e.codeTaken) throw e;      // anderer Code noetig, nicht anderer Server
        this.onStatus(`${this.url} nicht erreichbar`);
      }
    }
    throw last || new Error('Kein Vermittler erreichbar');
  }

  _connectTo(base) {
    return new Promise((resolve, reject) => {
      const token = Math.random().toString(36).slice(2, 12);
      const url = `${base}/peerjs?key=${encodeURIComponent(this.key)}` +
        `&id=${encodeURIComponent(this.peerId)}&token=${token}&version=${PROTOCOL_VERSION}`;
      let ws;
      try { ws = new WebSocket(url); }
      catch (e) { reject(e); return; }
      this.ws = ws;
      let settled = false;
      const fail = (err) => { if (!settled) { settled = true; reject(err); } };

      ws.onopen = () => this.onStatus('mit dem Vermittler verbunden');
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'OPEN':
            this.opened = true;
            this._startHeartbeat();
            this.onStatus(this.isHost ? `Code ${this.code} ist offen` : 'verbinde mit dem Host');
            // Gast meldet sich sofort beim Host
            if (!this.isHost) this.onPeerJoined(this.hostPeerId, true);
            if (!settled) { settled = true; resolve(); }
            break;
          case 'ID-TAKEN': {
            this.onCodeTaken();
            const e = new Error(this.isHost ? 'Code ist schon vergeben' : 'Verbindung fehlgeschlagen');
            e.codeTaken = true;
            fail(e);
            break;
          }
          case 'OFFER':
            this.onPeerJoined(msg.src, false);
            this.onSignal(msg.src, { type: 'sdp', sdp: msg.payload?.sdp });
            break;
          case 'ANSWER':
            this.onSignal(msg.src, { type: 'sdp', sdp: msg.payload?.sdp });
            break;
          case 'CANDIDATE':
            this.onSignal(msg.src, { type: 'candidate', candidate: msg.payload?.candidate });
            break;
          case 'EXPIRE': {
            const e = new Error(`Unter dem Code ${this.code} ist gerade niemand erreichbar.`);
            e.noHost = true;
            this.onError(e);
            break;
          }
          case 'LEAVE':
            this.onPeerLeft(msg.src);
            break;
          case 'ERROR':
            fail(new Error(msg.payload?.msg || 'Vermittler-Fehler'));
            break;
        }
      };
      ws.onerror = () => fail(new Error('Vermittler nicht erreichbar'));
      ws.onclose = () => {
        this._stopHeartbeat();
        if (!this._closedByUser) this.onStatus('Vermittler getrennt');
        fail(new Error('Verbindung zum Vermittler geschlossen'));
      };
    });
  }

  /** Verbindung zu einem weiteren Gast aufbauen (volles Netz). */
  connectToPeer(peerId) {
    if (!peerId || peerId === this.peerId) return;
    // Nur eine Seite initiiert, sonst kreuzen sich die Angebote
    if (this.peerId < peerId) this.onPeerJoined(peerId, true);
  }

  send(toId, payload) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const connectionId = `rr_${this.peerId}_${toId}`;
    if (payload.type === 'sdp') {
      const isOffer = payload.sdp?.type === 'offer';
      this.ws.send(JSON.stringify({
        type: isOffer ? 'OFFER' : 'ANSWER',
        dst: toId,
        payload: {
          sdp: payload.sdp,
          type: 'data',
          connectionId,
          label: connectionId,
          reliable: true,
          serialization: 'binary',
          browser: 'chrome',
          metadata: { game: 'riftrush', name: this.name },
        },
      }));
    } else if (payload.type === 'candidate') {
      this.ws.send(JSON.stringify({
        type: 'CANDIDATE',
        dst: toId,
        payload: { candidate: payload.candidate, type: 'data', connectionId },
      }));
    }
  }

  sendMeta() { /* der Vermittler kennt keine Lobby-Daten */ }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._hb = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
    }, 5000);
  }

  _stopHeartbeat() {
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
  }

  stop() {
    this._closedByUser = true;
    this._stopHeartbeat();
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

/** Sechsstelliger Zahlencode, gut vorlesbar (keine führende Null). */
export function makeRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hostIdFor(code) { return `riftrush-${code}`; }
export function guestIdFor(code) {
  return `riftrush-${code}-${Math.random().toString(36).slice(2, 8)}`;
}
export function isValidCode(code) { return /^\d{6}$/.test(String(code || '').trim()); }


/**
 * Prüft, ob ein Vermittler erreichbar ist — ohne eine Lobby zu eröffnen.
 * Meldet zurück, welcher Server geantwortet hat oder woran es scheitert.
 */
export function probePeerServers(urls, key = 'peerjs', timeoutMs = 6000) {
  const list = (urls || []).filter(Boolean);
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = () => {
      if (i >= list.length) { resolve({ ok: false, error: 'Kein Vermittler erreichbar' }); return; }
      const base = String(list[i++]).replace(/\/+$/, '');
      const id = `riftrush-probe-${Math.random().toString(36).slice(2, 10)}`;
      const token = Math.random().toString(36).slice(2, 10);
      let ws, done = false;
      const finish = (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { ws?.close(); } catch {}
        if (res.ok) resolve(res); else tryNext();
      };
      const timer = setTimeout(() => finish({ ok: false }), timeoutMs);
      try {
        ws = new WebSocket(`${base}/peerjs?key=${encodeURIComponent(key)}&id=${id}&token=${token}&version=1.5.2`);
      } catch { finish({ ok: false }); return; }
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'OPEN') finish({ ok: true, url: base });
        else if (m.type === 'ERROR') finish({ ok: false });
      };
      ws.onerror = () => finish({ ok: false });
      ws.onclose = () => finish({ ok: false });
    };
    tryNext();
  });
}
