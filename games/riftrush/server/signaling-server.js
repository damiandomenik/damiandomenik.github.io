/**
 * RiftRush — minimaler Signaling-Server mit Lobby-Liste.
 *
 *   npm install
 *   npm start                 # lauscht auf ws://localhost:8080
 *
 * Zwei Aufgaben:
 *   1. SDP/ICE zwischen den Peers vermitteln (danach läuft alles P2P)
 *   2. offene Lobbys auflisten, damit man nicht zwingend einen Code braucht
 *
 * Deploybar auf jedem Node-Host (Render, Railway, Fly.io, Glitch, VPS ...).
 * Für HTTPS-Seiten (GitHub Pages) muss der Server über wss:// erreichbar sein.
 */
const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 8;
const rooms = new Map();   // code -> { peers: Map(id -> ws), meta }
const browsers = new Set();

const server = http.createServer((req, res) => {
  if (req.url === '/lobbies') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(lobbyList()));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`RiftRush signaling server OK - ${rooms.size} Lobbys\n`);
});
const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function lobbyList() {
  const out = [];
  for (const [code, room] of rooms) {
    if (room.peers.size === 0) continue;
    out.push({
      code,
      host: room.meta.host || 'Runner',
      players: room.peers.size,
      max: MAX_PLAYERS,
      state: room.meta.state || 'lobby',
      age: Math.round((Date.now() - room.meta.created) / 1000),
    });
  }
  out.sort((a, b) => (a.state === b.state ? a.age - b.age : a.state === 'lobby' ? -1 : 1));
  return out;
}

function pushLobbies() {
  if (!browsers.size) return;
  const msg = { type: 'lobbies', rooms: lobbyList() };
  for (const ws of browsers) send(ws, msg);
}

wss.on('connection', (ws) => {
  ws.meta = { room: null, id: null, browsing: false };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // ---------- Lobby-Browser ----------
    if (msg.type === 'browse') {
      ws.meta.browsing = true;
      browsers.add(ws);
      send(ws, { type: 'lobbies', rooms: lobbyList() });
      return;
    }
    if (msg.type === 'unbrowse') {
      ws.meta.browsing = false;
      browsers.delete(ws);
      return;
    }

    // ---------- Lobby betreten ----------
    if (msg.type === 'join') {
      const code = String(msg.room || '').toUpperCase().slice(0, 12);
      const id = String(msg.id || '').slice(0, 40);
      if (!code || !id) return send(ws, { type: 'error', message: 'room/id fehlt' });

      let room = rooms.get(code);
      if (!room) {
        room = { peers: new Map(), meta: { created: Date.now(), state: 'lobby', host: null } };
        rooms.set(code, room);
      }
      if (room.peers.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'Lobby ist voll' });

      const peers = [...room.peers.keys()];
      room.peers.set(id, ws);
      if (msg.host || !room.meta.host) room.meta.host = String(msg.name || 'Runner').slice(0, 14);
      ws.meta = { room: code, id, browsing: ws.meta.browsing };

      send(ws, { type: 'joined', peers, room: code });
      for (const [pid, pws] of room.peers) {
        if (pid !== id) send(pws, { type: 'peer-joined', id });
      }
      pushLobbies();
      console.log(`[join] ${id} -> ${code} (${room.peers.size})`);
      return;
    }

    // ---------- Lobby-Status (wartend / laeuft) ----------
    if (msg.type === 'meta') {
      const room = rooms.get(ws.meta.room);
      if (!room) return;
      if (msg.state) room.meta.state = msg.state === 'running' ? 'running' : 'lobby';
      if (msg.name) room.meta.host = String(msg.name).slice(0, 14);
      pushLobbies();
      return;
    }

    // ---------- WebRTC-Signaling ----------
    if (msg.type === 'signal') {
      const room = rooms.get(ws.meta.room);
      if (!room) return;
      const target = room.peers.get(msg.to);
      if (target) send(target, { type: 'signal', from: ws.meta.id, data: msg.data });
      return;
    }

    if (msg.type === 'ping') send(ws, { type: 'pong' });
  });

  ws.on('close', () => {
    browsers.delete(ws);
    const { room: code, id } = ws.meta;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.peers.delete(id);
    for (const pws of room.peers.values()) send(pws, { type: 'peer-left', id });
    if (room.peers.size === 0) rooms.delete(code);
    pushLobbies();
    console.log(`[left] ${id} <- ${code}`);
  });
});

server.listen(PORT, () => console.log(`RiftRush signaling on :${PORT}`));
