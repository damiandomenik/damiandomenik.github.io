import * as THREE from 'three';
import { derivePalette } from './PlayerColors.js';

/* ==========================================================================
 * Gemeinsame Geometrien — einmal erzeugt, von allen Figuren benutzt.
 * Alles bewusst low-poly: 8 Spieler gleichzeitig müssen problemlos laufen.
 * Blickrichtung ist -Z (wie im Movement), "vorne" heißt also negatives Z.
 * ======================================================================== */
const G = {
  pelvis:   new THREE.BoxGeometry(0.30, 0.16, 0.21),
  torso:    new THREE.CapsuleGeometry(0.155, 0.24, 3, 10),
  chest:    new THREE.BoxGeometry(0.30, 0.20, 0.10),
  pack:     new THREE.BoxGeometry(0.22, 0.24, 0.11),
  core:     new THREE.IcosahedronGeometry(0.052, 0),
  coreBig:  new THREE.IcosahedronGeometry(0.062, 0),
  neck:     new THREE.CylinderGeometry(0.05, 0.055, 0.09, 6),
  head:     new THREE.IcosahedronGeometry(0.105, 0),
  helmet:   new THREE.SphereGeometry(0.126, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62),
  visor:    new THREE.BoxGeometry(0.19, 0.062, 0.05),
  visorFin: new THREE.BoxGeometry(0.035, 0.05, 0.10),
  antenna:  new THREE.CylinderGeometry(0.008, 0.012, 0.16, 4),
  shoulder: new THREE.BoxGeometry(0.12, 0.10, 0.16),
  shoulderBig: new THREE.BoxGeometry(0.14, 0.12, 0.18),
  upperArm: new THREE.CapsuleGeometry(0.048, 0.17, 2, 6),
  foreArm:  new THREE.CapsuleGeometry(0.042, 0.15, 2, 6),
  hand:     new THREE.BoxGeometry(0.075, 0.09, 0.062),
  thigh:    new THREE.CapsuleGeometry(0.065, 0.27, 2, 6),
  shin:     new THREE.CapsuleGeometry(0.052, 0.276, 2, 6),
  foot:     new THREE.BoxGeometry(0.11, 0.08, 0.24),
  belt:     new THREE.BoxGeometry(0.32, 0.05, 0.23),
  waistMod: new THREE.BoxGeometry(0.09, 0.12, 0.08),
};

/** Segmentierter Bodenring als eine einzige BufferGeometry (liegt in XZ). */
function segmentedRing(inner, outer, segments = 4, fill = 0.6) {
  const pos = [];
  const per = (Math.PI * 2) / segments;
  const steps = 5;
  for (let s = 0; s < segments; s++) {
    const a0 = s * per, a1 = a0 + per * fill;
    for (let i = 0; i < steps; i++) {
      const t0 = a0 + (a1 - a0) * (i / steps);
      const t1 = a0 + (a1 - a0) * ((i + 1) / steps);
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      pos.push(inner * c0, 0, inner * s0, outer * c0, 0, outer * s0, outer * c1, 0, outer * s1);
      pos.push(inner * c0, 0, inner * s0, outer * c1, 0, outer * s1, inner * c1, 0, inner * s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
G.ring = segmentedRing(0.40, 0.50, 4, 0.6);
G.arrow = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [0, 0, -0.30, -0.11, 0, -0.12, 0.11, 0, -0.12], 3));
  g.computeVertexNormals();
  return g;
})();

/** Von allen Figuren geteiltes dunkles Material (Anzug, Gelenke, Sohlen). */
const MAT_DARK = new THREE.MeshStandardMaterial({ color: 0x151b29, metalness: 0.5, roughness: 0.62, flatShading: true });
const MAT_METAL = new THREE.MeshStandardMaterial({ color: 0x2b3346, metalness: 0.75, roughness: 0.38, flatShading: true });

const _v = new THREE.Vector3();
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ==========================================================================
 * PlayerCharacter
 * Rein visuell: bekommt einen Bewegungszustand und interpretiert ihn selbst.
 * Kennt weder Netzwerk noch Physik.
 * ======================================================================== */
