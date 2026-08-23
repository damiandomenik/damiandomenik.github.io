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

console.log('=== 1b. Checkpoints sind nicht tödlich (inkl. bewegter Hazards) ===');
{
  const b1b = fails;
  for (let s = 0; s < 20; s++) {
    const seed = (s * 104729 + 7) >>> 0;
    dg.generate(seed, 9);
    // Welt über 12 s simulieren: erfasst bewegte Hazards, Blinker und die Chase-Wall
    for (let t = 0; t <= 12; t += 0.1) {
      dg.update(0.1, t, { x: 0, y: 0, z: -1e6 });   // "Spieler" weit vorne
      for (const cp of dg.checkpoints) {
        const p = cp.position;
        const box = { minX: p.x - 0.4, maxX: p.x + 0.4, minY: p.y, maxY: p.y + 1.8, minZ: p.z - 0.4, maxZ: p.z + 0.4 };
        for (const c of [...physics.statics, ...physics.dynamics]) {
          if (c.kind !== 'hazard' || c.active === false) continue;
          if (c.maxX > box.minX && c.minX < box.maxX && c.maxY > box.minY &&
              c.minY < box.maxY && c.maxZ > box.minZ && c.minZ < box.maxZ) {
            ok(false, `seed ${seed}: Hazard auf Checkpoint ${cp.index} (${dg.rooms[cp.index]?.def.id}) bei t=${t.toFixed(1)}s — Respawn-Todesschleife`);
            t = 999; break;
          }
        }
        if (t > 900) break;
      }
    }
  }
  console.log(fails === b1b ? '  alle Checkpoints sicher' : `  ${fails - b1b} Fehler`);
}

console.log('=== 1c. Kein Z-Fighting: überlappende Boxen sind nicht koplanar ===');
{
  const b1c = fails;
  dg.generate(31337, 9);
  const inst = dg.group.children.filter((c) => c.isInstancedMesh);
  const boxes = [];
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const im of inst) {
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m); m.decompose(pos, q, sc);
      boxes.push({ x: pos.x, z: pos.z, w: sc.x, d: sc.z, top: pos.y + sc.y / 2 });
    }
  }
  let coplanar = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.05 &&
                      Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.05;
      if (overlap && Math.abs(a.top - b.top) < 1e-5) coplanar++;
    }
  }
  ok(coplanar === 0, `${coplanar} überlappende Boxenpaare mit identischer Oberkante (flimmern)`);
  console.log(fails === b1c ? `  ${boxes.length} Boxen geprüft, keine koplanaren Überlappungen` : '  FEHLER');
}

console.log('=== 1d. Materialien überleben mehrfaches Neubauen ===');
{
  const b1d = fails;
  dg.generate(11, 9);
  const watched = [...Object.values(dg.materials), ...Object.values(dg.rimMaterials)];
  let disposed = 0;
  const names = [];
  watched.forEach((m, i) => m.addEventListener('dispose', () => { disposed++; names.push(i); }));
  for (let i = 0; i < 4; i++) dg.generate(500 + i, 9);
  ok(disposed === 0, `${disposed} gemeinsame Materialien wurden beim Neuaufbau weggeworfen`);
  // Geteilte Geometrie darf ebenfalls nicht sterben
  let geoGone = 0;
  dg.group.traverse((o) => { if (o.isMesh && !o.geometry.attributes.position) geoGone++; });
  ok(geoGone === 0, 'Geometrie wurde freigegeben, obwohl sie noch benutzt wird');
  console.log(fails === b1d ? '  keine Material-Verluste' : '  FEHLER');
}

console.log('=== 1e. Wallrun nur an markierten Wänden ===');
{
  const b1e = fails;
  let runnable = 0, plain = 0, roomsWithRunWall = 0;
  for (let s = 0; s < 20; s++) {
    dg.generate((s * 8191 + 3) >>> 0, 9);
    const r = physics.statics.filter((c) => c.runnable).length;
    runnable += r;
    plain += physics.statics.filter((c) => c.solid && !c.runnable).length;
    if (r > 0) roomsWithRunWall++;
    // markierte Wände müssen hoch genug zum Laufen sein
    for (const c of physics.statics.filter((x) => x.runnable)) {
      ok(c.maxY - c.minY >= 6, `Laufwand nur ${(c.maxY - c.minY).toFixed(1)} m hoch`);
    }
  }
  ok(runnable > 0, 'Es gibt gar keine Wallrun-Wände');
  ok(roomsWithRunWall === 20, `Nur ${roomsWithRunWall}/20 Dungeons enthalten Wallrun-Passagen`);
  ok(plain > runnable * 2, 'Fast jede Wand ist eine Laufwand — dann ist die Markierung sinnlos');
  console.log(`  ${(runnable / 20).toFixed(1)} Laufwände vs. ${(plain / 20).toFixed(0)} normale Wände pro Dungeon`);
}

