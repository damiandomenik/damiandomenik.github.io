import * as THREE from 'three';
import { PhysicsWorld } from '../src/core/Physics.js';
import { DungeonGenerator } from '../src/dungeon/DungeonGenerator.js';
import { PlayerMovement } from '../src/player/PlayerMovement.js';
import { CONFIG as C } from '../src/core/Config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };

const scene = new THREE.Scene(); const physics = new PhysicsWorld();
const dg = new DungeonGenerator(scene, physics);

console.log('=== 1. Struktur / Konnektivität (30 Seeds) ===');
for (let s = 0; s < 30; s++) {
  const seed = (s * 7919 + 13) >>> 0;
  dg.generate(seed, 9);
  // a) jeder Room-Eingang hat Boden auf Eingangshöhe
  for (const r of dg.rooms) {
    const o = r.origin;
    const list = physics.query(o.x-1, o.y-2, o.z-3, o.x+1, o.y+1, o.z+1);
    const floor = list.some(c => c.solid && Math.abs(c.maxY - o.y) < 0.7 &&
      c.minX <= o.x && c.maxX >= o.x && c.minZ <= o.z-1 && c.maxZ >= o.z-2);
    ok(floor, `seed ${seed}: Room ${r.index} (${r.def.id}) hat keinen Boden am Eingang y=${o.y.toFixed(1)}`);
  }
  // b) Abstieg pro Room kleiner als Kill-Plane-Abstand
  for (const r of dg.rooms) ok(r.exitY > C.KILL_Y + 8,
    `seed ${seed}: Room ${r.def.id} fällt ${r.exitY} (Kill-Plane ${C.KILL_Y})`);
  // c) kein Room-Typ zweimal direkt hintereinander
  for (let i = 1; i < dg.rooms.length; i++)
    ok(dg.rooms[i].def.id !== dg.rooms[i-1].def.id, `seed ${seed}: ${dg.rooms[i].def.id} doppelt hintereinander`);
  // d) genau ein Finish-Trigger
  const fin = physics.triggers.filter(t => t.userData?.type === 'finish');
  ok(fin.length === 1, `seed ${seed}: ${fin.length} Finish-Trigger`);
  // e) Checkpoints monoton in -Z
  for (let i = 1; i < dg.checkpoints.length; i++)
    ok(dg.checkpoints[i].position.z < dg.checkpoints[i-1].position.z, `seed ${seed}: Checkpoint-Reihenfolge falsch`);
  // f) vertical_shaft nicht versiegelt: über der Ausgangshöhe darf keine Wand am Ausgang stehen
  for (const r of dg.rooms.filter(r => r.def.id === 'vertical_shaft')) {
    const e = r.exit;
    const blocked = physics.query(e.x-0.5, e.y+0.2, e.z-0.5, e.x+0.5, e.y+1.8, e.z+0.5)
      .some(c => c.solid && c.maxY > e.y + 0.5 && c.minZ < e.z && c.maxZ > e.z);
    ok(!blocked, `seed ${seed}: vertical_shaft Ausgang versperrt`);
  }
}
console.log(fails === 0 ? '  alle Struktur-Checks bestanden' : `  ${fails} Fehler`);

console.log('=== 2. Movement-Features ===');
const before = fails;
dg.generate(7, 9);
const mv = new PlayerMovement(physics);
const dt = 1/60;
function fresh(x=0,y=0.2,z=-3){ const s = PlayerMovement.createState(); s.pos={x,y,z}; return s; }
const CMD = () => ({ mx:0, mz:0, yaw:0, sprint:false, crouch:false, jump:false, dash:false });

