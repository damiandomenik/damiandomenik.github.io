import * as THREE from 'three';
import { COLORS } from '../core/Config.js';

/**
 * Prozedurales Boss-Modell: "Rift Guardian".
 * Eine riesige, uralte Maschine aus Primitiven — keine externen Assets.
 * Rein visuell; die Spiellogik liegt in BossFight.
 *
 * Aufbau (Höhe ~16 m, Kern auf ~12.5 m):
 *   Sockelringe · Torso · Schulterblöcke · vier Arme · rotierende Ringe
 *   · schwebende Splitter · Kern mit Schild · Auge
 */
const G = {
  torso:    new THREE.CylinderGeometry(2.4, 3.6, 6.4, 8, 1),
  hull:     new THREE.OctahedronGeometry(3.2, 0),
  collar:   new THREE.CylinderGeometry(2.0, 2.6, 1.0, 8),
  shoulder: new THREE.BoxGeometry(2.6, 1.8, 2.6),
  armUpper: new THREE.CylinderGeometry(0.42, 0.55, 3.6, 6),
  armLower: new THREE.CylinderGeometry(0.30, 0.42, 3.2, 6),
  claw:     new THREE.OctahedronGeometry(0.75, 0),
  ring:     new THREE.TorusGeometry(4.6, 0.22, 6, 28),
  ringSmall:new THREE.TorusGeometry(3.2, 0.16, 6, 24),
  core:     new THREE.IcosahedronGeometry(1.5, 1),
  coreCage: new THREE.IcosahedronGeometry(2.5, 0),
  shard:    new THREE.OctahedronGeometry(0.45, 0),
  eye:      new THREE.BoxGeometry(2.2, 0.5, 0.4),
  head:     new THREE.BoxGeometry(2.6, 1.4, 1.8),
  base:     new THREE.CylinderGeometry(4.6, 5.4, 1.2, 8),
};

const _q = new THREE.Quaternion();

export class BossModel {
  /** @param {THREE.Scene} scene @param {{x:number,y:number,z:number}} pos */
  constructor(scene, pos) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.set(pos.x, pos.y, pos.z);
    scene.add(this.root);

