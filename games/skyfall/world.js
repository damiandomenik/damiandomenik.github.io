// SKYFALL — world.js
// Himmel, Wetter, Wolken, schwebende Inseln, Core-Reaktor.

import * as THREE from 'three';
import { M, teamEmissive, TEAM_COLOR, cloudTexture, glowTexture, buildTurret } from './models.js';

export const ISLAND_RADIUS = 112;
export const ISLAND_Z = 900;          // Blau bei -Z, Rot bei +Z
export const CORE_MAX_HP = 1000;

/* ------------------------------------------------------------------ *
 *  Wetter
 * ------------------------------------------------------------------ */

export const WEATHER = {
  sunset: {
    label: 'SONNENUNTERGANG',
    skyTop: 0x101c34, skyMid: 0x6d3a2e, skyBottom: 0xd9773a,
    sunColor: 0xffb066, sunIntensity: 2.6, sunDir: new THREE.Vector3(-0.55, 0.14, 0.82),
    ambient: 0x2c3446, ambientIntensity: 0.55,
    hemiSky: 0x4a5f80, hemiGround: 0x1a120c, hemiIntensity: 0.65,
    fog: 0x59392f, fogDensity: 0.00072,
    cloudColor: 0xd3a184, cloudLit: 0xffc79a,
    rain: 0, bloom: 0.62
  },
  storm: {
    label: 'STURM',
    skyTop: 0x05080d, skyMid: 0x131a24, skyBottom: 0x27303b,
    sunColor: 0x7f93ad, sunIntensity: 0.75, sunDir: new THREE.Vector3(0.35, 0.32, 0.87),
    ambient: 0x141b26, ambientIntensity: 0.42,
    hemiSky: 0x2a3646, hemiGround: 0x0a0c10, hemiIntensity: 0.5,
    fog: 0x171d26, fogDensity: 0.00135,
    cloudColor: 0x353f4d, cloudLit: 0x5d6b7d,
    rain: 1, bloom: 0.82
  }
};

