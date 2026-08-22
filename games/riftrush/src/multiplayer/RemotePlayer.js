import { CONFIG as C } from '../core/Config.js';
import { PlayerCharacter } from '../player/PlayerCharacter.js';
import { lerp, lerpAngle } from '../core/Utils.js';

/**
 * Remote-Spieler mit Snapshot-Interpolation.
 * Snapshots kommen mit NET_TICK_RATE (20 Hz) an; gerendert wird mit
 * NET_INTERP_DELAY Verzögerung, dadurch bleibt die Bewegung trotz
 * Jitter/Paketverlust flüssig. Fehlen Pakete, wird kurz extrapoliert.
 *
 * Das Modell ist identisch zum lokalen Spieler — nur Farbe und Name
 * unterscheiden sich, damit im Rennen sofort lesbar ist, was andere tun.
 */
export class RemotePlayer {
  constructor(scene, { id, name, color }, fx = null) {
    this.id = id;
    this.name = name || 'Runner';
    this.color = color || 0xffffff;
    this.scene = scene;

    this.character = new PlayerCharacter({
      scene, fx, name: this.name, color: this.color, isLocal: false, nameplate: true,
    });

    this.buffer = [];
    this.render = { x: 0, y: 0, z: 0, r: 0 };
    this.state = 'idle';
    this.speed = 0;
    this.grounded = true;
    this.wallSide = 0;
    this.velocityY = 0;
    this.checkpoint = 0;
    this.finished = false;
    this.finishTime = null;
    this.lastPacket = performance.now();
    this._visual = {
      movementState: 'idle', speed: 0, isGrounded: true,
      isWallRunning: false, isDashing: false, wallSide: 0, velocityY: 0,
    };
  }

  setProfile({ name, color }) {
    if (name && name !== this.name) { this.name = name; this.character.setName(name); }
    if (color && color !== this.color) { this.color = color; this.character.setColor(color); }
  }

  /** Snapshot aus dem Netzwerk. */
  push(msg) {
    const now = performance.now();
    this.lastPacket = now;
    this.buffer.push({
      t: now, x: msg.x, y: msg.y, z: msg.z,
      vx: msg.vx || 0, vy: msg.vy || 0, vz: msg.vz || 0,
      r: msg.r, st: msg.st, w: msg.w || 0, g: msg.g,
    });
    if (this.buffer.length > C.NET_SNAPSHOT_BUFFER) this.buffer.shift();
    this.checkpoint = msg.cp ?? this.checkpoint;
    if (msg.f) this.finished = true;
    if (this.buffer.length === 1) {
      this.render.x = msg.x; this.render.y = msg.y; this.render.z = msg.z; this.render.r = msg.r;
    }
  }

  update(dt, camera) {
    const target = performance.now() - C.NET_INTERP_DELAY * 1000;
    const buf = this.buffer;
    let px = this.render.x, py = this.render.y, pz = this.render.z, pr = this.render.r;
    let st = this.state, w = this.wallSide, g = this.grounded, vy = this.velocityY;

    if (buf.length >= 2) {
      let a = null, b = null;
      for (let i = buf.length - 1; i > 0; i--) {
        if (buf[i - 1].t <= target && buf[i].t >= target) { a = buf[i - 1]; b = buf[i]; break; }
      }
      if (a && b) {
        const span = b.t - a.t || 1;
        const k = Math.min(1, Math.max(0, (target - a.t) / span));
        px = lerp(a.x, b.x, k); py = lerp(a.y, b.y, k); pz = lerp(a.z, b.z, k);
        pr = lerpAngle(a.r, b.r, k);
        const src = k > 0.5 ? b : a;
        st = src.st; w = src.w; g = src.g; vy = src.vy;
      } else {
        // Extrapolation (max 250 ms), wenn Pakete fehlen
        const last = buf[buf.length - 1];
        const ahead = Math.min(0.25, (target - last.t) / 1000);
        if (ahead > 0) {
          px = last.x + last.vx * ahead;
          py = last.y + last.vy * ahead;
          pz = last.z + last.vz * ahead;
          pr = last.r; st = last.st; w = last.w; g = last.g; vy = last.vy;
        }
      }
      while (buf.length > 2 && buf[1].t < target - 500) buf.shift();
    } else if (buf.length === 1) {
      const s = buf[0];
      px = s.x; py = s.y; pz = s.z; pr = s.r; st = s.st; w = s.w; g = s.g; vy = s.vy;
    }

    const k = 1 - Math.exp(-24 * dt);
    const dx = px - this.render.x, dz = pz - this.render.z;
    this.speed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    this.render.x = lerp(this.render.x, px, k);
    this.render.y = lerp(this.render.y, py, k);
    this.render.z = lerp(this.render.z, pz, k);
    this.render.r = lerpAngle(this.render.r, pr, k);
    this.state = st || 'idle';
    this.wallSide = w || 0;
    this.velocityY = vy || 0;
    this.grounded = g != null ? !!g : !['jump', 'fall', 'wallrun', 'dash'].includes(this.state);

    const v = this._visual;
    v.movementState = this.state;
    v.speed = this.speed;
    v.isGrounded = this.grounded;
    v.isWallRunning = this.state === 'wallrun';
    v.isDashing = this.state === 'dash';
    v.wallSide = this.wallSide;
    v.velocityY = this.velocityY;

    this.character.setTransform(this.render.x, this.render.y, this.render.z, this.render.r);
    this.character.updateAnimation(dt, v, camera);

    // Verbindung verloren -> ausblenden
    const silence = performance.now() - this.lastPacket;
    this.character.setVisible(silence < 4000);
  }

  flash() { this.character.flash(); }

  dispose() { this.character.dispose(); }
}
