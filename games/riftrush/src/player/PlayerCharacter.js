import * as THREE from 'three';
import { derivePalette } from './PlayerColors.js';
import { CONFIG as CFG } from '../core/Config.js';

/* ==========================================================================
 * Statur-Presets.
 * Alle Maße in Metern; die Summe hip = thigh + shin + foot hält die Füße
 * exakt auf dem Boden, die Gesamthöhe bleibt bei ~1,8 m (Hitbox).
 * Umschalten: RIFT_CONFIG.CHARACTER_BUILD bzw. RIFTRUSH.setBuild('heavy').
 * ======================================================================== */
export const BUILDS = {
  // schlanker, langbeiniger Free-Runner (Standard)
  runner: {
    hip: 0.80, thigh: 0.37, shin: 0.35, foot: 0.08,
    torso: 0.58, torsoW: 1.14, torsoD: 0.95, limb: 1.18,
    shoulderX: 0.215, pad: 1.0, arm: 0.235, head: 0.98, helmet: 1.04, pack: 1.0,
  },
  // sehr schlank, maximal beweglich, kaum Panzerung
  agile: {
    hip: 0.94, thigh: 0.43, shin: 0.41, foot: 0.10,
    torso: 0.46, torsoW: 0.88, torsoD: 0.76, limb: 0.88,
    shoulderX: 0.175, pad: 0.62, arm: 0.25, head: 0.86, helmet: 0.92, pack: 0.7,
  },
  // massiver Exo-Anzug
  heavy: {
    hip: 0.74, thigh: 0.34, shin: 0.32, foot: 0.08,
    torso: 0.64, torsoW: 1.32, torsoD: 1.05, limb: 1.38,
    shoulderX: 0.245, pad: 1.35, arm: 0.225, head: 1.06, helmet: 1.12, pack: 1.25,
  },
};

/* ==========================================================================
 * Gemeinsame Geometrien — einmal erzeugt, von allen Figuren benutzt.
 * Blickrichtung ist -Z, "vorne" heißt also negatives Z.
 * ======================================================================== */
const G = {
  pelvis:   new THREE.BoxGeometry(0.26, 0.15, 0.19),
  torso:    new THREE.CapsuleGeometry(0.145, 0.26, 3, 10),   // Gesamtlänge 0.55
  chest:    new THREE.BoxGeometry(0.27, 0.19, 0.09),
  collar:   new THREE.BoxGeometry(0.30, 0.07, 0.15),
  pack:     new THREE.BoxGeometry(0.19, 0.22, 0.10),
  core:     new THREE.IcosahedronGeometry(0.05, 0),
  coreBig:  new THREE.IcosahedronGeometry(0.058, 0),
  neck:     new THREE.CylinderGeometry(0.042, 0.05, 0.09, 6),
  head:     new THREE.IcosahedronGeometry(0.10, 0),
  helmet:   new THREE.SphereGeometry(0.118, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58),
  crest:    new THREE.BoxGeometry(0.045, 0.055, 0.20),
  visor:    new THREE.BoxGeometry(0.175, 0.055, 0.05),
  visorFin: new THREE.BoxGeometry(0.032, 0.045, 0.09),
  antenna:  new THREE.CylinderGeometry(0.007, 0.011, 0.15, 4),
  shoulder: new THREE.BoxGeometry(0.11, 0.085, 0.14),
  upperArm: new THREE.CapsuleGeometry(0.042, 0.18, 2, 6),    // Gesamtlänge 0.264
  foreArm:  new THREE.CapsuleGeometry(0.036, 0.162, 2, 6),   // Gesamtlänge 0.234
  hand:     new THREE.BoxGeometry(0.065, 0.085, 0.055),
  thigh:    new THREE.CapsuleGeometry(0.058, 0.284, 2, 6),   // Gesamtlänge 0.40
  shin:     new THREE.CapsuleGeometry(0.046, 0.288, 2, 6),   // Gesamtlänge 0.38
  foot:     new THREE.BoxGeometry(0.10, 0.075, 0.23),
  belt:     new THREE.BoxGeometry(0.28, 0.045, 0.21),
  waistMod: new THREE.BoxGeometry(0.075, 0.11, 0.07),
  knee:     new THREE.BoxGeometry(0.085, 0.07, 0.075),
};
const LEN = { torso: 0.55, upper: 0.264, fore: 0.234, thigh: 0.40, shin: 0.38, foot: 0.075 };

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
G.ring = segmentedRing(0.38, 0.47, 4, 0.6);
G.arrow = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [0, 0, -0.30, -0.10, 0, -0.13, 0.10, 0, -0.13], 3));
  g.computeVertexNormals();
  return g;
})();

