import * as THREE from 'three';
import { clamp, damp } from '../core/MathUtils';

const PITCH_LIMIT = Math.PI / 2 - 0.02;

/**
 * First person view. Used by *both* the alive grandstand spectators and the
 * fighters — the camera rule in the design doc is absolute: if you are alive,
 * you are in first person.
 */
export class FirstPersonCamera {
  yaw = 0;
  pitch = 0;

  private recoilPitch = 0;
  private bobTime = 0;
  private bobOffset = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX;
    this.pitch = clamp(this.pitch - deltaY, -PITCH_LIMIT, PITCH_LIMIT);
  }

  setRotation(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** Kick the view up after a shot; it settles back on its own. */
  addRecoil(amount: number): void {
    this.recoilPitch += amount;
  }

  update(eyePosition: THREE.Vector3, horizontalSpeed: number, grounded: boolean, dt: number): void {
    this.recoilPitch = damp(this.recoilPitch, 0, 7.5, dt);

    // subtle head bob, only while actually walking on the ground
    if (grounded && horizontalSpeed > 0.6) {
      this.bobTime += dt * (4.4 + horizontalSpeed * 0.62);
      this.bobOffset = Math.sin(this.bobTime) * 0.035 * Math.min(1, horizontalSpeed / 6);
    } else {
      this.bobOffset = damp(this.bobOffset, 0, 8, dt);
    }

    this.camera.position.set(
      eyePosition.x,
      eyePosition.y + this.bobOffset,
      eyePosition.z,
    );
    this.camera.rotation.set(
      clamp(this.pitch + this.recoilPitch, -PITCH_LIMIT - 0.2, PITCH_LIMIT + 0.2),
      this.yaw,
      0,
      'YXZ',
    );
  }

  /** Unit vector the player is aiming along. */
  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target
      .set(0, 0, -1)
      .applyEuler(new THREE.Euler(this.pitch + this.recoilPitch, this.yaw, 0, 'YXZ'))
      .normalize();
  }
}
