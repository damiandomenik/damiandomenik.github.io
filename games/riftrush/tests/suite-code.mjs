/**
 * Beitritt per Zahlencode.
 *
 * Getestet wird gegen einen nachgebauten PeerServer, der sich exakt an das
 * dokumentierte Protokoll haelt (OPEN / ID-TAKEN / OFFER / ANSWER / CANDIDATE /
 * LEAVE / HEARTBEAT). Den oeffentlichen Vermittler kann ich hier nicht
 * erreichen — wenn der Client aber das Protokoll korrekt spricht, verhaelt er
 * sich dort genauso.
 */
import { WebSocketServer } from 'ws';
import { installWebRTCMock } from './mock-webrtc.mjs';

installWebRTCMock();
const { NetworkManager } = await import('../src/multiplayer/NetworkManager.js');
const { PeerSignaling, makeRoomCode, isValidCode, hostIdFor } =
  await import('../src/multiplayer/PeerSignaling.js');
const { CONFIG } = await import('../src/core/Config.js');

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Vermittler
const PORT = 8791;
const peers = new Map();
const log = { heartbeats: 0, relayed: 0, taken: 0 };
const server = new WebSocketServer({ port: PORT });
server.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const id = q.get('id');
  const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  if (!q.get('key') || !q.get('token') || !q.get('version')) {
    send({ type: 'ERROR', payload: { msg: 'unvollstaendige Anmeldung' } });
    ws.close();
    return;
  }
  if (peers.has(id)) { log.taken++; send({ type: 'ID-TAKEN', payload: { msg: 'ID is taken' } }); ws.close(); return; }
  peers.set(id, ws);
  send({ type: 'OPEN' });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === 'HEARTBEAT') { log.heartbeats++; return; }
    if (['OFFER', 'ANSWER', 'CANDIDATE'].includes(m.type)) {
      const dst = peers.get(m.dst);
      if (!dst) { send({ type: 'EXPIRE', src: m.dst }); return; }
      log.relayed++;
      dst.send(JSON.stringify({ type: m.type, src: id, payload: m.payload }));
    }
  });
  ws.on('close', () => {
    peers.delete(id);
    for (const other of peers.values()) {
      if (other.readyState === 1) other.send(JSON.stringify({ type: 'LEAVE', src: id }));
    }
  });
});
await wait(200);
CONFIG.PEER_SERVER = `ws://127.0.0.1:${PORT}`;
CONFIG.PEER_SERVERS = [CONFIG.PEER_SERVER];

const made = [];
async function player(name, code, isHost) {
  const n = new NetworkManager();
  const l = { joins: [], events: [], errors: [] };
  n.onPlayerJoin = (id, p) => l.joins.push(p.name);
  n.onEvent = (id, e) => l.events.push(e);
  n.onError = (e) => l.errors.push(e.message);
  await n.connect({
    code, url: '', selfId: `id-${name}`, isHost,
    profile: { name, color: 0x4c9dff, ready: false },
  });
  made.push(n);
  return { n, l };
}