    this.mat = {
      shell: new THREE.MeshPhongMaterial({ color: 0x232c42, specular: 0x4a5f8c, shininess: 30, flatShading: true }),
      metal: new THREE.MeshPhongMaterial({ color: 0x2f3852, specular: 0x8296c4, shininess: 60, flatShading: true }),
      trim: new THREE.MeshPhongMaterial({ color: 0x1a2740, specular: 0x5a72a8, shininess: 40, emissive: COLORS.accent2, emissiveIntensity: 0.35 }),
      core: new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.95, toneMapped: false }),
      shield: new THREE.MeshBasicMaterial({
        color: COLORS.accent2, transparent: true, opacity: 0.28, wireframe: true, depthWrite: false, toneMapped: false,
      }),
      eye: new THREE.MeshBasicMaterial({ color: COLORS.danger, toneMapped: false }),
    };

    const M = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.root.add(m);
      return m;
    };

    // ---- Sockel & Rumpf ----
    M(G.base, this.mat.metal, 0, 0.6, 0);
    this.body = new THREE.Group();
    this.body.position.y = 4.4;
    this.root.add(this.body);

    const torso = new THREE.Mesh(G.torso, this.mat.shell);
    const hull = new THREE.Mesh(G.hull, this.mat.trim);
    hull.position.y = 0.6;
    hull.scale.set(1, 0.85, 1);
    const collar = new THREE.Mesh(G.collar, this.mat.metal);
    collar.position.y = 3.4;
    this.body.add(torso, hull, collar);

    // ---- Schultern ----
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(G.shoulder, this.mat.metal);
      sh.position.set(s * 3.3, 2.6, 0);
      sh.rotation.z = -s * 0.16;
      this.body.add(sh);
    }

    // ---- Vier Arme (zwei vorne, zwei hinten) ----
    this.arms = [];
    const armAngles = [0.6, -0.6, Math.PI - 0.6, Math.PI + 0.6];
    for (let i = 0; i < armAngles.length; i++) {
      const pivot = new THREE.Group();
      const a = armAngles[i];
      pivot.position.set(Math.sin(a) * 3.4, 2.4, Math.cos(a) * 3.4);
      pivot.rotation.y = a;
      const upper = new THREE.Mesh(G.armUpper, this.mat.shell);
      upper.position.y = -1.6;
      upper.rotation.x = 0.4;
      const lowerPivot = new THREE.Group();
      lowerPivot.position.y = -3.0;
      const lower = new THREE.Mesh(G.armLower, this.mat.metal);
      lower.position.y = -1.5;
      const claw = new THREE.Mesh(G.claw, this.mat.trim);
      claw.position.y = -3.1;
      lowerPivot.add(lower, claw);
      pivot.add(upper, lowerPivot);
      this.body.add(pivot);
      this.arms.push({ pivot, lower: lowerPivot, base: a, phase: i * 1.7 });
    }

    // ---- Rotierende Ringe ----
    this.ringA = new THREE.Mesh(G.ring, this.mat.trim);
    this.ringA.position.y = 5.2;
    this.ringA.rotation.x = Math.PI / 2;
    this.ringB = new THREE.Mesh(G.ringSmall, this.mat.trim);
    this.ringB.position.y = 7.4;
    this.ringB.rotation.set(Math.PI / 2, 0, 0.5);
    this.root.add(this.ringA, this.ringB);

    // ---- Kopf / Auge ----
    this.head = new THREE.Group();
    this.head.position.y = 14.4;
    const headBox = new THREE.Mesh(G.head, this.mat.shell);
    this.eye = new THREE.Mesh(G.eye, this.mat.eye);
    this.eye.position.set(0, 0.1, -0.95);
    this.head.add(headBox, this.eye);
    this.root.add(this.head);

    // ---- Kern + Schild ----
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.y = 12.4;
    this.core = new THREE.Mesh(G.core, this.mat.core);
    this.cage = new THREE.Mesh(G.coreCage, this.mat.trim);
    this.cage.material = this.mat.trim;
    this.shield = new THREE.Mesh(G.coreCage, this.mat.shield);
    this.shield.scale.setScalar(1.6);
    this.coreGroup.add(this.core, this.cage, this.shield);
    this.root.add(this.coreGroup);

    this.coreLight = new THREE.PointLight(COLORS.accent, 40, 40, 2);
    this.coreLight.position.y = 12.4;
    this.root.add(this.coreLight);

    // ---- Schwebende Splitter ----
    this.shards = [];
    for (let i = 0; i < 8; i++) {
      const sh = new THREE.Mesh(G.shard, this.mat.trim);
      this.root.add(sh);
      this.shards.push({ mesh: sh, a: (i / 8) * Math.PI * 2, r: 5.5 + (i % 3), y: 7 + (i % 4) * 1.6, s: 0.4 + (i % 3) * 0.2 });
    }

    this.t = 0;
    this.state = 'shielded';     // shielded | vulnerable | damaged | unstable
    this._hit = 0;
    this._slam = 0;
    this._slamArm = 0;
  }

  setState(state) {
    this.state = state;
    if (state === 'vulnerable' || state === 'unstable') {
      this.shield.visible = false;
      this.mat.core.color.set(state === 'unstable' ? COLORS.danger : COLORS.goal);
      this.coreLight.color.set(state === 'unstable' ? COLORS.danger : COLORS.goal);
      this.mat.eye.color.set(state === 'unstable' ? 0xffffff : COLORS.goal);
    } else {
      this.shield.visible = true;
      this.mat.core.color.set(COLORS.accent);
      this.coreLight.color.set(COLORS.accent);
      this.mat.eye.color.set(COLORS.danger);
    }
  }

  /** Kurzes Aufleuchten + Rückstoß, wenn der Kern getroffen wird. */
  hit() { this._hit = 1; }

  /** Schlag-Animation eines Arms (Boss Slam). */
  slam() { this._slam = 1; this._slamArm = (this._slamArm + 1) % this.arms.length; }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const unstable = this.state === 'unstable';
    const speed = unstable ? 2.4 : 1;

    this.body.position.y = 4.4 + Math.sin(t * 0.8) * 0.22;
    this.body.rotation.y = Math.sin(t * 0.25) * 0.35;
    this.head.rotation.y = Math.sin(t * 0.35 + 1) * 0.5;
    this.head.position.y = 14.4 + Math.sin(t * 0.8 + 0.5) * 0.18;

    this.ringA.rotation.z = t * 0.35 * speed;
    this.ringB.rotation.z = -t * 0.5 * speed;
    this.ringB.rotation.y = Math.sin(t * 0.3) * 0.4;

    for (let i = 0; i < this.arms.length; i++) {
      const a = this.arms[i];
      const sw = Math.sin(t * 0.7 * speed + a.phase);
      a.pivot.rotation.x = sw * 0.18;
      a.lower.rotation.x = 0.35 + Math.cos(t * 0.9 + a.phase) * 0.25;
      a.pivot.rotation.z = Math.sin(t * 0.5 + a.phase) * 0.12;
    }

    // Slam: ein Arm fährt hart nach unten
    if (this._slam > 0) {
      this._slam = Math.max(0, this._slam - dt / 0.55);
      const u = 1 - this._slam;
      const punch = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
      const a = this.arms[this._slamArm];
      a.pivot.rotation.x = 1.25 * punch;
      a.lower.rotation.x = -0.5 * punch;
    }

    for (const s of this.shards) {
      const ang = s.a + t * 0.35 * s.s * speed;
      s.mesh.position.set(Math.cos(ang) * s.r, s.y + Math.sin(t * 0.9 + s.a) * 0.5, Math.sin(ang) * s.r);
      s.mesh.rotation.set(t * s.s, t * s.s * 0.7, 0);
      s.mesh.scale.setScalar(unstable ? 1.3 : 1);
    }

    // Kern
    const pulse = Math.sin(t * (unstable ? 7 : 2.2)) * 0.5 + 0.5;
    const vulnerable = this.state === 'vulnerable' || unstable;
    this.coreGroup.rotation.y = t * (vulnerable ? 1.4 : 0.5);
    this.coreGroup.rotation.x = Math.sin(t * 0.4) * 0.2;
    const baseScale = vulnerable ? 1.25 : 1;
    this.core.scale.setScalar(baseScale + pulse * (vulnerable ? 0.18 : 0.06) + this._hit * 0.6);
    this.coreLight.intensity = (vulnerable ? 70 : 34) + pulse * 20 + this._hit * 120;
    this.cage.rotation.y = -t * 0.8;
    if (this.shield.visible) {
      this.shield.rotation.y = t * 0.4;
      this.shield.rotation.x = -t * 0.25;
      this.mat.shield.opacity = 0.22 + pulse * 0.12;
    }

    if (this._hit > 0) {
      this._hit = Math.max(0, this._hit - dt / 0.4);
      this.root.position.x += (Math.random() - 0.5) * this._hit * 0.25;
      this.root.position.z += (Math.random() - 0.5) * this._hit * 0.25;
    }
    if (unstable) {
      this.root.rotation.z = Math.sin(t * 9) * 0.02;
      this.root.rotation.x = Math.cos(t * 7) * 0.015;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of Object.values(this.mat)) m.dispose();
  }
}
