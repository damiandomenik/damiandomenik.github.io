/**
 * Tests für die Spielerfigur: Aufbau, Animation über alle Bewegungszustände,
 * Farbsystem und Partikeleffekte.
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
import { PlayerCharacter, BUILDS } from '../src/player/PlayerCharacter.js';
import { CharacterFx } from '../src/player/CharacterFx.js';
import { playerColorByIndex, playerColorForId, pickFreeColor, derivePalette, PLAYER_PALETTE } from '../src/player/PlayerColors.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };

const scene = new THREE.Scene();
const fx = new CharacterFx(scene, 200);
const camera = new THREE.PerspectiveCamera(70, 1.6, 0.3, 400);
camera.position.set(0, 2, 6);

console.log('=== 1. Aufbau der Figur ===');
const ch = new PlayerCharacter({ scene, fx, name: 'Damian', color: playerColorByIndex(0), isLocal: false });
let meshes = 0, tris = 0;
ch.root.traverse((o) => {
  if (o.isMesh) {
    meshes++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  }
});
ok(meshes >= 18, `Figur hat nur ${meshes} Teile — zu simpel`);
ok(meshes <= 34, `Figur hat ${meshes} Meshes — zu viele Draw Calls für 8 Spieler`);
ok(tris < 2000, `Figur hat ${Math.round(tris)} Dreiecke — zu schwer`);
for (const part of ['torso', 'headGroup', 'visor', 'armL', 'armR', 'legL', 'legR', 'cores', 'nameplate']) {
  ok(!!ch[part], `Bestandteil fehlt: ${part}`);
}
ok(ch.visor.material.emissiveIntensity > 1, 'Visor leuchtet nicht');
ok(ch.ring === null, 'Bodenring ist nicht abgeschaltet (RIFT_CONFIG.GROUND_RING)');
console.log(`  ${meshes} Meshes, ${Math.round(tris)} Dreiecke, 8 Spieler => ${meshes * 8} Objekte`);

console.log('=== 2. Silhouette & Proportionen ===');
ch.updateAnimation(0.016, { movementState: 'idle', speed: 0, isGrounded: true }, camera);
ch.root.updateMatrixWorld(true);
// nur den Körper messen (ohne Bodenring und Namensschild)
const bb = new THREE.Box3().setFromObject(ch.tilt);
const h = bb.max.y - bb.min.y;
ok(bb.min.y > -0.12 && bb.min.y < 0.12, `Füße stehen nicht auf dem Boden (y=${bb.min.y.toFixed(2)})`);
ok(h > 1.62 && h < 1.95, `Körperhöhe ${h.toFixed(2)} passt nicht zur Kapsel-Hitbox (1.8)`);
const width = bb.max.x - bb.min.x;
ok(width > 0.42 && width < 1.0, `Schulterbreite ${width.toFixed(2)} unplausibel (Hitbox-Radius 0.4)`);
console.log(`  Höhe ${h.toFixed(2)} m, Breite ${width.toFixed(2)} m`);

console.log('=== 3. Animation über alle Bewegungszustände ===');
const STATES = ['idle', 'run', 'sprint', 'crouch', 'slide', 'jump', 'fall', 'wallrun', 'dash', 'respawn'];
for (const st of STATES) {
  const before = ch.legL.rotation.x;
  for (let i = 0; i < 40; i++) {
    T += 16.7;
    ch.setTransform(0, 0, -i * 0.2, 0.4);
    ch.updateAnimation(0.0167, {
      movementState: st, speed: st === 'sprint' ? 15 : st === 'run' ? 9 : 0,
      isGrounded: !['jump', 'fall', 'wallrun', 'dash'].includes(st),
      isWallRunning: st === 'wallrun', isDashing: st === 'dash',
      wallSide: st === 'wallrun' ? 1 : 0, velocityY: st === 'fall' ? -12 : 0,
    }, camera);
  }
  ch.root.updateMatrixWorld(true);
  let bad = false;
  ch.root.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) bad = true; });
  ok(!bad, `NaN in der Transformation bei Zustand "${st}"`);
  if (st === 'run' || st === 'sprint') {
    ok(Math.abs(ch.legL.rotation.x) > 0.05, `Beine bewegen sich nicht bei "${st}"`);
    ok(Math.abs(ch.armR.rotation.x) > 0.05, `Arme bewegen sich nicht bei "${st}"`);
  }
  if (st === 'sprint') ok(ch.tilt.rotation.x < -0.15, 'Sprint hat keine Vorlage');
  if (st === 'wallrun') ok(Math.abs(ch.tilt.rotation.z) > 0.1, 'Wallrun neigt den Körper nicht zur Wand');
  if (st === 'crouch' || st === 'slide') ok(ch.hips.position.y < 0.75, 'Ducken senkt den Körper nicht');
}
// Laufzyklus muss sich über die Zeit ändern (nicht eingefroren)
const snap = [];
for (let i = 0; i < 20; i++) {
  T += 16.7;
  ch.updateAnimation(0.0167, { movementState: 'run', speed: 9, isGrounded: true }, camera);
  snap.push(ch.legR.rotation.x);
}
ok(new Set(snap.map((v) => v.toFixed(3))).size > 8, 'Laufzyklus ist statisch');

console.log('=== 3b. Arme zeigen im Weltraum nach außen ===');
{
  const b = fails;
  // Gemessen wird die tatsächliche Handposition relativ zur Schulter — nicht
  // das Vorzeichen einer Rotation. Genau dieser Denkfehler hatte die Arme
  // vorher durch den Torso drehen lassen.
  const handWorld = (armGroup) => {
    let deepest = armGroup;
    armGroup.traverse((o) => { if (o.isMesh && o.position.y < deepest.position.y) deepest = o; });
    ch.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    armGroup.traverse((o) => { if (o.isMesh) { const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); if (!v.lengthSq() || p.y < v.y) v.copy(p); } });
    return v;
  };
  for (const st of ['idle', 'run', 'fall', 'jump', 'dash', 'slide']) {
    for (let i = 0; i < 40; i++) {
      T += 16.7;
      ch.setTransform(0, 0, 0, 0);
      ch.updateAnimation(0.0167, {
        movementState: st, speed: st === 'run' ? 9 : 0,
        isGrounded: !['jump', 'fall', 'dash'].includes(st), isDashing: st === 'dash',
      }, camera);
    }
    ch.root.updateMatrixWorld(true);
    const shL = new THREE.Vector3().setFromMatrixPosition(ch.armL.matrixWorld);
    const shR = new THREE.Vector3().setFromMatrixPosition(ch.armR.matrixWorld);
    const hL = handWorld(ch.armL), hR = handWorld(ch.armR);
    ok(hL.x <= shL.x + 0.02, `Linke Hand wandert bei "${st}" nach rechts in den Körper (${(hL.x - shL.x).toFixed(2)} m)`);
    ok(hR.x >= shR.x - 0.02, `Rechte Hand wandert bei "${st}" nach links in den Körper (${(hR.x - shR.x).toFixed(2)} m)`);
    ok(hL.x < hR.x, `Arme sind bei "${st}" vertauscht`);
  }
  console.log(fails === b ? '  Hände bleiben außerhalb des Torsos' : '  FEHLER');
}

console.log('=== 3c. Wallrun: Blick geht von der Wand weg ===');
{
  const b = fails;
  const fwd = new THREE.Vector3();
  for (const side of [1, -1]) {
    for (let i = 0; i < 60; i++) {
      T += 16.7;
      ch.setTransform(0, 0, 0, 0);              // Figur schaut nach -Z
      ch.updateAnimation(0.0167, { movementState: 'wallrun', speed: 15, isGrounded: false, isWallRunning: true, wallSide: side }, camera);
    }
    ch.root.updateMatrixWorld(true);
    // Blickrichtung des Kopfes in Weltkoordinaten
    fwd.set(0, 0, -1).applyQuaternion(ch.headGroup.getWorldQuaternion(new THREE.Quaternion()));
    // Wand rechts (side=+1, also +X): Blick muss eine Komponente nach -X haben
    ok(fwd.x * side < -0.05,
      `Bei Wand ${side > 0 ? 'rechts' : 'links'} schaut die Figur IN die Wand (fwd.x=${fwd.x.toFixed(2)})`);
    // Kopf muss sich auch von der Wand wegneigen: Kopf seitlich versetzt zur Hüfte
    const head = new THREE.Vector3().setFromMatrixPosition(ch.headGroup.matrixWorld);
    const hip = new THREE.Vector3().setFromMatrixPosition(ch.hips.matrixWorld);
    ok((head.x - hip.x) * side < -0.02,
      `Kopf neigt sich zur Wand statt von ihr weg (${(head.x - hip.x).toFixed(2)} m)`);
    // Der wandseitige Arm muss zur Wand greifen
    const reachArm = side > 0 ? ch.armR : ch.armL;
    let hand = new THREE.Vector3();
    reachArm.traverse((o) => { if (o.isMesh) { const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); if (!hand.lengthSq() || p.y < hand.y) hand.copy(p); } });
    const shoulder = new THREE.Vector3().setFromMatrixPosition(reachArm.matrixWorld);
    ok((hand.x - shoulder.x) * side > 0.05, 'Der wandseitige Arm greift nicht zur Wand');
  }
  console.log(fails === b ? '  Blick, Neigung und Greifarm stimmen für beide Seiten' : '  FEHLER');
}

console.log('=== 3c2. Körper dreht in die Laufrichtung (Strafe) ===');
{
  const b = fails;
  const fwd = new THREE.Vector3();
  const check = (moveAngle, label) => {
    for (let i = 0; i < 60; i++) {
      T += 16.7;
      ch.setTransform(0, 0, 0, 0.7);      // beliebige Blickrichtung
      ch.updateAnimation(0.0167, { movementState: 'run', speed: 9, isGrounded: true, moveAngle }, camera);
    }
    ch.root.updateMatrixWorld(true);
    // Vorwärtsachse des Oberkörpers in Weltkoordinaten
    fwd.set(0, 0, -1).applyQuaternion(ch.turn.getWorldQuaternion(new THREE.Quaternion()));
    /* Erwartete Weltrichtung der Bewegung.
     * Blickachse F = (-sin y, -cos y), Rechtsachse R = (cos y, -sin y);
     * v = cos(a)·F + sin(a)·R  =>  v = ( sin(a-y), -cos(a-y) ). */
    const y = 0.7;
    const ex = Math.sin(moveAngle - y), ez = -Math.cos(moveAngle - y);
    const dot = fwd.x * ex + fwd.z * ez;
    ok(dot > 0.9, `${label}: Körper zeigt nicht in die Laufrichtung (dot=${dot.toFixed(2)})`);
    return dot;
  };
  check(0, 'vorwärts');
  check(Math.PI / 2, 'strafe rechts');
  check(-Math.PI / 2, 'strafe links');
  check(Math.PI * 0.75, 'rückwärts-diagonal');
  // Kopf hält dagegen, damit der Blick nach vorne bleibt
  for (let i = 0; i < 60; i++) { T += 16.7; ch.updateAnimation(0.0167, { movementState: 'run', speed: 9, isGrounded: true, moveAngle: Math.PI / 2 }, camera); }
  ok(Math.sign(ch.headGroup.rotation.y) !== Math.sign(ch.turn.rotation.y),
    'Kopf dreht mit dem Körper statt dagegen');
  ok(Math.abs(ch.headGroup.rotation.y) > 0.3, 'Kopf hält kaum dagegen');
  // im Stand keine Drehung
  for (let i = 0; i < 60; i++) { T += 16.7; ch.updateAnimation(0.0167, { movementState: 'idle', speed: 0, isGrounded: true, moveAngle: 0 }, camera); }
  ok(Math.abs(ch.turn.rotation.y) < 0.05, `Figur bleibt im Stand verdreht (turn=${ch.turn.rotation.y.toFixed(3)})`);
  // Winkel darf über viele Richtungswechsel nicht aufsummieren
  for (const a of [1.5, -1.5, 3.0, -3.0, 2.5, -0.5, 3.1, -3.1]) {
    for (let i = 0; i < 25; i++) { T += 16.7; ch.updateAnimation(0.0167, { movementState: 'run', speed: 9, isGrounded: true, moveAngle: a }, camera); }
    ok(Math.abs(ch.pose.bodyTurn) <= Math.PI + 0.01, `Drehwinkel läuft weg (${ch.pose.bodyTurn.toFixed(2)})`);
  }
  console.log(fails === b ? '  Beine laufen in die tatsächliche Richtung' : '  FEHLER');
}

