import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import { clamp, damp } from '../core/MathUtils';
import type { CollisionWorld } from '../arena/CollisionWorld';

/**
 * The camera an eliminated player gets. It sits behind and slightly above the
 * player it follows, eases into position, and pulls in when a wall would
 * otherwise end up between the camera and its subject.
 */
export class ThirdPersonSpectatorCamera {
  /** Free orbit offsets on top of the target's own facing. */
  private orbitYaw = 0;
  private orbitPitch = 0.18;
  private distance: number = GAME_CONFIG.spectator.followDistance;

  private readonly smoothedTarget = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private initialised = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private collision: CollisionWorld,
  ) {}

  reset(): void {
    this.initialised = false;
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
  }

  look(deltaX: number, deltaY: number): void {
    this.orbitYaw -= deltaX;
    this.orbitPitch = clamp(this.orbitPitch - deltaY, -0.55, 1.15);
  }

  zoom(amount: number): void {
    this.distance = clamp(this.distance + amount, 2.4, 11);
  }

  /**
   * @param targetPosition feet position of the followed player
   * @param targetYaw their facing, so the camera naturally sits behind them
   */
  update(targetPosition: THREE.Vector3, targetYaw: number, dt: number): void {
    const cfg = GAME_CONFIG.spectator;
    const focus = new THREE.Vector3(
      targetPosition.x,
      targetPosition.y + 1.35,
      targetPosition.z,
    );

    if (!this.initialised) {
      this.smoothedTarget.copy(focus);
      this.initialised = true;
    } else {
      const lambda = cfg.smoothing;
      this.smoothedTarget.set(
        damp(this.smoothedTarget.x, focus.x, lambda, dt),
        damp(this.smoothedTarget.y, focus.y, lambda, dt),
        damp(this.smoothedTarget.z, focus.z, lambda, dt),
      );
    }

    const yaw = targetYaw + this.orbitYaw;
    const pitch = this.orbitPitch;

    this.toCamera.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch) + cfg.followHeight / this.distance,
      Math.cos(yaw) * Math.cos(pitch),
    ).normalize();

    this.desired
      .copy(this.smoothedTarget)
      .addScaledVector(this.toCamera, this.distance);

    // Pull in if something solid is in the way.
    let allowed = this.distance;
    if (this.collision.ready) {
      const hit = this.collision.raycast(
        this.smoothedTarget,
        this.toCamera,
        this.distance + 0.4,
      );
      if (hit) allowed = Math.max(cfg.minDistance, hit.distance - 0.35);
    }

    this.desired
      .copy(this.smoothedTarget)
      .addScaledVector(this.toCamera, allowed);

    this.camera.position.lerp(this.desired, 1 - Math.exp(-16 * dt));
    this.camera.lookAt(this.smoothedTarget);
  }
}
