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
import { BossFight, BOSS_PHASE } from '../src/boss/BossFight.js';
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
    ok(ids.indexOf('boss_arena') === ids.length - 3, 'Boss steht nicht an drittletzter Stelle');
    ok(!!dg.bossArena, 'Arena-Beschreibung fehlt');
    const a = dg.bossArena;
    ok(a.mechanisms.length === 3, `${a.mechanisms.length} Mechanismen statt 3`);
    ok(a.tiles.length >= 12, `nur ${a.tiles.length} steuerbare Kacheln`);
    ok(a.tiles.some((t) => !t.collapsible), 'Alle Kacheln einstürzbar — Ausgang würde unerreichbar');
    ok(a.portalTrigger.active === false, 'Portal ist von Anfang an offen');
    ok(!!a.finalSpawn, 'Kein Zielpunkt hinter dem Portal hinterlegt');
    ok(a.exitRoomIndex === dg.rooms.findIndex((r) => r.def.id === 'final_run'),
      'Portal führt nicht in die Endstrecke');
    ok(ids.includes('final_run'), 'Keine Endstrecke nach dem Boss');
    ok(ids.indexOf('final_run') === ids.indexOf('boss_arena') + 1, 'Endstrecke folgt nicht direkt');
    // Mechanismen müssen erhöht stehen (Parkour nötig)
    for (const m of a.mechanisms) ok(m.world.y - a.floorY > 4, 'Mechanismus steht ebenerdig');
    // Kern-Route liegt hoch
    ok(a.portal.y - a.floorY > 12, 'Portal haengt zu niedrig — keine Kletterroute noetig');
    ok(physics.statics.some((c2) => c2.runnable && c2.minZ < a.maxZ && c2.maxZ > a.minZ),
      'Keine Wallrun-Wand in der Arena');
  }
  console.log(fails === b ? '  Arena korrekt eingebettet' : `  ${fails - b} Fehler`);
}

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

