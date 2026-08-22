import * as THREE from 'three';
import { Collider } from '../core/Physics.js';
import { COLORS } from '../core/Config.js';

/* Gemeinsame Geometrien für alle Checkpoint-Tore. */
const G = {
  pillar: new THREE.BoxGeometry(0.34, 4.2, 0.34),
  base:   new THREE.BoxGeometry(0.9, 0.28, 0.9),
  arch:   new THREE.BoxGeometry(7.2, 0.30, 0.34),
  strip:  new THREE.BoxGeometry(0.10, 3.6, 0.10),
  curtain: new THREE.PlaneGeometry(6.4, 3.9),
  ring:   new THREE.RingGeometry(1.5, 1.72, 28, 1),
};

/**
 * Checkpoint = Respawn-Punkt + Fortschrittsmarker.
 * Optisch ein Sci-Fi-Tor: zwei leicht geneigte Pfeiler, Querbalken,
 * ein Energievorhang und ein Bodenring. Inaktiv ist alles gedämpft blau,
 * beim Durchlaufen springt es auf die Akzentfarbe (Ziel: gold).
 */
export class Checkpoint {
  constructor(index, position, scene, physics, isFinal = false) {
    this.index = index;
    this.position = { x: position.x, y: position.y, z: position.z };
    this.reached = false;
    this.isFinal = isFinal;
    this.scene = scene;

    const active = isFinal ? COLORS.goal : COLORS.checkpoint;
    this.activeColor = new THREE.Color(active);
    this.idleColor = new THREE.Color(0x3f5f8a);

    this.frameMat = new THREE.MeshPhongMaterial({
      color: 0x1d2740, specular: 0x44608c, shininess: 40,
      emissive: this.idleColor, emissiveIntensity: 0.25,
    });
    this.glowMat = new THREE.MeshBasicMaterial({ color: this.idleColor, transparent: true, opacity: 0.85 });
    this.curtainMat = new THREE.MeshBasicMaterial({
      color: this.idleColor, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: this.idleColor, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });

    this.group = new THREE.Group();
    const scale = isFinal ? 1.25 : 1;

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(G.pillar, this.frameMat);
      pillar.position.set(side * 3.3, 2.1, 0);
      pillar.rotation.z = side * 0.055;
      const base = new THREE.Mesh(G.base, this.frameMat);
      base.position.set(side * 3.4, 0.14, 0);
      const strip = new THREE.Mesh(G.strip, this.glowMat);
      strip.position.set(side * 3.08, 2.05, 0.14);
      this.group.add(pillar, base, strip);
    }

    const arch = new THREE.Mesh(G.arch, this.frameMat);
    arch.position.y = 4.15;
    const archGlow = new THREE.Mesh(G.arch, this.glowMat);
    archGlow.position.set(0, 3.92, 0.13);
    archGlow.scale.set(0.88, 0.22, 0.5);

    this.curtain = new THREE.Mesh(G.curtain, this.curtainMat);
    this.curtain.position.y = 2.0;

    this.ring = new THREE.Mesh(G.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;

    this.group.add(arch, archGlow, this.curtain, this.ring);
    this.group.scale.setScalar(scale);
    this.group.position.set(position.x, position.y, position.z);
    scene.add(this.group);

    this.trigger = new Collider(position.x, position.y, position.z, 8, 5, 4, 'trigger');
    this.trigger.userData = { type: 'checkpoint', index };
    physics.add(this.trigger);
  }

  activate() {
    if (this.reached) return;
    this.reached = true;
    this.frameMat.emissive.copy(this.activeColor);
    this.frameMat.emissiveIntensity = 0.6;
    this.glowMat.color.copy(this.activeColor);
    this.curtainMat.color.copy(this.activeColor);
    this.ringMat.color.copy(this.activeColor);
    this._flash = 1;
  }

  update(t) {
    const pulse = Math.sin(t * 2.2 + this.index) * 0.5 + 0.5;
    const flash = this._flash ? (this._flash = Math.max(0, this._flash - 0.02)) : 0;
    this.curtainMat.opacity = (this.reached ? 0.16 + pulse * 0.10 : 0.07 + pulse * 0.04) + flash * 0.5;
    this.ringMat.opacity = (this.reached ? 0.42 : 0.22) + pulse * 0.08 + flash * 0.4;
    this.ring.rotation.z = t * (this.reached ? 0.8 : 0.25);
    this.ring.scale.setScalar(1 + pulse * 0.03 + flash * 0.25);
    this.glowMat.opacity = (this.reached ? 0.9 : 0.45) + pulse * 0.1;
  }

  dispose() {
    this.scene.remove(this.group);
    this.frameMat.dispose();
    this.glowMat.dispose();
    this.curtainMat.dispose();
    this.ringMat.dispose();
  }
}
