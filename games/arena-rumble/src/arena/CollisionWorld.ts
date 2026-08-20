import * as THREE from 'three';
import { MeshBVH, type ExtendedTriangle } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface CapsuleResolveResult {
  position: THREE.Vector3;
  grounded: boolean;
  /** Normal of the surface the capsule is standing on, if any. */
  groundNormal: THREE.Vector3;
}

/**
 * One BVH over every solid triangle in the world (arena + grandstand).
 *
 * Baking everything into a single world-space geometry means player movement,
 * shot raycasts and camera collision all query the same structure, and adding a
 * brand new arena GLB needs no extra collision authoring.
 */
export class CollisionWorld {
  private bvh: MeshBVH | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  readonly bounds = new THREE.Box3();

  private readonly _segment = new THREE.Line3();
  private readonly _box = new THREE.Box3();
  private readonly _triPoint = new THREE.Vector3();
  private readonly _capsulePoint = new THREE.Vector3();
  private readonly _delta = new THREE.Vector3();
  private readonly _ray = new THREE.Ray();

  /** Rebuilds the BVH from the given roots. Call once per arena load. */
  build(roots: THREE.Object3D[]): void {
    this.dispose();

    const geometries: THREE.BufferGeometry[] = [];
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (mesh.userData.noCollision) return;

        // Instanced decoration (seats, railings) is baked in one geometry per
        // instance so players cannot walk through the grandstand.
        const instanced = mesh as unknown as THREE.InstancedMesh;
        if ((instanced as { isInstancedMesh?: boolean }).isInstancedMesh) {
          const matrix = new THREE.Matrix4();
          for (let i = 0; i < instanced.count; i++) {
            instanced.getMatrixAt(i, matrix);
            const g = toPositionOnly(mesh.geometry);
            g.applyMatrix4(matrix.premultiply(mesh.matrixWorld));
            geometries.push(g);
          }
          return;
        }

        const g = toPositionOnly(mesh.geometry);
        g.applyMatrix4(mesh.matrixWorld);
        geometries.push(g);
      });
    }

    if (!geometries.length) {
      console.warn('[CollisionWorld] nothing to collide against');
      return;
    }

    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) {
      console.warn('[CollisionWorld] merge failed');
      return;
    }

    this.geometry = merged;
    this.bvh = new MeshBVH(merged, { maxLeafTris: 8 });
    merged.computeBoundingBox();
    this.bounds.copy(merged.boundingBox ?? new THREE.Box3());
  }

  get ready(): boolean {
    return this.bvh !== null;
  }

  /**
   * Pushes a vertical capsule out of the world.
   * @param position feet position (bottom of the capsule)
   */
  resolveCapsule(
    position: THREE.Vector3,
    radius: number,
    height: number,
    out: CapsuleResolveResult,
  ): CapsuleResolveResult {
    out.position.copy(position);
    out.grounded = false;
    out.groundNormal.set(0, 1, 0);
    if (!this.bvh) return out;

    this._segment.start.set(position.x, position.y + radius, position.z);
    this._segment.end.set(position.x, position.y + height - radius, position.z);

    this._box.makeEmpty();
    this._box.expandByPoint(this._segment.start);
    this._box.expandByPoint(this._segment.end);
    this._box.min.addScalar(-radius);
    this._box.max.addScalar(radius);

    const segment = this._segment;
    const triPoint = this._triPoint;
    const capsulePoint = this._capsulePoint;
    const delta = this._delta;
    const box = this._box;
    let grounded = false;
    const groundNormal = out.groundNormal;

    this.bvh.shapecast({
      intersectsBounds: (bounds) => bounds.intersectsBox(box),
      intersectsTriangle: (tri: ExtendedTriangle) => {
        const distance = tri.closestPointToSegment(segment, triPoint, capsulePoint);
        if (distance >= radius) return false;

        const depth = radius - distance;
        delta.copy(capsulePoint).sub(triPoint);
        if (delta.lengthSq() < 1e-10) return false;
        delta.normalize();

        segment.start.addScaledVector(delta, depth);
        segment.end.addScaledVector(delta, depth);

        // Anything pushing us mostly upwards counts as floor.
        if (delta.y > 0.5) {
          grounded = true;
          groundNormal.copy(delta);
        }
        return false;
      },
    });

    out.position.set(segment.start.x, segment.start.y - radius, segment.start.z);
    out.grounded = grounded;
    return out;
  }

  /** First solid hit along a ray, or null. Returns a world-space point. */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): { point: THREE.Vector3; distance: number; normal: THREE.Vector3 } | null {
    if (!this.bvh) return null;
    this._ray.origin.copy(origin);
    this._ray.direction.copy(direction).normalize();

    const hit = this.bvh.raycastFirst(this._ray, THREE.DoubleSide, 0, maxDistance);
    if (!hit) return null;
    return {
      point: hit.point.clone(),
      distance: hit.distance,
      normal: hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0),
    };
  }

  /** Convenience: drop a ray straight down and report where it lands. */
  groundHeightAt(x: number, z: number, from = 200, to = -200): number | null {
    const hit = this.raycast(
      new THREE.Vector3(x, from, z),
      new THREE.Vector3(0, -1, 0),
      from - to,
    );
    return hit ? hit.point.y : null;
  }

  dispose(): void {
    this.geometry?.dispose();
    this.geometry = null;
    this.bvh = null;
    this.bounds.makeEmpty();
  }
}

/** Strips everything but positions/index so the merge never fails on mismatch. */
function toPositionOnly(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = source.getAttribute('position');
  g.setAttribute('position', pos.clone());
  if (source.index) g.setIndex(source.index.clone());
  return g;
}

export function makeResolveResult(): CapsuleResolveResult {
  return {
    position: new THREE.Vector3(),
    grounded: false,
    groundNormal: new THREE.Vector3(0, 1, 0),
  };
}
