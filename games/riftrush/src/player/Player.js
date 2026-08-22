import * as THREE from 'three';
import { CONFIG as C } from '../core/Config.js';
import { PlayerMovement } from './PlayerMovement.js';

const BODY_GEO = new THREE.CapsuleGeometry(C.PLAYER_RADIUS, C.PLAYER_HEIGHT - C.PLAYER_RADIUS * 2, 4, 10);
const VISOR_GEO = new THREE.BoxGeometry(0.42, 0.14, 0.12);
const TRAIL_GEO = new THREE.BoxGeometry(0.5, 0.06, 0.5);

/** Namensschild als Canvas-Sprite. */
function makeNameplate(name, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,20,0.72)';
  ctx.roundRect?.(4, 12, 248, 40, 10);
  ctx.fill();
  ctx.font = 'bold 30px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
  ctx.fillText(name.slice(0, 14), 128, 33);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  spr.scale.set(2.0, 0.5, 1);
  return spr;
}

/** Erzeugt eine Spielerfigur (Capsule + Visier + Namensschild). */
export function createAvatar(name, color, withNameplate = true) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.28 });
  const body = new THREE.Mesh(BODY_GEO, mat);
  body.position.y = C.PLAYER_HEIGHT / 2;
  const visor = new THREE.Mesh(VISOR_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  visor.position.set(0, C.PLAYER_HEIGHT - 0.42, -C.PLAYER_RADIUS * 0.92);
  const trail = new THREE.Mesh(TRAIL_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0 }));
  trail.position.y = 0.05;
  group.add(body, visor, trail);
  const inner = new THREE.Group();
  inner.add(...group.children);
  group.add(inner);
  group.userData = { body, visor, trail, inner, mat };
  if (withNameplate) {
    const np = makeNameplate(name, color);
    np.position.y = C.PLAYER_HEIGHT + 0.55;
    group.add(np);
    group.userData.nameplate = np;
  }
  return group;
}

/** Visuelles Feedback für States (Slide-Squash, Wallrun-Tilt, Dash-Glow). */
export function poseAvatar(avatar, state, speed, dt) {
  const u = avatar.userData;
  if (!u) return;
  const crouchy = state === 'slide' || state === 'crouch';
  const targetY = crouchy ? 0.58 : 1;
  const targetTilt = state === 'wallrun' ? 0.32 : state === 'slide' ? 0.22 : 0;
  const k = 1 - Math.exp(-14 * dt);
  u.inner.scale.y += (targetY - u.inner.scale.y) * k;
  u.inner.scale.x += ((crouchy ? 1.18 : 1) - u.inner.scale.x) * k;
  u.inner.rotation.z += (targetTilt - u.inner.rotation.z) * k;
  u.mat.emissiveIntensity += (((state === 'dash') ? 1.1 : 0.28) - u.mat.emissiveIntensity) * k;
  u.trail.material.opacity += (((state === 'dash' || speed > 16) ? 0.5 : 0) - u.trail.material.opacity) * k;
  u.trail.scale.setScalar(1 + Math.min(speed, 30) * 0.06);
}

/** Lokaler Spieler: Movement + Race-Fortschritt + Interaktionen. */
export class LocalPlayer {
  constructor(scene, physics, { id, name, color }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.scene = scene;
    this.physics = physics;
    this.movement = new PlayerMovement(physics);
    this.state = PlayerMovement.createState();

    this.avatar = createAvatar(name, color, false);
    scene.add(this.avatar);

    this.checkpoint = 0;
    this.deaths = 0;
    this.falls = 0;
    this.finished = false;
    this.finishTime = null;
    this.respawnTimer = 0;
    this.punchCooldown = 0;
    this.spawn = { x: 0, y: 0, z: -3 };
    this._triggers = [];
    this.events = {};
  }

  emit(evt, payload) { this.events[evt]?.(payload); }

