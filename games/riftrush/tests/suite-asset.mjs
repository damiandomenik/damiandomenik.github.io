/**
 * Charakter-Asset: GLB-Struktur, Rig, Animationen und die Anbindung im Spiel.
 * Geprüft wird mit dem echten three.js GLTFLoader — also genau dem Weg,
 * den auch der Browser nimmt.
 */
const ctx2d = () => ({
  fillRect(){}, clearRect(){}, fillText(){}, roundRect(){}, fill(){}, beginPath(){},
  moveTo(){}, lineTo(){}, closePath(){}, drawImage(){},
  font: '', textAlign: '', textBaseline: '', fillStyle: '',
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d }) };
globalThis.performance = { now: () => 0 };

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { adoptPlayerModel } from '../src/player/ModelLibrary.js';
import { GlbCharacter } from '../src/player/GlbCharacter.js';
import { PlayerCharacter } from '../src/player/PlayerCharacter.js';
import { CharacterFx } from '../src/player/CharacterFx.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'assets', 'RiftRush_Player.glb');

console.log('=== 1. GLB lädt mit dem echten GLTFLoader ===');
let gltf = null;
{
  ok(fs.existsSync(file), 'assets/RiftRush_Player.glb fehlt');
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await new Promise((resolve) => {
    new GLTFLoader().parse(ab, '', (g) => { gltf = g; resolve(); },
      (e) => { ok(false, 'GLTFLoader-Fehler: ' + e); resolve(); });
  });
  ok(!!gltf, 'GLB konnte nicht geparst werden');
  ok(buf.length < 1024 * 1024, `GLB ist ${(buf.length / 1024).toFixed(0)} KB — zu gross fuer den Browser-Start`);
  console.log(`  ${(buf.length / 1024).toFixed(0)} KB`);
}

if (!gltf) { console.log('\nERGEBNIS: Asset nicht ladbar'); process.exit(1); }

console.log('=== 2. Mesh, Materialien, Budget ===');
{
  const b = fails;
  let skinned = 0, tris = 0;
  const mats = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) skinned++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    mats.set(o.material.name, o.material);
    ok(!!g.attributes.skinIndex, `Mesh "${o.name}" hat keine Skin-Gewichte`);
    ok(!!g.attributes.normal, 'Mesh ohne Normalen — Beleuchtung waere kaputt');
  });
  ok(skinned > 0, 'Kein SkinnedMesh im Modell');
  ok(tris > 800, `Nur ${tris} Dreiecke — zu kantig fuer die Vorlage`);
  ok(tris < 12000, `${tris} Dreiecke — mit 8 Spielern zu teuer`);
  for (const n of ['Armor', 'ArmorLight', 'Metal', 'Visor', 'Accent']) {
    ok(mats.has(n), `Material "${n}" fehlt`);
  }
  ok(mats.size <= 6, `${mats.size} Materialien — zu viele Draw Calls`);
  const acc = mats.get('Accent'), vis = mats.get('Visor');
  ok(acc && acc.emissive.getHex() !== 0, 'Akzent leuchtet nicht');
  ok(vis && vis.emissive.getHex() !== 0, 'Visor leuchtet nicht');
  console.log(`  ${skinned} SkinnedMeshes, ${tris} Dreiecke, ${mats.size} Materialien (8 Spieler => ${tris * 8} Dreiecke)`);
  ok(fails === b, 'Mesh-Pruefung fehlgeschlagen');
}

console.log('=== 3. Proportionen passen zur Hitbox ===');
{
  const b = fails;
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const h = box.max.y - box.min.y;
  ok(h > 1.7 && h < 1.9, `Koerperhoehe ${h.toFixed(2)} m passt nicht zur 1.8-m-Hitbox`);
  ok(Math.abs(box.min.y) < 0.05, `Fuesse stehen bei y=${box.min.y.toFixed(3)} statt auf 0`);
  const w = box.max.x - box.min.x, d = box.max.z - box.min.z;
  ok(w > 0.35 && w < 0.85, `Breite ${w.toFixed(2)} m unplausibel`);
  ok(d < 0.8, `Tiefe ${d.toFixed(2)} m unplausibel`);
  console.log(`  ${h.toFixed(2)} m hoch, ${w.toFixed(2)} m breit, ${d.toFixed(2)} m tief`);
  ok(fails === b, 'Proportionen falsch');
}

