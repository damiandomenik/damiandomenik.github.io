import * as THREE from 'three';
import type { ArenaDefinition } from '../config/arenas';
import { arenaUrl } from '../config/arenas';
import type { AssetManager, ProgressHandler } from '../assets/AssetManager';

export interface LoadedArena {
  definition: ArenaDefinition;
  root: THREE.Group;
  /** World-space bounds of the whole arena mesh. */
  bounds: THREE.Box3;
  /** Footprint used to wrap the grandstand around the arena. */
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Y of the main fighting floor, always 0 after normalisation. */
  floorY: number;
  /** Roughly how tall the arena is above its floor. */
  headroom: number;
}

/**
 * Loads an arena GLB and puts it into a predictable coordinate frame:
 * centred on the origin in XZ, with the main floor at y = 0.
 *
 * The floor is *found*, not configured: rays are cast down through a grid in
 * the middle of the model and the most common hit height wins. That is what
 * lets a new arena GLB be dropped into public/assets/arenas without editing
 * any code.
 */
export class ArenaLoader {
  constructor(private assets: AssetManager) {}

  async load(definition: ArenaDefinition, onProgress?: ProgressHandler): Promise<LoadedArena> {
    const gltf = await this.assets.load(arenaUrl(definition), onProgress, definition.name);

    const root = new THREE.Group();
    root.name = `arena:${definition.id}`;
    const model = gltf.scene.clone(true);
    model.scale.setScalar(definition.scale);
    root.add(model);
    root.updateMatrixWorld(true);

    prepareMaterials(root);

    // 1. centre horizontally
    const raw = new THREE.Box3().setFromObject(root);
    const centre = raw.getCenter(new THREE.Vector3());
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    root.updateMatrixWorld(true);

    // 2. put the floor on y = 0
    const floor = definition.floorY ?? detectFloor(root, raw);
    model.position.y -= floor;
    root.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());

    return {
      definition,
      root,
      bounds,
      footprint: {
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
      },
      floorY: 0,
      headroom: Math.max(3, size.y),
    };
  }
}

/**
 * Casts a grid of downward rays through the middle 60% of the model and takes
 * the modal hit height. A single ray would land on a crate; the mode lands on
 * the actual floor.
 */
function detectFloor(root: THREE.Object3D, bounds: THREE.Box3): number {
  const raycaster = new THREE.Raycaster();
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const top = bounds.max.y + 5;
  const down = new THREE.Vector3(0, -1, 0);

  const meshes: THREE.Mesh[] = [];
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh);
  });
  if (!meshes.length) return bounds.min.y;

  const samples: number[] = [];
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = centre.x + ((i / (steps - 1)) * 2 - 1) * size.x * 0.3;
      const z = centre.z + ((j / (steps - 1)) * 2 - 1) * size.z * 0.3;
      raycaster.set(new THREE.Vector3(x, top, z), down);
      const hits = raycaster.intersectObjects(meshes, true);
      if (hits.length) samples.push(hits[hits.length - 1].point.y);
    }
  }
  if (!samples.length) return bounds.min.y;

  // modal height with a 0.25 m tolerance
  samples.sort((a, b) => a - b);
  let best = samples[0];
  let bestCount = 0;
  for (const candidate of samples) {
    const count = samples.filter((s) => Math.abs(s - candidate) < 0.25).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/** Sensible shadow + colour-space defaults for third party GLBs. */
function prepareMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const std = material as THREE.MeshStandardMaterial;
      if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
      if (std.emissiveMap) std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      // A lot of Sketchfab exports ship fully rough metal; nudge it so the
      // lighting rig actually reads.
      if (std.isMeshStandardMaterial && std.metalness > 0.9 && !std.metalnessMap) {
        std.metalness = 0.35;
      }
      std.side = THREE.FrontSide;
      std.needsUpdate = true;
    }
  });
}
