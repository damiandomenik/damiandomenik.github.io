/**
 * RiftRush — minimaler Signaling-Server.
 *
 *   npm install
 *   npm start                 # lauscht auf ws://localhost:8080
 *
 * Der Server vermittelt ausschließlich SDP/ICE zwischen den Peers.
 * Sobald die WebRTC-Verbindung steht, läuft das Spiel komplett P2P.
 * Deploybar auf jedem Node-Host (Render, Railway, Fly.io, Glitch, VPS ...).
 * Für HTTPS-Seiten (GitHub Pages) muss der Server über wss:// erreichbar sein.
 */
const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const rooms = new Map();   // roomCode -> Map(peerId -> ws)

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RiftRush signaling server OK\n');
});
const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  ws.meta = { room: null, id: null };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join') {
      const code = String(msg.room || '').toUpperCase().slice(0, 12);
      const id = String(msg.id || '').slice(0, 40);
      if (!code || !id) return send(ws, { type: 'error', message: 'room/id fehlt' });

      let room = rooms.get(code);
      if (!room) { room = new Map(); rooms.set(code, room); }
      if (room.size >= 8) return send(ws, { type: 'error', message: 'Lobby ist voll' });

      const peers = [...room.keys()];
      room.set(id, ws);
      ws.meta = { room: code, id };

      send(ws, { type: 'joined', peers, room: code });
      for (const [pid, pws] of room) {
        if (pid !== id) send(pws, { type: 'peer-joined', id });
      }
      console.log(`[join] ${id} -> ${code} (${room.size})`);
      return;
    }

    if (msg.type === 'signal') {
      const room = rooms.get(ws.meta.room);
      if (!room) return;
      const target = room.get(msg.to);
      if (target) send(target, { type: 'signal', from: ws.meta.id, data: msg.data });
      return;
    }

    if (msg.type === 'ping') send(ws, { type: 'pong' });
  });

  ws.on('close', () => {
    const { room: code, id } = ws.meta;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.delete(id);
    for (const pws of room.values()) send(pws, { type: 'peer-left', id });
    if (room.size === 0) rooms.delete(code);
    console.log(`[left] ${id} <- ${code}`);
  });
});

server.listen(PORT, () => console.log(`RiftRush signaling on :${PORT}`));
