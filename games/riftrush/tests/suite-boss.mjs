/**
 * Boss-Encounter: Arena, Zustandsmaschine, Angriffe, Synchronisation.
 */
const ctx2d = () => ({
  fillRect(){}, clearRect(){}, fillText(){}, roundRect(){}, fill(){}, beginPath(){},
  moveTo(){}, lineTo(){}, closePath(){}, drawImage(){},
  font: '', textAlign: '', textBaseline: '', fillStyle: '',
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d }) };
let T = 0;
globalThis.performance = { now: () => T };

import * as THREE from 'three';
import { PhysicsWorld } from '../src/core/Physics.js';
import { DungeonGenerator } from '../src/dungeon/DungeonGenerator.js';
import { PlayerMovement } from '../src/player/PlayerMovement.js';
import { BossFight, BOSS_PHASE, ESCAPE_SECONDS } from '../src/boss/BossFight.js';
import { CharacterFx } from '../src/player/CharacterFx.js';
import { AudioHooks } from '../src/core/AudioHooks.js';
import { RaceManager } from '../src/gameplay/RaceManager.js';
import { CONFIG as C } from '../src/core/Config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };

const scene = new THREE.Scene();
const physics = new PhysicsWorld();
const dg = new DungeonGenerator(scene, physics);

console.log('=== 1. Arena ist Teil jedes Dungeons ===');
{
  const b = fails;
  for (let s = 0; s < 12; s++) {
    dg.generate((s * 6151 + 17) >>> 0, 9);
    const ids = dg.rooms.map((r) => r.def.id);
    ok(ids.includes('boss_arena'), `seed ${s}: keine Boss-Arena in der Route`);
    ok(ids.indexOf('boss_arena') === ids.length - 2, 'Boss steht nicht direkt vor dem Finish');
    ok(!!dg.bossArena, 'Arena-Beschreibung fehlt');
    const a = dg.bossArena;
    ok(a.mechanisms.length === 3, `${a.mechanisms.length} Mechanismen statt 3`);
    ok(a.tiles.length >= 12, `nur ${a.tiles.length} steuerbare Kacheln`);
    ok(a.tiles.some((t) => !t.collapsible), 'Alle Kacheln einstürzbar — Ausgang würde unerreichbar');
    ok(a.coreTrigger.active === false, 'Kern ist von Anfang an verwundbar');
    ok(!!dg.doors.get(a.doorId), 'Ausgangstür fehlt');
    // Mechanismen müssen erhöht stehen (Parkour nötig)
    for (const m of a.mechanisms) ok(m.world.y - a.floorY > 4, 'Mechanismus steht ebenerdig');
    // Kern-Route liegt hoch
    ok(a.coreY - a.floorY > 12, 'Kern ist zu niedrig — keine Kletterroute nötig');
    ok(physics.statics.some((c2) => c2.runnable && c2.minZ < a.maxZ && c2.maxZ > a.minZ),
      'Keine Wallrun-Wand in der Arena');
  }
  console.log(fails === b ? '  Arena korrekt eingebettet' : `  ${fails - b} Fehler`);
}

console.log('=== 2. Zustandsmaschine ===');
const fx = new CharacterFx(scene, 120);
const audio = new AudioHooks();
const heard = [];
audio.on('*', (n) => heard.push(n));

function makeFight(host = true) {
  dg.generate(4242, 9);
  const f = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  f.setHost(host);
  f.sent = [];
  f.onEvent = (e) => f.sent.push(e);
  return f;
}
function fakeCtx(f, pos) {
  const st = PlayerMovement.createState();
  st.pos = { ...pos };
  return {
    localPlayer: { state: st, applyKnockback(x, y, z) { this.kb = { x, y, z }; }, kb: null },
    remotePlayers: new Map(),
    controller: { addShake() {} },
    onHit() {},
  };
}
function run(f, ctx, seconds, dt = 1 / 60) {
  for (let i = 0; i < seconds / dt; i++) { T += dt * 1000; f.update(dt, ctx); }
}

