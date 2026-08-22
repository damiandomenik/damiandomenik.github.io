import * as THREE from 'three';
import { COLORS } from '../core/Config.js';

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Materialien für alle Box-Kinds (minimalistic sci-fi). */
export function createMaterials() {
  return {
    solid: new THREE.MeshLambertMaterial({ color: COLORS.solid }),
    accent: new THREE.MeshLambertMaterial({ color: 0x18324a, emissive: COLORS.accent, emissiveIntensity: 0.32 }),
    hazard: new THREE.MeshLambertMaterial({ color: 0x40101f, emissive: COLORS.danger, emissiveIntensity: 0.75 }),
    switch: new THREE.MeshLambertMaterial({ color: 0x3a2a10, emissive: COLORS.switchOff, emissiveIntensity: 0.7 }),
    safe: new THREE.MeshLambertMaterial({ color: 0x143548, emissive: COLORS.safe, emissiveIntensity: 0.24 }),
    risk: new THREE.MeshLambertMaterial({ color: 0x3d2a10, emissive: COLORS.risk, emissiveIntensity: 0.3 }),
    goal: new THREE.MeshLambertMaterial({ color: 0x3d3417, emissive: COLORS.goal, emissiveIntensity: 0.5 }),
    blink: new THREE.MeshLambertMaterial({ color: 0x1d2b46, emissive: COLORS.accent2, emissiveIntensity: 0.35 }),
    door: new THREE.MeshLambertMaterial({ color: 0x2a1c3a, emissive: COLORS.switchOff, emissiveIntensity: 0.35 }),
  };
}

/** Erzeugt ein Mesh für ein dynamisches Objekt (Plattform, Tür, Hazard, Chase-Wall). */
export function createDynamicMesh(obj, materials) {
  const mat = materials[obj.kind] || materials.accent;
  const mesh = new THREE.Mesh(UNIT_BOX, obj.kind === 'hazard' ? mat.clone() : mat);
  mesh.scale.set(obj.w, obj.h, obj.d);
  if (obj.kind === 'hazard') { mesh.material.transparent = true; mesh.material.opacity = 0.82; }
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** Synchronisiert das Mesh mit dem Collider. */
export function syncDynamicMesh(obj) {
  const c = obj.collider;
  if (!obj.mesh) return;
  obj.mesh.position.set(
    (c.minX + c.maxX) / 2,
    (c.minY + c.maxY) / 2,
    (c.minZ + c.maxZ) / 2,
  );
  if (obj.kind === 'blink') {
    obj.mesh.visible = obj.on;
  } else if (obj.kind === 'door') {
    obj.mesh.visible = true;
  }
}
