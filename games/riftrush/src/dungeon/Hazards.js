import * as THREE from 'three';
import { COLORS } from '../core/Config.js';

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * Materialien des Dungeons — abgestimmt auf die Spielerfiguren:
 * dunkles, leicht metallisches Blau-Grau mit klaren Emissive-Akzenten.
 * Phong statt Standard, weil bis zu 10 Punktlichter auf großen Flächen
 * liegen und PBR hier keinen sichtbaren Mehrwert bringt.
 */
export function createMaterials() {
  return {
    solid:  new THREE.MeshPhongMaterial({ color: 0x232c42, specular: 0x39496b, shininess: 22 }),
    accent: new THREE.MeshPhongMaterial({ color: 0x1a3350, specular: 0x4a6f96, shininess: 40, emissive: COLORS.accent, emissiveIntensity: 0.22 }),
    hazard: new THREE.MeshPhongMaterial({ color: 0x3c1020, specular: 0x8a2140, shininess: 50, emissive: COLORS.danger, emissiveIntensity: 0.7, transparent: true, opacity: 0.86 }),
    switch: new THREE.MeshPhongMaterial({ color: 0x3a2a12, specular: 0x8a6a20, shininess: 40, emissive: COLORS.switchOff, emissiveIntensity: 0.6 }),
    safe:   new THREE.MeshPhongMaterial({ color: 0x15374c, specular: 0x3f7fa5, shininess: 34, emissive: COLORS.safe, emissiveIntensity: 0.16 }),
    risk:   new THREE.MeshPhongMaterial({ color: 0x3d2a12, specular: 0x9a7430, shininess: 34, emissive: COLORS.risk, emissiveIntensity: 0.22 }),
    goal:   new THREE.MeshPhongMaterial({ color: 0x3d3417, specular: 0xb09040, shininess: 46, emissive: COLORS.goal, emissiveIntensity: 0.42 }),
    blink:  new THREE.MeshPhongMaterial({ color: 0x1d2b46, specular: 0x5a6fa8, shininess: 38, emissive: COLORS.accent2, emissiveIntensity: 0.3 }),
    door:   new THREE.MeshPhongMaterial({ color: 0x2a1c3a, specular: 0x6a4a8a, shininess: 30, emissive: COLORS.switchOff, emissiveIntensity: 0.3 }),
  };
}

/**
 * Unbeleuchtete Kantenleuchten ("Panel-Linien") pro Box-Typ.
 * Sie geben den Plattformen eine erkennbare Silhouette, auch wenn kein
 * Punktlicht in der Nähe ist — und binden den Dungeon optisch an die
 * Emissive-Details der Figuren an.
 */
export function createRimMaterials() {
  const B = (c, o = 0.85) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o });
  return {
    solid:  B(0x3f6d9e, 0.55),
    accent: B(COLORS.accent, 0.9),
    safe:   B(COLORS.safe, 0.85),
    risk:   B(COLORS.risk, 0.9),
    goal:   B(COLORS.goal, 0.95),
    switch: B(COLORS.switchOff, 0.9),
    blink:  B(COLORS.accent2, 0.85),
  };
}

/** Erzeugt ein Mesh für ein dynamisches Objekt (Plattform, Tür, Hazard, Chase-Wall). */
export function createDynamicMesh(obj, materials) {
  // bewusst kein clone(): alle Gefahren teilen sich ein Material, damit das
  // Pulsieren zentral gesteuert werden kann und beim Neuaufbau nichts leckt
  const mat = materials[obj.kind] || materials.accent;
  const mesh = new THREE.Mesh(UNIT_BOX, mat);
  mesh.scale.set(obj.w, obj.h, obj.d);
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
  if (obj.kind === 'blink') obj.mesh.visible = obj.on;
  else if (obj.kind === 'door') obj.mesh.visible = true;
  else obj.mesh.visible = c.active !== false;
}
