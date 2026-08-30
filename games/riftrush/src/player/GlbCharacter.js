import * as THREE from 'three';
import { CONFIG as C } from '../core/Config.js';
import { derivePalette } from './PlayerColors.js';
import { instantiatePlayerModel } from './ModelLibrary.js';

/**
 * Spielerfigur auf Basis des GLB-Modells (Rift Runner).
 *
 * Bietet exakt dieselbe Schnittstelle wie PlayerCharacter — das Spiel merkt
 * nicht, welche Variante läuft:
 *   setTransform · setVisible · setColor · setName · punch · flash
 *   · setShadows · updateAnimation(dt, state, camera) · dispose
 *
 * Statt prozeduraler Posen werden hier die 16 Clips aus dem GLB überblendet.
 * Bodenring, Namensschild, Körperdrehung in Laufrichtung und die Partikel-
 * effekte funktionieren identisch.
 */
const CLIP_FOR_STATE = {
  idle: 'Idle', run: 'Run', sprint: 'Sprint', crouch: 'Crouch', slide: 'Slide',
  jump: 'Jump', fall: 'Fall', wallrun: 'WallRun', dash: 'Dash', respawn: 'Idle',
};
const ONESHOT = { Punch: 0.46, Land: 0.34, WallJump: 0.42, Hit: 0.38, JumpStart: 0.26 };
/* Additiv ueberlagert statt dazwischengeblendet: sonst mittelt der Mixer den
 * Schlag mit der laufenden Bewegung und er kommt nur halb heraus. */
const ADDITIVE = new Set(['Punch', 'Hit']);

const _v = new THREE.Vector3();
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function dampAngle(a, b, l, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-l * dt));
}