export class PlayerCharacter {
  /**
   * @param {object} opts { scene, fx, name, color, isLocal, nameplate }
   */
  constructor({ scene, fx = null, name = 'Runner', color = 0x4c9dff, isLocal = false, nameplate = true }) {
    this.scene = scene;
    this.fx = fx;
    this.name = name;
    this.isLocal = isLocal;

    this.root = new THREE.Group();
    this.tilt = new THREE.Group();          // Lean / Roll des ganzen Körpers
    this.hips = new THREE.Group();          // Hüfte: trägt Oberkörper und Beine
    this.hips.position.y = 0.86;
    this.tilt.add(this.hips);
    this.root.add(this.tilt);
    scene.add(this.root);

    this.materials = {};
    this.setColor(color);

    this.createBody();
    this.createBackpack();
    this.createEnergyCore();
    this.createHead();
    this.createVisor();
    this.createArms();
    this.createLegs();
    this.createGroundIndicator();
    if (nameplate) this.createNameplate(name);

    // Animationszustand
    this.phase = 0;
    this.t = 0;
    this.pose = {
      lean: 0, roll: 0, crouch: 0, bob: 0, swing: 0, spread: 0, reach: 0, twist: 0,
    };
    this.st = {
      movementState: 'idle', speed: 0, isGrounded: true,
      isWallRunning: false, isDashing: false, wallSide: 0, velocityY: 0,
    };
    this._prevGrounded = true;
    this._prevState = 'idle';
    this._fallSpeed = 0;
    this._dashTimer = 0;
    this._sparkTimer = 0;
    this._visorPulse = 0;
  }

