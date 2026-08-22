import * as THREE from 'three';
import { CONFIG as C } from '../core/Config.js';
import { clamp, damp } from '../core/Utils.js';

/**
 * Verbindet Input, Movement und Third-Person-Kamera.
 * Die Kamera folgt smooth, reagiert mit FOV auf Speed und
 * kollidiert mit der Level-Geometrie (kein Clipping durch Wände).
 */
export class PlayerController {
  constructor(player, camera, input, physics) {
    this.player = player;
    this.camera = camera;
    this.input = input;
    this.physics = physics;

    this.yaw = 0;
    this.pitch = -0.12;
    this.camDist = C.CAM_DISTANCE;
    this.target = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.shake = 0;
    this.roll = 0;
    this.enabled = true;
    this.cmd = { mx: 0, mz: 0, yaw: 0, sprint: false, crouch: false, jump: false, dash: false };
  }

  resetCamera() {
    const s = this.player.state;
    this.target.set(s.pos.x, s.pos.y + 1.5, s.pos.z);
    this.camPos.copy(this.target);
    this.camPos.z += C.CAM_DISTANCE;
  }

  buildCommand(frozen) {
    const { dx, dy } = this.input.consumeMouse();
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, C.PITCH_MIN, C.PITCH_MAX);

    const cmd = this.cmd;
    if (frozen || !this.enabled) {
      cmd.mx = 0; cmd.mz = 0; cmd.sprint = false; cmd.crouch = false; cmd.jump = false; cmd.dash = false;
    } else {
      const a = this.input.moveAxis();
      cmd.mx = a.x; cmd.mz = a.z;
      cmd.sprint = this.input.sprint;
      cmd.crouch = this.input.crouch;
      cmd.jump = this.input.jumpPressed;
      cmd.dash = this.input.dashPressed;
    }
    cmd.yaw = this.yaw;
    return cmd;
  }

  updateCamera(dt) {
    const s = this.player.state;
    const headY = s.pos.y + s.height * 0.85 + 0.15;
    /* Die Kamera hängt STARR an der Figur (wie in WoW): X und Z werden nicht
     * gedämpft, sonst wandert der Charakter beim Strafen aus der Bildmitte und
     * das Movement wirkt schwammig. Nur die Höhe wird geglättet, damit Stufen
     * und Landungen die Kamera nicht ruckeln lassen. */
    this.target.x = s.pos.x;
    this.target.z = s.pos.z;
    this.target.y = damp(this.target.y, headY, C.CAM_FOLLOW_Y, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = -Math.sin(this.yaw) * cp;
    const dirY = sp;
    const dirZ = -Math.cos(this.yaw) * cp;

    // Distanz leicht mit Speed erhöhen (nur Zoom, keine seitliche Verschiebung)
    const wanted = C.CAM_DISTANCE + Math.min(s.speed, 26) * 0.045;
    let dist = wanted;

    // Kollision: Ray vom Kopf nach hinten
    const hit = this.physics.raycast(this.target.x, this.target.y, this.target.z, -dirX, -dirY, -dirZ, wanted + 0.6);
    if (hit < wanted) dist = Math.max(C.CAM_MIN_DISTANCE, hit - 0.35);
    this.camDist = damp(this.camDist, dist, dist < this.camDist ? 40 : 8, dt);

    let cx = this.target.x - dirX * this.camDist;
    let cy = this.target.y - dirY * this.camDist + 0.35;
    let cz = this.target.z - dirZ * this.camDist;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3.2);
      const m = this.shake * 0.22;
      cx += (Math.random() - 0.5) * m;
      cy += (Math.random() - 0.5) * m;
      cz += (Math.random() - 0.5) * m;
    }

    this.camPos.set(cx, cy, cz);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.target.x, this.target.y + 0.25, this.target.z);

    // Wallrun-Roll: lookAt() überschreibt die Rotation, daher eigener
    // gedämpfter Wert, der DANACH auf die lokale Z-Achse gelegt wird.
    // Wandseite relativ zur Blickrichtung (1 = Wand rechts). Die Weltnormale
    // wäre hier falsch: der Roll hinge sonst von der Himmelsrichtung ab.
    const side = this.player.wallSide;
    const roll = s.wallrunning ? -0.1 * side : 0;
    this.roll = damp(this.roll, roll, 8, dt);
    this.camera.rotation.z = this.roll;

    // Dynamisches FOV
    let fov = C.CAM_FOV;
    if (s.state === 'dash') fov = C.CAM_FOV_DASH;
    else if (s.speed > 12) fov = C.CAM_FOV + (C.CAM_FOV_SPRINT - C.CAM_FOV) * Math.min(1, (s.speed - 12) / 8);
    this.camera.fov = damp(this.camera.fov, fov, 7, dt);
    this.camera.updateProjectionMatrix();
  }

  addShake(v) { this.shake = Math.min(1.6, this.shake + v); }
}