{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  const outside = fakeCtx(f, { x: A.center.x, y: A.floorY, z: A.maxZ + 40 });
  run(f, outside, 3);
  ok(f.phase === BOSS_PHASE.IDLE, 'Boss startet, obwohl niemand in der Arena ist');

  const inside = fakeCtx(f, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  run(f, inside, 0.2);
  ok(f.phase === BOSS_PHASE.SHIELD, 'Boss startet nicht beim Betreten');
  ok(f.sent.some((e) => e.k === 'begin'), 'Start wird nicht ans Netzwerk gemeldet');
  ok(f.model.shield.visible, 'Schild ist nicht sichtbar');
  ok(A.coreTrigger.active === false, 'Kern ist in Phase 1 verwundbar');

  // Kern darf in Phase 1 nicht treffbar sein
  ok(f.hitCore('me') === false, 'Kern lässt sich schon in Phase 1 treffen');

  // Mechanismen
  ok(f.activateMechanism(0, 'me') === true, 'Mechanismus lässt sich nicht aktivieren');
  ok(f.activateMechanism(0, 'me') === false, 'Mechanismus doppelt aktivierbar');
  ok(A.mechanisms[0].trigger.active === false, 'Trigger bleibt nach Aktivierung aktiv');
  ok(f.phase === BOSS_PHASE.SHIELD, 'Schild fällt schon bei einem Mechanismus');
  f.activateMechanism(1, 'me');
  f.activateMechanism(2, 'me');
  run(f, inside, 0.1);
  ok(f.phase === BOSS_PHASE.CORE, 'Schild fällt nicht nach allen Mechanismen');
  ok(!f.model.shield.visible, 'Schild bleibt sichtbar');
  ok(A.coreTrigger.active === true, 'Kern wird nicht verwundbar');
  ok(heard.includes('boss:shield-down'), 'Audio-Hook für den Schildbruch fehlt');

  // Kern treffen -> Fluchtphase
  ok(f.hitCore('me') === true, 'Kern lässt sich in Phase 2 nicht treffen');
  run(f, inside, 0.1);
  ok(f.phase === BOSS_PHASE.ESCAPE, 'Kerntreffer startet die Fluchtphase nicht');
  ok(f.coreFirstBy === 'me', 'Erster Kerntreffer wird nicht vermerkt');
  ok(dg.doors.get(A.doorId).open === true, 'Ausgangstür öffnet nicht');
  ok(A.coreTrigger.active === false, 'Kern bleibt nach der Flucht treffbar');
  ok(Math.abs(f.escapeRemainingMs - ESCAPE_SECONDS * 1000) < 400, 'Countdown startet falsch');
  ok(heard.includes('boss:escape'), 'Audio-Hook für den Countdown fehlt');
  console.log(fails === b ? '  Phasen 1 -> 2 -> 3 laufen korrekt' : `  ${fails - b} Fehler`);
}

console.log('=== 3. Einsturz lässt einen Weg zum Ausgang ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  const ctx = fakeCtx(f, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  run(f, ctx, 0.2);
  f.activateMechanism(0, 'me'); f.activateMechanism(1, 'me'); f.activateMechanism(2, 'me');
  run(f, ctx, 0.2);
  f.hitCore('me');
  run(f, ctx, ESCAPE_SECONDS + 5);
  const gone = A.tiles.filter((t) => t.visualState === 'gone');
  ok(gone.length > 3, `Nur ${gone.length} Kacheln eingestürzt — zu wenig Druck`);
  const survivors = A.tiles.filter((t) => !t.collapsible);
  ok(survivors.every((t) => t.collider.active), 'Die Mittelspur ist eingestürzt — Ausgang unerreichbar');
  ok(f.escapeRemainingMs === 0, 'Countdown läuft nicht ab');
  console.log(fails === b ? `  ${gone.length} Kacheln weg, Mittelspur steht` : '  FEHLER');
}

console.log('=== 3b. Führung: Wegweiser zeigt immer das nächste Ziel ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  const ctx = fakeCtx(f, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  run(f, ctx, 0.3);
  ok(f.beacon.visible, 'Kein Wegweiser in Phase 1');
  ok(f.hud.goal.includes('MECHANISMUS'), `Zieltext fehlt: "${f.hud.goal}"`);
  const near = A.mechanisms.reduce((best, m) => {
    const d = Math.hypot(m.world.x - ctx.localPlayer.state.pos.x, m.world.z - ctx.localPlayer.state.pos.z);
    return d < best.d ? { d, m } : best;
  }, { d: Infinity, m: null });
  ok(Math.hypot(f.beacon.position.x - near.m.world.x, f.beacon.position.z - near.m.world.z) < 1,
    'Wegweiser zeigt nicht auf den nächstgelegenen Mechanismus');
  ok(f.hud.goalDist > 0, 'Keine Entfernungsangabe');

  // nach Aktivierung wandert er zum nächsten
  f.activateMechanism(near.m.index, 'me');
  run(f, ctx, 0.2);
  ok(Math.hypot(f.beacon.position.x - near.m.world.x, f.beacon.position.z - near.m.world.z) > 1,
    'Wegweiser bleibt am erledigten Mechanismus stehen');

  f.activateMechanism(0, 'me'); f.activateMechanism(1, 'me'); f.activateMechanism(2, 'me');
  run(f, ctx, 0.2);
  ok(f.hud.goal.includes('KERN'), 'Wegweiser zeigt in Phase 2 nicht zum Kern');
  ok(Math.abs(f.beacon.position.y - A.walkwayY) < 2, 'Wegweiser zeigt nicht auf die Kernhöhe');

  f.hitCore('me');
  run(f, ctx, 0.2);
  ok(f.hud.goal.includes('AUSGANG') || f.hud.goal.includes('MITTELSPUR'), 'Kein Fluchtziel angezeigt');
  ok(Math.abs(f.beacon.position.z - A.exitWorld.z) < 2, 'Wegweiser zeigt nicht zum Ausgang');
  console.log(fails === b ? '  Ziel ist in jeder Phase markiert' : `  ${fails - b} Fehler`);
}

console.log('=== 3c. Nach Ablauf des Countdowns passiert etwas ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  const ctx = fakeCtx(f, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  run(f, ctx, 0.2);
  f.activateMechanism(0, 'me'); f.activateMechanism(1, 'me'); f.activateMechanism(2, 'me');
  run(f, ctx, 0.2);
  f.hitCore('me');
  run(f, ctx, ESCAPE_SECONDS - 2);
  ok(!f.collapsed, 'Kollaps startet zu früh');
  const attacksBefore = f.attackIndex;
  run(f, ctx, 8);
  ok(f.collapsed, 'Nach Ablauf des Countdowns passiert nichts');
  ok(f.hud.collapsed === true, 'HUD meldet den Kollaps nicht');
  ok(A.tiles.every((t) => !t.collapsible || t.visualState === 'gone'), 'Nicht alles Einstürzbare ist weg');
  ok(A.tiles.filter((t) => !t.collapsible).every((t) => t.collider.active), 'Auch die Mittelspur ist weg — Ausgang unerreichbar');
  ok(f.attackIndex > attacksBefore + 1, 'Der Boss feuert im Kollaps nicht härter');
  ok(dg.doors.get(A.doorId).open === true, 'Ausgangstür ist im Kollaps zu');
  console.log(fails === b ? '  Kollaps greift, Fluchtweg bleibt' : `  ${fails - b} Fehler`);
}

console.log('=== 4. Angriffe treffen nur, wenn man am Boden steht ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  f.setHost(false);        // keine eingeplanten Angriffe: hier wird einzeln geprüft

  // --- Schockwelle: am Boden treffen, in der Luft nicht ---
  const hitCtx = fakeCtx(f, { x: A.center.x + 12, y: A.floorY, z: A.center.z });
  f._setPhase(BOSS_PHASE.SHIELD);
  f._startAttack('shock', 12345);
  run(f, hitCtx, 4);
  ok(!!hitCtx.localPlayer.kb, 'Schockwelle trifft am Boden nicht');

  const jumpCtx = fakeCtx(f, { x: A.center.x + 12, y: A.floorY + 3.5, z: A.center.z });
  f._startAttack('shock', 12345);
  run(f, jumpCtx, 4);
  ok(!jumpCtx.localPlayer.kb, 'Schockwelle trifft, obwohl man drübergesprungen ist');

  // --- Laser ---
  const laserCtx = fakeCtx(f, { x: A.center.x, y: A.floorY, z: A.center.z });
  let hitL = false;
  laserCtx.localPlayer.applyKnockback = () => { hitL = true; };
  // direkt auf die Startachse des Strahls stellen
  f._startAttack('laser', 999);
  const at = f.active[f.active.length - 1];
  const ang = at.data.a0;
  laserCtx.localPlayer.state.pos.x = A.center.x - Math.sin(ang) * 10;
  laserCtx.localPlayer.state.pos.z = A.center.z - Math.cos(ang) * 10;
  run(f, laserCtx, 3);
  ok(hitL, 'Laser trifft niemanden auf seiner Achse');

  // --- Geschosse: Warnung erscheint vor dem Einschlag ---
  const projCtx = fakeCtx(f, { x: A.center.x, y: A.floorY, z: A.center.z });
  f._startAttack('proj', 4242);
  const pAt = f.active[f.active.length - 1];
  run(f, projCtx, 0.6);
  ok(f.marks.some((m) => m.visible), 'Einschläge werden nicht vorher markiert');
  ok(pAt.data.spots.every((s) => !s.hit), 'Geschosse schlagen ohne Vorwarnung ein');
  ok(pAt.warn >= 1.2, `Vorwarnzeit nur ${pAt.warn}s — zu kurz zum Reagieren`);
  run(f, projCtx, 3);
  ok(pAt.data.spots.some((s) => s.hit), 'Geschosse schlagen nie ein');
  console.log(fails === b ? '  Angriffe sind ausweichbar und angekündigt' : `  ${fails - b} Fehler`);
}

console.log('=== 5. Kein Dauerschaden / kein Stunlock ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  let hits = 0;
  const ctx = fakeCtx(f, { x: A.center.x + 10, y: A.floorY, z: A.center.z + 3 });
  ctx.localPlayer.applyKnockback = () => { hits++; };
  f._setPhase(BOSS_PHASE.CORE);
  run(f, ctx, 60);              // eine Minute regungslos in der Arena stehen
  ok(hits > 0, 'Wer regungslos stehen bleibt, wird gar nicht getroffen');
  ok(hits < 40, `${hits} Treffer in 60 s — zu dicht, das wäre ein Stunlock`);
  console.log(`  ${hits} Treffer in 60 s bei völliger Untätigkeit`);
  ok(fails === b, 'Trefferfrequenz unpassend');
}

console.log('=== 6. Synchronisation zwischen Host und Client ===');
{
  const b = fails;
  const host = makeFight(true);
  const A = dg.bossArena;
  // zweite Instanz auf derselben Arena = zweiter Client
  const client = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  client.setHost(false);
  client.sent = [];
  client.onEvent = (e) => client.sent.push(e);

  const link = (from, to) => { for (const e of from.sent.splice(0)) to.applyEvent(e, 'peer'); };
  const hCtx = fakeCtx(host, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  const cCtx = fakeCtx(client, { x: A.center.x - 14, y: A.floorY, z: A.center.z + 14 });

  run(host, hCtx, 0.2); link(host, client); run(client, cCtx, 0.05);
  ok(client.phase === BOSS_PHASE.SHIELD, 'Client startet den Kampf nicht mit');

  // Client aktiviert Mechanismen -> Host übernimmt
  client.activateMechanism(0, 'c'); client.activateMechanism(1, 'c'); client.activateMechanism(2, 'c');
  link(client, host);
  run(host, hCtx, 0.1);
  ok(host.mechanisms.every(Boolean), 'Host übernimmt die Mechanismen des Clients nicht');
  ok(host.phase === BOSS_PHASE.CORE, 'Host schaltet die Phase nicht weiter');
  link(host, client); run(client, cCtx, 0.05);
  ok(client.phase === BOSS_PHASE.CORE, 'Client bekommt die Phase nicht');

  // Client trifft zuerst -> Host entscheidet über den Bonus
  client.hitCore('c');
  link(client, host);
  run(host, hCtx, 0.05);
  ok(host.coreFirstBy === 'c', 'Host wertet den ersten Kerntreffer falsch');
  link(host, client); run(client, cCtx, 0.05);
  ok(client.phase === BOSS_PHASE.ESCAPE, 'Client wechselt nicht in die Fluchtphase');
  ok(client.coreFirstBy === 'c', 'Client kennt den Ersttreffer nicht');

  // Ein Client darf die Phase nicht selbst schalten
  const solo = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  solo.setHost(false);
  solo.onEvent = () => {};
  solo._setPhase(BOSS_PHASE.SHIELD);
  solo.mechanisms = [true, true, true];
  run(solo, cCtx, 2);
  ok(solo.phase === BOSS_PHASE.SHIELD, 'Client schaltet die Phase eigenmächtig');
  ok(solo.active.length === 0, 'Client plant eigene Angriffe (Desync)');
  solo.dispose();

  // Späteinsteiger übernimmt den Zustand
  const late = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  late.setHost(false);
  late.onEvent = () => {};
  late.applySnapshot(host.snapshot());
  ok(late.phase === BOSS_PHASE.ESCAPE, 'Späteinsteiger landet in der falschen Phase');
  ok(late.mechanisms.every(Boolean), 'Späteinsteiger sieht die Mechanismen nicht');
  late.dispose();

  // Datenvolumen: der Boss darf den Kanal nicht fluten
  host.sent.length = 0;
  run(host, hCtx, 30);
  const perSecond = host.sent.length / 30;
  ok(perSecond < 1.2, `Boss sendet ${perSecond.toFixed(2)} Nachrichten/s — zu viel Traffic`);
  console.log(`  ${host.sent.length} Nachrichten in 30 s (${perSecond.toFixed(2)}/s)`);
  client.dispose();
  console.log(fails === b ? '  Host/Client bleiben synchron' : `  ${fails - b} Fehler`);
}

console.log('=== 7. Zeitbonus für den ersten Kerntreffer ===');
{
  const b = fails;
  const race = new RaceManager(null);
  race.reset([{ id: 'a', name: 'A', color: 1 }, { id: 'b', name: 'B', color: 2 }]);
  race.setFinish('a', 120000);
  race.setFinish('b', 118500);
  race.setBonus('a', -C.BOSS_TIME_BONUS);
  const st = race.standings();
  ok(st[0].id === 'a', 'Der Bonus wirkt sich nicht auf die Platzierung aus');
  ok(st[0].finalTime === 120000 - C.BOSS_TIME_BONUS, 'Bonuszeit falsch verrechnet');
  ok(st[1].finalTime === 118500, 'Zeit ohne Bonus wird verändert');
  ok(C.BOSS_TIME_BONUS <= 4000, 'Bonus zu groß — entscheidet das Rennen allein');
  console.log(fails === b ? `  Bonus ${C.BOSS_TIME_BONUS / 1000}s wirkt korrekt` : '  FEHLER');
}

console.log('=== 8. Modell & Performance ===');
{
  const b = fails;
  const f = makeFight(true);
  let meshes = 0, tris = 0;
  f.model.root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  ok(meshes > 15, `Boss besteht nur aus ${meshes} Teilen`);
  ok(tris < 9000, `Boss hat ${Math.round(tris)} Dreiecke — zu schwer`);
  let lights = 0;
  f.model.root.traverse((o) => { if (o.isLight) lights++; });
  ok(lights <= 1, `${lights} Lichter am Boss — zu teuer`);

  const ctx = fakeCtx(f, { x: f.arena.center.x + 12, y: f.arena.floorY, z: f.arena.center.z });
  f._setPhase(BOSS_PHASE.CORE);
  const t0 = Date.now();
  run(f, ctx, 20);
  const ms = (Date.now() - t0) / (20 * 60);
  ok(ms < 0.6, `Boss-Update kostet ${ms.toFixed(2)} ms/Frame`);
  console.log(`  ${meshes} Meshes, ${Math.round(tris)} Dreiecke, ${ms.toFixed(3)} ms/Frame`);

  // Kein Zustand läuft aus dem Ruder
  let bad = false;
  f.model.root.updateMatrixWorld(true);
  f.model.root.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) bad = true; });
  ok(!bad, 'NaN im Boss-Modell');
  ok(f.active.length < 12, `${f.active.length} gleichzeitige Angriffe — Leck in der Angriffsliste`);
  f.dispose();
  console.log(fails === b ? '  Modell ist leichtgewichtig' : `  ${fails - b} Fehler`);
}

console.log('=== 9. Audio-Hooks vollständig ===');
{
  const b = fails;
  for (const name of ['boss:intro', 'boss:mechanism', 'boss:shield-down', 'boss:shockwave',
    'boss:laser-warning', 'boss:hit', 'boss:phase', 'boss:escape']) {
    ok(heard.includes(name), `Audio-Hook "${name}" wurde nie ausgelöst`);
  }
  console.log(fails === b ? `  ${new Set(heard).size} verschiedene Hooks ausgelöst` : '  FEHLER');
}

console.log(fails === 0 ? '\nERGEBNIS: alle Boss-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