/** Von allen Figuren geteilte Materialien. */
const MAT_DARK = new THREE.MeshStandardMaterial({ color: 0x141a27, metalness: 0.45, roughness: 0.66, flatShading: true });
const MAT_METAL = new THREE.MeshStandardMaterial({ color: 0x2a3247, metalness: 0.78, roughness: 0.34, flatShading: true });

const _v = new THREE.Vector3();
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
/** Winkel-Dämpfung über den kürzesten Weg (verhindert Sprünge bei ±180°). */
function dampAngle(a, b, l, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-l * dt));
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ==========================================================================
 * PlayerCharacter — rein visuell, kennt weder Netzwerk noch Physik.
 * ======================================================================== */
export class PlayerCharacter {
  constructor({ scene, fx = null, name = 'Runner', color = 0x4c9dff, isLocal = false, nameplate = true, build = 'runner' }) {
    this.scene = scene;
    this.fx = fx;
    this.name = name;
    this.isLocal = isLocal;
    this.buildName = BUILDS[build] ? build : 'runner';
    this.B = BUILDS[this.buildName];

    this.root = new THREE.Group();
    this.tilt = new THREE.Group();        // Neigung/Roll des ganzen Körpers
    this.turn = new THREE.Group();        // zusätzliche Körperdrehung (Wallrun)
    this.hips = new THREE.Group();
    this.hips.position.y = this.B.hip;
    this.turn.add(this.hips);
    this.tilt.add(this.turn);
    this.root.add(this.tilt);
    scene.add(this.root);

    this.materials = {};
    this.parts = [];
    this.shadowParts = [];
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

    this.phase = 0;
    this.t = 0;
    this.pose = {
      lean: 0, roll: 0, turn: 0, crouch: 0, swing: 0,
      armX: 0, armOut: 0.13, elbow: 0.35, legSplit: 0, reach: 0, bodyTurn: 0,
    };
    this.st = {
      movementState: 'idle', speed: 0, isGrounded: true,
      isWallRunning: false, isDashing: false, wallSide: 0, velocityY: 0, moveAngle: 0,
    };
    this._prevGrounded = true;
    this._prevState = 'idle';
    this._fallSpeed = 0;
    this._dashTimer = 0;
    this._sparkTimer = 0;
    this._visorPulse = 0;
    this._punch = 0;
  }

  // ------------------------------------------------------------------ Farbe
  setColor(color) {
    const p = derivePalette(color);
    this.color = color;
    this.palette = p;
    if (!this.materials.suit) {
      this.materials.suit = new THREE.MeshStandardMaterial({ metalness: 0.32, roughness: 0.48, flatShading: true });
      this.materials.visor = new THREE.MeshStandardMaterial({ color: 0x05070d, metalness: 0.2, roughness: 0.15 });
      this.materials.core = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, toneMapped: false });
      this.materials.ring = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
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

  _add(parent, mesh, shadow = false) {
    parent.add(mesh);
    this.parts.push(mesh);
    if (shadow) this.shadowParts.push(mesh);
    return mesh;
  }

