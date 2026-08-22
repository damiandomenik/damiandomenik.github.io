import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.com/games/riftrush/', pretendToBeVisual: true });
const { window } = dom;

// --- Browser-Stubs, die jsdom nicht mitbringt ---
window.HTMLCanvasElement.prototype.getContext = function () {
  return { fillRect(){}, fillText(){}, roundRect(){}, fill(){}, clearRect(){}, drawImage(){},
           beginPath(){}, moveTo(){}, lineTo(){}, closePath(){},
           font:'', textAlign:'', textBaseline:'', fillStyle:'', measureText:()=>({width:10}) };
};
window.HTMLCanvasElement.prototype.requestPointerLock = function(){ 
  Object.defineProperty(window.document, 'pointerLockElement', { value: this, configurable: true });
  window.document.dispatchEvent(new window.Event('pointerlockchange'));
};
window.document.exitPointerLock = function(){
  Object.defineProperty(window.document, 'pointerLockElement', { value: null, configurable: true });
  window.document.dispatchEvent(new window.Event('pointerlockchange'));
};
window.RTCPeerConnection = class { constructor(){ this.connectionState='new'; } createDataChannel(){ return { readyState:'connecting', send(){}, close(){} }; } close(){} };
let now = 0;
window.performance.now = () => now;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.performance = window.performance;
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
globalThis.devicePixelRatio = 1;
globalThis.localStorage = window.localStorage;
globalThis.requestAnimationFrame = (fn)=>fn(0);
globalThis.WebSocket = window.WebSocket;
globalThis.RTCPeerConnection = window.RTCPeerConnection;

let fails = 0; const ok=(c,m)=>{ if(!c){console.log('  FAIL:',m); fails++;} };
const errors = [];
window.addEventListener('error', e => errors.push(e.message));

const { Game } = await import('../src/core/Game.js');
const { Phase } = await import('../src/core/GameState.js');

console.log('=== 1. Start / Menü ===');
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
game.start();
ok(game.state.phase === Phase.MENU, 'Startphase ist nicht MENU');
ok(!document.getElementById('overlay').classList.contains('hidden'), 'Menü-Overlay nicht sichtbar');
ok(document.getElementById('hud').classList.contains('hidden'), 'HUD im Menü sichtbar');

console.log('=== 2. Solo-Lobby ===');
document.getElementById('input-name').value = 'Damian';
document.getElementById('btn-solo').click();
ok(game.state.phase === Phase.LOBBY, 'Solo führt nicht in die Lobby');
ok(game.localPlayer.name === 'Damian', 'Name nicht übernommen');
ok(document.getElementById('lobby-players').textContent.includes('Damian'), 'Spieler nicht in Lobby-Liste');
ok(!document.getElementById('btn-start').classList.contains('hidden'), 'Start-Button fehlt für Host');

console.log('=== 3. Match starten + Countdown + Timer ===');
document.getElementById('btn-start').click();
ok(game.state.phase === Phase.COUNTDOWN, 'Kein Countdown nach Start');
ok(game.dungeon.rooms.length > 5, 'Dungeon nicht gebaut');
ok(document.getElementById('overlay').classList.contains('hidden'), 'Overlay bleibt sichtbar');
ok(!document.getElementById('hud').classList.contains('hidden'), 'HUD nicht sichtbar');

const step = (frames, keys = []) => {
  for (const k of keys) game.input.keys.add(k);
  for (let i = 0; i < frames; i++) { now += 16.7; game.renderer._loop(); }
  for (const k of keys) game.input.keys.delete(k);
};
// three.Clock nutzt performance.now über die globale Referenz
step(20);
ok(game.state.phase === Phase.COUNTDOWN, 'Countdown zu früh vorbei');
now += 3200; step(2);
ok(game.state.phase === Phase.RUNNING, 'Match startet nicht (Phase ' + game.state.phase + ')');

console.log('=== 4. Bewegung im Match ===');
const z0 = game.localPlayer.state.pos.z;
step(120, ['KeyW', 'ShiftLeft']);
const z1 = game.localPlayer.state.pos.z;
ok(z1 < z0 - 5, `Spieler bewegt sich nicht (${z0.toFixed(1)} -> ${z1.toFixed(1)})`);
ok(game.localPlayer.state.pos.y > -50, 'Spieler durch den Boden gefallen');
ok(document.getElementById('hud-time').textContent !== '00:00.00', 'Timer läuft nicht');
ok(document.getElementById('hud-board').textContent.includes('Damian'), 'Leaderboard leer');
ok(game.localPlayer.checkpoint >= 0, 'Checkpoint-Tracking kaputt');

