// SKYFALL — models.js
// Alles hier wird prozedural aus Three.js-Primitiven gebaut. Keine externen Assets,
// keine Bilddateien. Die zwei Canvas-Texturen unten werden zur Laufzeit erzeugt.

import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Palette
 * ------------------------------------------------------------------ */

export const TEAM_COLOR = {
  blue: 0x3fb2ff,
  red:  0xff4a3d
};

const cache = {};

function mat(key, params) {
  if (!cache[key]) cache[key] = new THREE.MeshStandardMaterial(params);
  return cache[key];
}

export const M = {
  get hullDark()  { return mat('hullDark',  { color: 0x272d34, metalness: 0.92, roughness: 0.42 }); },
  get hullMid()   { return mat('hullMid',   { color: 0x39424c, metalness: 0.88, roughness: 0.5  }); },
  get hullLight() { return mat('hullLight', { color: 0x4d5864, metalness: 0.8,  roughness: 0.55 }); },
  get panel()     { return mat('panel',     { color: 0x14181d, metalness: 0.7,  roughness: 0.65 }); },
  get rust()      { return mat('rust',      { color: 0x5c3f2c, metalness: 0.55, roughness: 0.85 }); },
  get brass()     { return mat('brass',     { color: 0x9a7233, metalness: 1.0,  roughness: 0.35 }); },
  get rubber()    { return mat('rubber',    { color: 0x0d0f11, metalness: 0.2,  roughness: 0.95 }); },
  get concrete()  { return mat('concrete',  { color: 0x2c2f33, metalness: 0.05, roughness: 0.95 }); },
  get rock()      { return mat('rock',      { color: 0x1f2226, metalness: 0.04, roughness: 1.0, flatShading: true }); },
  get rockLight() { return mat('rockLight', { color: 0x33383e, metalness: 0.06, roughness: 0.95, flatShading: true }); },
  get glass()     {
    if (!cache.glass) cache.glass = new THREE.MeshPhysicalMaterial({
      color: 0x0b131a, metalness: 1.0, roughness: 0.06,
      transparent: true, opacity: 0.62, envMapIntensity: 1.4
    });
    return cache.glass;
  },
  get warn()      { return emissive('warn', 0xff8c1a, 2.2); },
  get engineHot() { return emissive('hot', 0xffd39a, 5.0); },
  get lampWhite() { return emissive('lampW', 0xdfe8f0, 1.6); }
};

function emissive(key, color, intensity) {
  if (!cache[key]) {
    cache[key] = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, emissive: color, emissiveIntensity: intensity,
      metalness: 0.3, roughness: 0.4
    });
  }
  return cache[key];
}

export function teamEmissive(team, intensity = 2.4) {
  return emissive('team_' + team + '_' + intensity, TEAM_COLOR[team], intensity);
}

/* ------------------------------------------------------------------ *
 *  Laufzeit-Texturen (Canvas, keine Dateien)
 * ------------------------------------------------------------------ */

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d').createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

let _cloud = null;
export function cloudTexture() {
  if (_cloud) return _cloud;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  // Mehrere weiche Blobs übereinander -> unregelmäßige Wolkenform
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.pow(Math.random(), 0.6) * S * 0.3;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d * 0.55;
    const r = S * (0.09 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Kanten weich ausblenden, damit keine harten Sprite-Ränder entstehen
  const fade = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, S, S);
  _cloud = new THREE.CanvasTexture(c);
  _cloud.colorSpace = THREE.SRGBColorSpace;
  return _cloud;
}

/* ------------------------------------------------------------------ *
 *  Geometrie-Helfer
 * ------------------------------------------------------------------ */

// Tragfläche: Grundriss als 2D-Shape, dann extrudiert. Ergibt saubere,
// gepfeilte Silhouetten statt flacher Boxen.
export function wingGeometry({ span, rootChord, tipChord, sweep, thickness, dihedral = 0 }) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, -rootChord);
  s.lineTo(span, -sweep - tipChord);
  s.lineTo(span, -sweep);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: thickness * 0.35,
    bevelThickness: thickness * 0.35,
    bevelSegments: 1,
    curveSegments: 1
  });
  g.translate(0, 0, -thickness / 2);
  g.rotateX(-Math.PI / 2);          // Sehne -> Z, Dicke -> Y
  if (dihedral) g.rotateZ(dihedral);
  return g;
}

