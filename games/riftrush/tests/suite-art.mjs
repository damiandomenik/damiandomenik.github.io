/**
 * Grafik-Ebene: Umgebung, Materialien, Instanzfarben.
 * Diese Fehlerklasse (schwarze Flächen, unsichtbare Effekte) sieht man sonst
 * erst im Browser — hier wird sie numerisch geprüft.
 */
const ctx2d = () => ({
  fillRect(){}, clearRect(){}, fillText(){}, roundRect(){}, fill(){}, beginPath(){},
  moveTo(){}, lineTo(){}, closePath(){}, drawImage(){},
  font: '', textAlign: '', textBaseline: '', fillStyle: '',
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d }) };
globalThis.performance = { now: () => 0 };

import * as THREE from 'three';
import { Environment } from '../src/core/Environment.js';
import { PhysicsWorld } from '../src/core/Physics.js';
import { DungeonGenerator } from '../src/dungeon/DungeonGenerator.js';
import { UNIT_BOX, createMaterials, createRimMaterials } from '../src/dungeon/Hazards.js';
import { PlayerCharacter } from '../src/player/PlayerCharacter.js';
import { CharacterFx } from '../src/player/CharacterFx.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL:', m); fails++; } };

console.log('=== 1. Vertex-Farben: keine schwarzen Flächen ===');
{
  const b = fails;
  const colAttr = UNIT_BOX.getAttribute('color');
  ok(!!colAttr, 'UNIT_BOX hat kein color-Attribut — mit vertexColors wäre alles schwarz');
  ok(colAttr && colAttr.array.every((v) => v === 1), 'color-Attribut ist nicht weiß vorbelegt');
  const mats = createMaterials();
  for (const [k, m] of Object.entries(mats)) {
    ok(m.vertexColors === true, `Material "${k}" nutzt keine vertexColors (Instanzfarben wirkungslos)`);
  }
  // Gegenprobe: jede Geometrie, die mit vertexColors gezeichnet wird, braucht das Attribut
  const fx = new CharacterFx(new THREE.Scene(), 8);
  if (fx.material.vertexColors) {
    ok(!!fx.mesh.geometry.getAttribute('color'), 'Partikelgeometrie fehlt das color-Attribut');
  }
  fx.dispose();
  console.log(fails === b ? '  alle Materialien korrekt vorbereitet' : `  ${fails - b} Fehler`);
}

console.log('=== 2. Leuchtende Elemente umgehen das Tone Mapping ===');
{
  const b = fails;
  const rims = createRimMaterials();
  for (const [k, m] of Object.entries(rims)) {
    ok(m.toneMapped === false, `Kantenlicht "${k}" wird tone-gemappt und wirkt dadurch matt`);
  }
  const scene = new THREE.Scene();
  const ch = new PlayerCharacter({ scene, name: 'X', color: 0x4c9dff });
  ok(ch.materials.core.toneMapped === false, 'Energiekern wird tone-gemappt');
  ok(ch.materials.ring.toneMapped === false, 'Bodenring wird tone-gemappt');
  ok(ch.nameplate.material.toneMapped === false, 'Namensschild wird tone-gemappt (Text wirkt grau)');
  ch.dispose();
  console.log(fails === b ? '  Glow-Materialien bleiben unangetastet' : `  ${fails - b} Fehler`);
}

console.log('=== 3. Instanzfarben streuen, ohne dunkel zu werden ===');
{
  const b = fails;
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  const dg = new DungeonGenerator(scene, physics);
  dg.generate(31337, 9);
  const inst = dg.group.children.filter((o) => o.isInstancedMesh && o.instanceColor);
  ok(inst.length > 0, 'Keine Instanzfarben gesetzt');
  let min = 9, max = 0, distinct = new Set();
  for (const im of inst) {
    const a = im.instanceColor.array;
    for (let i = 0; i < a.length; i++) { min = Math.min(min, a[i]); max = Math.max(max, a[i]); }
    for (let i = 0; i < im.count; i++) distinct.add(a[i * 3 + 1].toFixed(3));
  }
  ok(min > 0.6, `Dunkelste Instanzfarbe ${min.toFixed(2)} — Flächen würden absaufen`);
  ok(max < 1.35, `Hellste Instanzfarbe ${max.toFixed(2)} — überstrahlt`);
  ok(distinct.size > 8, `Nur ${distinct.size} verschiedene Helligkeiten — keine sichtbare Streuung`);
  console.log(`  Streuung ${min.toFixed(2)}–${max.toFixed(2)} über ${distinct.size} Stufen`);
  ok(fails === b, 'Instanzfarben fehlerhaft');
}

