import * as THREE from 'three';
import type { WeaponDefinition } from '../config/weapons';

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface Impact {
  points: THREE.Points;
  velocities: THREE.Vector3[];
  life: number;
}

/**
 * Everything you *see* when a shot happens. All of it is cosmetic and driven
 * by host `fire_event` messages, so every player sees the same shots even
 * though only the host decided what they hit.
 */
export class CombatSystem {
  private tracers: Tracer[] = [];
  private impacts: Impact[] = [];
  private muzzleFlash: THREE.PointLight;
  private flashLife = 0;

  private tracerGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
  private tracerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd79a,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
    depthWrite: false,
  });
  private sparkMaterial = new THREE.PointsMaterial({
    color: 0xffc978,
    size: 0.07,
    transparent: true,
    opacity: 1,
    toneMapped: false,
    depthWrite: false,
  });

  constructor(private scene: THREE.Scene) {
    this.tracerGeometry.translate(0, 0.5, 0);
    this.muzzleFlash = new THREE.PointLight(0xffc06a, 0, 9, 2);
    this.muzzleFlash.userData.noCollision = true;
    this.scene.add(this.muzzleFlash);
  }

  /** Draw one shot: beam from the muzzle to each resolved impact point. */
  showShot(
    weapon: WeaponDefinition,
    origin: THREE.Vector3,
    hits: Array<{ point: THREE.Vector3; targetId: string | null }>,
  ): void {
    if (weapon.kind === 'melee') {
      for (const hit of hits) if (hit.targetId) this.spawnImpact(hit.point, 0xff8f6b);
      return;
    }

    for (const hit of hits) {
      this.spawnTracer(origin, hit.point);
      this.spawnImpact(hit.point, hit.targetId ? 0xff6b6b : 0xffc978);
    }

    this.muzzleFlash.position.copy(origin);
    this.muzzleFlash.intensity = weapon.pellets > 1 ? 14 : 9;
    this.flashLife = 0.055;
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    if (length < 0.05) return;

    const mesh = new THREE.Mesh(this.tracerGeometry, this.tracerMaterial.clone());
    mesh.userData.noCollision = true;
    mesh.position.copy(from);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.075, maxLife: 0.075 });
  }

  private spawnImpact(at: THREE.Vector3, color: number): void {
    const count = 9;
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = at.x;
      positions[i * 3 + 1] = at.y;
      positions[i * 3 + 2] = at.z;
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 3.4,
          Math.random() * 2.6,
          (Math.random() - 0.5) * 3.4,
        ),
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = this.sparkMaterial.clone();
    material.color.setHex(color);

    const points = new THREE.Points(geometry, material);
    points.userData.noCollision = true;
    points.frustumCulled = false;
    this.scene.add(points);
    this.impacts.push({ points, velocities, life: 0.42 });
  }

  update(dt: number): void {
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.muzzleFlash.intensity = 0;
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      const material = tracer.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, tracer.life / tracer.maxLife) * 0.85;
      if (tracer.life <= 0) {
        this.scene.remove(tracer.mesh);
        material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      impact.life -= dt;

      const attribute = impact.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let p = 0; p < impact.velocities.length; p++) {
        const velocity = impact.velocities[p];
        velocity.y -= 9.2 * dt;
        attribute.setXYZ(
          p,
          attribute.getX(p) + velocity.x * dt,
          attribute.getY(p) + velocity.y * dt,
          attribute.getZ(p) + velocity.z * dt,
        );
      }
      attribute.needsUpdate = true;

      const material = impact.points.material as THREE.PointsMaterial;
      material.opacity = Math.max(0, impact.life / 0.42);

      if (impact.life <= 0) {
        this.scene.remove(impact.points);
        impact.points.geometry.dispose();
        material.dispose();
        this.impacts.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.mesh);
      (tracer.mesh.material as THREE.Material).dispose();
    }
    for (const impact of this.impacts) {
      this.scene.remove(impact.points);
      impact.points.geometry.dispose();
      (impact.points.material as THREE.Material).dispose();
    }
    this.tracers = [];
    this.impacts = [];
    this.muzzleFlash.intensity = 0;
  }

  dispose(): void {
    this.clear();
    this.tracerGeometry.dispose();
    this.tracerMaterial.dispose();
    this.sparkMaterial.dispose();
    this.muzzleFlash.removeFromParent();
  }
}