console.log('=== 2. Ablauf: Mechanismen -> Portal -> Endstrecke ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  const outside = fakeCtx(f, { x: A.center.x, y: A.floorY, z: A.maxZ + 40 });
  run(f, outside, 3);
  ok(f.phase === BOSS_PHASE.IDLE, 'Boss startet, obwohl niemand in der Arena ist');

  const inside = fakeCtx(f, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  run(f, inside, 0.2);
  ok(f.phase === BOSS_PHASE.ACTIVE, 'Boss startet nicht beim Betreten');
  ok(f.sent.some((e) => e.k === 'begin'), 'Start wird nicht ans Netzwerk gemeldet');
  ok(f.model.shield.visible, 'Schild ist nicht sichtbar');
  ok(!f.portalOpen && !f.portal.visible, 'Portal ist von Anfang an da');
  ok(f.enterPortal('me') === null, 'Portal laesst sich ohne Mechanismen benutzen');

  ok(f.activateMechanism(0, 'me') === true, 'Mechanismus laesst sich nicht aktivieren');
  ok(f.activateMechanism(0, 'me') === false, 'Mechanismus doppelt aktivierbar');
  ok(A.mechanisms[0].trigger.active === false, 'Trigger bleibt nach Aktivierung aktiv');
  ok(!f.portalOpen, 'Portal oeffnet schon bei einem Mechanismus');
  f.activateMechanism(1, 'me');
  ok(!f.portalOpen, 'Portal oeffnet schon bei zwei Mechanismen');
  f.activateMechanism(2, 'me');
  run(f, inside, 0.2);
  ok(f.portalOpen, 'Portal oeffnet nicht nach allen drei Mechanismen');
  ok(f.portal.visible, 'Portal ist unsichtbar');
  ok(A.portalTrigger.active === true, 'Portal-Trigger ist nicht scharf');
  ok(!f.model.shield.visible, 'Schild bleibt sichtbar');
  ok(Math.abs(f.portal.position.y - A.portal.y) < 0.01, 'Portal steht an der falschen Stelle');
  ok(Math.hypot(f.portal.position.x - A.center.x, f.portal.position.z - A.center.z) < 0.01,
    'Portal schwebt nicht ueber der Mitte');

  const spawn = f.enterPortal('me');
  ok(!!spawn, 'Portal-Durchflug liefert keinen Zielpunkt');
  ok(spawn === A.finalSpawn, 'Zielpunkt ist nicht die Endstrecke');
  ok(f.escaped === true, 'Durchflug wird nicht vermerkt');
  ok(A.portalTrigger.active === false, 'Portal bleibt nach dem Durchflug scharf');
  ok(f.enterPortal('me') === null, 'Portal laesst sich zweimal benutzen');
  ok(f.portalFirstBy === 'me', 'Erster Durchflug wird nicht vermerkt');
  run(f, inside, 0.2);
  ok(!f.portal.visible, 'Portal bleibt nach dem Durchflug sichtbar');
  console.log(fails === b ? '  Mechanismen -> Portal -> Endstrecke' : `  ${fails - b} Fehler`);
}

console.log('=== 3. Mechanismen zaehlen nur fuer den eigenen Spieler ===');
{
  const b = fails;
  const A = dg.bossArena;
  const me = makeFight(true);
  const other = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  other.setHost(false);
  other.sent = [];
  other.onEvent = (e) => other.sent.push(e);

  const ctxA = fakeCtx(me, { x: A.center.x + 14, y: A.floorY, z: A.center.z + 14 });
  const ctxB = fakeCtx(other, { x: A.center.x - 14, y: A.floorY, z: A.center.z + 14 });
  run(me, ctxA, 0.2);
  for (const e of me.sent.splice(0)) other.applyEvent(e, 'me');
  run(other, ctxB, 0.1);

  // Spieler A macht alle drei
  me.activateMechanism(0, 'me');
  me.activateMechanism(1, 'me');
  me.activateMechanism(2, 'me');
  for (const e of me.sent.splice(0)) other.applyEvent(e, 'me');
  run(other, ctxB, 0.2);

  ok(me.portalOpen === true, 'Portal oeffnet bei A nicht');
  ok(other.mechanisms.every((m) => m === false),
    'Die Mechanismen von A zaehlen auch fuer B — genau das soll nicht passieren');
  ok(other.portalOpen === false, 'B bekommt das Portal geschenkt');
  ok(other.enterPortal('b') === null, 'B kann durchs Portal, ohne selbst gesammelt zu haben');
  ok(other.peerProgress.get('me') === 3, 'Fortschritt der Mitspieler wird nicht mitgeteilt');

  // B sammelt selbst -> bekommt sein eigenes Portal
  other.activateMechanism(0, 'b');
  other.activateMechanism(1, 'b');
  other.activateMechanism(2, 'b');
  ok(other.portalOpen === true, 'B bekommt kein Portal, obwohl er selbst gesammelt hat');
  ok(!!other.enterPortal('b', 61000), 'B kommt nicht durchs eigene Portal');

  /* Der Bonus geht an den mit der besseren RENNZEIT, nicht an das schnellere
   * Paket: A springt zuerst durch (Host, sofortige Auswertung), Bs Nachricht
   * trifft erst danach ein — hat aber die kleinere Zeit. */
  me.enterPortal('me', 62500);
  ok(me.portalFirstBy === 'me', 'Host wertet den eigenen Durchflug nicht');
  for (const e of other.sent.splice(0)) me.applyEvent(e, 'b');
  ok(me.portalFirstBy === 'b',
    `Spaeter eintreffende, aber schnellere Zeit wird ignoriert (${me.portalFirstBy})`);
  ok(me.sent.some((e) => e.k === 'first' && e.by === 'b'), 'Korrektur wird nicht verteilt');
  other.dispose();
  console.log(fails === b ? '  Jeder Spieler sammelt fuer sich' : `  ${fails - b} Fehler`);
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
  ok(f.hud.goal.includes('PORTAL'), `Wegweiser zeigt nicht zum Portal: "${f.hud.goal}"`);
  ok(Math.abs(f.beacon.position.y - A.portal.y) < 2, 'Wegweiser zeigt nicht auf die Portalhoehe');

  f.enterPortal('me');
  run(f, ctx, 0.2);
  ok(!f.beacon.visible, 'Wegweiser bleibt nach dem Durchflug stehen');
  console.log(fails === b ? '  Ziel ist in jeder Phase markiert' : `  ${fails - b} Fehler`);
}

console.log('=== 3d. Portal-Ziel liegt auf festem Boden ===');
{
  const b = fails;
  for (let i = 0; i < 10; i++) {
    dg.generate((i * 4451 + 9) >>> 0, 9);
    const A = dg.bossArena;
    ok(!!A.finalSpawn, 'Kein Portal-Ziel');
    const mv = new PlayerMovement(physics);
    const st = PlayerMovement.createState();
    st.pos = { ...A.finalSpawn };
    const cmd = { mx: 0, mz: 0, yaw: 0, sprint: false, crouch: false, jump: false, dash: false };
    for (let f = 0; f < 90; f++) mv.update(st, cmd, 1 / 60);
    ok(st.grounded, `seed ${i}: Spieler landet nach dem Portal nicht auf Boden`);
    ok(Math.abs(st.pos.y - A.finalSpawn.y) < 1.2, `seed ${i}: Portal-Ziel schwebt zu hoch`);
    ok(Math.abs(st.pos.z - A.finalSpawn.z) < 0.5, `seed ${i}: Spieler rutscht vom Zielpunkt`);
    // Die Endstrecke muss hinter der Arena liegen, nicht darin
    ok(A.finalSpawn.z < A.minZ, 'Portal-Ziel liegt noch in der Arena');
  }
  console.log(fails === b ? '  Landung nach dem Portal ist sicher' : `  ${fails - b} Fehler`);
}

console.log('=== 4. Angriffe treffen nur, wenn man am Boden steht ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  f.setHost(false);        // keine eingeplanten Angriffe: hier wird einzeln geprüft

  // --- Schockwelle: am Boden treffen, in der Luft nicht ---
  const hitCtx = fakeCtx(f, { x: A.center.x + 12, y: A.floorY, z: A.center.z });
  f._setPhase(BOSS_PHASE.ACTIVE);
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
  laserCtx.localPlayer.state.pos.y = at.data.y - 0.2;    // Laser kann hoch liegen
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

console.log('=== 4b. Treffer setzt zum Checkpoint zurück ===');
{
  const b = fails;
  const f = makeFight(true);
  f.setHost(false);
  const A = dg.bossArena;
  const ctx = fakeCtx(f, { x: A.center.x + 12, y: A.floorY, z: A.center.z });
  let kills = 0, knockbacks = 0;
  ctx.onKill = () => { kills++; };
  ctx.localPlayer.applyKnockback = () => { knockbacks++; };

  f._setPhase(BOSS_PHASE.ACTIVE);
  f._startAttack('shock', 12345);
  // bis exakt zum Treffer laufen, damit die Schonzeit sauber messbar ist
  let guard = 0;
  while (kills === 0 && guard++ < 600) run(f, ctx, 1 / 60);
  ok(kills === 1, `Treffer loest keinen Respawn aus (${kills})`);
  ok(knockbacks === 0, 'Treffer wirkt noch als Knockback statt als Respawn');

  // Schonzeit: direkt danach darf nicht sofort erneut gestorben werden
  f._startAttack('shock', 999);
  run(f, ctx, 2.2);
  ok(kills === 1, 'Keine Schonzeit nach dem Respawn — man stirbt sofort wieder');
  ok(f.invulnUntil > f.time, 'Schonzeit ist bereits abgelaufen');
  // nach Ablauf wieder verwundbar
  f.invulnUntil = 0;
  f._startAttack('shock', 4711);
  run(f, ctx, 4);
  ok(kills === 2, 'Nach der Schonzeit trifft der Boss nicht mehr');
  console.log(fails === b ? '  Treffer = Respawn, mit kurzer Schonzeit' : `  ${fails - b} Fehler`);
}

console.log('=== 4c. Auch oben ist man nicht sicher ===');
{
  const b = fails;
  const f = makeFight(true);
  f.setHost(false);
  const A = dg.bossArena;

  // Rotorarme: auf Plattform-/Laufsteghöhe, treffen dort auch
  let heights = new Set();
  for (let s2 = 0; s2 < 12; s2++) {
    f.active.length = 0;
    f._startAttack('sweep', s2 * 977 + 3);
    const at = f.active[0];
    ok(!!at, 'Rotorarm-Angriff startet nicht');
    if (at) heights.add(Math.round(at.data.y - A.floorY));
  }
  ok(heights.size >= 2, `Rotorarme nur auf einer Höhe (${[...heights].join(', ')})`);
  ok([...heights].every((h) => h > 4), `Rotorarme liegen zu tief: ${[...heights].join(', ')}`);

  // Treffer auf Kletterhöhe
  f.active.length = 0;
  f.invulnUntil = 0;
  f._startAttack('sweep', 4242);
  const sw = f.active[0];
  let killed = 0;
  const high = fakeCtx(f, { x: A.center.x + 9, y: sw.data.y - 0.9, z: A.center.z });
  high.onKill = () => { killed++; };
  // genau auf die Bahn eines Arms stellen
  const ang = sw.data.a0;
  high.localPlayer.state.pos.x = A.center.x + Math.sin(ang) * 9;
  high.localPlayer.state.pos.z = A.center.z + Math.cos(ang) * 9;
  run(f, high, 5);
  ok(killed > 0, 'Rotorarm trifft auf Kletterhöhe niemanden');

  // Wer tiefer steht, wird von einem hohen Arm nicht getroffen
  f.active.length = 0;
  f.invulnUntil = 0;
  f._startAttack('sweep', 4242);
  let killedLow = 0;
  const low = fakeCtx(f, { x: high.localPlayer.state.pos.x, y: A.floorY, z: high.localPlayer.state.pos.z });
  low.onKill = () => { killedLow++; };
  run(f, low, 5);
  ok(killedLow === 0, 'Hoher Rotorarm trifft auch am Boden — Höhe wird ignoriert');

  // Laser und Einschläge erreichen ebenfalls die Höhe
  const laserY = new Set(), projY = new Set();
  for (let s2 = 0; s2 < 14; s2++) {
    f.active.length = 0;
    f._startAttack('laser', s2 * 613 + 7);
    laserY.add(Math.round(f.active[0].data.y - A.floorY));
    f.active.length = 0;
    f._startAttack('proj', s2 * 421 + 11);
    for (const sp of f.active[0].data.spots) projY.add(Math.round((sp.y ?? A.floorY) - A.floorY));
  }
  ok([...laserY].some((h) => h > 4), `Laser bleibt immer unten (${[...laserY].join(', ')})`);
  ok([...projY].some((h) => h > 4), `Einschläge treffen nie die Hochplattformen (${[...projY].join(', ')})`);
  console.log(`  Rotorarme auf ${[...heights].sort().join('/')} m, Laser ${[...laserY].sort().join('/')} m, Einschläge ${[...projY].sort((x, y) => x - y).join('/')} m`);
  ok(fails === b, 'Höhenangriffe fehlerhaft');
}

console.log('=== 5. Kein Dauerschaden / kein Stunlock ===');
{
  const b = fails;
  const f = makeFight(true);
  const A = dg.bossArena;
  let hits = 0;
  const ctx = fakeCtx(f, { x: A.center.x + 10, y: A.floorY, z: A.center.z + 3 });
  ctx.onKill = () => { hits++; };
  f._setPhase(BOSS_PHASE.ACTIVE);
  run(f, ctx, 60);              // eine Minute regungslos in der Arena stehen
  ok(hits > 0, 'Wer regungslos stehen bleibt, wird gar nicht getroffen');
  ok(hits < 14, `${hits} Respawns in 60 s — zu hart, selbst fuer voellige Untaetigkeit`);
  console.log(`  ${hits} Respawns in 60 s bei völliger Untätigkeit`);
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
  ok(client.phase === BOSS_PHASE.ACTIVE, 'Client startet den Kampf nicht mit');

  // Client geht durchs eigene Portal -> Host vergibt den Erst-Bonus
  client.mechanisms = [true, true, true];
  client._openPortal();
  client.enterPortal('c');
  link(client, host);
  run(host, hCtx, 0.05);
  ok(host.portalFirstBy === 'c', 'Host wertet den ersten Durchflug falsch');
  link(host, client); run(client, cCtx, 0.05);
  ok(client.portalFirstBy === 'c', 'Client kennt den Ersten nicht');

  // Ein Client darf weder Phase schalten noch eigene Angriffe planen
  const solo = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  solo.setHost(false);
  solo.onEvent = () => {};
  solo._setPhase(BOSS_PHASE.ACTIVE);
  run(solo, cCtx, 6);
  ok(solo.active.length === 0, 'Client plant eigene Angriffe (Desync)');
  solo.dispose();

  // Späteinsteiger übernimmt den Zustand
  const late = new BossFight({ scene, dungeon: dg, arena: dg.bossArena, fx, audio, seed: 7 });
  late.setHost(false);
  late.onEvent = () => {};
  late.applySnapshot(host.snapshot());
  ok(late.phase === BOSS_PHASE.ACTIVE, 'Späteinsteiger landet in der falschen Phase');
  ok(late.mechanisms.every((m) => m === false), 'Späteinsteiger bekommt fremde Mechanismen geschenkt');
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

console.log('=== 7. Zeitbonus für den ersten Durchflug ===');
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
  f._setPhase(BOSS_PHASE.ACTIVE);
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
    'boss:laser-warning', 'boss:phase', 'boss:portal-open', 'boss:portal-enter']) {
    ok(heard.includes(name), `Audio-Hook "${name}" wurde nie ausgelöst`);
  }
  console.log(fails === b ? `  ${new Set(heard).size} verschiedene Hooks ausgelöst` : '  FEHLER');
}

console.log(fails === 0 ? '\nERGEBNIS: alle Boss-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
