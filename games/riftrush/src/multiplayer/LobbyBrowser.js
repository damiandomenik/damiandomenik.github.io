/**
 * Lobby-Browser.
 *
 * WebRTC selbst kann keine Lobbys finden — P2P kennt nur Gegenstellen, die man
 * schon kennt. Der Signaling-Server weiß aber ohnehin, welche Räume existieren,
 * und gibt diese Liste hier heraus. Ohne Server (manueller Modus) gibt es
 * folglich auch keine Liste; dort bleibt der Code-Austausch der Weg.
 *
 * Die Verbindung ist getrennt von der Spielverbindung und wird beim Beitreten
 * wieder geschlossen.
 */
export class LobbyBrowser {
  constructor() {
    this.ws = null;
    this.url = '';
    this.rooms = [];
    this.status = 'idle';        // idle | connecting | online | error
    this.onUpdate = () => {};
    this._retry = null;
    this._closedByUser = false;
  }

  get available() { return /^wss?:\/\//i.test(this.url || ''); }

  /** Startet (oder wechselt) die Beobachtung eines Signaling-Servers. */
  start(url) {
    const clean = (url || '').trim();
    if (clean === this.url && this.ws && this.ws.readyState <= 1) return;
    this.stop();
    this.url = clean;
    if (!this.available) {
      this.status = 'idle';
      this.rooms = [];
      this.onUpdate(this);
      return;
    }
    this._connect();
  }

  _connect() {
    this._closedByUser = false;
    this.status = 'connecting';
    this.onUpdate(this);
    let ws;
    try { ws = new WebSocket(this.url); }
    catch { this.status = 'error'; this.onUpdate(this); return; }
    this.ws = ws;

    ws.onopen = () => {
      this.status = 'online';
      ws.send(JSON.stringify({ type: 'browse' }));
      this.onUpdate(this);
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'lobbies') {
        this.rooms = Array.isArray(msg.rooms) ? msg.rooms : [];
        this.onUpdate(this);
      }
    };
    ws.onerror = () => { this.status = 'error'; this.onUpdate(this); };
    ws.onclose = () => {
      this.ws = null;
      if (this._closedByUser) return;
      this.status = 'error';
      this.onUpdate(this);
      // einmal pro 5 s erneut versuchen, solange das Menü offen ist
      clearTimeout(this._retry);
      this._retry = setTimeout(() => { if (!this._closedByUser && this.url) this._connect(); }, 5000);
    };
  }

  /** Manuelle Aktualisierung (der Server pusht sonst von selbst). */
  refresh() {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'browse' }));
    else if (this.available) this._connect();
  }

  stop() {
    this._closedByUser = true;
    clearTimeout(this._retry);
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'unbrowse' }));
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.status = 'idle';
  }
}