console.log('=== 1f. Wallrun-Räume sind ohne Wallrun nicht passierbar ===');
{
  const b1f = fails;
  dg.generate(4242, 9);
  // Bot ohne Wallrun-Fähigkeit muss im wall_gap scheitern
  const room = dg.rooms.find((r) => r.def.id === 'wall_gap') || dg.rooms.find((r) => r.def.id === 'wall_corridor');
  ok(!!room, 'Kein Wallrun-Raum in der Route');
  if (room) {
    const mv = new PlayerMovement(physics);
    const st = PlayerMovement.createState();
    st.pos = { x: 0, y: room.origin.y + 0.4, z: room.origin.z - 2 };
    const cmd = { mx: 0, mz: 1, yaw: 0, sprint: true, crouch: false, jump: false, dash: false };
    let deepest = st.pos.z;
    for (let f = 0; f < 400; f++) {
      cmd.jump = f % 25 === 0;
      mv.update(st, cmd, 1 / 60);
      deepest = Math.min(deepest, st.pos.z);
      if (st.pos.y < room.origin.y - 20) break;      // abgestürzt = Absicht
    }
    const reachedEnd = deepest < room.origin.z - room.length + 6;
    ok(!reachedEnd, 'Geradeaus-Bot kommt ohne Wallrun durch — die Passage ist zu einfach');
  }
  console.log(fails === b1f ? '  Wallrun ist dort wirklich nötig' : '  FEHLER');
}

