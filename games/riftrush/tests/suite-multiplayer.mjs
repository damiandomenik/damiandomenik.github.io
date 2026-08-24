/**
 * Multiplayer-Integrationstest.
 * Startet den ECHTEN Signaling-Server aus /server, verbindet mehrere
 * NetworkManager-Instanzen darüber und tauscht Daten über gemockte
 * PeerConnections aus (Loopback). Damit wird der komplette Pfad geprüft:
 *
 *   NetworkManager -> WebRTCManager -> Signaling -> Server -> Gegenstelle
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { installWebRTCMock, NETSTATS } from './mock-webrtc.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
installWebRTCMock();

const { NetworkManager } = await import('../src/multiplayer/NetworkManager.js');
const { CONFIG: C } = await import('../src/core/Config.js');

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Server
const PORT = 8734;
const server = spawn(process.execPath, [path.join(root, 'server', 'signaling-server.js')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
await wait(700);
ok(serverLog.includes('signaling on'), 'Signaling-Server startet nicht: ' + serverLog.slice(0, 300));

const URL_ = `ws://127.0.0.1:${PORT}`;
const made = [];
async function makePeer(id, name, color, isHost, code = 'TESTRM') {
  const n = new NetworkManager();
  const log = { joins: [], leaves: [], states: [], events: [], starts: [], errors: [] };
  n.onPlayerJoin = (pid, p) => log.joins.push({ pid, name: p.name });
  n.onPlayerLeave = (pid) => log.leaves.push(pid);
  n.onState = (pid, m) => log.states.push({ pid, m });
  n.onEvent = (pid, e) => log.events.push({ pid, e });
  n.onStart = (m) => log.starts.push(m);
  n.onError = (e) => log.errors.push(e.message);
  await n.connect({ code, url: URL_, selfId: id, isHost, profile: { name, color, ready: false } });
  made.push(n);
  return { n, log };
}

try {
  console.log('=== 1. Zwei Peers verbinden sich über den Server ===');
  const A = await makePeer('idA', 'Damian', 0x38f2c8, true);
  await wait(120);
  const B = await makePeer('idB', 'Alex', 0xff4d6d, false);
  await wait(500);

  ok(A.n.peerCount === 1, `Host sieht ${A.n.peerCount} Peers (erwartet 1)`);
  ok(B.n.peerCount === 1, `Client sieht ${B.n.peerCount} Peers (erwartet 1)`);
  ok(A.n.roster.get('idB')?.name === 'Alex', 'Host kennt den Namen des Clients nicht: ' + JSON.stringify([...A.n.roster.values()]));
  ok(B.n.roster.get('idA')?.name === 'Damian', 'Client kennt den Namen des Hosts nicht');
  ok(B.n.roster.get('idA')?.color === 0x38f2c8, 'Farbe wird nicht übertragen');
  ok(B.n.roster.get('idA')?.host === true, 'Host-Flag fehlt');
  ok(A.n.allPlayers().length === 2, 'allPlayers unvollständig');
  ok(A.log.errors.length === 0 && B.log.errors.length === 0, 'Fehler: ' + [...A.log.errors, ...B.log.errors]);

  console.log('=== 2. Ready-Status ===');
  B.n.setReady(true);
  await wait(120);
  ok(A.n.roster.get('idB').ready === true, 'Ready wird nicht übertragen');
  B.n.setReady(false);
  await wait(120);
  ok(A.n.roster.get('idB').ready === false, 'Ready-Reset kommt nicht an');

  console.log('=== 3. Match-Start (Seed-Verteilung) ===');
  A.n.startMatch(4242, 3000);
  await wait(120);
  ok(B.log.starts.length === 1, `Client erhält ${B.log.starts.length} Start-Nachrichten`);
  ok(B.log.starts[0]?.seed === 4242, 'Seed weicht ab -> unterschiedliche Dungeons!');
  ok(B.log.starts[0]?.countdown === 3000, 'Countdown fehlt');

  console.log('=== 4. State-Snapshots: Tickrate & Inhalt ===');
  const before = B.log.states.length;
  for (let i = 0; i < 120; i++) {                       // 2 Sekunden bei 60 fps
    A.n.tickState(1 / 60, { x: i * 0.1, y: 1, z: -i, vx: 0, vy: 0, vz: -12, r: 0.5, st: 'sprint', cp: 2, f: 0 });
  }
  await wait(200);
  const got = B.log.states.length - before;
  ok(got >= 30 && got <= 45, `Tickrate falsch: ${got} Pakete in 2 s (erwartet ~40 bei ${C.NET_TICK_RATE} Hz)`);
  const last = B.log.states.at(-1).m;
  ok(last.st === 'sprint' && last.cp === 2 && typeof last.ts === 'number', 'Snapshot unvollständig: ' + JSON.stringify(last));

  console.log('=== 5. Events (Treffer) ===');
  A.n.sendEvent({ t: 'hit', target: 'idB', kx: 10, ky: 5, kz: 0 });
  await wait(120);
  const hit = B.log.events.find((e) => e.e.t === 'hit');
  ok(!!hit, 'Treffer-Event kommt nicht an');
  ok(hit?.e.target === 'idB' && hit?.pid === 'idA', 'Treffer-Event fehlerhaft');

  console.log('=== 6. Dritter Spieler (Full Mesh) ===');
  const D = await makePeer('idC', 'Max', 0x6f7bff, false);
  await wait(600);
  ok(A.n.peerCount === 2, `Host sieht ${A.n.peerCount} Peers (erwartet 2)`);
  ok(B.n.peerCount === 2, `Client B sieht ${B.n.peerCount} Peers (erwartet 2)`);
  ok(D.n.peerCount === 2, `Client C sieht ${D.n.peerCount} Peers (erwartet 2)`);
  ok(D.n.roster.get('idA')?.name === 'Damian' && D.n.roster.get('idB')?.name === 'Alex',
    'Neuer Peer kennt nicht alle: ' + JSON.stringify([...D.n.roster.keys()]));

  console.log('=== 7. Broadcast an alle ===');
  const bBefore = B.log.events.length, cBefore = D.log.events.length;
  A.n.sendEvent({ t: 'switch', doorId: 'door_3' });
  await wait(150);
  ok(B.log.events.length === bBefore + 1 && D.log.events.length === cBefore + 1,
    'Broadcast erreicht nicht alle Peers');

  console.log('=== 8. Verlassen: genau ein Leave-Event ===');
  D.n.disconnect();
  await wait(500);
  ok(A.log.leaves.filter((x) => x === 'idC').length === 1,
    `Leave-Events für idC: ${A.log.leaves.filter((x) => x === 'idC').length} (erwartet 1)`);
  ok(A.n.peerCount === 1, `Nach Verlassen ${A.n.peerCount} Peers (erwartet 1)`);
  ok(!A.n.roster.has('idC'), 'Peer bleibt im Roster');

  console.log('=== 9. Paketverlust auf dem unreliable Channel ===');
  NETSTATS.dropRate = 0.25;
  const sBefore = B.log.states.length;
  for (let i = 0; i < 60; i++) A.n.tickState(1 / 60, { x: 0, y: 0, z: -i, vx: 0, vy: 0, vz: 0, r: 0, st: 'run', cp: 0, f: 0 });
  await wait(200);
  ok(B.log.states.length > sBefore, 'Bei Paketverlust kommt gar nichts mehr an');
  ok(B.log.errors.length === 0, 'Fehler bei Paketverlust');
  NETSTATS.dropRate = 0;

  console.log('=== 10. Reconnect in denselben Room ===');
  const E = await makePeer('idC2', 'Max2', 0x7ee787, false);
  await wait(600);
  ok(A.n.peerCount === 2, `Reconnect scheiterte (${A.n.peerCount} Peers)`);
  ok(A.n.roster.get('idC2')?.name === 'Max2', 'Reconnect-Profil fehlt');
  console.log('=== 10b. Lobby-Browser: Lobbys ohne Code finden ===');
  {
    const { LobbyBrowser } = await import('../src/multiplayer/LobbyBrowser.js');
    const br = new LobbyBrowser();
    let updates = 0;
    br.onUpdate = () => updates++;
    br.start(URL_);
    await wait(500);
    ok(br.status === 'online', `Browser nicht verbunden (${br.status})`);
    ok(br.rooms.length >= 1, 'Die offene Lobby taucht nicht in der Liste auf');
    const entry = br.rooms.find((r) => r.code === 'TESTRM');
    ok(!!entry, `Lobby TESTRM fehlt in der Liste: ${JSON.stringify(br.rooms)}`);
    ok(entry && entry.host === 'Damian', `Falscher Hostname: ${entry && entry.host}`);
    ok(entry && entry.players >= 2, `Spielerzahl falsch: ${entry && entry.players}`);
    ok(entry && entry.state === 'lobby', 'Lobby wird nicht als offen gemeldet');
    ok(entry && entry.max === 8, 'Maximale Spielerzahl fehlt');

    // Statuswechsel: Match gestartet -> Lobby zeigt "läuft"
    const before = updates;
    A.n.setLobbyState('running');
    await wait(300);
    ok(updates > before, 'Statusänderung wird nicht an die Browser gepusht');
    ok(br.rooms.find((r) => r.code === 'TESTRM')?.state === 'running',
      'Laufendes Match wird weiter als offen angezeigt');
    A.n.setLobbyState('lobby');
    await wait(200);

    // Neue Lobby erscheint automatisch, ohne Nachfragen
    const before2 = br.rooms.length;
    const F = await makePeer('idF', 'Zweiter', 0x7ee787, true, 'ROOM2');
    await wait(400);
    ok(br.rooms.length > before2, 'Neue Lobby erscheint nicht automatisch');
    ok(!!br.rooms.find((r) => r.code === 'ROOM2'), 'Zweite Lobby fehlt');

    // Beim Verlassen verschwindet sie wieder
    F.n.disconnect();
    await wait(500);
    ok(!br.rooms.find((r) => r.code === 'ROOM2'), 'Leere Lobby bleibt in der Liste stehen');

    br.stop();
    ok(br.ws === null, 'Browser-Verbindung wird nicht geschlossen');
  }

  console.log('=== 10c. Ohne Server keine Liste (aber saubere Meldung) ===');
  {
    const { LobbyBrowser } = await import('../src/multiplayer/LobbyBrowser.js');
    const br = new LobbyBrowser();
    br.start('');
    ok(br.available === false, 'Leere URL gilt als gültiger Server');
    ok(br.rooms.length === 0, 'Ohne Server werden Lobbys gemeldet');
    ok(br.status === 'idle', 'Falscher Status ohne Server');
    br.stop();
  }

  console.log('=== 10c2. Voreingestellter Server wird übernommen ===');
  {
    const { CONFIG } = await import('../src/core/Config.js');
    ok('SIGNALING_URL' in CONFIG, 'CONFIG.SIGNALING_URL fehlt — kein Ort fuer die Server-Adresse');
    ok(typeof CONFIG.SIGNALING_URL === 'string', 'SIGNALING_URL hat den falschen Typ');
    const fs2 = await import('fs');
    const path2 = await import('path');
    const srv = path2.join(root, 'server');
    for (const f of ['render.yaml', 'Dockerfile', 'fly.toml', 'signaling-server.js']) {
      ok(fs2.existsSync(path2.join(srv, f)), `Deployment-Vorlage fehlt: server/${f}`);
    }
    const render = fs2.readFileSync(path2.join(srv, 'render.yaml'), 'utf8');
    ok(render.includes('signaling-server.js'), 'render.yaml startet den falschen Prozess');
    ok(render.includes('rootDir: server'), 'render.yaml zeigt nicht auf den Serverordner');
  }

  console.log('=== 10d. Verbindungscodes sind kompakt und verlustfrei ===');
  {
    const sig = await import('../src/multiplayer/SignalingManager.js');
    const cands = Array.from({ length: 8 }, (_, i) =>
      `a=candidate:${i} 1 udp 2113937151 192.168.1.${i} 5000${i} typ host generation 0 ufrag AbCd network-cost 999`);
    const tcp = Array.from({ length: 6 }, (_, i) =>
      `a=candidate:t${i} 1 tcp 1518214911 192.168.1.${i} 9 typ host tcptype passive generation 0`);
    const sdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', ...cands, ...tcp].join('\r\n');
    const payload = { from: 'peer-abc', data: { type: 'sdp', sdp: { type: 'offer', sdp } } };
    const plain = Buffer.from(JSON.stringify(payload)).toString('base64').length;
    const code = await sig.encodeBlob(JSON.parse(JSON.stringify(payload)));
    const back = await sig.decodeBlob(code);
    ok(code.length < plain * 0.4, `Code nur ${code.length} statt ${plain} Zeichen — zu wenig Ersparnis`);
    ok(back.data.sdp.sdp.includes('a=candidate:0'), 'UDP-Kandidaten gehen beim Kodieren verloren');
    ok(!back.data.sdp.sdp.includes(' tcp '), 'TCP-Kandidaten werden nicht entfernt');
    ok(back.from === 'peer-abc', 'Absender geht verloren');
    ok(!/[^A-Za-z0-9_-]/.test(code), 'Code enthaelt Zeichen, die beim Kopieren kaputtgehen');
    // Alte, unkomprimierte Codes muessen weiterhin lesbar sein
    const legacy = Buffer.from(JSON.stringify(payload)).toString('base64');
    const old = await sig.decodeBlob(legacy);
    ok(old.from === 'peer-abc', 'Alte Codes lassen sich nicht mehr lesen');
    console.log(`  ${plain} -> ${code.length} Zeichen (${(100 - code.length / plain * 100).toFixed(0)} % kuerzer)`);
  }

  console.log('=== 11. Manueller Modus (ohne Server, Copy & Paste) ===');
  const mkManual = async (id, name, isHost) => {
    const n = new NetworkManager();
    const log = { joins: [], events: [], blobs: [] };
    n.onPlayerJoin = (pid, p) => log.joins.push({ pid, name: p.name });
    n.onEvent = (pid, e) => log.events.push({ pid, e });
    await n.connect({ code: 'MANUAL', url: '', selfId: id, isHost, profile: { name, color: 0x38f2c8, ready: false } });
    n.signaling.onLocalBlob = (b) => log.blobs.push(b);
    if (n.signaling._lastBlob) log.blobs.push(n.signaling._lastBlob);
    made.push(n);
    return { n, log };
  };
  const H = await mkManual('uid-host', 'HostSpieler', true);
  const G = await mkManual('uid-guest', 'GastSpieler', false);
  await wait(120);
  ok(H.n.isManual, 'Ohne URL wird nicht auf manuelles Signaling umgeschaltet');
  ok(H.log.blobs.length > 0, 'Host erzeugt keinen Offer-Code');
  ok(await G.n.signaling.receiveBlob(H.log.blobs.at(-1)) === true, 'Gast kann den Offer-Code nicht lesen');
  await wait(150);
  ok(G.log.blobs.length > 0, 'Gast erzeugt keinen Antwort-Code');
  ok(await H.n.signaling.receiveBlob(G.log.blobs.at(-1)) === true, 'Host kann den Antwort-Code nicht lesen');
  await wait(300);
  ok(H.n.peerCount === 1 && G.n.peerCount === 1, `Manuelle Verbindung steht nicht (${H.n.peerCount}/${G.n.peerCount})`);
  ok(H.n.roster.get('guest')?.name === 'GastSpieler', 'Profil kommt im manuellen Modus nicht an');
  ok(G.n.roster.get('host')?.name === 'HostSpieler', 'Host-Profil fehlt beim Gast');
  ok(await G.n.signaling.receiveBlob('kein-gueltiger-code') === false, 'Ungültiger Code wird nicht abgefangen');

  // Treffer: IDs sind hier lokale Aliase ("guest"/"host") -> gerichteter Versand nötig
  H.n.sendEventTo('guest', { t: 'hit', target: 'guest', kx: 12, ky: 5, kz: 0 });
  await wait(150);
  const mhit = G.log.events.find((e) => e.e.t === 'hit');
  ok(!!mhit, 'Treffer erreicht den Gegner im manuellen Modus nicht');
  ok(mhit && mhit.e.target !== G.n.selfId,
    'Testannahme falsch: Alias-ID stimmt zufällig mit der eigenen ID überein');

} catch (err) {
  console.log('  FAIL: Ausnahme —', err.stack);
  fails++;
} finally {
  for (const n of made) { try { n.disconnect(); } catch {} }
  await wait(200);
  server.kill();
}

console.log(fails === 0 ? '\nERGEBNIS: alle Multiplayer-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
