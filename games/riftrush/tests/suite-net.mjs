// DOM-Stubs für Nameplate-Canvas
const ctx2d = () => ({
  fillRect(){}, clearRect(){}, fillText(){}, roundRect(){}, fill(){}, beginPath(){},
  moveTo(){}, lineTo(){}, closePath(){}, drawImage(){},
  font:'', textAlign:'', textBaseline:'', fillStyle:'',
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d }) };
let T = 1000;
globalThis.performance = { now: () => T };

import * as THREE from 'three';
import { RemotePlayer } from '../src/multiplayer/RemotePlayer.js';
import { RaceManager } from '../src/gameplay/RaceManager.js';
import { CONFIG as C } from '../src/core/Config.js';

let fails = 0; const ok = (c,m)=>{ if(!c){console.log('  FAIL:',m); fails++;} };

console.log('=== Snapshot-Interpolation (20 Hz + Jitter + Paketverlust) ===');
const scene = new THREE.Scene();
const rp = new RemotePlayer(scene, { id:'p2', name:'Tester', color:0x38f2c8 });
const dt = 1/60, tick = 1000 / C.NET_TICK_RATE;
let nextPacket = T, sent = 0, speedMax = 0, jumps = 0, prev = null, lost = 0;
for (let f = 0; f < 600; f++) {
  T += dt * 1000;
  if (T >= nextPacket) {
    nextPacket += tick + (Math.random()*40 - 20);          // Jitter ±20 ms
    const t = (sent * tick) / 1000;
    if (Math.random() > 0.12) {                             // 12% Paketverlust
      rp.push({ x: 0, y: 0, z: -t * 12, vx:0, vy:0, vz:-12, r: 0, st:'sprint', cp: Math.floor(t) });
    } else lost++;
    sent++;
  }
  rp.update(dt);
  if (prev !== null) {
    const step = Math.abs(rp.render.z - prev) / dt;
    speedMax = Math.max(speedMax, step);
    if (f > 60 && step > 40) jumps++;                       // harte Sprünge?
  }
  prev = rp.render.z;
  ok(Number.isFinite(rp.render.z), 'NaN in Interpolation');
}
console.log(`  Pakete=${sent} verloren=${lost} finaleZ=${rp.render.z.toFixed(1)} maxSchritt=${speedMax.toFixed(1)} m/s Ruckler=${jumps}`);
ok(jumps === 0, `harte Positionssprünge (${jumps})`);
ok(Math.abs(rp.render.z + 12*10) < 25, `Interpolation läuft weg (z=${rp.render.z.toFixed(1)}, erwartet ~-120)`);
ok(rp.buffer.length < C.NET_SNAPSHOT_BUFFER + 2, 'Snapshot-Buffer wächst unbegrenzt');

console.log('=== Leaderboard / Platzierungen ===');
const race = new RaceManager(null);
race.reset([
  {id:'a',name:'Alex',color:1},{id:'b',name:'Player42',color:2},
  {id:'c',name:'Damian',color:3},{id:'d',name:'Max',color:4},
]);
race.get('a').checkpoint = 5; race.get('a').z = -300;
race.get('b').checkpoint = 5; race.get('b').z = -320;   // weiter im selben Abschnitt
race.get('c').checkpoint = 3; race.get('c').z = -180;
race.setFinish('d', 134000);
let st = race.standings();
ok(st[0].id === 'd', 'Finisher nicht auf Platz 1');
ok(st[1].id === 'b', 'Fortschritt innerhalb des Checkpoints falsch gewichtet');
ok(st[2].id === 'a' && st[3].id === 'c', 'Checkpoint-Sortierung falsch');
ok(!race.allFinished, 'allFinished zu früh true');
race.setFinish('a', 140000); race.setFinish('b', 150000); race.setFinish('c', 160000);
st = race.standings();
ok(st.map(e=>e.id).join('') === 'dabc', 'Zeitsortierung falsch: ' + st.map(e=>e.id).join(''));
ok(race.allFinished, 'allFinished bleibt false');
console.log('  Reihenfolge:', st.map((e,i)=>`${i+1}.${e.name}`).join('  '));

console.log(fails === 0 ? '\nERGEBNIS: alle Netzwerk-/Race-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);

export default fails;
