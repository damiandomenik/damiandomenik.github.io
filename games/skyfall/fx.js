// SKYFALL — fx.js
// Gepoolte Partikel, Truemmer, Explosionen. Alles vorab allokiert,
// zur Laufzeit wird nichts Neues erzeugt.

import * as THREE from 'three';
import { glowTexture, cloudTexture, M } from './models.js';

const PART_VS = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const PART_FS = `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export class ParticleSystem {
  constructor(scene, max, { additive = true, soft = false } = {}) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.base = new Float32Array(max);

    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -99999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { map: { value: soft ? cloudTexture() : glowTexture() } },
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.geo = geo;
  }

  spawn(px, py, pz, vx, vy, vz, color, size, life, opts = {}) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    const c = color;
    this.col[i3] = ((c >> 16) & 255) / 255;
    this.col[i3 + 1] = ((c >> 8) & 255) / 255;
    this.col[i3 + 2] = (c & 255) / 255;
    this.size[i] = size;
    this.base[i] = opts.alpha ?? 1;
    this.alpha[i] = this.base[i];
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = opts.gravity ?? 0;
    this.drag[i] = opts.drag ?? 1.2;
    this.grow[i] = opts.grow ?? 0;
    return i;
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha, base, size, grav, drag, grow, max } = this;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      const i3 = i * 3;
      if (life[i] <= 0) { alpha[i] = 0; pos[i3 + 1] = -99999; continue; }
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= d; vel[i3 + 1] *= d; vel[i3 + 2] *= d;
      vel[i3 + 1] += grav[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = life[i] / maxLife[i];
      alpha[i] = t * t * (3 - 2 * t) * base[i];   // weiches Ausblenden, Grundtransparenz erhalten
      if (grow[i]) size[i] += grow[i] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ *
 *  Truemmer
 * ------------------------------------------------------------------ */

export class DebrisPool {
  constructor(scene, max = 260) {
    this.max = max;
    this.head = 0;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x30363d, metalness: 0.85, roughness: 0.5 }),
      max
    );
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this.items = [];
    const dummy = new THREE.Object3D();
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.items.push({
        life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        rot: new THREE.Euler(), spin: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1)
      });
    }
    this._d = new THREE.Object3D();
  }

  spawn(pos, vel, scale, life = 4) {
    const it = this.items[this.head];
    this.head = (this.head + 1) % this.max;
    it.pos.copy(pos);
    it.vel.copy(vel);
    it.scale.set(scale.x, scale.y, scale.z);
    it.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    it.life = life;
  }

  update(dt) {
    const d = this._d;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      it.vel.y -= 26 * dt;
      it.vel.multiplyScalar(Math.max(0, 1 - 0.35 * dt));
      it.pos.addScaledVector(it.vel, dt);
      it.rot.x += it.spin.x * dt; it.rot.y += it.spin.y * dt; it.rot.z += it.spin.z * dt;
      d.position.copy(it.pos);
      d.rotation.copy(it.rot);
      const s = it.life <= 0 ? 0.0001 : Math.min(1, it.life);
      d.scale.set(it.scale.x * s, it.scale.y * s, it.scale.z * s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ *
 *  Blitzlichter fuer Explosionen
 * ------------------------------------------------------------------ */

class FlashPool {
  constructor(scene, count = 6) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffa04a, 0, 160, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, life: 0, peak: 0 });
    }
    this.head = 0;
  }
  spawn(pos, intensity, color, life = 0.5) {
    const f = this.lights[this.head];
    this.head = (this.head + 1) % this.lights.length;
    f.light.position.copy(pos);
    f.light.color.setHex(color);
    f.light.visible = true;
    f.peak = intensity;
    f.life = life;
    f.max = life;
  }
  update(dt) {
    for (const f of this.lights) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.light.visible = false; f.light.intensity = 0; continue; }
      const t = f.life / f.max;
      f.light.intensity = f.peak * t * t;
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Zentraler Effekt-Manager
 * ------------------------------------------------------------------ */

export class FX {
  constructor(scene) {
    this.sparks = new ParticleSystem(scene, 3000, { additive: true });
    this.smoke = new ParticleSystem(scene, 1800, { additive: false, soft: true });
    this.debris = new DebrisPool(scene, 260);
    this.flash = new FlashPool(scene, 8);
    this._v = new THREE.Vector3();
  }

  update(dt) {
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);
    this.flash.update(dt);
  }

  // Kleine Funken bei Einschlägen
  impact(pos, normal, color = 0xffc07a, count = 12) {
    for (let i = 0; i < count; i++) {
      const sp = 8 + Math.random() * 26;
      this.sparks.spawn(
        pos.x, pos.y, pos.z,
        (normal.x + (Math.random() - 0.5) * 1.4) * sp,
        (normal.y + (Math.random() - 0.5) * 1.4) * sp + 4,
        (normal.z + (Math.random() - 0.5) * 1.4) * sp,
        color, 0.9 + Math.random() * 1.2, 0.25 + Math.random() * 0.45,
        { gravity: -20, drag: 1.6 }
      );
    }
    this.smoke.spawn(pos.x, pos.y, pos.z, 0, 3, 0, 0x8a8f96, 4, 0.7,
      { alpha: 0.35, drag: 1.4, grow: 6 });
  }

  muzzle(pos, dir, color = 0xaee6ff) {
    this.sparks.spawn(pos.x, pos.y, pos.z, dir.x * 6, dir.y * 6, dir.z * 6,
      color, 6, 0.07, { drag: 3 });
    for (let i = 0; i < 3; i++) {
      this.sparks.spawn(pos.x, pos.y, pos.z,
        dir.x * 22 + (Math.random() - 0.5) * 8,
        dir.y * 22 + (Math.random() - 0.5) * 8,
        dir.z * 22 + (Math.random() - 0.5) * 8,
        color, 1.2, 0.12, { drag: 4 });
    }
  }

  explosion(pos, size = 1, color = 0xff9440) {
    const n = Math.floor(24 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(Math.random() * 2 - 1);
      const sp = (14 + Math.random() * 40) * size;
      this.sparks.spawn(
        pos.x, pos.y, pos.z,
        Math.sin(b) * Math.cos(a) * sp,
        Math.cos(b) * sp + 8 * size,
        Math.sin(b) * Math.sin(a) * sp,
        Math.random() < 0.3 ? 0xffe9b0 : color,
        (1.6 + Math.random() * 3) * size,
        0.35 + Math.random() * 0.7,
        { gravity: -14, drag: 1.1 }
      );
    }
    // Feuerball
    this.sparks.spawn(pos.x, pos.y, pos.z, 0, 2 * size, 0, 0xffd08a,
      18 * size, 0.28, { drag: 3, grow: 40 * size });
    // Rauchwolke
    const sn = Math.floor(10 * size);
    for (let i = 0; i < sn; i++) {
      this.smoke.spawn(
        pos.x + (Math.random() - 0.5) * 4 * size,
        pos.y + (Math.random() - 0.5) * 4 * size,
        pos.z + (Math.random() - 0.5) * 4 * size,
        (Math.random() - 0.5) * 9 * size,
        3 + Math.random() * 7 * size,
        (Math.random() - 0.5) * 9 * size,
        0x2b2c30, (7 + Math.random() * 9) * size, 1.4 + Math.random() * 1.6,
        { alpha: 0.6, drag: 0.7, grow: 9 * size }
      );
    }
    this.flash.spawn(pos, 260 * size * size, color, 0.45);
    const dn = Math.floor(7 * size);
    for (let i = 0; i < dn; i++) {
      this.debris.spawn(pos,
        new THREE.Vector3((Math.random() - 0.5) * 32, Math.random() * 26 + 6, (Math.random() - 0.5) * 32).multiplyScalar(size),
        new THREE.Vector3(0.4 + Math.random() * 1.4, 0.3 + Math.random(), 0.5 + Math.random() * 1.8).multiplyScalar(size),
        2.5 + Math.random() * 2.5);
    }
  }

  // Kontinuierlicher Schadensrauch (z.B. brennendes Flugzeug)
  damageSmoke(pos, vel, severity) {
    this.smoke.spawn(pos.x, pos.y, pos.z,
      vel.x * 0.2 + (Math.random() - 0.5) * 3,
      vel.y * 0.2 + 2,
      vel.z * 0.2 + (Math.random() - 0.5) * 3,
      severity > 0.6 ? 0x14161a : 0x555a61,
      3 + Math.random() * 3, 1.0 + Math.random(),
      { alpha: 0.45, drag: 0.9, grow: 7 });
    if (severity > 0.55 && Math.random() < 0.6) {
      this.sparks.spawn(pos.x, pos.y, pos.z,
        (Math.random() - 0.5) * 8, 3 + Math.random() * 6, (Math.random() - 0.5) * 8,
        0xff8830, 2 + Math.random() * 2, 0.3, { drag: 2 });
    }
  }

  // Triebwerksspur
  engineTrail(pos, back, throttle, boost) {
    if (Math.random() > throttle * 0.85 + (boost ? 0.4 : 0)) return;
    this.sparks.spawn(pos.x, pos.y, pos.z,
      back.x * (10 + Math.random() * 14), back.y * (10 + Math.random() * 14), back.z * (10 + Math.random() * 14),
      boost ? 0x9ad6ff : 0xffb066,
      1.4 + Math.random() * 1.8, 0.16 + Math.random() * 0.2, { drag: 2.5 });
  }

  coreBurst(pos, color) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
      const sp = 12 + Math.random() * 40;
      this.sparks.spawn(pos.x, pos.y, pos.z,
        Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp,
        color, 1.8 + Math.random() * 2.4, 0.5 + Math.random() * 0.8, { drag: 1.0 });
    }
    this.flash.spawn(pos, 200, color, 0.35);
  }
}