console.log('=== 4a. Figur bleibt in der Bildmitte (WoW-Stil) ===');
{
  const THREE = await import('three');
  const v = new THREE.Vector3();
  let maxOff = 0;
  const sample = (keys, frames) => {
    step(frames, keys);
    game.camera.updateMatrixWorld(true);
    const p = game.localPlayer.state.pos;
    v.set(p.x, p.y + 0.9, p.z).project(game.camera);
    maxOff = Math.max(maxOff, Math.abs(v.x));
  };
  for (let i = 0; i < 6; i++) {
    sample(['KeyW', 'KeyD', 'ShiftLeft'], 12);   // vorwärts + strafe rechts
    sample(['KeyW', 'KeyA', 'ShiftLeft'], 12);   // Richtungswechsel
    sample(['KeyA'], 10);
    sample(['KeyD'], 10);
  }
  ok(maxOff < 0.09, `Figur wandert beim Strafen aus der Mitte (max ${maxOff.toFixed(3)} NDC)`);
  console.log(`  maximale Abweichung: ${(maxOff * 50).toFixed(1)} % der halben Bildbreite`);
}

console.log('=== 4b. Kamera überschlägt sich nicht bei Yaw + Pitch ===');
{
  let maxRoll = 0;
  for (const [yaw, pitch] of [[0,0],[1.2,0.8],[-2.4,-0.9],[3.9,1.0],[-5.5,0.6],[7.2,-1.1]]) {
    game.controller.yaw = yaw; game.controller.pitch = pitch;
    step(4);
    // Rechts-Vektor der Kamera darf keine Y-Komponente haben -> kein Roll
    const e = game.camera.matrixWorld.elements;
    maxRoll = Math.max(maxRoll, Math.abs(e[1]));
  }
  ok(maxRoll < 0.02, `Kamera rollt/überschlägt sich (max ${maxRoll.toFixed(3)} statt ~0)`);
  ok(game.camera.rotation.order === 'YXZ', 'Kamera nutzt nicht die Euler-Ordnung YXZ');
  game.controller.yaw = 0; game.controller.pitch = -0.12; step(4);
}

console.log('=== 5. Pause / Resume ===');
window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape' }));
ok(game.state.phase === Phase.PAUSED, 'Escape pausiert nicht');
document.getElementById('btn-resume').click();
ok(game.state.phase === Phase.RUNNING, 'Resume funktioniert nicht');

console.log('=== 6. Tippen in Formularfeldern blockiert nicht das Spiel ===');
const inp = document.getElementById('input-name');
inp.dispatchEvent(new window.KeyboardEvent('keydown', { code:'Space', bubbles:true }));
ok(!game.input.keys.has('Space'), 'Leertaste im Eingabefeld wird als Sprung gewertet');

console.log('=== 7. Ziel erreichen -> Ergebnisse ===');
const fin = game.physics.triggers.find(t => t.userData?.type === 'finish');
const p = game.localPlayer.state.pos;
p.x = (fin.minX+fin.maxX)/2; p.y = fin.minY + 0.5; p.z = (fin.minZ+fin.maxZ)/2;
game.localPlayer.state.vel = {x:0,y:0,z:0};
step(6);
ok(game.localPlayer.finished, 'Finish-Trigger löst nicht aus');
ok(game.state.phase === Phase.RESULTS, 'Kein Ergebnis-Screen (Phase ' + game.state.phase + ')');
ok(document.getElementById('results-list').textContent.includes('Damian'), 'Ergebnisliste leer');
const t = game.state.results[0].time;
ok(t > 0 && t < 600000, `Unplausible Endzeit ${t}`);

console.log('=== 8. Rematch ===');
const seed1 = game.state.seed;
document.getElementById('btn-rematch').click();
ok(game.state.phase === Phase.COUNTDOWN, 'Rematch startet nicht');
ok(game.state.seed !== seed1, 'Rematch nutzt denselben Seed');
ok(!game.localPlayer.finished, 'Finish-Flag nicht zurückgesetzt');
ok(game.race.standings().every(e => !e.finished), 'Race nicht zurückgesetzt');
now += 3300; step(60, ['KeyW']);
ok(game.state.phase === Phase.RUNNING, 'Zweiter Run läuft nicht');

console.log('=== 9. Speicher: mehrere Dungeon-Generierungen ===');
const before = game.scene.children.length;
for (let i=0;i<5;i++) game.buildDungeon(1000+i);
const after = game.scene.children.length;
ok(Math.abs(after-before) < 40, `Scene wächst bei Regeneration (${before} -> ${after})`);

console.log('=== 10. Verlassen ===');
game.leave();
ok(game.state.phase === Phase.MENU, 'Leave führt nicht ins Menü');
ok(game.remotePlayers.size === 0, 'Remote-Spieler nicht aufgeräumt');

ok(errors.length === 0, 'Laufzeitfehler: ' + errors.join(' | '));
console.log(fails===0 ? '\nERGEBNIS: alle E2E-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
