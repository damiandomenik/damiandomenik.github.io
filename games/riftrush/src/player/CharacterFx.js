import * as THREE from 'three';

/**
 * Globales, sehr leichtes Partikelsystem für alle Spieler.
 * Ein einziger InstancedMesh (additiv, kein Depth-Write) für sämtliche Effekte:
 * Dash-Trail, Wallrun-Funken, Lande- und Sprungstaub.
 *
 * Es wird pro Frame nichts allokiert; tote Partikel werden auf Skalierung 0
 * gesetzt. Ausblenden geschieht über die Instanzfarbe (additiv => schwarz
 * bedeutet unsichtbar), da InstancedMesh kein Alpha pro Instanz kennt.
 */
const GEO = new THREE.OctahedronGeometry(0.5, 0);
// three multipliziert bei vertexColors mit dem color-Attribut. Fehlt es, ist der
// Default (0,0,0) und alle Partikel wären schwarz — also weiß vorbelegen, damit
// erst die Instanzfarbe die Farbe bestimmt.
GEO.setAttribute('color', new THREE.BufferAttribute(
  new Float32Array(GEO.attributes.position.count * 3).fill(1), 3));
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

export class CharacterFx {
  constructor(scene, max = 300) {
    this.max = max;
    this.scene = scene;
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, toneMapped: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(GEO, this.material, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    this.p = new Array(max);
    for (let i = 0; i < max; i++) {
      this.p[i] = { life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, g: 1, r: 0, gr: 0, b: 0, spin: 0 };
    }
    this.cursor = 0;
    this.enabled = true;
    this._hide();
  }

  _hide() {
    _s.set(0, 0, 0);
    _m.compose(_p.set(0, -9999, 0), _q, _s);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, gravity = 1) {
    if (!this.enabled) return;
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    _col.set(color);
    p.life = life; p.max = life;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size; p.g = gravity;
    p.r = _col.r; p.gr = _col.g; p.b = _col.b;
    p.spin = Math.random() * 6.28;
  }

  /** Kleine Explosion (Landung, Sprung, Treffer). */
  burst(x, y, z, color, count = 8, { speed = 3.2, size = 0.12, life = 0.42, up = 0.6, gravity = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = speed * (0.55 + Math.random() * 0.6);
      this.spawn(x, y + 0.05, z,
        Math.cos(a) * r, up * (0.4 + Math.random()), Math.sin(a) * r,
        color, size * (0.7 + Math.random() * 0.7), life * (0.7 + Math.random() * 0.6), gravity);
    }
  }

  update(dt) {
    const arr = this.p;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = arr[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        _s.set(0, 0, 0);
        _m.compose(_p.set(0, -9999, 0), _q, _s);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      p.vy -= 9.0 * p.g * dt;
      p.vx *= 0.94; p.vz *= 0.94;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.life / p.max;
      const sc = p.size * (0.35 + 0.65 * k);
      _q.setFromAxisAngle(UP, p.spin + (1 - k) * 4);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
      const f = k * k;
      this.mesh.instanceColor.setXYZ(i, p.r * f, p.gr * f, p.b * f);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = any;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.material.dispose();
  }
}

const UP = new THREE.Vector3(0.4, 1, 0.2).normalize();