// Fuselage-Segment mit eckigem Querschnitt (radialSegments klein = kantig/dieselpunk)
function hullSeg(rTop, rBot, len, seg = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
  g.rotateX(Math.PI / 2);          // Längsachse -> Z
  return g;
}

// Kleine technische Details (Greebles) auf eine Fläche streuen.
function greeble(parent, count, box, spread, material) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, material, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    d.position.set(
      (Math.random() - 0.5) * spread.x,
      (Math.random() - 0.5) * spread.y,
      (Math.random() - 0.5) * spread.z
    );
    d.scale.set(
      box.x * (0.5 + Math.random()),
      box.y * (0.5 + Math.random()),
      box.z * (0.5 + Math.random())
    );
    d.rotation.set(0, 0, Math.random() < 0.5 ? 0 : Math.PI / 2);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.castShadow = true;
  parent.add(inst);
  return inst;
}

function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* ------------------------------------------------------------------ *
 *  Triebwerk
 * ------------------------------------------------------------------ */

// Liefert eine Gruppe + einen Handle, über den game.js den Schub visualisiert.
function buildEngine(radius, length, teamCol) {
  const g = new THREE.Group();

  // Gehäuse
  add(g, hullSeg(radius * 0.86, radius, length * 0.7, 10), M.hullMid, 0, 0, 0);
  // Kühlrippen
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, radius * 0.07, 4, 10), M.hullDark);
    r.position.z = -length * 0.3 + i * length * 0.2;
    g.add(r);
  }
  // Düse
  const nozzle = add(g, hullSeg(radius * 1.05, radius * 0.72, length * 0.34, 10), M.hullDark, 0, 0, length * 0.5);
  nozzle.material = M.panel;

  // Innere Glut
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.68, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c })
  );
  core.position.z = length * 0.63;
  core.rotation.y = Math.PI;
  g.add(core);

  // Flammenkegel
  const flameGeo = new THREE.ConeGeometry(radius * 0.62, length * 1.5, 10, 1, true);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, length * 0.75);
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
    color: 0xffc27a, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  }));
  flame.position.z = length * 0.6;
  g.add(flame);

  // Punktlicht + Glow-Sprite
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffb066,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
  }));
  glow.scale.setScalar(radius * 5);
  glow.position.z = length * 0.66;
  g.add(glow);

  const trimGeo = new THREE.TorusGeometry(radius * 1.06, radius * 0.05, 4, 12);
  const trim = new THREE.Mesh(trimGeo, teamCol);
  trim.position.z = -length * 0.36;
  g.add(trim);

  g.userData.thrust = { flame, glow, core, nozzleZ: length * 0.66 };
  return g;
}

/* ------------------------------------------------------------------ *
 *  Flugzeuge
 * ------------------------------------------------------------------ */

export const AIRCRAFT_SPECS = {
  interceptor: {
    label: 'INTERCEPTOR',
    tagline: 'Schnell, wendig, dünnhäutig.',
    hp: 130,
    cruise: 105, max: 155, boost: 235, accel: 62, drag: 0.42,
    pitch: 2.1, yaw: 0.95, roll: 3.6,
    boostFuel: 3.2, boostRegen: 0.55,
    gun: { dmg: 11, rate: 0.085, speed: 620, spread: 0.006, coreMul: 0.35, ports: 2 },
    heavy: null,
    radius: 3.2
  },
  striker: {
    label: 'STRIKER',
    tagline: 'Allrounder mit Zähnen.',
    hp: 220,
    cruise: 88, max: 130, boost: 195, accel: 46, drag: 0.5,
    pitch: 1.55, yaw: 0.8, roll: 2.5,
    boostFuel: 4.0, boostRegen: 0.5,
    gun: { dmg: 16, rate: 0.11, speed: 560, spread: 0.008, coreMul: 0.45, ports: 2 },
    heavy: { type: 'rocket', dmg: 80, splash: 55, radius: 9, rate: 1.4, speed: 210, ammo: 8, coreMul: 1.0 },
    radius: 4.2
  },
  bomber: {
    label: 'BOMBER',
    tagline: 'Langsam. Fliegende Abrissbirne.',
    hp: 420,
    cruise: 62, max: 92, boost: 132, accel: 26, drag: 0.62,
    pitch: 0.95, yaw: 0.5, roll: 1.35,
    boostFuel: 5.0, boostRegen: 0.4,
    gun: { dmg: 13, rate: 0.16, speed: 480, spread: 0.016, coreMul: 0.3, ports: 2 },
    heavy: { type: 'bomb', dmg: 140, splash: 120, radius: 16, rate: 0.9, speed: 30, ammo: 10, coreMul: 1.6 },
    radius: 6.4
  }
};