console.log('=== 3d. Sichtbarer Schlag ===');
{
  const b = fails;
  const idle = { movementState: 'idle', speed: 0, isGrounded: true };
  for (let i = 0; i < 30; i++) { T += 16.7; ch.updateAnimation(0.0167, idle, camera); }
  const rest = ch.armR.rotation.x;
  ch.punch();
  let peak = rest;
  for (let i = 0; i < 8; i++) { T += 16.7; ch.updateAnimation(0.0167, idle, camera); peak = Math.max(peak, ch.armR.rotation.x); }
  ok(peak > rest + 0.8, `Schlag ist nicht sichtbar (Arm nur ${(peak - rest).toFixed(2)} rad nach vorn)`);
  for (let i = 0; i < 30; i++) { T += 16.7; ch.updateAnimation(0.0167, idle, camera); }
  ok(Math.abs(ch.armR.rotation.x - rest) < 0.15, 'Arm kehrt nach dem Schlag nicht zurück');
  ok(ch._punch === 0, 'Schlag-Timer läuft nicht ab');
  console.log(fails === b ? '  Schlag ausgefahren und zurückgenommen' : '  FEHLER');
}

console.log('=== 3e. Statur: kräftig, Beine nicht überlang ===');
{
  const b = fails;
  const heights = {};
  for (const name of Object.keys(BUILDS)) {
    const c = new PlayerCharacter({ scene, name: 'B', color: 0x4c9dff, build: name, nameplate: false });
    c.updateAnimation(0.016, { movementState: 'idle', speed: 0, isGrounded: true });
    c.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c.tilt);
    heights[name] = box.max.y - box.min.y;
    ok(box.min.y > -0.12 && box.min.y < 0.12, `Preset "${name}": Füße nicht auf dem Boden (${box.min.y.toFixed(2)})`);
    ok(heights[name] > 1.6 && heights[name] < 1.95, `Preset "${name}": Höhe ${heights[name].toFixed(2)} passt nicht zur Hitbox`);
    const legRatio = BUILDS[name].hip / heights[name];
    const maxLeg = name === 'agile' ? 0.56 : 0.50;
    ok(legRatio < maxLeg, `Preset "${name}": Beine machen ${(legRatio * 100).toFixed(0)} % der Höhe aus — zu lang`);
    const box2 = new THREE.Box3().setFromObject(c.tilt);
    const slim = (box2.max.x - box2.min.x) / heights[name];
    ok(slim > 0.27, `Preset "${name}": zu schmal (Breite/Höhe ${slim.toFixed(2)})`);
    c.dispose();
  }
  ok(new Set(Object.values(heights).map((v) => v.toFixed(2))).size > 1, 'Presets unterscheiden sich nicht');
  console.log('  ' + Object.entries(heights).map(([k, v]) => `${k}: ${v.toFixed(2)}m`).join(', '));
}

