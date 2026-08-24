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
  /** Lobby-Metadaten (Hostname, wartend/läuft) — nur mit Server sinnvoll. */
  sendMeta() {}
  get label() { return 'none'; }
}

/** Signaling über einen kleinen WebSocket-Server (siehe /server). */
export class WebSocketSignaling extends SignalingManager {
  constructor(opts) {
    super(opts);
    this.url = opts.url;
    this.name = opts.name || 'Runner';
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
        this.ws.send(JSON.stringify({
          type: 'join', room: this.room, id: this.selfId, host: this.isHost, name: this.name,
        }));
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

  sendMeta(meta) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'meta', ...meta }));
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
    encodeBlob({ from: this.selfId, data: payload }).then((blob) => {
      this._lastBlob = blob;
      this.onLocalBlob(blob);
    });
  }

  /** Vom UI aufgerufen, wenn der Nutzer einen Code einfügt. */
  async receiveBlob(text) {
    let obj;
    try { obj = await decodeBlob(text); }
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

/* ------------------------------------------------------------------ Codes
 * Der Verbindungscode IST die Verbindungsinformation (SDP + ICE-Kandidaten) —
 * ohne Server gibt es nichts Kürzeres als das. Zwei Maßnahmen drücken ihn
 * trotzdem auf etwa ein Viertel:
 *   1. TCP-Kandidaten entfernen, solange UDP-Kandidaten vorhanden sind
 *      (für Peer-to-Peer ohne TURN sind sie praktisch nutzlos)
 *   2. verlustfrei komprimieren (deflate) und base64url ohne Füllzeichen
 * Präfix "R1" = komprimiert, "R0" = unkomprimiert (alter Browser).
 */
function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Entfernt TCP-Kandidaten, wenn es UDP-Kandidaten gibt. */
export function slimSdp(sdp) {
  if (!sdp) return sdp;
  const lines = sdp.split(/\r?\n/);
  const cand = lines.filter((l) => l.startsWith('a=candidate:'));
  const udp = cand.filter((l) => / udp /i.test(l));
  if (!cand.length || !udp.length) return sdp;
  return lines.filter((l) => !l.startsWith('a=candidate:') || / udp /i.test(l)).join('\r\n');
}

export async function encodeBlob(obj) {
  if (obj?.data?.sdp?.sdp) obj.data.sdp.sdp = slimSdp(obj.data.sdp.sdp);
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      return 'R1' + b64url(new Uint8Array(buf));
    } catch { /* faellt unten auf unkomprimiert zurueck */ }
  }
  return 'R0' + b64url(bytes);
}

export async function decodeBlob(str) {
  const clean = String(str).trim().replace(/\s+/g, '');
  const tag = clean.slice(0, 2);
  // Erst den Typ pruefen, dann dekodieren: sonst scheitert ein Code ohne
  // Praefix schon am Abschneiden der ersten beiden Zeichen.
  if (tag === 'R1' || tag === 'R0') {
    const body = unb64url(clean.slice(2));
    if (tag === 'R0') return JSON.parse(new TextDecoder().decode(body));
    const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }
  // alter Code ohne Praefix
  return JSON.parse(decodeURIComponent(escape(atob(clean))));
}

/** Fabrik: erzeugt die passende Signaling-Implementierung. */
export function createSignaling({ url, selfId, room, isHost, name }) {
  if (url && /^wss?:\/\//i.test(url.trim())) {
    return new WebSocketSignaling({ url: url.trim(), selfId, room, isHost, name });
  }
  return new ManualSignaling({ selfId, room, isHost });
}