/* ------------------------------------------------------------------ *
 *  Himmelskuppel (Gradient-Shader, keine Textur)
 * ------------------------------------------------------------------ */

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FS = `
uniform vec3 topColor, midColor, bottomColor, sunColor, sunDir;
uniform float sunIntensity, flash;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y * 0.5 + 0.5;
  vec3 col = mix(bottomColor, midColor, smoothstep(0.30, 0.52, h));
  col = mix(col, topColor, smoothstep(0.52, 0.92, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * pow(s, 90.0) * sunIntensity;        // Sonnenscheibe
  col += sunColor * pow(s, 7.0) * 0.20 * sunIntensity;  // Halo
  col += vec3(flash) * (0.35 + 0.65 * smoothstep(0.2, 0.9, h));
  // leichtes Banding aufbrechen
  col += (fract(sin(dot(d.xy, vec2(12.99, 78.23))) * 43758.5) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      topColor:     { value: new THREE.Color() },
      midColor:     { value: new THREE.Color() },
      bottomColor:  { value: new THREE.Color() },
      sunColor:     { value: new THREE.Color() },
      sunDir:       { value: new THREE.Vector3(0, 0.2, 1) },
      sunIntensity: { value: 1 },
      flash:        { value: 0 }
    };
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(9000, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS,
        side: THREE.BackSide, depthWrite: false, fog: false
      })
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  apply(w) {
    this.uniforms.topColor.value.setHex(w.skyTop);
    this.uniforms.midColor.value.setHex(w.skyMid);
    this.uniforms.bottomColor.value.setHex(w.skyBottom);
    this.uniforms.sunColor.value.setHex(w.sunColor);
    this.uniforms.sunDir.value.copy(w.sunDir);
    this.uniforms.sunIntensity.value = w.sunIntensity;
  }

  set flash(v) { this.uniforms.flash.value = v; }
  follow(cam) { this.mesh.position.copy(cam.position); }
}

/* ------------------------------------------------------------------ *
 *  Wolkenmeer
 * ------------------------------------------------------------------ */

export class CloudField {
  constructor(scene, count = 190) {
    this.sprites = [];
    this.group = new THREE.Group();
    this.group.renderOrder = -1;
    const tex = cloudTexture();

    for (let i = 0; i < count; i++) {
      const deep = i < count * 0.55;
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        opacity: deep ? 0.55 : 0.38, fog: false
      });
      const s = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.55) * 3400;
      s.position.set(
        Math.cos(a) * r,
        deep ? -160 - Math.random() * 420 : 120 + Math.random() * 700,
        Math.sin(a) * r * 0.8 + (Math.random() - 0.5) * 900
      );
      const sc = (deep ? 420 : 300) * (0.55 + Math.random() * 1.1);
      s.scale.set(sc, sc * (0.45 + Math.random() * 0.2), 1);
      s.userData.drift = 1.5 + Math.random() * 4;
      s.userData.base = s.material.opacity;
      this.group.add(s);
      this.sprites.push(s);
    }
    scene.add(this.group);
  }

  apply(w) {
    const lit = new THREE.Color(w.cloudLit);
    const dark = new THREE.Color(w.cloudColor);
    for (const s of this.sprites) {
      const t = Math.max(0, Math.min(1, (s.position.y + 400) / 900));
      s.material.color.copy(dark).lerp(lit, t * 0.85);
      s.material.opacity = s.userData.base * (w.rain ? 1.25 : 1.0);
    }
  }

  update(dt) {
    for (const s of this.sprites) {
      s.position.x += s.userData.drift * dt;
      if (s.position.x > 3600) s.position.x -= 7200;
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Regen (folgt der Kamera)
 * ------------------------------------------------------------------ */

export class Rain {
  constructor(scene, count = 2600) {
    const pos = new Float32Array(count * 3);
    this.count = count;
    this.speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 220;
      pos[i * 3 + 1] = Math.random() * 160 - 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
      this.speed[i] = 90 + Math.random() * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fb4c8, size: 0.9, transparent: true, opacity: 0.4,
      depthWrite: false, sizeAttenuation: true, fog: false
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  setActive(on) { this.points.visible = on; }

  update(dt, cam) {
    if (!this.points.visible) return;
    const p = this.points.geometry.attributes.position;
    const a = p.array;
    for (let i = 0; i < this.count; i++) {
      a[i * 3 + 1] -= this.speed[i] * dt;
      if (a[i * 3 + 1] < -60) {
        a[i * 3 + 1] = 100;
        a[i * 3] = (Math.random() - 0.5) * 220;
        a[i * 3 + 2] = (Math.random() - 0.5) * 220;
      }
    }
    p.needsUpdate = true;
    this.points.position.set(cam.position.x, cam.position.y, cam.position.z);
  }
}

/* ------------------------------------------------------------------ *
 *  Core-Reaktor
 * ------------------------------------------------------------------ */

export class Core {
  constructor(team) {
    this.team = team;
    this.hp = CORE_MAX_HP;
    this.maxHp = CORE_MAX_HP;
    this.group = new THREE.Group();
    this.destroyed = false;
    this._alarmT = 0;

    const tc = TEAM_COLOR[team];

    // Fundament
    const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 16, 3, 10), M.concrete);
    base.position.y = 1.5; base.receiveShadow = true; base.castShadow = true;
    this.group.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(13.4, 0.5, 6, 24), M.hullDark);
    rim.rotation.x = Math.PI / 2; rim.position.y = 3.1;
    this.group.add(rim);

    // Sechs schwere Pylonen
    this.pylons = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Group();
      p.position.set(Math.cos(a) * 9.5, 3, Math.sin(a) * 9.5);
      p.rotation.y = -a;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 15, 6), M.hullDark);
      col.position.y = 7.5; col.castShadow = true;
      p.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), M.hullMid);
      cap.position.y = 15.4; p.add(cap);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 5), M.panel);
      claw.position.set(0, 16.5, -1.4);
      claw.rotation.x = 0.9; p.add(claw);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 11, 0.3), teamEmissive(team, 2.0));
      strip.position.set(0, 7.5, -1.2); p.add(strip);
      this.group.add(p);
      this.pylons.push(p);
    }

    // Energiekern
    this.crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.2, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0a0f14, emissive: tc, emissiveIntensity: 3.4,
        metalness: 0.6, roughness: 0.25, flatShading: true
      })
    );
    this.crystal.position.y = 13;
    this.group.add(this.crystal);

    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(7.0, 0),
      new THREE.MeshBasicMaterial({
        color: tc, wireframe: true, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    this.shell.position.y = 13;
    this.group.add(this.shell);

    // Energieringe
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(7.5 + i * 1.6, 0.16, 4, 40),
        new THREE.MeshBasicMaterial({
          color: tc, transparent: true, opacity: 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      r.position.y = 13;
      r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      r.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7);
      this.group.add(r);
      this.rings.push(r);
    }

    // Halo
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: tc, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, opacity: 0.85
    }));
    this.halo.scale.setScalar(42);
    this.halo.position.y = 13;
    this.group.add(this.halo);

    this.light = new THREE.PointLight(tc, 90, 190, 2);
    this.light.position.y = 13;
    this.group.add(this.light);

    // Alarmlampen am Fundament
    this.alarms = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x140503, emissive: 0xff3311, emissiveIntensity: 0 }));
      l.position.set(Math.cos(a) * 14.5, 3.6, Math.sin(a) * 14.5);
      this.group.add(l);
      this.alarms.push(l);
    }
  }

  get pct() { return this.hp / this.maxHp; }

  // 100/75/50/25/10/0 Stufen
  get stage() {
    const p = this.pct;
    if (p <= 0) return 0;
    if (p <= 0.10) return 10;
    if (p <= 0.25) return 25;
    if (p <= 0.50) return 50;
    if (p <= 0.75) return 75;
    return 100;
  }

  setHP(hp) {
    this.hp = Math.max(0, Math.min(this.maxHp, hp));
    if (this.hp <= 0) this.destroyed = true;
  }

  update(dt, t) {
    const p = this.pct;
    const st = this.stage;

    this.crystal.rotation.y += dt * (0.3 + (1 - p) * 1.6);
    this.crystal.rotation.x += dt * 0.12;
    this.shell.rotation.y -= dt * (0.2 + (1 - p) * 0.9);

    for (const r of this.rings) {
      r.rotation.x += r.userData.spin.x * dt;
      r.rotation.y += r.userData.spin.y * dt;
      r.rotation.z += r.userData.spin.z * dt;
      r.material.opacity = this.destroyed ? 0 : 0.7 * (0.4 + p * 0.6);
    }

    // Instabilität: je weniger HP, desto härter das Pulsieren
    const inst = 1 - p;
    const pulse = 1 + Math.sin(t * (2 + inst * 16)) * (0.06 + inst * 0.34);
    const flicker = st <= 25 && Math.random() < inst * 0.25 ? 0.25 : 1;

    const baseE = 3.4 * (0.35 + p * 0.65) * pulse * flicker;
    this.crystal.material.emissiveIntensity = this.destroyed ? 0 : baseE;
    this.crystal.scale.setScalar(this.destroyed ? 0.001 : 1 + (pulse - 1) * 0.5);
    this.halo.scale.setScalar(this.destroyed ? 0.001 : 42 * (0.6 + p * 0.4) * pulse);
    this.light.intensity = this.destroyed ? 0 : 90 * (0.3 + p * 0.7) * pulse * flicker;
    this.shell.material.opacity = this.destroyed ? 0 : 0.35 * p;

    // Alarm ab 50 %
    this._alarmT += dt;
    const alarmOn = st <= 50 && !this.destroyed;
    const speed = st <= 10 ? 7 : st <= 25 ? 4 : 2;
    const blink = alarmOn ? (Math.sin(this._alarmT * speed) * 0.5 + 0.5) : 0;
    for (let i = 0; i < this.alarms.length; i++) {
      this.alarms[i].material.emissiveIntensity = blink * 4 * (i % 2 ? 1 : 0.6);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Insel
 * ------------------------------------------------------------------ */

// Deterministisches Pseudo-Rauschen, damit beide Clients dieselbe Insel sehen.
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noisyCone(radius, height, seed) {
  const g = new THREE.ConeGeometry(radius, height, 14, 5);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y > height / 2 - 0.01) continue;          // obere Kante flach lassen
    const n = hash3(v.x * 0.07 + seed, v.y * 0.07, v.z * 0.07);
    const n2 = hash3(v.z * 0.13, v.x * 0.13 + seed, v.y * 0.05);
    const f = 1 + (n - 0.5) * 0.45;
    v.x *= f; v.z *= f;
    v.y += (n2 - 0.5) * height * 0.14;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

class IslandBuilder {
  constructor(team) {
    this.team = team;
    this.group = new THREE.Group();
    this.colliders = [];     // lokale AABBs {cx,cy,cz,hx,hy,hz}
    this.destructibles = []; // {mesh, hp, maxHp, pos:Vector3(local), radius, dead}
    this.tc = teamEmissive(team, 2.2);
    this.rnd = mulberry(team === 'blue' ? 11 : 29);
  }

  box(w, h, d, x, y, z, material, solid = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (solid) this.colliders.push({ cx: x, cy: y + h / 2, cz: z, hx: w / 2, hy: h / 2, hz: d / 2 });
    return m;
  }

  cyl(rt, rb, h, x, y, z, material, solid = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    if (solid) this.colliders.push({ cx: x, cy: y + h / 2, cz: z, hx: rb, hy: h / 2, hz: rb });
    return m;
  }

  pipe(a, b, r, material) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), material);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    this.group.add(m);
    return m;
  }
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -Z zeigt bei beiden Inseln lokal Richtung Gegner.
export function buildIsland(team) {
  const B = new IslandBuilder(team);
  const g = B.group;
  const R = ISLAND_RADIUS;
  const tc = B.tc;
  const rnd = B.rnd;

  /* ---- Fels ---- */
  const under = new THREE.Mesh(noisyCone(R * 0.97, 210, team === 'blue' ? 3 : 17), M.rock);
  under.rotation.x = Math.PI;
  under.position.y = -105;
  under.receiveShadow = true;
  g.add(under);

  // Gesteinsschichten
  for (let i = 0; i < 3; i++) {
    const rr = R * (0.9 - i * 0.16);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr * 0.86, 8, 14), M.rockLight);
    band.position.y = -14 - i * 26;
    g.add(band);
  }
  // Abgesprengte Brocken, die unter der Insel schweben
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = R * (0.5 + rnd() * 0.7);
    const s = 3 + rnd() * 9;
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), M.rock);
    chunk.position.set(Math.cos(a) * d, -60 - rnd() * 130, Math.sin(a) * d);
    chunk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(chunk);
  }

  // Oberdeck
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.99, 6, 14), M.rockLight);
  deck.position.y = -3;
  deck.receiveShadow = true;
  g.add(deck);

  // Stahlplattform über dem Fels (verhindert den "nackter Zylinder"-Look)
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.6, 14), M.concrete);
  plate.position.y = 0.3;
  plate.receiveShadow = true;
  g.add(plate);

  // Randwall + Geländer
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = Math.cos(a) * (R * 0.965), z = Math.sin(a) * (R * 0.965);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2), M.hullDark);
    post.position.set(x, 1.2, z);
    post.castShadow = true;
    g.add(post);
    if (i % 4 === 0) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), M.warn);
      lamp.position.set(x, 2.7, z);
      g.add(lamp);
    }
  }

  /* ---- Hangar (Front, Richtung Gegner) ---- */
  const hangarZ = -52;
  const hangar = new THREE.Group();
  hangar.position.set(0, 0, hangarZ);
  g.add(hangar);

  // Tonnengewölbe
  const shellGeo = new THREE.CylinderGeometry(17, 17, 40, 16, 1, true, 0, Math.PI);
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({
    color: 0x2b3138, metalness: 0.85, roughness: 0.55, side: THREE.DoubleSide
  }));
  shell.rotation.z = Math.PI / 2;
  shell.rotation.y = Math.PI / 2;
  shell.position.y = 0.5;
  shell.castShadow = true; shell.receiveShadow = true;
  hangar.add(shell);

  // Spanten
  for (let i = -2; i <= 2; i++) {
    const ribGeo = new THREE.TorusGeometry(17.4, 0.7, 5, 16, Math.PI);
    const rib = new THREE.Mesh(ribGeo, M.hullDark);
    rib.position.set(0, 0.5, i * 9);
    rib.castShadow = true;
    hangar.add(rib);
  }

  // Rückwand + Seitenwände
  B.box(36, 17, 1.4, 0, 0, hangarZ + 20, M.panel);
  for (const s of [1, -1]) B.box(1.4, 9, 40, s * 17, 0, hangarZ, M.hullDark);

  // Deckenlicht-Streifen
  for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 0.8), M.lampWhite);
    strip.position.set(0, 14.5, hangarZ - 16 + i * 8);
    g.add(strip);
  }
  const hangarLight = new THREE.PointLight(0xbfd4e6, 40, 70, 2);
  hangarLight.position.set(0, 12, hangarZ);
  g.add(hangarLight);

  // Startdeck nach vorn — begehbar, ragt kontrolliert ueber den Inselrand
  B.box(30, 1.2, 52, 0, 0, hangarZ - 40, M.concrete);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 4.5), M.warn);
    m.position.set(i % 2 ? 12 : -12, 1.3, hangarZ - 20 - i * 6);
    g.add(m);
  }
  B.box(22, 1.4, 20, 0, 0, hangarZ - 68, M.hullDark);
  // Tragwerk unter dem Ueberhang
  for (const s2 of [1, -1]) {
    B.pipe(new THREE.Vector3(s2 * 10, 0, hangarZ - 76),
           new THREE.Vector3(s2 * 16, -26, hangarZ - 34), 0.8, M.rust);
    B.pipe(new THREE.Vector3(s2 * 10, 1, hangarZ - 72),
           new THREE.Vector3(s2 * 15, 9, hangarZ - 58), 0.5, M.rust);
  }
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), M.warn);
    l.position.set(i < 2 ? -11 : 11, 1.9, hangarZ - 62 - (i % 2) * 12);
    g.add(l);
  }

  // Startplätze (3 Stück, nebeneinander im Hangar)
  const pads = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 11;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.35, 5, 22), tc);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.9, hangarZ + 2);
    g.add(ring);
    pads.push(new THREE.Vector3(x, 0.9, hangarZ + 2));
  }

  /* ---- Core-Bereich (Zentrum, leicht nach hinten versetzt) ---- */
  const coreZ = 18;
  const corePlat = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 5, 12), M.concrete);
  corePlat.position.set(0, 2.5, coreZ);
  corePlat.receiveShadow = true; corePlat.castShadow = true;
  g.add(corePlat);
  B.colliders.push({ cx: 0, cy: 2.5, cz: coreZ, hx: 30, hy: 2.5, hz: 30 });

  // Rampen von zwei Seiten, damit man raufkommt
  for (const s of [1, -1]) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 20), M.hullDark);
    ramp.position.set(s * 30, 2.6, coreZ);
    ramp.rotation.x = 0;
    ramp.rotation.z = s * 0.25;
    ramp.receiveShadow = true;
    g.add(ramp);
  }
  // Stufen als begehbare Kollider (einfacher als schiefe Ebenen)
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      B.box(12, 1.25 * (i + 1), 4, s * (38 - i * 4), 0, coreZ, M.concrete);
    }
  }

  const core = new Core(team);
  core.group.position.set(0, 5, coreZ);
  g.add(core.group);

  /* ---- Industrie ---- */
  // Generatoren-Reihe
  for (let i = 0; i < 3; i++) {
    const x = -62 + i * 6;
    const z = 52 + i * 4;
    const tank = B.cyl(6.5, 7, 16, x, 0, z, M.hullMid);
    B.box(15, 1.2, 15, x, 16, z, M.hullDark);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.25, 4, 20), tc);
    glow.rotation.x = Math.PI / 2; glow.position.set(x, 11, z);
    g.add(glow);
    B.destructibles.push({
      mesh: tank, hp: 220, maxHp: 220, pos: new THREE.Vector3(x, 8, z), radius: 8, dead: false, extra: [glow]
    });
    B.pipe(new THREE.Vector3(x, 12, z), new THREE.Vector3(0, 10, coreZ + 10), 0.9, M.rust);
  }

  // Kühltürme
  for (const s of [1, -1]) {
    const x = s * 58, z = -12;
    const t = B.cyl(5, 9, 26, x, 0, z, M.hullDark);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(6, 5, 3, 10), M.rust);
    cap.position.set(x, 27, z); g.add(cap);
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(5.4 + i * 0.6, 0.3, 4, 14), M.hullMid);
      band.rotation.x = Math.PI / 2; band.position.set(x, 6 + i * 8, z);
      g.add(band);
    }
    B.destructibles.push({
      mesh: t, hp: 260, maxHp: 260, pos: new THREE.Vector3(x, 13, z), radius: 9, dead: false, extra: [cap]
    });
  }

  // Kleine Blöcke, Container, Antennen
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 44 + rnd() * 48;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 22 && z < -20) continue;      // Startbahn freihalten
    if (x * x + z * z < 40 * 40) continue;
    const w = 5 + rnd() * 8, h = 3 + rnd() * 9, dd = 5 + rnd() * 8;
    B.box(w, h, dd, x, 0, z, rnd() < 0.3 ? M.rust : M.hullMid);
    if (rnd() < 0.5) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, w * 0.6), tc);
      l.position.set(x, h + 0.3, z); g.add(l);
    }
  }

  // Antennenmasten
  for (const s of [1, -1]) {
    const x = s * 36, z = 64;
    B.cyl(0.5, 0.9, 34, x, 0, z, M.hullDark, false);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 0.3), M.hullDark);
      arm.position.set(x, 18 + i * 6, z); g.add(arm);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 5), M.warn);
    top.position.set(x, 34.5, z); g.add(top);
  }

  // Rohrleitungen über dem Deck
  for (let i = 0; i < 8; i++) {
    const a1 = rnd() * Math.PI * 2, a2 = a1 + 0.6 + rnd();
    const d1 = 45 + rnd() * 40, d2 = 45 + rnd() * 40;
    B.pipe(
      new THREE.Vector3(Math.cos(a1) * d1, 2 + rnd() * 6, Math.sin(a1) * d1),
      new THREE.Vector3(Math.cos(a2) * d2, 2 + rnd() * 6, Math.sin(a2) * d2),
      0.4 + rnd() * 0.4, M.rust
    );
  }

  // Kleine Brücke zum Core
  B.box(6, 0.6, 26, 0, 5.5, coreZ - 42, M.hullDark);
  for (let i = 0; i < 4; i++) {
    B.box(0.6, 6, 0.6, 3, 0, coreZ - 52 + i * 7, M.hullDark, false);
    B.box(0.6, 6, 0.6, -3, 0, coreZ - 52 + i * 7, M.hullDark, false);
  }

  /* ---- Geschütztürme ---- */
  const turrets = [];
  const turretSpots = [[-70, -30], [70, -30], [-46, 74], [46, 74]];
  for (const [x, z] of turretSpots) {
    const t = buildTurret(team);
    t.position.set(x, 0, z);
    g.add(t);
    B.colliders.push({ cx: x, cy: 1.5, cz: z, hx: 2, hy: 1.5, hz: 2 });
    turrets.push({ obj: t, local: new THREE.Vector3(x, 4.2, z), cool: Math.random() * 2, hp: 300, dead: false });
  }

  /* ---- Spawnpunkte ---- */
  const spawns = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spawns.push(new THREE.Vector3(Math.cos(a) * 16 + 0, 1.1, Math.sin(a) * 12 + hangarZ + 14));
  }

  // Blau steht bei -Z, Rot bei +Z. Lokal zeigt -Z immer zum Gegner,
  // deshalb wird die blaue Insel um 180 Grad gedreht.
  const flip = team === 'blue';
  g.position.set(0, 0, team === 'blue' ? -ISLAND_Z : ISLAND_Z);
  g.rotation.y = flip ? Math.PI : 0;
  g.updateMatrixWorld(true);

  const toWorld = (v) => v.clone().applyMatrix4(g.matrixWorld);

  return {
    team,
    group: g,
    core,
    corePos: toWorld(new THREE.Vector3(0, 18, coreZ)),
    center: g.position.clone(),
    radius: R,
    pads: pads.map(toWorld),
    forwardYaw: g.rotation.y,                  // Blickrichtung "zum Gegner"
    spawns: spawns.map(toWorld),
    turrets: turrets.map(t => ({ ...t, world: toWorld(t.local) })),
    destructibles: B.destructibles.map(d => ({ ...d, world: toWorld(d.pos) })),
    colliders: B.colliders.map(c => {
      const p = toWorld(new THREE.Vector3(c.cx, c.cy, c.cz));
      // Drehung ist nur 0 oder PI -> Halbausdehnungen bleiben achsenparallel
      return { min: new THREE.Vector3(p.x - c.hx, p.y - c.hy, p.z - c.hz),
               max: new THREE.Vector3(p.x + c.hx, p.y + c.hy, p.z + c.hz) };
    }),
    deckY: g.position.y,                        // Oberkante Deck (lokal y=0)
    hangarLight
  };
}

/* ------------------------------------------------------------------ *
 *  Beleuchtung
 * ------------------------------------------------------------------ */

export class Lighting {
  constructor(scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.near = 1; c.far = 900; c.left = -220; c.right = 220; c.top = 220; c.bottom = -220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6);
    scene.add(this.hemi);
  }

  apply(w) {
    this.sun.color.setHex(w.sunColor);
    this.sun.intensity = w.sunIntensity;
    this.ambient.color.setHex(w.ambient);
    this.ambient.intensity = w.ambientIntensity;
    this.hemi.color.setHex(w.hemiSky);
    this.hemi.groundColor.setHex(w.hemiGround);
    this.hemi.intensity = w.hemiIntensity;
    this.sunDir = w.sunDir.clone().normalize();
  }

  // Schattenkamera folgt dem Spieler, sonst reicht die Auflösung nicht
  follow(target) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 400);
    this.sun.target.updateMatrixWorld();
  }
}