console.log('=== 4. Farbsystem ===');
const colors = new Set();
for (let i = 0; i < PLAYER_PALETTE.length; i++) colors.add(playerColorByIndex(i));
ok(colors.size === PLAYER_PALETTE.length, 'Palette enthält doppelte Farben');
ok(playerColorByIndex(0) === playerColorByIndex(PLAYER_PALETTE.length), 'Palette rotiert nicht');
ok(playerColorForId('abc') === playerColorForId('abc'), 'Farbe pro ID ist nicht stabil');
const used = [playerColorByIndex(0), playerColorByIndex(1)];
ok(!used.includes(pickFreeColor(used, playerColorByIndex(0))), 'pickFreeColor gibt eine belegte Farbe zurück');
const pal = derivePalette(0x4c9dff);
ok(pal.dark.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25, 'Sekundärfarbe ist nicht dunkel');
ch.setColor(playerColorByIndex(3));
ok(ch.materials.suit.color.getHex() !== 0x000000, 'setColor setzt die Anzugfarbe nicht');

console.log('=== 5. Partikeleffekte ===');
{
  ok(!ch.ring, 'Bodenring ist standardmäßig noch aktiv');
  const geoColor = fx.mesh.geometry.getAttribute('color');
  ok(!!geoColor, 'Partikelgeometrie hat kein color-Attribut (Partikel wären schwarz)');
  ok(geoColor && geoColor.array.every((v) => v === 1), 'color-Attribut ist nicht weiß vorbelegt');

  const live = () => fx.p.filter((p) => p.life > 0).length;
  // Landung nach einem Fall
  ch.updateAnimation(0.016, { movementState: 'fall', speed: 5, isGrounded: false, velocityY: -18 }, camera);
  const beforeLand = live();
  ch.updateAnimation(0.016, { movementState: 'run', speed: 5, isGrounded: true, velocityY: 0 }, camera);
  ok(live() > beforeLand, 'Landung erzeugt keinen Partikeleffekt');

  // Dash
  const beforeDash = live();
  ch.updateAnimation(0.016, { movementState: 'dash', speed: 30, isGrounded: false, isDashing: true }, camera);
  ok(live() > beforeDash, 'Dash erzeugt keinen Effekt');

  // Überlauf: mehr Partikel anfordern als Plätze da sind
  for (let i = 0; i < 500; i++) fx.burst(0, 0, 0, 0xffffff, 8);
  ok(live() <= fx.max, 'Partikelpool läuft über');
  for (let i = 0; i < 80; i++) fx.update(0.05);
  ok(live() === 0, 'Partikel sterben nicht ab');
  ok(fx.mesh.visible === false, 'Leeres Partikelsystem wird weiter gezeichnet');
}