// Slide
let s = fresh(), cmd = CMD(); cmd.mz=1; cmd.sprint=true;
for (let i=0;i<90;i++) mv.update(s,cmd,dt);
cmd.crouch = true; mv.update(s,cmd,dt);
ok(s.sliding && s.state==='slide', 'Slide startet nicht aus dem Sprint');
ok(s.height < C.PLAYER_HEIGHT, 'Slide reduziert die Höhe nicht');
const slideSpeed = s.speed;
ok(slideSpeed > C.SPRINT_SPEED, `Slide gibt keinen Boost (${slideSpeed.toFixed(1)})`);
for (let i=0;i<80;i++) mv.update(s,cmd,dt);
ok(!s.sliding, 'Slide endet nicht');

// Double Jump
s = fresh(); cmd = CMD();
for (let i=0;i<10;i++) mv.update(s,cmd,dt);
cmd.jump=true; mv.update(s,cmd,dt); cmd.jump=false;
for (let i=0;i<20;i++) mv.update(s,cmd,dt);
const y1 = s.pos.y;
cmd.jump=true; mv.update(s,cmd,dt); cmd.jump=false;
ok(s.jumpsLeft===0, 'Double Jump verbraucht keine Ladung');
let peak=s.pos.y; for(let i=0;i<60;i++){mv.update(s,cmd,dt); peak=Math.max(peak,s.pos.y);}
ok(peak > y1+1.2, `Double Jump hebt nicht (${(peak-y1).toFixed(2)}m)`);

// Wallrun gegen eine Testwand
const w = new PhysicsWorld();
const { Collider } = await import('../src/core/Physics.js');
w.add(new Collider(0,-1,0, 60,1,60,'solid'));      // Boden
w.add(new Collider(4,0,0, 1,10,40,'solid'));       // Wand rechts
w.build();
const mv2 = new PlayerMovement(w);
s = fresh(0,0,0); cmd = CMD(); cmd.mz=1; cmd.sprint=true;
for (let i=0;i<40;i++) mv2.update(s,cmd,dt);       // Speed aufbauen
cmd.jump=true; mv2.update(s,cmd,dt); cmd.jump=false;
cmd.mx=1;                                           // in die Wand steuern
let wr=false; for (let i=0;i<40;i++){ mv2.update(s,cmd,dt); if (s.wallrunning) wr=true; }
ok(wr, 'Wallrun startet nicht');
// Walljump
if (wr) {
  s.wallrunning = true; s.wallTimer = 1; s.wallNormal={x:-1,z:0}; s.grounded=false;
  cmd.jump = true; mv2.update(s,cmd,dt); cmd.jump=false;
  ok(s.vel.y > 8 && s.vel.x < -6, `Walljump falsch (vy=${s.vel.y.toFixed(1)} vx=${s.vel.x.toFixed(1)})`);
}
// Dash-Cooldown
s = fresh(); cmd = CMD(); cmd.dash=true; mv.update(s,cmd,dt);
ok(s.dashing, 'Dash startet nicht');
cmd.dash=false; for(let i=0;i<20;i++) mv.update(s,cmd,dt);
cmd.dash=true; mv.update(s,cmd,dt);
ok(s.dashCooldown > 0.5, 'Dash-Cooldown greift nicht');
// Keine NaN
ok(Number.isFinite(s.pos.x+s.pos.y+s.pos.z+s.vel.x+s.vel.y+s.vel.z), 'NaN in Position/Velocity');
console.log(fails === before ? '  alle Movement-Checks bestanden' : `  ${fails-before} Fehler`);

console.log('=== 3. Determinismus (gleicher Seed => gleicher Dungeon) ===');
const b3 = fails;
const sig = (d) => d.boxes.map(b=>`${b.x.toFixed(3)},${b.y.toFixed(3)},${b.z.toFixed(3)},${b.kind}`).join('|');
dg.generate(4242, 9); const a = sig(dg);
dg.generate(999, 9);
dg.generate(4242, 9); const b = sig(dg);
ok(a === b, 'Dungeon ist nicht deterministisch');
console.log(fails === b3 ? '  deterministisch' : '  FEHLER');

console.log(fails === 0 ? '\nERGEBNIS: alle Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);

export default fails;