export function buildAircraft(type, team) {
  const g = new THREE.Group();
  const tc = teamEmissive(team, 2.6);
  const engines = [];

  if (type === 'interceptor') buildInterceptor(g, tc, engines);
  else if (type === 'bomber') buildBomber(g, tc, engines);
  else buildStriker(g, tc, engines);

  g.userData.engines = engines;
  g.userData.type = type;
  g.userData.team = team;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildInterceptor(g, tc, engines) {
  // Rumpf: schlank, nach vorn spitz
  add(g, hullSeg(0.55, 1.15, 5.5, 8), M.hullMid, 0, 0, -1.2);
  add(g, hullSeg(1.15, 1.0, 4.5, 8), M.hullDark, 0, 0, 2.8);
  const nose = add(g, new THREE.ConeGeometry(0.55, 3.0, 8), M.hullDark, 0, 0, -5.4);
  nose.rotation.x = -Math.PI / 2;
  add(g, new THREE.CylinderGeometry(0.06, 0.02, 2.2, 4), M.brass, 0, 0, -7.4).rotation.x = Math.PI / 2;

  // Rückenwirbel
  add(g, new THREE.BoxGeometry(0.5, 0.6, 6.5), M.panel, 0, 0.85, 0.5);

  // Cockpit
  const canopy = add(g, new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.glass, 0, 0.72, -2.2);
  canopy.scale.set(0.85, 0.72, 2.0);

  // Delta-Flügel
  const wg = wingGeometry({ span: 5.2, rootChord: 4.6, tipChord: 1.0, sweep: 3.2, thickness: 0.3 });
  const wl = add(g, wg, M.hullMid, 0.9, -0.15, 1.6);
  const wr = add(g, wg.clone(), M.hullMid, -0.9, -0.15, 1.6);
  wr.scale.x = -1;
  wl.rotation.z = -0.11; wr.rotation.z = 0.11;

  // Canards
  const cg = wingGeometry({ span: 1.9, rootChord: 1.5, tipChord: 0.4, sweep: 1.0, thickness: 0.16 });
  const cl = add(g, cg, M.hullDark, 0.8, 0.15, -3.2);
  const cr = add(g, cg.clone(), M.hullDark, -0.8, 0.15, -3.2);
  cr.scale.x = -1;

  // Doppel-Seitenleitwerke, nach außen geneigt
  const fg = wingGeometry({ span: 2.1, rootChord: 2.0, tipChord: 0.7, sweep: 1.3, thickness: 0.18 });
  for (const s of [1, -1]) {
    const f = add(g, fg.clone(), M.hullDark, s * 1.5, 0.4, 3.4);
    f.rotation.z = Math.PI / 2 - s * 0.35;
    f.scale.x = s;
    add(g, new THREE.BoxGeometry(0.12, 0.5, 0.5), tc, s * 2.15, 2.0, 3.9);
  }

  // Team-Streifen auf den Flügeln
  for (const s of [1, -1]) add(g, new THREE.BoxGeometry(3.0, 0.06, 0.35), tc, s * 3.0, 0.02, 1.3);

  // Waffenports
  for (const s of [1, -1]) {
    const p = add(g, new THREE.CylinderGeometry(0.14, 0.14, 2.6, 6), M.panel, s * 1.5, -0.45, -2.6);
    p.rotation.x = Math.PI / 2;
    g.userData.ports = g.userData.ports || [];
    g.userData.ports.push(new THREE.Vector3(s * 1.5, -0.45, -4.0));
  }

  // Ein Triebwerk
  const e = buildEngine(1.1, 3.0, tc);
  e.position.set(0, 0, 4.4);
  g.add(e); engines.push(e);

  greeble(g, 22, { x: 0.28, y: 0.14, z: 0.5 }, { x: 1.6, y: 0.9, z: 6.5 }, M.hullDark);
  add(g, new THREE.BoxGeometry(0.2, 0.12, 0.12), M.warn, 1.1, 0.5, -1.0);
  add(g, new THREE.BoxGeometry(0.2, 0.12, 0.12), M.warn, -1.1, 0.5, -1.0);
}

function buildStriker(g, tc, engines) {
  // Kastenförmiger, schwerer Rumpf
  add(g, hullSeg(1.1, 1.9, 7.0, 8), M.hullMid, 0, 0, -0.5);
  add(g, hullSeg(1.9, 1.7, 4.0, 8), M.hullDark, 0, 0, 4.8);
  const nose = add(g, new THREE.ConeGeometry(1.1, 3.4, 8), M.hullDark, 0, 0, -5.6);
  nose.rotation.x = -Math.PI / 2;
  add(g, new THREE.BoxGeometry(2.6, 0.7, 5.0), M.panel, 0, -1.3, 0.5);

  // Cockpit + Panzerwanne
  const canopy = add(g, new THREE.SphereGeometry(1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.glass, 0, 1.15, -2.4);
  canopy.scale.set(0.9, 0.8, 1.9);
  add(g, new THREE.BoxGeometry(2.2, 0.9, 2.4), M.hullDark, 0, 0.7, -0.6);

  // Hauptflügel, mittelstark gepfeilt, mit Endplatten
  const wg = wingGeometry({ span: 7.0, rootChord: 4.4, tipChord: 1.6, sweep: 2.2, thickness: 0.4 });
  for (const s of [1, -1]) {
    const w = add(g, wg.clone(), M.hullMid, s * 1.6, 0.1, 1.0);
    w.scale.x = s;
    w.rotation.z = -s * 0.06;
    // Endplatte
    const ep = add(g, new THREE.BoxGeometry(0.2, 1.5, 2.4), M.hullDark, s * 8.5, 0.5, 0.2);
    ep.rotation.x = 0.1;
    add(g, new THREE.BoxGeometry(0.24, 0.5, 0.5), tc, s * 8.5, 1.2, -0.6);
    // Team-Streifen
    add(g, new THREE.BoxGeometry(3.4, 0.08, 0.5), tc, s * 4.4, 0.32, 0.6);
    // Waffenpylon
    const pod = add(g, hullSeg(0.32, 0.42, 3.4, 6), M.hullDark, s * 3.4, -0.55, -0.4);
    pod.rotation.z = 0;
    g.userData.ports = g.userData.ports || [];
    g.userData.ports.push(new THREE.Vector3(s * 3.4, -0.55, -2.4));
    // Raketen unter dem Flügel
    for (let i = 0; i < 2; i++) {
      add(g, hullSeg(0.14, 0.2, 1.9, 6), M.rust, s * (2.2 + i * 0.7), -0.95, 1.6);
    }
  }

  // Seitenleitwerk + Höhenruder
  const fin = wingGeometry({ span: 2.8, rootChord: 2.6, tipChord: 1.0, sweep: 1.8, thickness: 0.22 });
  const f = add(g, fin, M.hullDark, 0, 1.2, 4.6);
  f.rotation.z = Math.PI / 2;
  const tail = wingGeometry({ span: 2.4, rootChord: 1.8, tipChord: 0.7, sweep: 1.1, thickness: 0.2 });
  for (const s of [1, -1]) {
    const t = add(g, tail.clone(), M.hullDark, s * 0.9, 0.3, 5.6);
    t.scale.x = s;
  }

  // Zwei Triebwerke
  for (const s of [1, -1]) {
    const e = buildEngine(1.0, 3.2, tc);
    e.position.set(s * 1.15, -0.15, 6.2);
    g.add(e); engines.push(e);
  }

  greeble(g, 34, { x: 0.32, y: 0.18, z: 0.6 }, { x: 2.6, y: 1.6, z: 8.0 }, M.hullDark);
  add(g, new THREE.BoxGeometry(0.24, 0.14, 0.14), M.warn, 1.5, 0.9, -1.4);
  add(g, new THREE.BoxGeometry(0.24, 0.14, 0.14), M.warn, -1.5, 0.9, -1.4);
}

function buildBomber(g, tc, engines) {
  // Voluminöser Rumpf mit Bombenschacht
  add(g, hullSeg(2.0, 3.1, 9.0, 10), M.hullMid, 0, 0, -1.0);
  add(g, hullSeg(3.1, 2.4, 6.0, 10), M.hullDark, 0, 0, 6.4);
  const nose = add(g, new THREE.SphereGeometry(2.0, 12, 8), M.hullDark, 0, -0.2, -5.8);
  nose.scale.set(1.0, 0.85, 1.5);

  // Bombenschacht
  add(g, new THREE.BoxGeometry(3.4, 1.0, 7.0), M.panel, 0, -2.4, 1.0);
  for (let i = 0; i < 4; i++) {
    add(g, new THREE.SphereGeometry(0.55, 8, 6), M.rust, i % 2 ? 0.8 : -0.8, -2.9, -1.6 + i * 1.5);
  }

  // Kanzel
  const canopy = add(g, new THREE.SphereGeometry(1.7, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), M.glass, 0, 1.6, -3.6);
  canopy.scale.set(1.0, 0.7, 1.6);
  add(g, new THREE.BoxGeometry(3.6, 1.4, 3.0), M.hullDark, 0, 1.0, -1.4);

  // Große, kaum gepfeilte Flügel
  const wg = wingGeometry({ span: 12.0, rootChord: 6.0, tipChord: 3.0, sweep: 1.8, thickness: 0.7 });
  for (const s of [1, -1]) {
    const w = add(g, wg.clone(), M.hullMid, s * 2.6, 0.6, 1.0);
    w.scale.x = s;
    add(g, new THREE.BoxGeometry(5.0, 0.1, 0.7), tc, s * 6.5, 1.0, 0.4);
    // Zwei Triebwerksgondeln pro Seite
    for (let i = 0; i < 2; i++) {
      const x = s * (4.2 + i * 3.4);
      add(g, hullSeg(1.0, 1.2, 4.2, 8), M.hullDark, x, -0.2, 1.2);
      add(g, new THREE.BoxGeometry(0.5, 1.4, 1.8), M.hullDark, x, 0.6, 0.6);
      const e = buildEngine(1.1, 3.0, tc);
      e.position.set(x, -0.2, 3.4);
      g.add(e); engines.push(e);
    }
    // Fahrwerksverkleidung
    add(g, new THREE.BoxGeometry(1.0, 1.0, 3.0), M.panel, s * 2.8, -1.8, 2.6);
  }

  // Doppel-Seitenleitwerk
  const fin = wingGeometry({ span: 4.0, rootChord: 3.6, tipChord: 1.6, sweep: 2.0, thickness: 0.32 });
  for (const s of [1, -1]) {
    const f = add(g, fin.clone(), M.hullDark, s * 2.4, 1.5, 7.4);
    f.rotation.z = Math.PI / 2;
    f.scale.x = 1;
    add(g, new THREE.BoxGeometry(0.4, 0.4, 0.6), tc, s * 2.4, 5.4, 7.0);
  }
  add(g, new THREE.BoxGeometry(5.4, 0.3, 2.6), M.hullDark, 0, 1.5, 8.2);

  // Defensiv-Türmchen
  const turret = add(g, new THREE.SphereGeometry(0.9, 10, 8), M.hullDark, 0, 2.4, 3.2);
  turret.scale.y = 0.7;
  for (const s of [1, -1]) {
    const b = add(g, new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), M.panel, s * 0.3, 2.5, 4.4);
    b.rotation.x = Math.PI / 2;
  }

  g.userData.ports = [new THREE.Vector3(1.2, -1.2, -6.0), new THREE.Vector3(-1.2, -1.2, -6.0)];

  greeble(g, 48, { x: 0.4, y: 0.24, z: 0.8 }, { x: 4.0, y: 3.0, z: 11.0 }, M.hullDark);
  for (const s of [1, -1]) add(g, new THREE.BoxGeometry(0.3, 0.18, 0.18), M.warn, s * 2.2, 2.0, -2.0);
}

/* ------------------------------------------------------------------ *
 *  Pilot
 * ------------------------------------------------------------------ */

// Gesamthöhe ~1.8. Ursprung an den Füßen. Blickrichtung -Z.
export function buildPilot(team) {
  const g = new THREE.Group();
  const tc = teamEmissive(team, 2.0);
  const suit = M.hullDark;
  const armor = M.hullMid;

  const hips = new THREE.Group();
  hips.position.y = 0.9;
  g.add(hips);

  // Torso
  const torso = add(hips, new THREE.BoxGeometry(0.52, 0.62, 0.36), suit, 0, 0.3, 0);
  add(hips, new THREE.BoxGeometry(0.58, 0.2, 0.4), armor, 0, 0.55, 0);       // Brustpanzer
  add(hips, new THREE.BoxGeometry(0.3, 0.14, 0.42), M.panel, 0, 0.3, -0.02); // Frontplatte
  add(hips, new THREE.BoxGeometry(0.12, 0.05, 0.05), tc, 0, 0.42, -0.19);    // Teamlicht Brust
  add(hips, new THREE.BoxGeometry(0.6, 0.16, 0.4), M.rubber, 0, -0.02, 0);   // Gürtel
  add(hips, new THREE.BoxGeometry(0.14, 0.1, 0.1), M.brass, 0.22, -0.02, -0.2);

  // Rucksack / Jetpack
  add(hips, new THREE.BoxGeometry(0.44, 0.5, 0.24), armor, 0, 0.34, 0.28);
  for (const s of [1, -1]) {
    add(hips, new THREE.CylinderGeometry(0.09, 0.09, 0.46, 8), M.rust, s * 0.14, 0.34, 0.42);
    const nz = add(hips, new THREE.ConeGeometry(0.08, 0.14, 8), M.panel, s * 0.14, 0.06, 0.42);
    nz.rotation.x = Math.PI;
  }
  add(hips, new THREE.BoxGeometry(0.3, 0.06, 0.06), tc, 0, 0.56, 0.4);

  // Kopf + Helm
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0);
  hips.add(head);
  const helm = add(head, new THREE.SphereGeometry(0.19, 12, 10), armor, 0, 0.04, 0);
  helm.scale.set(1.0, 1.05, 1.1);
  add(head, new THREE.BoxGeometry(0.26, 0.11, 0.06), M.glass, 0, 0.02, -0.17);      // Visier
  add(head, new THREE.BoxGeometry(0.2, 0.02, 0.02), tc, 0, 0.02, -0.2);             // Visier-Glow
  add(head, new THREE.BoxGeometry(0.16, 0.12, 0.14), M.panel, 0, -0.09, -0.1);      // Atemmaske
  add(head, new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), M.brass, 0.16, 0.1, 0.02).rotation.z = -0.5;
  add(head, new THREE.BoxGeometry(0.05, 0.05, 0.12), M.lampWhite, -0.17, 0.08, -0.04); // Helmlampe

  // Schulterpanzer
  for (const s of [1, -1]) {
    const sh = add(hips, new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), armor, s * 0.33, 0.56, 0);
    sh.rotation.z = -s * 0.2;
    add(hips, new THREE.BoxGeometry(0.1, 0.03, 0.14), tc, s * 0.4, 0.58, 0);
  }

  // Arme
  const arms = [];
  for (const s of [1, -1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.33, 0.5, 0);
    hips.add(a);
    add(a, new THREE.CylinderGeometry(0.075, 0.065, 0.34, 8), suit, 0, -0.17, 0);
    add(a, new THREE.BoxGeometry(0.13, 0.14, 0.13), armor, 0, -0.36, 0);       // Ellbogen
    add(a, new THREE.CylinderGeometry(0.065, 0.06, 0.3, 8), suit, 0, -0.52, 0);
    add(a, new THREE.BoxGeometry(0.12, 0.12, 0.15), M.rubber, 0, -0.7, -0.02); // Handschuh
    if (s < 0) add(a, new THREE.BoxGeometry(0.1, 0.06, 0.1), M.panel, 0, -0.4, 0.09); // Armdisplay
    arms.push(a);
  }

  // Beine
  const legs = [];
  for (const s of [1, -1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.15, -0.08, 0);
    hips.add(l);
    add(l, new THREE.CylinderGeometry(0.11, 0.09, 0.42, 8), suit, 0, -0.21, 0);
    add(l, new THREE.BoxGeometry(0.17, 0.12, 0.19), armor, 0, -0.44, 0.01);    // Knie
    add(l, new THREE.CylinderGeometry(0.09, 0.08, 0.36, 8), suit, 0, -0.64, 0);
    add(l, new THREE.BoxGeometry(0.18, 0.13, 0.3), M.rubber, 0, -0.85, -0.04); // Stiefel
    add(l, new THREE.BoxGeometry(0.14, 0.04, 0.06), M.hullDark, 0, -0.9, -0.16);
    legs.push(l);
  }

  // Waffe in der rechten Hand (Index 0 = +X Seite)
  const gun = new THREE.Group();
  gun.position.set(0, -0.72, -0.1);
  arms[0].add(gun);
  add(gun, new THREE.BoxGeometry(0.09, 0.14, 0.5), M.panel, 0, 0, -0.16);
  add(gun, new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), M.hullDark, 0, 0.03, -0.5).rotation.x = Math.PI / 2;
  add(gun, new THREE.BoxGeometry(0.06, 0.03, 0.16), tc, 0, 0.09, -0.2);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.74);
  gun.add(muzzle);

  // Fallschirm (versteckt, wird beim Absprung eingeblendet)
  const chute = new THREE.Group();
  chute.visible = false;
  chute.position.set(0, 2.6, 0.2);
  hips.add(chute);
  const canopyGeo = new THREE.SphereGeometry(1.9, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const chuteMat = new THREE.MeshStandardMaterial({
    color: TEAM_COLOR[team], metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide
  });
  add(chute, canopyGeo, chuteMat, 0, 0, 0);
  add(chute, new THREE.SphereGeometry(1.55, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), M.panel, 0, 0.12, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const line = add(chute, new THREE.CylinderGeometry(0.015, 0.015, 2.5, 3), M.rubber,
      Math.cos(a) * 0.85, -1.3, Math.sin(a) * 0.85);
    line.lookAt(new THREE.Vector3(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8));
    line.rotateX(Math.PI / 2);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { hips, head, arms, legs, torso, gun, muzzle, chute, team };
  return g;
}

/* ------------------------------------------------------------------ *
 *  Bodenwaffen (Erstpersonen-Modell in der Hand des Remote-Spielers
 *  ist der Blaster oben; hier nur die Werte)
 * ------------------------------------------------------------------ */

export const WEAPONS = {
  blaster: {
    label: 'BLASTER', dmg: 15, rate: 0.12, mag: 24, reload: 1.4,
    speed: 240, spread: 0.012, pellets: 1, coreMul: 0.35, color: 0x8fe3ff, splash: 0, radius: 0
  },
  scatter: {
    label: 'SCATTER', dmg: 12, rate: 0.72, mag: 6, reload: 2.0,
    speed: 190, spread: 0.07, pellets: 7, coreMul: 0.45, color: 0xffc46b, splash: 0, radius: 0
  },
  rocket: {
    label: 'RAKETE', dmg: 85, rate: 1.15, mag: 4, reload: 2.6,
    speed: 105, spread: 0.0, pellets: 1, coreMul: 1.0, color: 0xff8a3c, splash: 60, radius: 8
  }
};

/* ------------------------------------------------------------------ *
 *  Geschützturm (Inselverteidigung, vom Host simuliert)
 * ------------------------------------------------------------------ */

export function buildTurret(team) {
  const g = new THREE.Group();
  const tc = teamEmissive(team, 2.0);

  add(g, new THREE.CylinderGeometry(1.5, 1.9, 1.2, 8), M.concrete, 0, 0.6, 0);
  add(g, new THREE.CylinderGeometry(1.1, 1.2, 1.0, 8), M.hullDark, 0, 1.6, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(g, new THREE.BoxGeometry(0.16, 0.5, 0.16), M.rust, Math.cos(a) * 1.7, 0.3, Math.sin(a) * 1.7);
  }

  const yaw = new THREE.Group();
  yaw.position.y = 2.2;
  g.add(yaw);
  const housing = add(yaw, new THREE.BoxGeometry(1.6, 1.1, 1.9), M.hullMid, 0, 0.3, 0);
  add(yaw, new THREE.BoxGeometry(1.0, 0.4, 0.5), M.panel, 0, 0.9, 0.4);
  add(yaw, new THREE.BoxGeometry(0.4, 0.12, 0.12), tc, 0, 0.9, -0.7);

  const pitch = new THREE.Group();
  pitch.position.set(0, 0.35, -0.4);
  yaw.add(pitch);
  for (const s of [1, -1]) {
    const b = add(pitch, new THREE.CylinderGeometry(0.14, 0.16, 3.4, 8), M.hullDark, s * 0.32, 0, -1.5);
    b.rotation.x = Math.PI / 2;
  }
  add(pitch, new THREE.BoxGeometry(1.0, 0.5, 0.9), M.hullDark, 0, 0, 0.1);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -3.3);
  pitch.add(muzzle);

  g.userData = { yaw, pitch, muzzle, housing, team };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