console.log('=== 4. Umgebung: Himmel, Sterne, Gitter ===');
{
  const b = fails;
  const scene = new THREE.Scene();
  const renderer = { toneMapping: 0, toneMappingExposure: 1, outputColorSpace: '' };
  const env = new Environment(scene, renderer);
  ok(renderer.toneMapping === THREE.ACESFilmicToneMapping, 'Tone Mapping nicht gesetzt');
  ok(renderer.toneMappingExposure > 0.8 && renderer.toneMappingExposure < 1.6, 'Belichtung unplausibel');
  ok(scene.children.includes(env.sky), 'Himmel fehlt in der Szene');
  ok(env.skyMat.fog === false, 'Himmel wird vernebelt (Nebel über dem Himmel = graue Wand)');
  ok(env.starMat.fog === false, 'Sterne werden vernebelt');
  ok(env.sky.material.side === THREE.BackSide, 'Himmelskuppel zeigt nach außen');
  ok(env.sky.material.depthWrite === false, 'Himmel schreibt in den Tiefenpuffer');
  ok(env.sky.renderOrder < 0, 'Himmel wird nicht zuerst gezeichnet');
  const stars = env.stars.geometry.getAttribute('position');
  ok(stars.count > 300, 'Zu wenige Sterne');
  let far = 0;
  for (let i = 0; i < stars.count; i++) {
    far = Math.max(far, Math.hypot(stars.getX(i), stars.getZ(i)));
  }
  ok(far < 320, `Sterne liegen bei ${far.toFixed(0)} — außerhalb der Himmelskuppel`);

  // Alles muss der Kamera folgen, sonst reißt der Horizont auf
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(120, 8, -430);
  env.update(0.016, cam, -12);
  ok(env.sky.position.distanceTo(cam.position) < 0.001, 'Himmel folgt der Kamera nicht');
  ok(Math.abs(env.stars.position.x - cam.position.x) < 0.001, 'Sterne folgen der Kamera nicht');
  ok(Math.abs(env.grid.position.x - cam.position.x) <= 5, 'Gitter folgt der Kamera nicht');
  ok(env.grid.position.y < -12, 'Gitter liegt über dem Spieler');
  ok(Number.isFinite(env.skyMat.uniforms.time.value), 'Zeit-Uniform kaputt');

  const before = scene.children.length;
  env.dispose();
  ok(scene.children.length === before - 3, 'dispose räumt die Umgebung nicht auf');
  console.log(fails === b ? '  Umgebung vollständig und kameragebunden' : `  ${fails - b} Fehler`);
}

console.log('=== 5. Kantenlicht auf Wänden und Plattformen ===');
{
  const b = fails;
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  const dg = new DungeonGenerator(scene, physics);
  dg.generate(4242, 9);
  const rimMats = new Set(Object.values(dg.rimMaterials));
  const rimMeshes = dg.group.children.filter((o) => o.isInstancedMesh && rimMats.has(o.material));
  const bars = rimMeshes.reduce((n, m) => n + m.count, 0);
  ok(bars > 200, `Nur ${bars} Leuchtkanten im ganzen Dungeon`);
  ok(rimMeshes.length <= 10, `${rimMeshes.length} zusätzliche Draw Calls für Kantenlicht — zu viele`);
  // Draw-Call-Budget insgesamt
  const draws = dg.group.children.filter((o) => o.isMesh || o.isInstancedMesh).length;
  ok(draws < 90, `${draws} Draw Calls für die Dungeon-Geometrie — zu viele`);
  console.log(`  ${bars} Leuchtkanten, ${draws} Draw Calls für den gesamten Dungeon`);
  ok(fails === b, 'Kantenlicht fehlerhaft');
}

console.log(fails === 0 ? '\nERGEBNIS: alle Grafik-Tests bestanden' : `\nERGEBNIS: ${fails} Fehler`);
export default fails;