function segmentedRing(inner, outer, segments = 4, fill = 0.6) {
  const pos = [];
  const per = (Math.PI * 2) / segments;
  for (let s = 0; s < segments; s++) {
    const a0 = s * per, a1 = a0 + per * fill;
    for (let i = 0; i < 5; i++) {
      const t0 = a0 + (a1 - a0) * (i / 5), t1 = a0 + (a1 - a0) * ((i + 1) / 5);
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
const RING_GEO = segmentedRing(0.38, 0.47, 4, 0.6);

export class GlbCharacter {
  constructor({ scene, fx = null, name = 'Runner', color = 0x4c9dff, isLocal = false, nameplate = true }) {
    const inst = instantiatePlayerModel();
    if (!inst) throw new Error('Charaktermodell ist nicht geladen');

    this.scene = scene;
    this.fx = fx;
    this.name = name;
    this.isLocal = isLocal;
    this.buildName = 'glb';

    this.root = new THREE.Group();
    this.turn = new THREE.Group();      // Drehung in Laufrichtung / zur Wand
    this.tilt = new THREE.Group();      // Neigung und Roll
    this.turn.add(this.tilt);
    this.root.add(this.turn);
    this.tilt.add(inst.root);
    this.model = inst.root;
    this.modelMaterials = inst.materials;
    scene.add(this.root);

    // Armknochen merken: der greifende Arm beim Wallrun haengt von der
    // Wandseite ab und wird nach dem Mixer ueberschrieben.
    this.bones = {};
    inst.root.traverse((o) => {
      if (o.isBone && /^(Upper|Lower)Arm_[LR]$/.test(o.name)) this.bones[o.name] = o;
    });

    this.mixer = new THREE.AnimationMixer(inst.root);
    this.actions = {};
    for (const clip of inst.clips) {
      let a;
      if (ADDITIVE.has(clip.name)) {
        const add = THREE.AnimationUtils.makeClipAdditive(clip.clone());
        a = this.mixer.clipAction(add, inst.root, THREE.AdditiveAnimationBlendMode);
      } else {
        a = this.mixer.clipAction(clip);
      }
      a.clampWhenFinished = !!ONESHOT[clip.name];
      a.loop = ONESHOT[clip.name] ? THREE.LoopOnce : THREE.LoopRepeat;
      this.actions[clip.name] = a;
    }
    this.current = null;
    this.oneShot = null;
    this.oneShotTime = 0;

    this.materials = {};
    this.setColor(color);
    this._buildRing();
    if (nameplate) this.createNameplate(name);

    this.t = 0;
    this.pose = { lean: 0, roll: 0, turn: 0, bodyTurn: 0 };
    this.st = {
      movementState: 'idle', speed: 0, isGrounded: true,
      isWallRunning: false, isDashing: false, wallSide: 0, velocityY: 0, moveAngle: 0,
    };
    this._prevGrounded = true;
    this._prevState = 'idle';
    this._fallSpeed = 0;
    this._dashTimer = 0;
    this._sparkTimer = 0;
    this._play('Idle', 0);
  }

  // ------------------------------------------------------------------ Farbe
  setColor(color) {
    const p = derivePalette(color);
    this.color = color;
    this.palette = p;
    if (!this.materials.ring) {
      this.materials.ring = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      });
    }
    this.materials.ring.color.copy(p.rim);
    // Nur die Akzent- und Visor-Materialien tragen die Spielerfarbe —
    // die Panzerung bleibt bei allen gleich (so ist es im Sheet vorgesehen).
    const accent = this.modelMaterials.Accent;
    const visor = this.modelMaterials.Visor;
    if (accent) {
      accent.color.copy(p.core).multiplyScalar(0.35);
      accent.emissive.copy(p.core);
      accent.emissiveIntensity = 1.0;
      accent.toneMapped = false;
    }
    if (visor) {
      visor.emissive.copy(p.visor);
      visor.emissiveIntensity = this.isLocal ? 1.6 : 1.2;
      visor.toneMapped = false;
    }
    if (this.nameplate) this._paintNameplate();
  }

  _buildRing() {
    if (!C.GROUND_RING) { this.ring = null; return; }
    this.ring = new THREE.Mesh(RING_GEO, this.materials.ring);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
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

  setName(name) { this.name = name; if (this.nameplate) this._paintNameplate(); }

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
    t.moveAngle = s.moveAngle ?? 0;
  }

  setTransform(x, y, z, yaw) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  setVisible(v) { this.root.visible = v; }

  // -------------------------------------------------------------- Clips
  _play(name, fade = 0.18) {
    const a = this.actions[name];
    if (!a || this.current === name) return;
    const prev = this.actions[this.current];
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    this.current = name;
  }

  _playOnce(name) {
    const a = this.actions[name];
    if (!a) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    this.oneShot = name;
    this.oneShotTime = ONESHOT[name] || 0.4;
  }

  punch() { this._playOnce('Punch'); }
  flash() { this._flash = 0.25; }

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
    if (s.isGrounded && !this._prevGrounded) { this._onLand(); this._playOnce('Land'); }
    if (!s.isGrounded && this._prevGrounded && ms === 'jump') { this._emitJump(); this._playOnce('JumpStart'); }
    if (s.isDashing && this._prevState !== 'dash') this._emitDash();
    this._prevGrounded = s.isGrounded;
    this._prevState = ms;

    // ---- Clip-Auswahl ----
    if (this.oneShot) {
      this.oneShotTime -= dt;
      if (this.oneShotTime <= 0) {
        this.actions[this.oneShot]?.fadeOut(0.15);
        this.oneShot = null;
      }
    }
    let clip = CLIP_FOR_STATE[ms] || 'Idle';
    if (clip === 'Run' && s.speed < 5.5) clip = 'Walk';
    this._play(clip, this.current ? 0.16 : 0);
    this.mixer.update(dt);

    // ---- Körperhaltung (dieselbe Logik wie bei der prozeduralen Figur) ----
    const lean = ms === 'sprint' ? -0.12 : ms === 'dash' ? -0.20 : 0;
    /* Fuesse an der Wand, Kopf davon weggelehnt; Blick leicht nach aussen.
     * Vorzeichen kommt aus der Wandseite, nicht aus dem Clip — sonst waere an
     * der gegenueberliegenden Wand alles spiegelverkehrt. */
    const side = s.wallSide || 1;
    const roll = s.isWallRunning ? 0.30 * side : 0;
    const wallTurn = s.isWallRunning ? 0.22 * side : 0;
    p.lean = damp(p.lean, lean, 10, dt);
    p.roll = damp(p.roll, roll, 8, dt);
    p.turn = damp(p.turn, wallTurn, 8, dt);

    /* Auch beim Wallrun in die tatsaechliche Laufrichtung drehen. Vorher blieb
     * der Koerper zur Kamera ausgerichtet, waehrend er seitlich an der Wand
     * entlangglitt — das sah aus wie Driften. */
    let moveTurn = 0;
    if (s.speed > 1.5) {
      moveTurn = -s.moveAngle * (s.isGrounded || s.isWallRunning ? 1 : 0.5);
    }
    if (this.oneShot === 'Punch') moveTurn = 0;
    p.bodyTurn = dampAngle(p.bodyTurn, moveTurn, 9, dt);
    p.bodyTurn = ((p.bodyTurn + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

    this.tilt.rotation.x = p.lean;
    this.tilt.rotation.z = p.roll;
    this.turn.rotation.y = p.turn + p.bodyTurn;

    // ---- Wallrun: der wandseitige Arm greift nach der Wand ----
    this._reach = damp(this._reach ?? 0, s.isWallRunning ? 1 : 0, 9, dt);
    if (this._reach > 0.01) {
      const side = s.wallSide || 1;
      const upper = this.bones[side > 0 ? 'UpperArm_R' : 'UpperArm_L'];
      const lower = this.bones[side > 0 ? 'LowerArm_R' : 'LowerArm_L'];
      const w = this._reach;
      if (upper) {
        // nach aussen zur Wand: rechts positiv, links negativ
        upper.rotation.z = upper.rotation.z * (1 - w) + (1.05 * side) * w;
        upper.rotation.x = upper.rotation.x * (1 - w) + (-0.45) * w;
      }
      if (lower) lower.rotation.x = lower.rotation.x * (1 - w) + 0.25 * w;
    }

    // ---- Visor pulsiert, Treffer blitzt auf ----
    const visor = this.modelMaterials.Visor;
    if (visor) {
      const base = this.isLocal ? 1.6 : 1.2;
      const boost = (s.isDashing ? 1.2 : 0) + (this._flash > 0 ? 2.5 : 0);
      visor.emissiveIntensity = base + boost + Math.sin(this.t * 2.4) * 0.1;
    }
    if (this._flash > 0) this._flash -= dt;

    // ---- Bodenring ----
    if (this.ring) {
      const ringTarget = s.isGrounded ? (this.isLocal ? 0.55 : 0.4) : 0.12;
      this.materials.ring.opacity = damp(this.materials.ring.opacity, ringTarget, 8, dt);
      this.ring.rotation.y += dt * 0.6;
      this.ring.scale.setScalar(1 + (s.isGrounded ? Math.sin(this.t * 2.2) * 0.05 : 0.25));
    }

    this._updateFx(dt, s);

    if (this.nameplate && camera) {
      _v.setFromMatrixPosition(this.nameplate.matrixWorld);
      const d = camera.position.distanceTo(_v);
      const k = clamp(Math.pow(Math.max(d, 1), 0.72) * 0.36, 0.85, 2.6);
      this.nameplate.scale.set(1.55 * k, 0.46 * k, 1);
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
        this.fx.spawn(px + (Math.random() - 0.5) * 0.3, py + 0.6 + Math.random() * 0.7,
          pz + (Math.random() - 0.5) * 0.3,
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
        this.fx.spawn(px + rx * 0.45, py + 0.25 + Math.random() * 0.5, pz + rz * 0.45,
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

  setShadows(enabled) {
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = enabled; o.receiveShadow = false; } });
  }

  dispose() {
    this.scene.remove(this.root);
    this.mixer.stopAllAction();
    for (const m of Object.values(this.modelMaterials)) m.dispose();
    this.materials.ring?.dispose();
    if (this.nameplate) {
      this.nameplate.material.map?.dispose();
      this.nameplate.material.dispose();
    }
  }
}