console.log('=== 6. Namensschild ===');
{
  ok(ch.nameplate.material.map != null, 'Namensschild hat keine Textur');
  camera.position.set(0, 2, 8);
  ch.setTransform(0, 0, 0, 0);
  ch.root.updateMatrixWorld(true);
  ch.updateAnimation(0.016, { movementState: 'idle', speed: 0, isGrounded: true }, camera);
  const near = ch.nameplate.scale.x;
  camera.position.set(0, 2, 90);
  ch.root.updateMatrixWorld(true);
  ch.updateAnimation(0.016, { movementState: 'idle', speed: 0, isGrounded: true }, camera);
  const far = ch.nameplate.scale.x;
  ok(far > near, 'Namensschild skaliert nicht mit der Distanz');
  ok(far / near < 4, 'Namensschild wird aus der Ferne zu groß');
  ch.setName('NeuerName');
  ok(ch.name === 'NeuerName', 'setName wirkt nicht');
}

console.log('=== 7. Schatten-Budget ===');
{
  ch.setShadows(true);
  let casters = 0, all = 0;
  ch.root.traverse((o) => { if (o.isMesh) { all++; if (o.castShadow) casters++; } });
  ok(casters > 6, 'Zu wenige Schattenwerfer — die Figur hätte keinen erkennbaren Schatten');
  ok(casters <= 14, `${casters} Schattenwerfer pro Figur — bei 8 Spielern zu teuer`);
  ch.setShadows(false);
  let off = 0;
  ch.root.traverse((o) => { if (o.isMesh && o.castShadow) off++; });
  ok(off === 0, 'setShadows(false) schaltet nicht alles ab');
  console.log(`  ${casters} von ${all} Meshes werfen Schatten (8 Spieler => ${casters * 8} Shadow-Draws)`);
}