  // ------------------------------------------------------------------ Farbe
  setColor(color) {
    const p = derivePalette(color);
    this.color = color;
    this.palette = p;
    if (!this.materials.suit) {
      this.materials.suit = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.5, flatShading: true });
      this.materials.visor = new THREE.MeshStandardMaterial({
        color: 0x05070d, metalness: 0.2, roughness: 0.15, emissiveIntensity: 1,
      });
      this.materials.core = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
      this.materials.ring = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      });
    }
    this.materials.suit.color.copy(p.primary);
    this.materials.suit.emissive.copy(p.rim);
    this.materials.suit.emissiveIntensity = 0.08;
    this.materials.visor.emissive.copy(p.visor);
    this.materials.visor.emissiveIntensity = this.isLocal ? 2.6 : 1.9;
    this.materials.core.color.copy(p.core);
    this.materials.ring.color.copy(p.rim);
    if (this.nameplate) this._paintNameplate();
  }

  // ------------------------------------------------------------------ Körper
  createBody() {
    const suit = this.materials.suit;
    const pelvis = new THREE.Mesh(G.pelvis, MAT_DARK);
    pelvis.position.y = 0.02;

    const torso = new THREE.Mesh(G.torso, suit);
    torso.position.y = 0.30;
    torso.scale.set(1.16, 1, 0.86);

    const chest = new THREE.Mesh(G.chest, MAT_METAL);
    chest.position.set(0, 0.34, -0.09);
    chest.rotation.x = -0.12;

    const belt = new THREE.Mesh(G.belt, MAT_METAL);
    belt.position.y = 0.10;

    // asymmetrisches Hüftmodul (Silhouette!)
    const waist = new THREE.Mesh(G.waistMod, MAT_METAL);
    waist.position.set(0.19, 0.06, 0.02);
    waist.rotation.z = -0.2;

    this.torso = torso;
    this.chestGroup = new THREE.Group();
    this.chestGroup.add(torso, chest, belt, waist, pelvis);
    this.hips.add(this.chestGroup);
    this.parts = [pelvis, torso, chest, belt, waist];
    // Kleinteile (Finnen, Antenne, Hände, Kern) werfen keinen Schatten —
    // der Shadow-Pass kostet pro Mesh, und man sieht den Unterschied nicht.
    this.shadowParts = [pelvis, torso, chest];
  }

  createBackpack() {
    const pack = new THREE.Mesh(G.pack, MAT_DARK);
    pack.position.set(0, 0.34, 0.135);
    const fin = new THREE.Mesh(G.visorFin, MAT_METAL);
    fin.position.set(-0.13, 0.40, 0.14);
    fin.rotation.z = 0.35;
    this.chestGroup.add(pack, fin);
    this.parts.push(pack, fin);
    this.shadowParts.push(pack);
  }

  createEnergyCore() {
    const back = new THREE.Mesh(G.coreBig, this.materials.core);
    back.position.set(0, 0.36, 0.20);
    const front = new THREE.Mesh(G.core, this.materials.core);
    front.position.set(0, 0.35, -0.145);
    this.cores = [back, front];
    this.chestGroup.add(back, front);
  }

  createHead() {
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.72;

    const neck = new THREE.Mesh(G.neck, MAT_DARK);
    neck.position.y = -0.11;
    const head = new THREE.Mesh(G.head, MAT_DARK);
    head.scale.set(1, 1.05, 1.05);
    const helmet = new THREE.Mesh(G.helmet, this.materials.suit);
    helmet.position.y = 0.012;
    helmet.scale.set(1, 0.96, 1.08);
    // asymmetrische Antenne
    const ant = new THREE.Mesh(G.antenna, MAT_METAL);
    ant.position.set(0.085, 0.11, 0.03);
    ant.rotation.z = -0.42;
    ant.rotation.x = 0.2;

    this.headGroup.add(neck, head, helmet, ant);
    this.hips.add(this.headGroup);
    this.parts.push(neck, head, helmet, ant);
    this.shadowParts.push(head, helmet);
  }

  createVisor() {
    const visor = new THREE.Mesh(G.visor, this.materials.visor);
    visor.position.set(0, -0.005, -0.098);
    visor.rotation.x = -0.14;
    const finL = new THREE.Mesh(G.visorFin, this.materials.visor);
    finL.position.set(-0.098, 0.01, -0.05);
    finL.rotation.y = 0.25;
    const finR = finL.clone();
    finR.position.x = 0.098;
    finR.rotation.y = -0.25;
    this.visor = visor;
    this.headGroup.add(visor, finL, finR);
    this.parts.push(visor, finL, finR);
  }

  // ------------------------------------------------------------------ Arme
  _buildArm(side) {
    const arm = new THREE.Group();                 // Pivot = Schulter
    arm.position.set(0.20 * side, 0.47, 0);

    const pad = new THREE.Mesh(side < 0 ? G.shoulderBig : G.shoulder, this.materials.suit);
    pad.position.set(0.02 * side, 0.02, 0);
    pad.rotation.z = -0.25 * side;

    const upper = new THREE.Mesh(G.upperArm, MAT_DARK);
    upper.position.y = -0.115;

    const fore = new THREE.Group();                // Pivot = Ellbogen
    fore.position.y = -0.235;
    const foreMesh = new THREE.Mesh(G.foreArm, this.materials.suit);
    foreMesh.position.y = -0.11;
    const hand = new THREE.Mesh(G.hand, MAT_METAL);
    hand.position.y = -0.225;
    fore.add(foreMesh, hand);

    arm.add(pad, upper, fore);
    this.hips.add(arm);
    this.parts.push(pad, upper, foreMesh, hand);
    this.shadowParts.push(upper, foreMesh);
    return { arm, fore };
  }

  createArms() {
    const l = this._buildArm(-1);
    const r = this._buildArm(1);
    this.armL = l.arm; this.foreL = l.fore;
    this.armR = r.arm; this.foreR = r.fore;
  }

  // ------------------------------------------------------------------ Beine
  _buildLeg(side) {
    const leg = new THREE.Group();                 // Pivot = Hüftgelenk
    leg.position.set(0.093 * side, -0.02, 0);

    const thigh = new THREE.Mesh(G.thigh, this.materials.suit);
    thigh.position.y = -0.20;

    const shin = new THREE.Group();                // Pivot = Knie
    shin.position.y = -0.40;
    const shinMesh = new THREE.Mesh(G.shin, MAT_DARK);
    shinMesh.position.y = -0.19;
    const foot = new THREE.Mesh(G.foot, MAT_METAL);
    foot.position.set(0, -0.42, -0.035);
    shin.add(shinMesh, foot);

    leg.add(thigh, shin);
    this.hips.add(leg);
    this.parts.push(thigh, shinMesh, foot);
    this.shadowParts.push(thigh, shinMesh);
    return { leg, shin, foot };
  }

  createLegs() {
    const l = this._buildLeg(-1);
    const r = this._buildLeg(1);
    this.legL = l.leg; this.shinL = l.shin; this.footL = l.foot;
    this.legR = r.leg; this.shinR = r.shin; this.footR = r.foot;
  }

  // ------------------------------------------------- Bodenring / Indikator
  createGroundIndicator() {
    this.ring = new THREE.Mesh(G.ring, this.materials.ring);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);

    if (this.isLocal) {
      this.arrow = new THREE.Mesh(G.arrow, this.materials.ring);
      this.arrow.position.y = 0.03;
      this.arrow.renderOrder = 2;
      this.root.add(this.arrow);
    }
  }

  // ------------------------------------------------------------- Namensschild
  createNameplate(name) {
    this.name = name;
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 96;
    this._npCanvas = cv;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._npTex = tex;
    this.nameplate = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: true, depthWrite: false,
    }));
    this.nameplate.position.y = 2.12;
    this.nameplate.renderOrder = 4;
    this.root.add(this.nameplate);
    this._paintNameplate();
  }

  _paintNameplate() {
    const cv = this._npCanvas;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx || typeof ctx.clearRect !== 'function') return;
    const accent = '#' + new THREE.Color(this.palette.rim).getHexString();
    ctx.clearRect(0, 0, cv.width, cv.height);
    // Hintergrund
    ctx.fillStyle = 'rgba(6,10,18,0.66)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(14, 14, 292, 50, 12); ctx.fill(); }
    else ctx.fillRect(14, 14, 292, 50);
    // Akzentlinie in Spielerfarbe
    ctx.fillStyle = accent;
    ctx.fillRect(14, 60, 292, 4);
    // Zeiger nach unten
    ctx.beginPath();
    ctx.moveTo(148, 66); ctx.lineTo(172, 66); ctx.lineTo(160, 82); ctx.closePath();
    ctx.fill();
    // Text
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eef5ff';
    ctx.fillText(String(this.name).slice(0, 14), 160, 39);
    if (this._npTex) this._npTex.needsUpdate = true;
  }

  setName(name) {
    this.name = name;
    if (this.nameplate) this._paintNameplate();
  }

  // ------------------------------------------------------------------ Zustand
  /** @param {object} s { movementState, speed, isGrounded, isWallRunning, isDashing, wallSide, velocityY } */
  setState(s) {
    const t = this.st;
    t.movementState = s.movementState ?? t.movementState;
    t.speed = s.speed ?? 0;
    t.isGrounded = !!s.isGrounded;
    t.isWallRunning = !!s.isWallRunning;
    t.isDashing = !!s.isDashing;
    t.wallSide = s.wallSide ?? 0;
    t.velocityY = s.velocityY ?? 0;
  }

  setTransform(x, y, z, yaw) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  setVisible(v) { this.root.visible = v; }

  // ------------------------------------------------------------ Animation
  updateAnimation(dt, state, camera) {
    if (state) this.setState(state);
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const s = this.st;
    const ms = s.movementState;
    const p = this.pose;

    // ---- Ereignisse (Landung, Sprung, Dash) ----
    if (!s.isGrounded) this._fallSpeed = Math.min(this._fallSpeed, s.velocityY);
    if (s.isGrounded && !this._prevGrounded) this._onLand();
    if (!s.isGrounded && this._prevGrounded && ms === 'jump') this._emitJump();
    if (s.isDashing && this._prevState !== 'dash') this._emitDash();
    this._prevGrounded = s.isGrounded;
    this._prevState = ms;

    // ---- Zielpose je nach Bewegungszustand ----
    const spd = s.speed;
    let lean = 0, roll = 0, crouch = 0, swing = 0, spread = 0, reach = 0, twist = 0;
    let cycle = 0;

    switch (ms) {
      case 'sprint':
        lean = -0.30 - clamp((spd - 12) * 0.012, 0, 0.12);
        swing = 1.0; cycle = 1; break;
      case 'run':
        lean = -0.16; swing = 0.78; cycle = 1; break;
      case 'crouch':
        crouch = 1; lean = -0.22; swing = 0.35; cycle = spd > 1 ? 1 : 0; break;
      case 'slide':
        crouch = 1; lean = -0.5; spread = -0.5; twist = 0.25; break;
      case 'jump':
        lean = -0.1; spread = 0.55; break;
      case 'fall':
        lean = 0.05; spread = 0.95; break;
      case 'wallrun':
        roll = -0.38 * (s.wallSide || 1);
        lean = -0.22; swing = 0.9; cycle = 1; reach = 1; break;
      case 'dash':
        lean = -0.62; spread = -0.75; twist = 0.1; break;
      case 'respawn':
      case 'idle':
      default:
        lean = 0; swing = 0; break;
    }

    // ---- Laufzyklus ----
    if (cycle) this.phase += dt * (4.2 + Math.min(spd, 22) * 0.62);
    else this.phase = damp(this.phase % (Math.PI * 2), 0, 6, dt);

    const k = 10;
    p.lean = damp(p.lean, lean, k, dt);
    p.roll = damp(p.roll, roll, k * 0.8, dt);
    p.crouch = damp(p.crouch, crouch, k * 1.2, dt);
    p.swing = damp(p.swing, swing, k, dt);
    p.spread = damp(p.spread, spread, k, dt);
    p.reach = damp(p.reach, reach, k, dt);
    p.twist = damp(p.twist, twist, k, dt);

    const sw = Math.sin(this.phase) * p.swing;
    const swB = Math.sin(this.phase + Math.PI) * p.swing;
    const breathe = Math.sin(this.t * 1.9) * 0.012;

    // ---- Rumpf ----
    this.tilt.rotation.x = p.lean;
    this.tilt.rotation.z = p.roll;
    this.tilt.rotation.y = p.twist * 0.6;
    const bob = cycle ? Math.abs(Math.sin(this.phase)) * 0.045 * p.swing : 0;
    this.hips.position.y = 0.86 - p.crouch * 0.30 + bob + (cycle ? 0 : breathe);
    this.chestGroup.rotation.y = -sw * 0.16;
    this.chestGroup.scale.y = 1 + (cycle ? 0 : breathe * 1.6);

    // ---- Kopf: schaut leicht gegen die Körperneigung (stabilisiert den Blick)
    this.headGroup.rotation.x = -p.lean * 0.55 + (cycle ? Math.sin(this.phase * 2) * 0.03 : 0);
    this.headGroup.rotation.z = -p.roll * 0.35;

    // ---- Arme ----
    const armIdle = 0.06 + Math.sin(this.t * 1.4) * 0.02;
    this.armL.rotation.x = sw * 1.05 + armIdle - p.spread * 0.15;
    this.armR.rotation.x = swB * 1.05 + armIdle - p.spread * 0.15;
    this.armL.rotation.z = 0.12 + p.spread * 0.85;
    this.armR.rotation.z = -0.12 - p.spread * 0.85;
    this.foreL.rotation.x = -0.35 - Math.max(0, sw) * 0.9 - p.spread * 0.25;
    this.foreR.rotation.x = -0.35 - Math.max(0, swB) * 0.9 - p.spread * 0.25;

    // Wallrun: der wandseitige Arm greift zur Wand
    if (p.reach > 0.01) {
      const side = s.wallSide || 1;
      const reachArm = side > 0 ? this.armR : this.armL;
      const reachFore = side > 0 ? this.foreR : this.foreL;
      reachArm.rotation.x = damp(reachArm.rotation.x, -0.5, 12, dt);
      reachArm.rotation.z = damp(reachArm.rotation.z, -1.15 * side, 12, dt);
      reachFore.rotation.x = damp(reachFore.rotation.x, -0.25, 12, dt);
    }

    // ---- Beine ----
    const crouchBend = p.crouch * 0.95;
    this.legL.rotation.x = swB * 0.85 - crouchBend * 0.9 + p.spread * 0.12;
    this.legR.rotation.x = sw * 0.85 - crouchBend * 0.9 + p.spread * 0.12;
    this.shinL.rotation.x = Math.max(0, -swB) * 1.25 + crouchBend * 1.7 + p.spread * 0.35;
    this.shinR.rotation.x = Math.max(0, -sw) * 1.25 + crouchBend * 1.7 + p.spread * 0.35;
    this.footL.rotation.x = -this.legL.rotation.x * 0.35 - this.shinL.rotation.x * 0.3;
    this.footR.rotation.x = -this.legR.rotation.x * 0.35 - this.shinR.rotation.x * 0.3;
    this.legL.rotation.z = p.spread * 0.12;
    this.legR.rotation.z = -p.spread * 0.12;

    // ---- Visor / Kern pulsieren ----
    this._visorPulse = damp(this._visorPulse, s.isDashing ? 1 : 0, 8, dt);
    const base = this.isLocal ? 2.6 : 1.9;
    this.materials.visor.emissiveIntensity =
      base + this._visorPulse * 2.2 + Math.sin(this.t * 2.4) * 0.12;
    const coreScale = 1 + Math.sin(this.t * 3.1) * 0.08 + this._visorPulse * 0.35;
    this.cores[0].scale.setScalar(coreScale);
    this.cores[1].scale.setScalar(coreScale);

    // ---- Bodenring ----
    const ringTarget = s.isGrounded ? (this.isLocal ? 0.55 : 0.4) : 0.12;
    this.materials.ring.opacity = damp(this.materials.ring.opacity, ringTarget, 8, dt);
    const rs = 1 + (s.isGrounded ? Math.sin(this.t * 2.2) * 0.05 : 0.25);
    this.ring.scale.setScalar(rs);
    this.ring.rotation.y += dt * 0.6;
    if (this.arrow) this.arrow.rotation.y = 0;

    // ---- laufende Effekte ----
    this._updateFx(dt, s);

    // ---- Namensschild ----
    if (this.nameplate && camera) {
      _v.setFromMatrixPosition(this.nameplate.matrixWorld);
      const d = camera.position.distanceTo(_v);
      // wächst mit der Distanz, aber gedeckelt -> aus der Ferne lesbar,
      // aus der Nähe nicht riesig
      const k2 = clamp(Math.pow(Math.max(d, 1), 0.72) * 0.36, 0.85, 2.6);
      this.nameplate.scale.set(1.55 * k2, 0.46 * k2, 1);
      this.nameplate.visible = d > 2.2 && d < 140;
    }
  }

  // -------------------------------------------------------------- Effekte
  _updateFx(dt, s) {
    if (!this.fx) return;
    const px = this.root.position.x, py = this.root.position.y, pz = this.root.position.z;

    // Dash-Trail
    if (s.isDashing) {
      this._dashTimer -= dt;
      if (this._dashTimer <= 0) {
        this._dashTimer = 0.022;
        this.fx.spawn(
          px + (Math.random() - 0.5) * 0.3, py + 0.6 + Math.random() * 0.7, pz + (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 1.2, (Math.random() - 0.2) * 1.0, (Math.random() - 0.5) * 1.2,
          this.palette.core, 0.16, 0.34, 0.15);
      }
    }

    // Wallrun-Funken an den Füßen
    if (s.isWallRunning) {
      this._sparkTimer -= dt;
      if (this._sparkTimer <= 0) {
        this._sparkTimer = 0.045;
        const side = s.wallSide || 1;
        const yaw = this.root.rotation.y;
        const rx = Math.cos(yaw) * side, rz = -Math.sin(yaw) * side;
        this.fx.spawn(
          px + rx * 0.45, py + 0.25 + Math.random() * 0.5, pz + rz * 0.45,
          -rx * 2.4 + (Math.random() - 0.5), 1.2 + Math.random() * 2.0, -rz * 2.4 + (Math.random() - 0.5),
          this.palette.visor, 0.09, 0.35, 1.2);
      }
    }
  }

  _onLand() {
    const hard = this._fallSpeed < -14;
    this._fallSpeed = 0;
    if (!this.fx) return;
    const p = this.root.position;
    this.fx.burst(p.x, p.y, p.z, this.palette.rim, hard ? 12 : 6,
      { speed: hard ? 4.2 : 2.4, size: hard ? 0.15 : 0.1, life: 0.4, up: 0.5, gravity: 1.4 });
  }

  _emitJump() {
    if (!this.fx) return;
    const p = this.root.position;
    this.fx.burst(p.x, p.y, p.z, this.palette.core, 5,
      { speed: 1.8, size: 0.09, life: 0.3, up: 0.3, gravity: 1.2 });
  }

  _emitDash() {
    if (!this.fx) return;
    const p = this.root.position;
    this.fx.burst(p.x, p.y + 0.8, p.z, this.palette.visor, 10,
      { speed: 3.4, size: 0.13, life: 0.35, up: 0.2, gravity: 0.1 });
  }

  /** Kurzes Aufleuchten (Treffer). */
  flash() { this._visorPulse = 1.6; }

  // -------------------------------------------------------------- Schatten
  setShadows(enabled) {
    for (const m of this.parts) { m.castShadow = false; m.receiveShadow = false; }
    for (const m of this.shadowParts) m.castShadow = enabled;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const key of ['suit', 'visor', 'core', 'ring']) this.materials[key]?.dispose();
    if (this.nameplate) {
      this.nameplate.material.map?.dispose();
      this.nameplate.material.dispose();
    }
  }
}
