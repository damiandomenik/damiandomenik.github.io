import { CONFIG as C } from '../core/Config.js';
import { PlayerMovement } from './PlayerMovement.js';
import { PlayerCharacter } from './PlayerCharacter.js';

/**
 * Lokaler Spieler: Movement + Race-Fortschritt + Interaktionen.
 * Die Darstellung übernimmt komplett PlayerCharacter — hier wird nur der
 * Bewegungszustand übergeben.
 */
export class LocalPlayer {
  constructor(scene, physics, { id, name, color }, fx = null) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.scene = scene;
    this.physics = physics;
    this.movement = new PlayerMovement(physics);
    this.state = PlayerMovement.createState();

    this.character = new PlayerCharacter({
      scene, fx, name, color, isLocal: true, nameplate: false,
    });

    this.checkpoint = 0;
    this.deaths = 0;
    this.falls = 0;
    this.finished = false;
    this.finishTime = null;
    this.respawnTimer = 0;
    this.punchCooldown = 0;
    this.spawn = { x: 0, y: 0, z: -3 };
    this._triggers = [];
    this._visual = {
      movementState: 'idle', speed: 0, isGrounded: true,
      isWallRunning: false, isDashing: false, wallSide: 0, velocityY: 0,
    };
    this.events = {};
  }

  emit(evt, payload) { this.events[evt]?.(payload); }

  setColor(color) { this.color = color; this.character.setColor(color); }
  setName(name) { this.name = name; this.character.setName(name); }

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
    this.syncCharacter(0);
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
    this.character.flash();
  }

  /** Wandseite relativ zur Blickrichtung: 1 = rechts, -1 = links, 0 = keine. */
  get wallSide() {
    const s = this.state;
    if (!s.wallrunning) return 0;
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    return (rx * -s.wallNormal.x + rz * -s.wallNormal.z) > 0 ? 1 : -1;
  }

  update(dt, cmd, dungeon, matchRunning, camera) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      this.state.vel.x = this.state.vel.z = 0;
      this.state.vel.y = 0;
      this.state.state = 'respawn';
      this.syncCharacter(dt, camera);
      return;
    }

    this.movement.update(this.state, cmd, dt);
    const s = this.state;

    // Sturz ins Nichts (Kill-Plane relativ zum letzten Checkpoint,
    // da der Dungeon absteigende Rooms enthalten kann)
    const cpPos = dungeon.checkpointPosition(this.checkpoint);
    if (s.pos.y < cpPos.y + C.KILL_Y) {
      this.falls++;
      this.respawnAt(cpPos);
      this.syncCharacter(dt, camera);
      return;
    }

    // Hazards
    if (this.physics.hitsHazard(s.pos, C.PLAYER_RADIUS, s.height)) {
      this.respawnAt(cpPos);
      this.syncCharacter(dt, camera);
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

    this.syncCharacter(dt, camera);
  }

  syncCharacter(dt, camera) {
    const s = this.state;
    const v = this._visual;
    v.movementState = s.state;
    v.speed = s.speed;
    v.isGrounded = s.grounded;
    v.isWallRunning = s.wallrunning;
    v.isDashing = s.dashing;
    v.wallSide = this.wallSide;
    v.velocityY = s.vel.y;

    this.character.setTransform(s.pos.x, s.pos.y, s.pos.z, s.yaw);
    this.character.setVisible(this.respawnTimer <= 0 || Math.sin(performance.now() * 0.03) > 0);
    this.character.updateAnimation(dt, v, camera);
  }

  /** Kompaktes Netzwerk-Paket. */
  netState() {
    const s = this.state;
    return {
      x: +s.pos.x.toFixed(2), y: +s.pos.y.toFixed(2), z: +s.pos.z.toFixed(2),
      vx: +s.vel.x.toFixed(1), vy: +s.vel.y.toFixed(1), vz: +s.vel.z.toFixed(1),
      r: +s.yaw.toFixed(3),
      st: s.state,
      w: this.wallSide,
      g: s.grounded ? 1 : 0,
      cp: this.checkpoint,
      f: this.finished ? 1 : 0,
    };
  }
}
