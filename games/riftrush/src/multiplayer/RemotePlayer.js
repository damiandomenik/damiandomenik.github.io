import { CONFIG as C } from '../core/Config.js';
import { createAvatar, poseAvatar } from '../player/Player.js';
import { lerp, lerpAngle } from '../core/Utils.js';

/**
 * Remote-Spieler mit Snapshot-Interpolation.
 * Snapshots kommen mit NET_TICK_RATE (20 Hz) an; gerendert wird mit
 * NET_INTERP_DELAY Verzögerung, dadurch bleibt die Bewegung trotz
 * Jitter/Paketverlust flüssig. Fehlen Pakete, wird kurz extrapoliert.
 */
export class RemotePlayer {
  constructor(scene, { id, name, color }) {
    this.id = id;
    this.name = name || 'Runner';
    this.color = color || 0xffffff;
    this.scene = scene;
    this.avatar = createAvatar(this.name, this.color, true);
    scene.add(this.avatar);

    this.buffer = [];                 // { t, x, y, z, vx, vy, vz, r, st }
    this.render = { x: 0, y: 0, z: 0, r: 0 };
    this.state = 'idle';
    this.speed = 0;
    this.checkpoint = 0;
    this.finished = false;
    this.finishTime = null;
    this.lastPacket = performance.now();
    this.flashTimer = 0;
    this._clockOffset = null;
  }

  setProfile({ name, color }) {
    if (name && name !== this.name) {
      this._disposeAvatar();
      this.avatar = createAvatar(name, color || this.color, true);
      this.scene.add(this.avatar);
      this.name = name;
    }
    if (color) this.color = color;
  }

  /** Snapshot aus dem Netzwerk. */
  push(msg) {
    const now = performance.now();
    this.lastPacket = now;
    // lokale Empfangszeit als Zeitbasis -> keine Uhrensynchronisation nötig
    this.buffer.push({
      t: now, x: msg.x, y: msg.y, z: msg.z,
      vx: msg.vx || 0, vy: msg.vy || 0, vz: msg.vz || 0,
      r: msg.r, st: msg.st,
    });
    if (this.buffer.length > C.NET_SNAPSHOT_BUFFER) this.buffer.shift();
    this.checkpoint = msg.cp ?? this.checkpoint;
    if (msg.f) this.finished = true;
    if (this.buffer.length === 1) {
      this.render.x = msg.x; this.render.y = msg.y; this.render.z = msg.z; this.render.r = msg.r;
    }
  }

  update(dt) {
    const target = performance.now() - C.NET_INTERP_DELAY * 1000;
    const buf = this.buffer;
    let px = this.render.x, py = this.render.y, pz = this.render.z, pr = this.render.r, st = this.state;

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
        st = k > 0.5 ? b.st : a.st;
      } else {
        // Extrapolation (max 250 ms), wenn Pakete fehlen
        const last = buf[buf.length - 1];
        const ahead = Math.min(0.25, (target - last.t) / 1000);
        if (ahead > 0) {
          px = last.x + last.vx * ahead;
          py = last.y + last.vy * ahead;
          pz = last.z + last.vz * ahead;
          pr = last.r; st = last.st;
        }
      }
      while (buf.length > 2 && buf[1].t < target - 500) buf.shift();
    } else if (buf.length === 1) {
      const s = buf[0];
      px = s.x; py = s.y; pz = s.z; pr = s.r; st = s.st;
    }

    const k = 1 - Math.exp(-24 * dt);
    const dx = px - this.render.x, dz = pz - this.render.z;
    this.speed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    this.render.x = lerp(this.render.x, px, k);
    this.render.y = lerp(this.render.y, py, k);
    this.render.z = lerp(this.render.z, pz, k);
    this.render.r = lerpAngle(this.render.r, pr, k);
    this.state = st || 'idle';

    this.avatar.position.set(this.render.x, this.render.y, this.render.z);
    this.avatar.rotation.y = this.render.r;
    poseAvatar(this.avatar, this.state, this.speed, Math.min(dt, 0.05));

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.avatar.userData.mat.emissiveIntensity = 1.4;
    }

    // Verbindung verloren -> ausblenden
    const silence = performance.now() - this.lastPacket;
    this.avatar.visible = silence < 4000;
  }

  flash() { this.flashTimer = 0.2; }

  _disposeAvatar() {
    this.scene.remove(this.avatar);
    const u = this.avatar.userData;
    u?.mat?.dispose();
    u?.nameplate?.material?.map?.dispose();
    u?.nameplate?.material?.dispose();
  }

  dispose() { this._disposeAvatar(); }
}
