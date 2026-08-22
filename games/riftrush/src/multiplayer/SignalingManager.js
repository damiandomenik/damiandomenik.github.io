/**
 * Signaling-Abstraktion.
 * Die WebRTC-Verbindung braucht einen Kanal zum Austausch von SDP/ICE.
 * Diese Schicht ist bewusst austauschbar (WebSocket-Server, Firebase,
 * Supabase, manuelles Copy&Paste ...). Das Spiel kennt nur dieses Interface:
 *
 *   start(), stop(), send(toId, payload)
 *   Callbacks: onPeerJoined(id, initiate), onPeerLeft(id), onSignal(fromId, payload),
 *              onStatus(text), onError(err)
 */
export class SignalingManager {
  constructor({ selfId, room, isHost }) {
    this.selfId = selfId;
    this.room = room;
    this.isHost = isHost;
    this.needsBundledIce = false;   // true => SDP erst nach vollständigem ICE-Gathering senden
    this.onPeerJoined = () => {};
    this.onPeerLeft = () => {};
    this.onSignal = () => {};
    this.onStatus = () => {};
    this.onError = () => {};
  }
  async start() {}
  stop() {}
  send() {}
  get label() { return 'none'; }
}

/** Signaling über einen kleinen WebSocket-Server (siehe /server). */
export class WebSocketSignaling extends SignalingManager {
  constructor(opts) {
    super(opts);
    this.url = opts.url;
    this.ws = null;
    this.retry = 0;
    this.closedByUser = false;
  }

  get label() { return 'WebSocket'; }

  start() {
    return new Promise((resolve, reject) => {
      let settled = false;
      try { this.ws = new WebSocket(this.url); }
      catch (e) { reject(e); return; }

      this.ws.onopen = () => {
        this.onStatus('verbunden mit Signaling');
        this.ws.send(JSON.stringify({ type: 'join', room: this.room, id: this.selfId, host: this.isHost }));
      };
      this.ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'joined':
            // Liste bereits vorhandener Peers -> wir initiieren die Offers
            (msg.peers || []).forEach((pid) => this.onPeerJoined(pid, true));
            if (!settled) { settled = true; resolve(); }
            break;
          case 'peer-joined':
            this.onPeerJoined(msg.id, false);
            break;
          case 'peer-left':
            this.onPeerLeft(msg.id);
            break;
          case 'signal':
            this.onSignal(msg.from, msg.data);
            break;
          case 'error':
            this.onError(new Error(msg.message || 'Signaling-Fehler'));
            break;
        }
      };
      this.ws.onerror = () => {
        if (!settled) { settled = true; reject(new Error('Signaling-Server nicht erreichbar')); }
      };
      this.ws.onclose = () => {
        this.onStatus('Signaling getrennt');
        if (!settled) { settled = true; reject(new Error('Signaling-Verbindung geschlossen')); }
      };
    });
  }

  send(toId, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'signal', room: this.room, from: this.selfId, to: toId, data: payload }));
    }
  }

  stop() {
    this.closedByUser = true;
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

/**
 * Manueller Modus ohne Server: SDP wird als Base64-Blob per Copy&Paste getauscht.
 * Unterstützt genau eine Gegenstelle (1v1) — ideal für einen schnellen Test
 * auf GitHub Pages ohne eigenes Backend.
 */
export class ManualSignaling extends SignalingManager {
  constructor(opts) {
    super(opts);
    this.needsBundledIce = true;
    this.peerId = opts.isHost ? 'guest' : 'host';
    this.onLocalBlob = () => {};   // UI zeigt diesen Blob an
  }

  get label() { return 'Manuell (Copy & Paste)'; }

  async start() {
    if (this.isHost) {
      // Host erzeugt sofort ein Offer
      this.onPeerJoined(this.peerId, true);
      this.onStatus('Warte auf Antwort-Code des Gastes');
    } else {
      this.onStatus('Offer-Code des Hosts einfügen');
    }
  }

  send(toId, payload) {
    this._lastBlob = encodeBlob({ from: this.selfId, data: payload });
    this.onLocalBlob(this._lastBlob);
  }

  /** Vom UI aufgerufen, wenn der Nutzer einen Code einfügt. */
  receiveBlob(text) {
    let obj;
    try { obj = decodeBlob(text.trim()); }
    catch { this.onError(new Error('Ungültiger Code')); return false; }
    if (!obj || !obj.data) { this.onError(new Error('Ungültiger Code')); return false; }
    if (!this.isHost && !this._joined) {
      this._joined = true;
      this.onPeerJoined(this.peerId, false);
    }
    this.onSignal(this.peerId, obj.data);
    return true;
  }

  stop() {}
}

export function encodeBlob(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
export function decodeBlob(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str))));
}

/** Fabrik: erzeugt die passende Signaling-Implementierung. */
export function createSignaling({ url, selfId, room, isHost }) {
  if (url && /^wss?:\/\//i.test(url.trim())) {
    return new WebSocketSignaling({ url: url.trim(), selfId, room, isHost });
  }
  return new ManualSignaling({ selfId, room, isHost });
}