  reset(spawn) {
    this.spawn = { ...spawn };
    this.checkpoint = 0;
    this.deaths = 0;
    this.falls = 0;
    this.finished = false;
    this.finishTime = null;
    this.respawnTimer = 0;
    this.punchCooldown = 0;
    const s = this.state;
    Object.assign(s, PlayerMovement.createState());
    s.pos.x = spawn.x; s.pos.y = spawn.y; s.pos.z = spawn.z;
    this.syncAvatar(0);
  }

  respawnAt(pos, isDeath = true) {
    const s = this.state;
    s.pos.x = pos.x; s.pos.y = pos.y + 0.2; s.pos.z = pos.z;
    s.vel.x = s.vel.y = s.vel.z = 0;
    s.wallrunning = false; s.dashing = false; s.sliding = false;
    s.dashCooldown = 0; s.stunTimer = 0;
    this.respawnTimer = C.RESPAWN_TIME;
    if (isDeath) { this.deaths++; this.emit('death'); }
  }

  applyKnockback(dx, dy, dz) {
    const s = this.state;
    s.vel.x += dx; s.vel.y = Math.max(s.vel.y * 0.4 + dy, dy * 0.8); s.vel.z += dz;
    s.stunTimer = C.PUNCH_STUN;
    s.wallrunning = false;
  }

  update(dt, cmd, dungeon, matchRunning) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      this.state.vel.x = this.state.vel.z = 0;
      this.state.vel.y = 0;
      this.state.state = 'respawn';
      this.syncAvatar(dt);
      return;
    }

    this.movement.update(this.state, cmd, dt);
    const s = this.state;

    // Sturz ins Nichts (Kill-Plane relativ zum letzten Checkpoint,
    // da der Dungeon absteigende Rooms enthalten kann)
    const cpPos = dungeon.checkpointPosition(this.checkpoint);
    if (s.pos.y < cpPos.y + C.KILL_Y) {
      this.falls++;
      this.respawnAt(dungeon.checkpointPosition(this.checkpoint));
      this.syncAvatar(dt);
      return;
    }

    // Hazards
    if (this.physics.hitsHazard(s.pos, C.PLAYER_RADIUS, s.height)) {
      this.respawnAt(dungeon.checkpointPosition(this.checkpoint));
      this.syncAvatar(dt);
      return;
    }

    // Trigger
    const triggers = this.physics.triggersAt(s.pos, C.PLAYER_RADIUS, s.height, this._triggers);
    for (const t of triggers) {
      const d = t.userData;
      if (!d) continue;
      if (d.type === 'checkpoint' && d.index > this.checkpoint) {
        this.checkpoint = d.index;
        dungeon.checkpoints[d.index]?.activate();
        this.emit('checkpoint', d.index);
      } else if (d.type === 'switch') {
        if (!dungeon.doors.get(d.doorId)?.open) {
          dungeon.openDoor(d.doorId);
          this.emit('switch', d.doorId);
        }
      } else if (d.type === 'finish' && matchRunning && !this.finished) {
        this.finished = true;
        this.emit('finish');
      }
    }

    this.syncAvatar(dt);
  }

  syncAvatar(dt) {
    const s = this.state;
    this.avatar.position.set(s.pos.x, s.pos.y, s.pos.z);
    this.avatar.rotation.y = s.yaw;
    this.avatar.visible = this.respawnTimer <= 0 || Math.sin(performance.now() * 0.03) > 0;
    poseAvatar(this.avatar, s.state, s.speed, Math.min(dt, 0.05));
  }

  /** Kompaktes Netzwerk-Paket. */
  netState() {
    const s = this.state;
    return {
      x: +s.pos.x.toFixed(2), y: +s.pos.y.toFixed(2), z: +s.pos.z.toFixed(2),
      vx: +s.vel.x.toFixed(1), vy: +s.vel.y.toFixed(1), vz: +s.vel.z.toFixed(1),
      r: +s.yaw.toFixed(3),
      st: s.state,
      cp: this.checkpoint,
      f: this.finished ? 1 : 0,
    };
  }
}
