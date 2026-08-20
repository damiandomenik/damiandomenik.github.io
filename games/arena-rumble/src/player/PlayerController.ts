import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import type { CollisionWorld, CapsuleResolveResult } from '../arena/CollisionWorld';
import { makeResolveResult } from '../arena/CollisionWorld';
import type { InputManager } from './InputManager';
import type { FirstPersonCamera } from '../camera/FirstPersonCamera';

/**
 * The local player's body.
 *
 * Movement is simulated here, on the owning client, and the resulting position
 * is reported to the host, which validates it (see HostAuthority). Full server
 * side movement with prediction and rollback would be the textbook answer, but
 * for eight friends on a peer to peer mesh it buys latency pain in exchange for
 * a cheat class nobody in a private room is going to exploit.
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  grounded = true;

  /** Set to false during the countdown and while dead. */
  movementEnabled = true;

  private resolve: CapsuleResolveResult = makeResolveResult();
  private coyoteTimer = 0;
  private jumpBuffer = 0;
  private readonly wishDirection = new THREE.Vector3();
  private readonly forwardVector = new THREE.Vector3();
  private readonly rightVector = new THREE.Vector3();

  constructor(
    private input: InputManager,
    private camera: FirstPersonCamera,
    private collision: CollisionWorld,
  ) {}

  teleport(position: THREE.Vector3, yaw: number): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.camera.setRotation(yaw, 0);
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + GAME_CONFIG.player.eyeHeight,
      this.position.z,
    );
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dt: number): void {
    const cfg = GAME_CONFIG.player;

    // -------------------------------------------------------------- look
    const delta = this.input.consumeMouseDelta();
    if (this.input.isLocked) this.camera.look(delta.x, delta.y);

    // ---------------------------------------------------------- movement
    const move = this.input.movement;
    const active = this.movementEnabled;

    this.forwardVector.set(-Math.sin(this.camera.yaw), 0, -Math.cos(this.camera.yaw));
    this.rightVector.set(Math.cos(this.camera.yaw), 0, -Math.sin(this.camera.yaw));

    this.wishDirection.set(0, 0, 0);
    if (active) {
      if (move.forward) this.wishDirection.add(this.forwardVector);
      if (move.backward) this.wishDirection.sub(this.forwardVector);
      if (move.right) this.wishDirection.add(this.rightVector);
      if (move.left) this.wishDirection.sub(this.rightVector);
    }
    const wishing = this.wishDirection.lengthSq() > 0;
    if (wishing) this.wishDirection.normalize();

    const targetSpeed = move.sprint && move.forward ? cfg.sprintSpeed : cfg.walkSpeed;
    const control = this.grounded ? 1 : cfg.airControl;

    if (wishing) {
      this.velocity.x += this.wishDirection.x * cfg.acceleration * control * dt;
      this.velocity.z += this.wishDirection.z * cfg.acceleration * control * dt;
    }

    // ground friction
    if (this.grounded) {
      const speed = this.horizontalSpeed;
      if (speed > 0) {
        const drop = speed * cfg.friction * dt * (wishing ? 0.55 : 1);
        const scale = Math.max(0, speed - drop) / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    // clamp horizontal speed
    const speed = this.horizontalSpeed;
    if (speed > targetSpeed) {
      const scale = targetSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // ------------------------------------------------------------- jump
    this.coyoteTimer = this.grounded ? 0.12 : Math.max(0, this.coyoteTimer - dt);
    this.jumpBuffer = active && move.jump ? 0.12 : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
      this.velocity.y = cfg.jumpVelocity;
      this.jumpBuffer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
    }

    this.velocity.y += cfg.gravity * dt;
    if (this.velocity.y < -55) this.velocity.y = -55;

    // ------------------------------------------------------ integrate
    // Substep so a fast player cannot tunnel through a thin wall.
    const steps = Math.min(4, Math.max(1, Math.ceil((this.velocity.length() * dt) / 0.25)));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.position.addScaledVector(this.velocity, stepDt);
      this.collision.resolveCapsule(
        this.position,
        cfg.radius,
        cfg.height,
        this.resolve,
      );
      const corrected = this.resolve.position;
      const pushedUp = corrected.y - this.position.y;
      this.position.copy(corrected);

      if (this.resolve.grounded) {
        if (this.velocity.y < 0) this.velocity.y = 0;
        this.grounded = true;
      } else if (pushedUp <= 0.0001) {
        this.grounded = false;
      }
      if (!this.resolve.grounded && this.velocity.y > 0 && pushedUp < -0.0001) {
        this.velocity.y = 0; // bonked the ceiling
      }
    }

    // Safety net: if somebody falls out of the world, put them back.
    if (this.position.y < -60) {
      this.position.set(0, 4, 0);
      this.velocity.set(0, 0, 0);
    }

    this.camera.update(this.eyePosition, this.horizontalSpeed, this.grounded, dt);
  }
}