console.log('=== 8. Rechenzeit für 8 Spieler ===');
{
  const crowd = [];
  for (let i = 0; i < 8; i++) crowd.push(new PlayerCharacter({ scene, fx, name: 'P' + i, color: playerColorByIndex(i) }));
  const t0 = Date.now();
  for (let f = 0; f < 120; f++) {
    T += 16.7;
    for (const c of crowd) {
      c.setTransform(Math.sin(f * 0.1) * 5, 0, -f * 0.2, f * 0.02);
      c.updateAnimation(0.0167, { movementState: 'sprint', speed: 15, isGrounded: true }, camera);
    }
    fx.update(0.0167);
  }
  const ms = Date.now() - t0;
  const perFrame = ms / 120;
  ok(perFrame < 2.0, `Animation von 8 Figuren kostet ${perFrame.toFixed(2)} ms/Frame — zu viel`);
  console.log(`  8 Figuren + Partikel: ${perFrame.toFixed(2)} ms/Frame (CPU-Anteil)`);
  crowd.forEach((c) => c.dispose());
}

console.log('=== 9. Aufräumen ===');
{
  const before = scene.children.length;
  const tmp = new PlayerCharacter({ scene, fx, name: 'Temp', color: 0xff0000 });
  ok(scene.children.length === before + 1, 'Figur wird nicht der Szene hinzugefügt');
  tmp.dispose();
  ok(scene.children.length === before, 'dispose entfernt die Figur nicht');
}

console.log(fails === 0 ? '\nERGEBNIS: alle Charakter-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