  // ------------------------------------------------------------------ Rumpf
  createBody() {
    const B = this.B;
    this.chestGroup = new THREE.Group();

    const pelvis = new THREE.Mesh(G.pelvis, MAT_DARK);
    pelvis.position.y = 0.03;
    pelvis.scale.set(B.torsoW, 1, B.torsoD);

    const torso = new THREE.Mesh(G.torso, this.materials.suit);
    torso.position.y = B.torso * 0.55;
    torso.scale.set(B.torsoW, B.torso / LEN.torso, B.torsoD);

    const chest = new THREE.Mesh(G.chest, MAT_METAL);
    chest.position.set(0, B.torso * 0.68, -0.085 * B.torsoD);
    chest.rotation.x = -0.12;
    chest.scale.set(B.torsoW, 1, 1);

    const collar = new THREE.Mesh(G.collar, MAT_METAL);
    collar.position.y = B.torso * 0.95;
    collar.scale.set(B.torsoW, 1, B.torsoD);

    const belt = new THREE.Mesh(G.belt, MAT_METAL);
    belt.position.y = 0.13;
    belt.scale.set(B.torsoW, 1, B.torsoD);

    // asymmetrisches Hüftmodul für die Silhouette
    const waist = new THREE.Mesh(G.waistMod, MAT_METAL);
    waist.position.set(0.145 * B.torsoW + 0.02, 0.09, 0.01);
    waist.rotation.z = -0.2;

    this.torso = torso;
    this._add(this.chestGroup, pelvis, true);
    this._add(this.chestGroup, torso, true);
    this._add(this.chestGroup, chest, true);
    this._add(this.chestGroup, collar);
    this._add(this.chestGroup, belt);
    this._add(this.chestGroup, waist);
    this.hips.add(this.chestGroup);
  }

  createBackpack() {
    const B = this.B;
    const pack = new THREE.Mesh(G.pack, MAT_DARK);
    pack.position.set(0, B.torso * 0.72, 0.115 * B.torsoD + 0.02);
    pack.scale.setScalar(B.pack);
    this._add(this.chestGroup, pack, true);
  }

  createEnergyCore() {
    const B = this.B;
    const back = new THREE.Mesh(G.coreBig, this.materials.core);
    back.position.set(0, B.torso * 0.76, 0.115 * B.torsoD + 0.09 * B.pack);
    const front = new THREE.Mesh(G.core, this.materials.core);
    front.position.set(0, B.torso * 0.72, -0.135 * B.torsoD);
    this.cores = [back, front];
    this.chestGroup.add(back, front);
  }

  createHead() {
    const B = this.B;
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = B.torso + 0.16;

    const neck = new THREE.Mesh(G.neck, MAT_DARK);
    neck.position.y = -0.10;
    const head = new THREE.Mesh(G.head, MAT_DARK);
    head.scale.setScalar(B.head);
    const helmet = new THREE.Mesh(G.helmet, this.materials.suit);
    helmet.position.y = 0.012;
    helmet.scale.set(B.helmet, B.helmet * 0.94, B.helmet * 1.06);
    // Helmkamm: klare Silhouette von der Seite
    const crest = new THREE.Mesh(G.crest, MAT_METAL);
    crest.position.set(0, 0.10 * B.helmet, 0.005);
    crest.scale.setScalar(B.helmet);
    // asymmetrische Antenne
    const ant = new THREE.Mesh(G.antenna, MAT_METAL);
    ant.position.set(0.08 * B.helmet, 0.10, 0.04);
    ant.rotation.set(0.18, 0, -0.45);

    this._add(this.headGroup, neck);
    this._add(this.headGroup, head, true);
    this._add(this.headGroup, helmet, true);
    this._add(this.headGroup, crest);
    this._add(this.headGroup, ant);
    this.hips.add(this.headGroup);
  }

  createVisor() {
    const B = this.B;
    const visor = new THREE.Mesh(G.visor, this.materials.visor);
    visor.position.set(0, -0.004, -0.092 * B.helmet - 0.008);
    visor.rotation.x = -0.14;
    visor.scale.set(B.helmet, 1, 1);
    const finL = new THREE.Mesh(G.visorFin, this.materials.visor);
    finL.position.set(-0.092 * B.helmet, 0.012, -0.045);
    finL.rotation.y = 0.28;
    const finR = finL.clone();
    finR.position.x = 0.092 * B.helmet;
    finR.rotation.y = -0.28;
    this.visor = visor;
    this._add(this.headGroup, visor);
    this._add(this.headGroup, finL);
    this._add(this.headGroup, finR);
  }

