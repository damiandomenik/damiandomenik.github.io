import * as THREE from 'three';
import { Collider } from '../core/Physics.js';
import { COLORS } from '../core/Config.js';

const PILLAR_GEO = new THREE.BoxGeometry(0.5, 4, 0.5);
const BEAM_GEO = new THREE.BoxGeometry(6.4, 0.18, 0.18);

/** Checkpoint = Respawn-Punkt + Fortschrittsmarker. */
export class Checkpoint {
  constructor(index, position, scene, physics, isFinal = false) {
    this.index = index;
    this.position = { x: position.x, y: position.y, z: position.z };
    this.reached = false;
    this.isFinal = isFinal;

    const color = isFinal ? COLORS.goal : COLORS.checkpoint;
    this.matOff = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 });
    this.matOn = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });

    this.group = new THREE.Group();
    const l = new THREE.Mesh(PILLAR_GEO, this.matOff);
    const r = new THREE.Mesh(PILLAR_GEO, this.matOff);
    const b = new THREE.Mesh(BEAM_GEO, this.matOff);
    l.position.set(-3.2, 2, 0);
    r.position.set(3.2, 2, 0);
    b.position.set(0, 4.0, 0);
    this.group.add(l, r, b);
    this.parts = [l, r, b];
    this.group.position.set(position.x, position.y, position.z);
    scene.add(this.group);

    this.trigger = new Collider(position.x, position.y, position.z, 8, 5, 4, 'trigger');
    this.trigger.userData = { type: 'checkpoint', index };
    physics.add(this.trigger);
  }

  activate() {
    if (this.reached) return;
    this.reached = true;
    this.parts.forEach((p) => (p.material = this.matOn));
  }

  update(t) {
    const s = this.reached ? 1 : 0.6 + Math.sin(t * 2 + this.index) * 0.12;
    this.group.children[2].scale.y = s;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.matOff.dispose(); this.matOn.dispose();
  }
}