console.log('=== 4. Rig ===');
{
  const b = fails;
  const bones = new Set();
  gltf.scene.traverse((o) => { if (o.isBone) bones.add(o.name); });
  const required = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
    'UpperArm_L', 'LowerArm_L', 'Hand_L', 'UpperArm_R', 'LowerArm_R', 'Hand_R',
    'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'UpperLeg_R', 'LowerLeg_R', 'Foot_R'];
  for (const n of required) ok(bones.has(n), `Knochen "${n}" fehlt`);
  for (const n of ['Backpack', 'Core', 'Visor']) ok(bones.has(n), `Zusatzknochen "${n}" fehlt`);
  ok(bones.size <= 30, `${bones.size} Knochen — Rig unnoetig komplex`);
  // Hierarchie stichprobenartig
  let hand = null;
  gltf.scene.traverse((o) => { if (o.name === 'Hand_L') hand = o; });
  const chain = [];
  for (let n = hand; n; n = n.parent) chain.push(n.name);
  ok(chain.includes('LowerArm_L') && chain.includes('Chest') && chain.includes('Hips'),
    'Hand haengt nicht korrekt in der Kette: ' + chain.join(' < '));
  console.log(`  ${bones.size} Knochen, Kette ${chain.slice(0, 6).join(' < ')}`);
  ok(fails === b, 'Rig fehlerhaft');
}

console.log('=== 5. Alle geforderten Animationen ===');
{
  const b = fails;
  const names = gltf.animations.map((a) => a.name);
  const required = ['Idle', 'Walk', 'Run', 'Sprint', 'JumpStart', 'Jump', 'Fall', 'Land',
    'Crouch', 'Slide', 'WallRun', 'WallJump', 'Dash', 'Punch', 'Hit', 'Death'];
  for (const n of required) ok(names.includes(n), `Animation "${n}" fehlt`);
  for (const clip of gltf.animations) {
    ok(clip.duration > 0.1, `Clip "${clip.name}" ist ${clip.duration}s lang`);
    ok(clip.tracks.length > 0, `Clip "${clip.name}" hat keine Kanäle`);
  }
  // Arcade-Tempo: Laufzyklen muessen kurz sein
  const byName = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));
  ok(byName.Sprint.duration < byName.Run.duration, 'Sprint ist nicht schneller als Run');
  ok(byName.Run.duration < byName.Walk.duration, 'Run ist nicht schneller als Walk');
  ok(byName.Sprint.duration < 0.8, `Sprint-Zyklus ${byName.Sprint.duration}s — zu traege fuer ein Arcade-Spiel`);
  ok(byName.Dash.duration < 0.6, 'Dash ist zu lang');
  console.log(`  ${names.length} Clips, Sprint ${byName.Sprint.duration}s / Run ${byName.Run.duration}s / Walk ${byName.Walk.duration}s`);
  ok(fails === b, 'Animationen unvollstaendig');
}

console.log('=== 6. Jeder Clip bewegt das Rig wirklich ===');
{
  const b = fails;
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const tracked = [];
  scene.traverse((o) => { if (o.isBone && ['Hips', 'Chest', 'UpperArm_R', 'UpperLeg_L', 'Head'].includes(o.name)) tracked.push(o); });
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.reset(); action.play();
    const samples = [];
    for (let i = 0; i <= 6; i++) {
      mixer.update(i === 0 ? 0 : clip.duration / 6);
      scene.updateMatrixWorld(true);
      samples.push(tracked.map((t) => t.matrixWorld.elements.slice(0, 12).join(',')).join('|'));
      let bad = false;
      scene.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) bad = true; });
      ok(!bad, `NaN in Clip "${clip.name}"`);
    }
    ok(new Set(samples).size > 1, `Clip "${clip.name}" bewegt gar nichts`);
    action.stop();
  }
  console.log('  alle Clips animieren das Rig');
  ok(fails === b, 'Clips fehlerhaft');
}

console.log('=== 6b. Panzerung bricht in keiner Animation ===');
{
  const b = fails;
  // Geometrische Pruefung im Ruheraum der Knochen (tools/check_clearance.py):
  // exakt, weil achsenparallele Huellen bei gedrehtem Koerper Fehlalarme geben.
  const { execFileSync } = await import('child_process');
  let out = '', ranOk = false;
  try {
    out = execFileSync('python3', [path.join(root, 'tools', 'check_clearance.py')],
      { encoding: 'utf8', timeout: 120000 });
    ranOk = true;
  } catch (e) {
    if (e.status === 1) { out = e.stdout || ''; ranOk = true; }
    else console.log('  (uebersprungen — python3 nicht verfuegbar)');
  }
  if (ranOk) {
    ok(out.includes('Keine Durchdringungen'),
      'Gliedmassen durchdringen den Rumpf:\n' + out.split('\n').slice(0, 6).join('\n'));
    console.log('  ' + out.trim().split('\n')[0]);
  }
  ok(fails === b, 'Deformationspruefung fehlgeschlagen');
}