  // ------------------------------------------------------------------ Arme
  _buildArm(side) {
    const B = this.B;
    const arm = new THREE.Group();
    arm.position.set(B.shoulderX * side, B.torso * 0.88, 0);

    const upper = new THREE.Mesh(G.upperArm, MAT_DARK);
    upper.position.y = -B.arm / 2;
    upper.scale.set(B.limb, B.arm / LEN.upper, B.limb);

    const fore = new THREE.Group();
    fore.position.y = -B.arm;
    const foreMesh = new THREE.Mesh(G.foreArm, this.materials.suit);
    foreMesh.position.y = -B.arm * 0.47;
    foreMesh.scale.set(B.limb, B.arm / LEN.fore * 0.94, B.limb);
    const hand = new THREE.Mesh(G.hand, MAT_METAL);
    hand.position.y = -B.arm * 0.95;
    hand.scale.setScalar(B.limb);
    fore.add(foreMesh, hand);

    arm.add(upper, fore);
    this.hips.add(arm);
    this.parts.push(upper, foreMesh, hand);
    this.shadowParts.push(upper, foreMesh);

    // Schulterpanzer bleibt am Rumpf, nicht am Arm — sonst schwingt er mit
    const pad = new THREE.Mesh(G.shoulder, this.materials.suit);
    pad.position.set(B.shoulderX * side * 1.06, B.torso * 0.90, 0);
    pad.rotation.z = -0.28 * side;
    pad.scale.setScalar(B.pad);
    if (side < 0) pad.scale.multiplyScalar(1.22);     // Asymmetrie
    this._add(this.chestGroup, pad);                  // kein Schattenwerfer: Budget

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
    const B = this.B;
    const leg = new THREE.Group();
    leg.position.set(0.082 * side * B.torsoW + 0.012 * side, 0, 0);

    const thigh = new THREE.Mesh(G.thigh, this.materials.suit);
    thigh.position.y = -B.thigh / 2;
    thigh.scale.set(B.limb, B.thigh / LEN.thigh, B.limb);

    const shin = new THREE.Group();
    shin.position.y = -B.thigh;
    const knee = new THREE.Mesh(G.knee, MAT_METAL);
    knee.position.y = -0.02;
    knee.scale.setScalar(B.limb);
    const shinMesh = new THREE.Mesh(G.shin, MAT_DARK);
    shinMesh.position.y = -B.shin / 2;
    shinMesh.scale.set(B.limb, B.shin / LEN.shin, B.limb);
    const foot = new THREE.Mesh(G.foot, MAT_METAL);
    foot.position.set(0, -B.shin - B.foot / 2, -0.035);
    foot.scale.set(B.limb, B.foot / LEN.foot, 1);
    shin.add(knee, shinMesh, foot);

    leg.add(thigh, shin);
    this.hips.add(leg);
    this.parts.push(thigh, knee, shinMesh, foot);
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
  /**
   * Bodenindikator ist standardmäßig AUS — die Figur soll für sich stehen.
   * Über RIFT_CONFIG.GROUND_RING = true wieder einschaltbar.
   */
  createGroundIndicator() {
    if (!CFG.GROUND_RING) return;
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
      map: tex, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
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
    ctx.fillStyle = 'rgba(6,10,18,0.66)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(14, 14, 292, 50, 12); ctx.fill(); }
    else ctx.fillRect(14, 14, 292, 50);
    ctx.fillStyle = accent;
    ctx.fillRect(14, 60, 292, 4);
    ctx.beginPath();
    ctx.moveTo(148, 66); ctx.lineTo(172, 66); ctx.lineTo(160, 82); ctx.closePath();
    ctx.fill();
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
  setState(s) {
    const t = this.st;
    t.movementState = s.movementState ?? t.movementState;
    t.speed = s.speed ?? 0;
    t.isGrounded = !!s.isGrounded;
    t.isWallRunning = !!s.isWallRunning;
    t.isDashing = !!s.isDashing;
    t.wallSide = s.wallSide ?? 0;
    t.velocityY = s.velocityY ?? 0;
    // Laufrichtung relativ zur Blickrichtung: 0 = vorwärts, +PI/2 = rechts
    t.moveAngle = s.moveAngle ?? 0;
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

    // ---- Ereignisse ----
    if (!s.isGrounded) this._fallSpeed = Math.min(this._fallSpeed, s.velocityY);
    if (s.isGrounded && !this._prevGrounded) this._onLand();
    if (!s.isGrounded && this._prevGrounded && ms === 'jump') this._emitJump();
    if (s.isDashing && this._prevState !== 'dash') this._emitDash();
    this._prevGrounded = s.isGrounded;
    this._prevState = ms;

    /* ---- Zielpose ----------------------------------------------------
     * armX  : Grundstellung der Arme (+ nach vorne, − nach hinten)
     * armOut: Abspreizen, NIE negativ (sonst kreuzen die Arme im Körper)
     * elbow : Ellbogenbeugung
     */
    const spd = s.speed;
    let lean = 0, roll = 0, turn = 0, crouch = 0, swing = 0, cycle = 0;
    let armX = 0, armOut = 0.13, elbow = 0.35, legSplit = 0, reach = 0;

    switch (ms) {
      case 'sprint':
        lean = -0.30 - clamp((spd - 12) * 0.012, 0, 0.12);
        swing = 1.05; cycle = 1; armOut = 0.10; elbow = 0.75; break;
      case 'run':
        lean = -0.16; swing = 0.8; cycle = 1; armOut = 0.12; elbow = 0.5; break;
      case 'crouch':
        crouch = 1; lean = -0.22; swing = 0.35; cycle = spd > 1 ? 1 : 0;
        armOut = 0.20; elbow = 0.9; break;
      case 'slide':
        crouch = 1; lean = -0.46; armX = -0.85; armOut = 0.30; elbow = 0.55;
        legSplit = 1; break;
      case 'jump':
        lean = -0.08; armX = 0.75; armOut = 0.35; elbow = 0.9; legSplit = -0.6; break;
      case 'fall':
        lean = 0.06; armX = -0.15; armOut = 1.0; elbow = 0.25; legSplit = -0.25; break;
      case 'wallrun': {
        /* rotation.y > 0 dreht den Blick nach LINKS, rotation.z > 0 kippt den
         * Kopf nach LINKS. Bei einer Wand RECHTS (side = +1) muss beides
         * positiv sein, damit sich die Figur von der Wand wegdreht und -neigt. */
        const side = s.wallSide || 1;
        roll = 0.34 * side;
        turn = 0.40 * side;
      }
        lean = -0.20; swing = 0.95; cycle = 1; reach = 1; armOut = 0.12; elbow = 0.6; break;
      case 'dash':
        lean = -0.58; armX = -1.15; armOut = 0.12; elbow = 0.2; legSplit = -0.35; break;
      case 'respawn':
      case 'idle':
      default:
        armOut = 0.14; elbow = 0.3; break;
    }

    if (cycle) this.phase += dt * (4.2 + Math.min(spd, 22) * 0.62);
    else this.phase = damp(this.phase % (Math.PI * 2), 0, 6, dt);

    const k = 10;
    p.lean = damp(p.lean, lean, k, dt);
    p.roll = damp(p.roll, roll, k * 0.8, dt);
    p.turn = damp(p.turn, turn, k * 0.8, dt);
    p.crouch = damp(p.crouch, crouch, k * 1.2, dt);
    p.swing = damp(p.swing, swing, k, dt);
    p.armX = damp(p.armX, armX, k, dt);
    p.armOut = damp(p.armOut, Math.max(0, armOut), k, dt);
    p.elbow = damp(p.elbow, elbow, k, dt);
    p.legSplit = damp(p.legSplit, legSplit, k, dt);
    p.reach = damp(p.reach, reach, k, dt);

    const sw = Math.sin(this.phase) * p.swing;
    const swB = -sw;
    const breathe = Math.sin(this.t * 1.9) * 0.012;

    // ---- Rumpf ----
    this.tilt.rotation.x = p.lean;
    this.tilt.rotation.z = p.roll;
    const bob = cycle ? Math.abs(Math.sin(this.phase)) * 0.045 * p.swing : 0;
    this.hips.position.y = this.B.hip - p.crouch * 0.32 + bob + (cycle ? 0 : breathe);
    /* ---- Der Körper dreht sich in die tatsächliche Laufrichtung ----
     * Läuft man nur mit A/D zur Seite, würde die Figur sonst vorwärts laufende
     * Beine haben und seitlich wegrutschen. Der Unterkörper dreht deshalb in
     * die Bewegungsrichtung, Brust und Kopf halten dagegen, sodass der Blick
     * weiterhin dorthin geht, wo die Kamera hinschaut. */
    let moveTurn = 0;
    if (!s.isWallRunning && spd > 1.5) {
      // Vorzeichen: Blickrichtung ist (-sin θ, -cos θ). Damit der Körper nach
      // rechts (moveAngle = +PI/2) zeigt, muss um -PI/2 gedreht werden.
      moveTurn = -s.moveAngle * (s.isGrounded ? 1 : 0.5);
    }
    if (this._punch > 0) moveTurn *= this._punch;      // beim Schlag zur Front zurück
    p.bodyTurn = dampAngle(p.bodyTurn, moveTurn, 9, dt);
    // Auf [-PI, PI] normalisieren: dampAngle nimmt den kürzesten Weg und kann
    // dabei Vielfache von 2*PI aufsammeln. Die Drehung sähe gleich aus, aber
    // das Klemmen der Kopf-Gegendrehung würde dann falsch herum wirken.
    p.bodyTurn = ((p.bodyTurn + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.turn.rotation.y = p.turn + p.bodyTurn;

    const counter = clamp(p.bodyTurn, -1.25, 1.25);
    this.chestGroup.rotation.y = -sw * 0.16 - counter * 0.28;
    this.chestGroup.scale.y = 1 + (cycle ? 0 : breathe * 1.6);

    // ---- Kopf: stabilisiert den Blick, schaut beim Wallrun nach vorne ----
    this.headGroup.rotation.x = -p.lean * 0.55 + (cycle ? Math.sin(this.phase * 2) * 0.03 : 0);
    this.headGroup.rotation.z = -p.roll * 0.4;
    this.headGroup.rotation.y = -p.turn * 0.55 - counter * 0.62;

    /* ---- Arme: erst Zielwinkel berechnen, dann EINMAL setzen.
     * (Vorher wurde der Wallrun-Arm nach dem Setzen nochmal überschrieben,
     *  was sichtbares Zittern erzeugt hat.) */
    const idleSway = cycle ? 0 : Math.sin(this.t * 1.4) * 0.03;
    let lX = p.armX + sw * 1.0 + idleSway;
    let rX = p.armX + swB * 1.0 + idleSway;
    /* Vorzeichen: rotation.z > 0 bewegt einen hängenden Arm nach +X (rechts).
     * Der linke Arm muss also negativ, der rechte positiv abgespreizt werden —
     * vorher war es umgekehrt und beide Arme drehten durch den Torso. */
    let lZ = -p.armOut, rZ = p.armOut;
    let lE = -p.elbow - Math.max(0, sw) * 0.85;
    let rE = -p.elbow - Math.max(0, swB) * 0.85;

    if (p.reach > 0.01) {
      const side = s.wallSide || 1;
      const w = p.reach;
      if (side > 0) {                       // Wand rechts -> rechter Arm greift nach rechts
        rX = rX * (1 - w) + (-0.45) * w;
        rZ = rZ * (1 - w) + (1.15) * w;
        rE = rE * (1 - w) + (-0.2) * w;
      } else {                              // Wand links
        lX = lX * (1 - w) + (-0.45) * w;
        lZ = lZ * (1 - w) + (-1.15) * w;
        lE = lE * (1 - w) + (-0.2) * w;
      }
    }
    // ---- Schlag: überschreibt den rechten Arm für ~0.35 s ----
    if (this._punch > 0) {
      this._punch = Math.max(0, this._punch - dt / 0.35);
      const u = 1 - this._punch;                 // 0 -> 1 über die Dauer
      // schnelles Ausfahren, langsameres Zurücknehmen
      const ext = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
      const e = ext * ext * (3 - 2 * ext);       // smoothstep
      rX = rX * (1 - e) + 1.45 * e;              // Arm nach vorne
      rZ = rZ * (1 - e) - 0.18 * e;
      rE = rE * (1 - e) + 0.02 * e;              // Ellbogen durchgestreckt
      lX = lX * (1 - e) + (-0.55) * e;           // Gegenarm zurück
      lE = lE * (1 - e) + (-1.15) * e;
      this.chestGroup.rotation.y = -0.42 * e;    // Körper dreht mit
      this.turn.rotation.y = p.turn + p.bodyTurn - 0.16 * e;
    }

    this.armL.rotation.set(lX, 0, lZ);
    this.armR.rotation.set(rX, 0, rZ);
    this.foreL.rotation.x = lE;
    this.foreR.rotation.x = rE;

    // ---- Beine ----
    const crouchBend = p.crouch * 0.95;
    const split = p.legSplit;
    // legSplit > 0: Beine in Schrittstellung (Slide), < 0: angezogen (Sprung)
    const lLeg = swB * 0.85 - crouchBend * 0.9 + split * 0.85 + Math.max(0, -split) * 0.5;
    const rLeg = sw * 0.85 - crouchBend * 0.9 - split * 0.35 + Math.max(0, -split) * 0.5;
    this.legL.rotation.x = lLeg;
    this.legR.rotation.x = rLeg;
    this.shinL.rotation.x = Math.max(0, -swB) * 1.25 + crouchBend * 1.7 + Math.max(0, -split) * 1.1;
    this.shinR.rotation.x = Math.max(0, -sw) * 1.25 + crouchBend * 1.7 + Math.max(0, split) * 1.3 + Math.max(0, -split) * 1.1;
    this.footL.rotation.x = -lLeg * 0.3 - this.shinL.rotation.x * 0.3;
    this.footR.rotation.x = -rLeg * 0.3 - this.shinR.rotation.x * 0.3;
    const legOut = Math.max(0, split) * 0.06 + Math.max(0, -split) * 0.1;
    this.legL.rotation.z = -legOut;
    this.legR.rotation.z = legOut;

    // ---- Visor / Kern ----
    this._visorPulse = damp(this._visorPulse, s.isDashing ? 1 : 0, 8, dt);
    const base = this.isLocal ? 2.6 : 1.9;
    this.materials.visor.emissiveIntensity = base + this._visorPulse * 2.2 + Math.sin(this.t * 2.4) * 0.12;
    const coreScale = 1 + Math.sin(this.t * 3.1) * 0.08 + this._visorPulse * 0.35;
    this.cores[0].scale.setScalar(coreScale);
    this.cores[1].scale.setScalar(coreScale);

    // ---- Bodenring (optional) ----
    if (this.ring) {
      const ringTarget = s.isGrounded ? (this.isLocal ? 0.55 : 0.4) : 0.12;
      this.materials.ring.opacity = damp(this.materials.ring.opacity, ringTarget, 8, dt);
      this.ring.scale.setScalar(1 + (s.isGrounded ? Math.sin(this.t * 2.2) * 0.05 : 0.25));
      this.ring.rotation.y += dt * 0.6;
    }

    this._updateFx(dt, s);

    // ---- Namensschild ----
    if (this.nameplate && camera) {
      _v.setFromMatrixPosition(this.nameplate.matrixWorld);
      const d = camera.position.distanceTo(_v);
      const k2 = clamp(Math.pow(Math.max(d, 1), 0.72) * 0.36, 0.85, 2.6);
      this.nameplate.scale.set(1.55 * k2, 0.46 * k2, 1);
      this.nameplate.visible = d > 2.2 && d < 140;
    }
  }

  // -------------------------------------------------------------- Effekte
  _updateFx(dt, s) {
    if (!this.fx) return;
    const px = this.root.position.x, py = this.root.position.y, pz = this.root.position.z;

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
    this.fx.burst(p.x, p.y, p.z, this.palette.core, 5, { speed: 1.8, size: 0.09, life: 0.3, up: 0.3, gravity: 1.2 });
  }

  _emitDash() {
    if (!this.fx) return;
    const p = this.root.position;
    this.fx.burst(p.x, p.y + 0.8, p.z, this.palette.visor, 10, { speed: 3.4, size: 0.13, life: 0.35, up: 0.2, gravity: 0.1 });
  }

  flash() { this._visorPulse = 1.6; }

  /** Sichtbarer Schlag: kurzer Ausfallschritt mit Faust nach vorne. */
  punch() { this._punch = 1; }

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