console.log('=== 1g. Jeder Raum ist ohne Grenzsprünge durchquerbar ===');
{
  const b1g = fails;
  // Sprunghöhe 2.07 m (einfach) bzw. ~3.8 m (Doppelsprung). Die Hüllkurve
  // rechnet mit Sicherheitsabstand — Sprünge am Limit gelten als Fehler.
  const MAX_RISE = 3.2;
  const gapLimit = (dy) => (dy <= 1.7
    ? Math.max(2.5, 9.0 - Math.max(0, dy) * 2.6)
    : Math.max(1.5, 5.2 - (dy - 1.7) * 1.6));
  const gapOf = (a, b) => Math.hypot(
    Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX)),
    Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ)));

  let unreachable = 0, checked = 0;
  for (let s = 0; s < 12; s++) {
    dg.generate((s * 7919 + 13) >>> 0, 9);
    for (const room of dg.rooms) {
      const zLo = room.origin.z - room.length - 8, zHi = room.origin.z + 8;
      const P = [];
      const collect = (c) => {
        if (!c || c.kind === 'hazard') return;
        if (c.minZ > zHi || c.maxZ < zLo) return;
        if ((c.maxX - c.minX) < 0.8 || (c.maxZ - c.minZ) < 0.8) return;  // dünne Wände
        P.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, top: c.maxY });
      };
      physics.statics.forEach(collect);
      physics.dynamics.forEach(collect);
      const runWalls = physics.statics.some((c) => c.runnable && c.minZ < room.origin.z && c.maxZ > room.origin.z - room.length);
      const start = P.filter((p) => p.maxZ > room.origin.z - 6 && p.minZ < room.origin.z + 1 && Math.abs(p.top - room.origin.y) < 0.8);
      const goalZ = room.origin.z - room.length;
      const goal = P.filter((p) => p.minZ < goalZ + 7 && p.maxZ > goalZ - 1 && Math.abs(p.top - (room.origin.y + room.exitY)) < 0.8);
      if (!start.length || !goal.length) continue;
      checked++;
      const seen = new Set(start), queue = [...start];
      while (queue.length) {
        const a = queue.shift();
        for (const b of P) {
          if (seen.has(b)) continue;
          const dy = b.top - a.top;
          if (dy > MAX_RISE) continue;
          const g = gapOf(a, b);
          const wallHelp = runWalls && Math.abs((a.minX + a.maxX) / 2) < 8 && Math.abs((b.minX + b.maxX) / 2) < 8;
          if (g > gapLimit(dy) && !(wallHelp && g <= 24)) continue;
          seen.add(b); queue.push(b);
        }
      }
      if (!goal.some((g) => seen.has(g))) {
        unreachable++;
        if (unreachable < 4) ok(false, `Raum "${room.def.id}" (seed ${(s * 7919 + 13) >>> 0}) ist nicht durchquerbar — Sprung zu weit oder zu hoch`);
      }
    }
  }
  ok(unreachable === 0, `${unreachable} nicht durchquerbare Abschnitte`);
  console.log(fails === b1g ? `  ${checked} Raumdurchläufe geprüft, alle sicher erreichbar` : '  FEHLER');
}

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
const runWall = new Collider(2.6, 0, 0, 1, 10, 40, 'solid');
runWall.runnable = true;                            // markierte Laufwand
w.add(runWall);
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
// Gegenprobe: an einer NICHT markierten Wand darf kein Wallrun starten
{
  const w2 = new PhysicsWorld();
  w2.add(new Collider(0, -1, 0, 60, 1, 60, 'solid'));
  w2.add(new Collider(2.6, 0, 0, 1, 10, 40, 'solid'));   // gewöhnliche Wand
  w2.build();
  const mv3 = new PlayerMovement(w2);
  const s3 = fresh(0, 0, 0);
  const c3 = CMD(); c3.mz = 1; c3.sprint = true;
  for (let i = 0; i < 40; i++) mv3.update(s3, c3, dt);
  c3.jump = true; mv3.update(s3, c3, dt); c3.jump = false;
  c3.mx = 1;
  let wr2 = false;
  for (let i = 0; i < 60; i++) { mv3.update(s3, c3, dt); if (s3.wallrunning) wr2 = true; }
  ok(!wr2, 'Wallrun funktioniert auch an unmarkierten Wänden');
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

console.log('=== 2b. Bewegungsbudget: Sprünge müssen knapp sein ===');
{
  const b2b = fails;
  const measure = (dbl, dash, sprint = true) => {
    const w3 = new PhysicsWorld();
    w3.add(new Collider(0, -1, 10, 40, 1, 40, 'solid'));
    w3.build();
    const m = new PlayerMovement(w3);
    const st = PlayerMovement.createState();
    st.pos = { x: 0, y: 0, z: 5 };
    const cmd = { mx: 0, mz: 1, yaw: 0, sprint, crouch: false, jump: false, dash: false };
    for (let i = 0; i < 60; i++) m.update(st, cmd, dt);
    const z0 = st.pos.z;
    cmd.jump = true; m.update(st, cmd, dt); cmd.jump = false;
    let u = false, d = false;
    for (let i = 0; i < 300; i++) {
      cmd.jump = (dbl && !u && i === 10) ? (u = true) : false;
      cmd.dash = (dash && !d && i === 20) ? (d = true) : false;
      m.update(st, cmd, dt);
      if (i > 4 && st.pos.y <= 0) break;
    }
    return z0 - st.pos.z;
  };
  const walk = measure(false, false, false);
  const jump = measure(false, false);
  const dbl = measure(true, false);
  const dash = measure(true, true);
  ok(jump > walk + 1.5, 'Sprinten bringt beim Sprung kaum etwas');
  ok(dbl > jump + 2.5, 'Doppelsprung bringt zu wenig');
  ok(dash > dbl + 3, 'Dash bringt zu wenig');
  ok(jump < 10, `Ein einfacher Sprint-Sprung schafft ${jump.toFixed(1)} m — damit ist jede Lücke trivial`);
  console.log(`  Gehen ${walk.toFixed(1)} | Sprint ${jump.toFixed(1)} | +Doppel ${dbl.toFixed(1)} | +Dash ${dash.toFixed(1)} m`);

  // Lücken im Level müssen zur Reichweite passen: erreichbar, aber nicht geschenkt
  let worst = 0, worstRoom = '';
  for (let s2 = 0; s2 < 20; s2++) {
    dg.generate((s2 * 7717 + 5) >>> 0, 9);
    for (const room of dg.rooms) {
      if (!['parkour_bridges', 'parkour_pillars'].includes(room.def.id)) continue;
      const z0 = room.origin.z, z1 = room.origin.z - room.length;
      const tops = dg.boxes.filter((bx) => bx.z < z0 && bx.z > z1 && bx.w >= 2.4 && bx.d >= 2.4)
        .sort((a, b3) => b3.z - a.z);
      for (let i = 1; i < tops.length; i++) {
        const a = tops[i - 1], b3 = tops[i];
        const gap = Math.max(0, Math.hypot(a.x - b3.x, a.z - b3.z) - (a.d + b3.d) / 4 - (a.w + b3.w) / 4);
        if (gap > worst) { worst = gap; worstRoom = room.def.id; }
      }
    }
  }
  ok(worst < jump * 0.9, `Grösste Lücke ${worst.toFixed(1)} m bei ${jump.toFixed(1)} m Reichweite (${worstRoom}) — unfair`);
  ok(worst > walk, `Grösste Lücke nur ${worst.toFixed(1)} m — man kommt ohne Sprint hinüber`);
  console.log(`  grösste Lücke ${worst.toFixed(1)} m (${(worst / jump * 100).toFixed(0)} % der Reichweite)`);

  // Dash ist eine Ressource, keine Dauerfähigkeit
  const w4 = new PhysicsWorld();
  w4.add(new Collider(0, -1, 0, 40, 1, 40, 'solid'));
  w4.build();
  const m4 = new PlayerMovement(w4);
  const air = PlayerMovement.createState();
  air.pos = { x: 0, y: 20, z: 0 };
  const c4 = { mx: 0, mz: 1, yaw: 0, sprint: true, crouch: false, jump: false, dash: true };
  m4.update(air, c4, dt); c4.dash = false;
  const cd0 = air.dashCooldown;
  ok(cd0 > 1.5, 'Dash-Cooldown ist zu kurz');
  for (let i = 0; i < 60; i++) m4.update(air, c4, dt);
  ok(air.dashCooldown > cd0 - 0.25, 'Dash lädt in der Luft nach — dann ist er keine Ressource');
  ok(air.dashCharges === 0, 'Luft-Dash verbraucht keine Ladung');
  console.log(fails === b2b ? '  Bewegung ist ein Budget, kein Dauerangebot' : `  ${fails - b2b} Fehler`);
}

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