try {
  console.log('=== 1. Code erzeugen und prüfen ===');
  {
    const codes = new Set();
    for (let i = 0; i < 500; i++) {
      const c = makeRoomCode();
      ok(/^\d{6}$/.test(c), `Code ist nicht sechsstellig: ${c}`);
      ok(c[0] !== '0', `Code beginnt mit Null: ${c}`);
      codes.add(c);
    }
    ok(codes.size > 400, `Nur ${codes.size} verschiedene Codes aus 500 — zu wenig Streuung`);
    ok(isValidCode('482913') && !isValidCode('48291') && !isValidCode('ABC123'),
      'Code-Prüfung akzeptiert Falsches oder lehnt Richtiges ab');
    console.log(`  ${codes.size} verschiedene aus 500 Versuchen`);
  }

  console.log('=== 1b. Anmeldung entspricht dem offiziellen Client ===');
{
  // Abgeglichen mit peerjs 1.5.5:
  //   wss://host:443/peerjs?key=<key>&id=<id>&token=<token>&version=1.5.5
  const seen = [];
  const probe = new WebSocketServer({ port: 8792 });
  probe.on('connection', (ws, req) => { seen.push(req.url); ws.send(JSON.stringify({ type: 'OPEN' })); });
  await wait(120);
  const sig = new PeerSignaling({ selfId: 'p', room: '482913', isHost: true, urls: ['ws://127.0.0.1:8792'] });
  await sig.start();
  await wait(80);
  const url = seen[0] || '';
  ok(/^\/peerjs\?/.test(url), `Falscher Pfad: ${url}`);
  const q = new URL(url, 'http://x').searchParams;
  ok(q.get('key') === 'peerjs', 'key fehlt oder ist falsch');
  ok(q.get('id') === 'riftrush-482913', `id falsch: ${q.get('id')}`);
  ok((q.get('token') || '').length >= 6, 'token fehlt');
  ok(/^\d+\.\d+\.\d+$/.test(q.get('version') || ''), `version fehlt oder unplausibel: ${q.get('version')}`);
  ok(q.get('version') === '1.5.5', `version ${q.get('version')} weicht vom offiziellen Client (1.5.5) ab`);
  console.log(`  ${url}`);
  sig.stop();
  probe.close();
}

console.log('=== 2. Host öffnet, zwei Gäste treten mit der Zahl bei ===');
  const code = makeRoomCode();
  const A = await player('Damian', code, true);
  await wait(150);
  ok(peers.has(hostIdFor(code)), `Host ist unter riftrush-${code} nicht erreichbar`);

  const B = await player('Alex', code, false);
  await wait(600);
  ok(A.n.peerCount === 1, `Host sieht ${A.n.peerCount} Mitspieler nach dem ersten Beitritt`);
  ok(B.n.peerCount === 1, 'Gast ist nicht mit dem Host verbunden');
  // Der Roster ist nach Transportkennung geschluesselt, nicht nach Spieler-ID
  const byName = (n2, nm) => [...n2.roster.values()].find((p) => p.name === nm);
  ok(byName(A.n, 'Alex'), 'Name kommt beim Host nicht an');
  ok(byName(B.n, 'Damian')?.host === true, 'Host-Kennzeichnung fehlt');
  ok(A.l.errors.length === 0 && B.l.errors.length === 0, 'Fehler: ' + [...A.l.errors, ...B.l.errors]);

  const C = await player('Max', code, false);
  await wait(900);
  ok(C.n.peerCount >= 1, 'Dritter Spieler kommt nicht rein');
  ok(A.n.peerCount === 2, `Host sieht ${A.n.peerCount} statt 2 Mitspieler`);
  // Volles Netz: auch die Gäste untereinander
  ok(B.n.peerCount === 2, `Gäste verbinden sich nicht untereinander (${B.n.peerCount})`);
  ok(C.n.peerCount === 2, `Dritter ist nicht mit beiden verbunden (${C.n.peerCount})`);
  console.log(`  Code ${code}: 3 Spieler, ${log.relayed} vermittelte Nachrichten`);

  console.log('=== 3. Spielverkehr läuft danach direkt ===');
  {
    const before = log.relayed;
    A.n.startMatch(4242, 3000);
    A.n.sendEvent({ t: 'punch' });
    for (let i = 0; i < 40; i++) A.n.tickState(1 / 60, { x: i, y: 0, z: -i, st: 'run', cp: 0, f: 0 });
    await wait(250);
    ok(B.l.events.some((e) => e.t === 'punch'), 'Ereignisse erreichen die Mitspieler nicht');
    ok(log.relayed === before,
      `Der Vermittler sieht weiter Spieldaten (${log.relayed - before}) — es läuft nicht Peer-to-Peer`);
    console.log('  Vermittler bleibt beim Spielen unbeteiligt');
  }

  console.log('=== 4. Falscher Code, belegter Code, Verlassen ===');
  {
    const D = new NetworkManager();
    let err = null;
    D.onError = (e) => { err = e; };
    try {
      await D.connect({
        code: '999111', url: '', selfId: 'id-lost', isHost: false,
        profile: { name: 'Verirrt', color: 1, ready: false },
      });
      await wait(400);
    } catch (e) { err = e; }
    ok(D.peerCount === 0, 'Beitritt mit unbekanntem Code stellt trotzdem eine Verbindung her');
    ok(err && err.noHost, 'Unbekannter Code wird nicht als "niemand da" gemeldet');
    ok(err && /999111/.test(err.message), 'Die Meldung nennt den eingegebenen Code nicht');
    D.disconnect();

    // Belegter Code -> ID-TAKEN
    const taken = new PeerSignaling({ selfId: 'x', room: code, isHost: true, url: CONFIG.PEER_SERVER });
    let notified = false;
    taken.onCodeTaken = () => { notified = true; };
    let threw = false;
    try { await taken.start(); } catch { threw = true; }
    ok(threw, 'Belegter Code wird nicht als Fehler gemeldet');
    ok(notified, 'onCodeTaken wird nicht ausgelöst — kein neuer Code möglich');
    ok(log.taken > 0, 'Der Vermittler hat den belegten Code gar nicht gemeldet');
    taken.stop();

    const leftBefore = A.n.peerCount;
    C.n.disconnect();
    await wait(500);
    ok(A.n.peerCount === leftBefore - 1, 'Verlassen wird nicht bemerkt');
  }

  console.log('=== 4b. Ausweichen auf einen zweiten Vermittler ===');
{
  const { probePeerServers } = await import('../src/multiplayer/PeerSignaling.js');
  // erster Eintrag tot, zweiter läuft
  const res = await probePeerServers(['ws://127.0.0.1:1', CONFIG.PEER_SERVER], 'peerjs', 2000);
  ok(res.ok, 'Verbindungstest findet keinen erreichbaren Vermittler');
  ok(res.url === CONFIG.PEER_SERVER, `Falscher Vermittler gemeldet: ${res.url}`);
  const bad = await probePeerServers(['ws://127.0.0.1:1'], 'peerjs', 1200);
  ok(!bad.ok, 'Toter Vermittler wird als erreichbar gemeldet');

  // Auch der echte Verbindungsaufbau muss weiterrücken
  const sig = new PeerSignaling({
    selfId: 'fallback', room: makeRoomCode(), isHost: true,
    urls: ['ws://127.0.0.1:1', CONFIG.PEER_SERVER],
  });
  await sig.start();
  ok(sig.url === CONFIG.PEER_SERVER, 'Verbindungsaufbau rückt nicht auf den zweiten Vermittler');
  ok(sig.attempt === 1, 'Der erste Versuch wurde übersprungen statt fehlzuschlagen');
  sig.stop();
  console.log('  toter Vermittler wird übersprungen');
}

console.log('=== 5. Verbindung wird gehalten ===');
  {
    const before = log.heartbeats;
    await wait(5400);
    ok(log.heartbeats > before, 'Keine Lebenszeichen — der Vermittler wirft die Verbindung raus');
    console.log(`  ${log.heartbeats - before} Lebenszeichen in 5 s`);
  }
} catch (err) {
  console.log('  FAIL: Ausnahme —', err.stack);
  fails++;
} finally {
  for (const n of made) { try { n.disconnect(); } catch {} }
  await wait(200);
  server.close();
  for (const ws of peers.values()) { try { ws.close(); } catch {} }
}

console.log(fails === 0 ? '\nERGEBNIS: alle Zahlencode-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