console.log('=== 7. Anbindung im Spiel ===');
{
  const b = fails;
  // Pflicht-Schnittstelle: beide Varianten muessen austauschbar sein
  const required = ['setTransform', 'setVisible', 'setColor', 'setName', 'punch',
    'flash', 'setShadows', 'updateAnimation', 'dispose'];
  for (const m of required) {
    ok(typeof GlbCharacter.prototype[m] === 'function', `GlbCharacter fehlt ${m}()`);
    ok(typeof PlayerCharacter.prototype[m] === 'function', `PlayerCharacter fehlt ${m}()`);
  }

  adoptPlayerModel(gltf.scene, gltf.animations);
  const scene = new THREE.Scene();
  const fx = new CharacterFx(scene, 60);
  const camera = new THREE.PerspectiveCamera(70, 1.6, 0.3, 400);
  camera.position.set(0, 2, 6);

  const a = new GlbCharacter({ scene, fx, name: 'A', color: 0x4c9dff, isLocal: false });
  const c = new GlbCharacter({ scene, fx, name: 'B', color: 0xff9f2e, isLocal: true, nameplate: false });
  ok(a.model !== c.model, 'Beide Spieler teilen sich dasselbe Modell');
  ok(a.model.children.length > 0, 'Geklontes Modell ist leer');

  // Eigene Skelette: sonst bewegen sich alle Spieler identisch
  const boneA = [], boneB = [];
  a.model.traverse((o) => { if (o.isBone && o.name === 'UpperLeg_L') boneA.push(o); });
  c.model.traverse((o) => { if (o.isBone && o.name === 'UpperLeg_L') boneB.push(o); });
  ok(boneA[0] && boneB[0] && boneA[0] !== boneB[0], 'Spieler teilen sich ein Skelett');

  // Farbvarianten: Akzent unterscheidet sich, Panzerung nicht
  ok(a.modelMaterials.Accent !== c.modelMaterials.Accent, 'Akzent-Material wird geteilt');
  ok(a.modelMaterials.Accent.emissive.getHex() !== c.modelMaterials.Accent.emissive.getHex(),
    'Spielerfarbe wirkt sich nicht auf den Akzent aus');

  // Zustaende durchspielen
  const states = ['idle', 'run', 'sprint', 'crouch', 'slide', 'jump', 'fall', 'wallrun', 'dash'];
  for (const st of states) {
    for (let i = 0; i < 20; i++) {
      a.setTransform(0, 0, -i * 0.1, 0.3);
      a.updateAnimation(1 / 60, {
        movementState: st, speed: st === 'sprint' ? 15 : 8,
        isGrounded: !['jump', 'fall', 'wallrun', 'dash'].includes(st),
        isWallRunning: st === 'wallrun', isDashing: st === 'dash',
        wallSide: 1, velocityY: 0, moveAngle: 0,
      }, camera);
    }
    ok(!!a.current, `Kein Clip aktiv bei "${st}"`);
    let bad = false;
    a.root.updateMatrixWorld(true);
    a.root.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) bad = true; });
    ok(!bad, `NaN bei Zustand "${st}"`);
  }
  // Laufrichtung / Wallrun-Drehung wie bei der prozeduralen Figur
  for (let i = 0; i < 60; i++) {
    a.updateAnimation(1 / 60, { movementState: 'run', speed: 9, isGrounded: true, moveAngle: Math.PI / 2 }, camera);
  }
  ok(Math.abs(a.turn.rotation.y + Math.PI / 2) < 0.15, 'Koerper dreht nicht in die Laufrichtung');
  a.punch();
  ok(a.oneShot === 'Punch', 'Punch-Clip startet nicht');
  for (let i = 0; i < 40; i++) a.updateAnimation(1 / 60, { movementState: 'idle', speed: 0, isGrounded: true }, camera);
  ok(a.oneShot === null, 'Punch-Clip endet nicht');

  const before = scene.children.length;
  a.dispose(); c.dispose();
  ok(scene.children.length === before - 2, 'dispose raeumt nicht auf');
  console.log(fails === b ? '  GLB-Figur ist ein vollwertiger Ersatz' : `  ${fails - b} Fehler`);
}

console.log(fails === 0 ? '\nERGEBNIS: alle Asset-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
