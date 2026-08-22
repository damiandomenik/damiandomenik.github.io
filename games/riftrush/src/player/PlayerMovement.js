import { CONFIG as C } from '../core/Config.js';
import { PhysicsWorld } from '../core/Physics.js';

const info = { grounded: false, ceiling: false, wallX: 0, wallZ: 0, wall: false, ground: null, stepped: false };

/**
 * Arcade-Parkour-Movement.
 * Zustand liegt komplett im übergebenen `s`-Objekt (Player), damit
 * dieselbe Logik später auch server-seitig laufen kann.
 */
export class PlayerMovement {
  constructor(physics) {
    this.physics = physics;
  }

  static createState() {
    return {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      height: C.PLAYER_HEIGHT,
      grounded: false,
      wasGrounded: false,
      coyote: 0,
      jumpBuffer: 0,
      jumpsLeft: 1,
      sprinting: false,
      crouching: false,
      sliding: false,
      slideTimer: 0,
      slideCooldown: 0,
      wallrunning: false,
      wallTimer: 0,
      wallCooldown: 0,
      airLock: 0,
      wallNormal: { x: 0, z: 0 },
      dashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      dashCharges: C.DASH_AIR_CHARGES,
      stunTimer: 0,
      state: 'idle',
      speed: 0,
      groundPlatform: null,
    };
  }

  /**
   * @param s   Player-State (siehe createState)
   * @param cmd { mx, mz, yaw, sprint, crouch, jump, dash }
   */
  update(s, cmd, dt) {
    const r = C.PLAYER_RADIUS;
    s.yaw = cmd.yaw;

    // ---- Timer ----
    s.dashCooldown = Math.max(0, s.dashCooldown - dt);
    s.slideCooldown = Math.max(0, s.slideCooldown - dt);
    s.wallCooldown = Math.max(0, s.wallCooldown - dt);
    s.airLock = Math.max(0, s.airLock - dt);
    s.stunTimer = Math.max(0, s.stunTimer - dt);
    s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
    if (cmd.jump) s.jumpBuffer = C.JUMP_BUFFER;

    const stunned = s.stunTimer > 0;

    // ---- Wunschrichtung (kamerarelativ) ----
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    let wx = 0, wz = 0;
    if (!stunned) {
      wx = cmd.mx * cos - cmd.mz * sin;
      wz = -cmd.mx * sin - cmd.mz * cos;
    }
    const hasInput = wx !== 0 || wz !== 0;

    // ---- Crouch / Slide ----
    const wantCrouch = cmd.crouch && !stunned;
    const horizSpeed = Math.hypot(s.vel.x, s.vel.z);

    if (wantCrouch && s.grounded && !s.sliding && s.slideCooldown <= 0 && horizSpeed > C.SLIDE_MIN_SPEED) {
      s.sliding = true;
      s.slideTimer = C.SLIDE_TIME;
      const l = horizSpeed || 1;
      const boost = Math.max(C.SLIDE_SPEED, horizSpeed * 1.12);
      s.vel.x = (s.vel.x / l) * boost;
      s.vel.z = (s.vel.z / l) * boost;
    }
    if (s.sliding) {
      s.slideTimer -= dt;
      if (!wantCrouch || s.slideTimer <= 0 || (s.grounded && horizSpeed < 4.5)) {
        s.sliding = false;
        s.slideCooldown = C.SLIDE_COOLDOWN;
      }
    }
    s.crouching = wantCrouch && !s.sliding;

    // Höhe anpassen (Aufstehen nur wenn Platz)
    const targetH = (s.crouching || s.sliding) ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
    if (targetH > s.height) {
      const list = this.physics.query(s.pos.x - r, s.pos.y + s.height, s.pos.z - r,
        s.pos.x + r, s.pos.y + targetH, s.pos.z + r);
      let blocked = false;
      for (const c of list) {
        if (c.solid && PhysicsWorld.overlaps(c, s.pos.x - r, s.pos.y + s.height + 0.02, s.pos.z - r,
          s.pos.x + r, s.pos.y + targetH, s.pos.z + r)) { blocked = true; break; }
      }
      if (!blocked) s.height = targetH;
    } else s.height = targetH;

    // ---- Sprint ----
    s.sprinting = cmd.sprint && !s.crouching && !stunned && (hasInput || !s.grounded);

    // ---- Dash ----
    if (cmd.dash && !stunned && s.dashCooldown <= 0 && (s.grounded || s.dashCharges > 0)) {
      let dx = wx, dz = wz;
      if (!hasInput) { dx = -sin; dz = -cos; }
      const l = Math.hypot(dx, dz) || 1;
      s.dashing = true;
      s.dashTimer = C.DASH_TIME;
      s.dashCooldown = C.DASH_COOLDOWN;
      s.dashDir = { x: dx / l, z: dz / l };
      if (!s.grounded) s.dashCharges--;
      s.vel.y = Math.max(s.vel.y, 1.2);
      s.wallrunning = false;
    }
    if (s.dashing) {
      s.dashTimer -= dt;
      s.vel.x = s.dashDir.x * C.DASH_FORCE;
      s.vel.z = s.dashDir.z * C.DASH_FORCE;
      s.vel.y *= 0.72;
      if (s.dashTimer <= 0) {
        s.dashing = false;
        s.vel.x *= 0.62; s.vel.z *= 0.62;
      }
    }

    // ---- Wallrun ----
    const wallDot = s.wallNormal.x * -wx + s.wallNormal.z * -wz;
    if (s.wallrunning) {
      s.wallTimer -= dt;
      const stillFast = Math.hypot(s.vel.x, s.vel.z) > C.WALLRUN_MIN_SPEED * 0.6;
      if (s.grounded || s.wallTimer <= 0 || !stillFast || wantCrouch) this._endWallrun(s);
      else {
        // Tangente entlang der Wand
        let tx = -s.wallNormal.z, tz = s.wallNormal.x;
        if (tx * s.vel.x + tz * s.vel.z < 0) { tx = -tx; tz = -tz; }
        const spd = C.WALLRUN_SPEED;
        s.vel.x = tx * spd - s.wallNormal.x * C.WALLRUN_STICK;
        s.vel.z = tz * spd - s.wallNormal.z * C.WALLRUN_STICK;
        s.vel.y -= C.WALLRUN_GRAVITY * dt;
        if (s.vel.y < -6) s.vel.y = -6;
      }
    }

    // ---- Jump / Walljump / Doublejump ----
    if (s.jumpBuffer > 0 && !stunned) {
      if (s.wallrunning) {
        // 1. Geschwindigkeitsanteil IN die Wand entfernen (Wallrun drückt aktiv dagegen)
        const intoV = -(s.vel.x * s.wallNormal.x + s.vel.z * s.wallNormal.z);
        if (intoV > 0) { s.vel.x += s.wallNormal.x * intoV; s.vel.z += s.wallNormal.z * intoV; }
        // 2. Absprung
        s.vel.y = C.WALLJUMP_FORCE;
        s.vel.x += s.wallNormal.x * C.WALLJUMP_PUSH;
        s.vel.z += s.wallNormal.z * C.WALLJUMP_PUSH;
        // 3. Eingabe nur berücksichtigen, soweit sie nicht zurück in die Wand zeigt
        if (hasInput) {
          const into = -(wx * s.wallNormal.x + wz * s.wallNormal.z);
          const ix = into > 0 ? wx + s.wallNormal.x * into : wx;
          const iz = into > 0 ? wz + s.wallNormal.z * into : wz;
          s.vel.x += ix * 3.5; s.vel.z += iz * 3.5;
        }
        this._endWallrun(s);
        s.airLock = C.WALLJUMP_LOCK;
        s.jumpBuffer = 0;
        s.jumpsLeft = 1;
        s.grounded = false;
      } else if (s.grounded || s.coyote > 0) {
        s.vel.y = C.JUMP_FORCE;
        if (s.sliding) { s.vel.x *= 1.06; s.vel.z *= 1.06; s.sliding = false; }
        s.grounded = false;
        s.coyote = 0;
        s.jumpBuffer = 0;
        s.jumpsLeft = 1;
      } else if (s.jumpsLeft > 0) {
        s.vel.y = C.DOUBLE_JUMP_FORCE;
        s.jumpsLeft--;
        s.jumpBuffer = 0;
        if (hasInput) {
          const l = Math.hypot(s.vel.x, s.vel.z);
          const target = Math.max(l, C.PLAYER_SPEED);
          s.vel.x = wx * target; s.vel.z = wz * target;
        }
      }
    }

    // ---- Horizontale Beschleunigung ----
    if (!s.dashing && !s.wallrunning) {
      const maxSpeed = s.sliding ? C.SLIDE_SPEED
        : s.crouching ? C.CROUCH_SPEED
        : s.sprinting ? C.SPRINT_SPEED : C.PLAYER_SPEED;

      if (s.grounded) {
        if (s.sliding) {
          const f = Math.exp(-C.FRICTION_SLIDE * dt);
          s.vel.x *= f; s.vel.z *= f;
          if (hasInput) { s.vel.x += wx * 6 * dt; s.vel.z += wz * 6 * dt; }
        } else if (hasInput) {
          this._accelerate(s, wx, wz, maxSpeed, C.ACCEL_GROUND, dt);
          const f = Math.exp(-C.FRICTION_GROUND * 0.25 * dt);
          s.vel.x *= f; s.vel.z *= f;
        } else {
          const f = Math.exp(-C.FRICTION_GROUND * dt);
          s.vel.x *= f; s.vel.z *= f;
        }
      } else {
        // direkt nach einem Walljump ist die Luftsteuerung kurz gedämpft
        const airMul = s.airLock > 0 ? 0.25 : 1;
        if (hasInput) this._accelerate(s, wx, wz, maxSpeed, C.ACCEL_AIR * C.AIR_CONTROL * airMul, dt);
        const f = Math.exp(-C.FRICTION_AIR * dt);
        s.vel.x *= f; s.vel.z *= f;
      }
    }

    // ---- Gravitation ----
    if (!s.wallrunning && !s.dashing) {
      s.vel.y -= C.GRAVITY * dt;
      if (s.vel.y < -C.MAX_FALL_SPEED) s.vel.y = -C.MAX_FALL_SPEED;
    }

    // ---- Bewegliche Plattform mitnehmen ----
    if (s.groundPlatform && s.groundPlatform.dynamic && s.groundPlatform.active) {
      s.pos.x += s.groundPlatform.delta.x;
      s.pos.y += s.groundPlatform.delta.y;
      s.pos.z += s.groundPlatform.delta.z;
    }

    // ---- Kollision / Bewegung ----
    s.wasGrounded = s.grounded;
    this.physics.movePlayer(s.pos, r, s.height, s.vel.x * dt, s.vel.y * dt, s.vel.z * dt, info);

    s.grounded = info.grounded;
    s.groundPlatform = info.ground;
    if (info.grounded) {
      if (s.vel.y < 0) s.vel.y = 0;
      s.jumpsLeft = 1;
      s.dashCharges = C.DASH_AIR_CHARGES;
      s.coyote = C.COYOTE_TIME;
      s.airLock = 0;
      if (s.wallrunning) this._endWallrun(s);
    } else {
      s.coyote = Math.max(0, s.coyote - dt);
    }
    if (info.ceiling && s.vel.y > 0) s.vel.y = 0;

    // Wandkontakt -> Wallrun starten
    if (info.wall) {
      // bei Eckenkontakt können beide Achsen gesetzt sein -> normalisieren
      let nx = info.wallX, nz = info.wallZ;
      const nl = Math.hypot(nx, nz);
      if (nl > 0) { nx /= nl; nz /= nl; }
      const speedNow = Math.hypot(s.vel.x, s.vel.z);
      const into = (-nx) * wx + (-nz) * wz;
      if (!s.grounded && !s.wallrunning && !s.dashing && s.wallCooldown <= 0 &&
          speedNow > C.WALLRUN_MIN_SPEED && hasInput && into > 0.15 && s.vel.y < 6 && !wantCrouch) {
        s.wallrunning = true;
        s.wallTimer = C.WALLRUN_MAX_TIME;
        s.wallNormal.x = nx; s.wallNormal.z = nz;
        s.vel.y = Math.max(s.vel.y, C.WALLRUN_UPKICK);
        s.jumpsLeft = 1;
      } else if (!s.wallrunning) {
        if (nx !== 0) s.vel.x = 0;
        if (nz !== 0) s.vel.z = 0;
      }
      s.wallNormalLast = { x: nx, z: nz };
    } else if (s.wallrunning) {
      this._endWallrun(s);
    }

    // ---- State für Netzwerk / Animation ----
    s.speed = Math.hypot(s.vel.x, s.vel.z);
    s.state = s.dashing ? 'dash'
      : s.wallrunning ? 'wallrun'
      : s.sliding ? 'slide'
      : !s.grounded ? (s.vel.y > 0.5 ? 'jump' : 'fall')
      : s.crouching ? 'crouch'
      : s.speed > 11 ? 'sprint'
      : s.speed > 0.6 ? 'run' : 'idle';
    return s;
  }

  /**
   * Arcade-Beschleunigung mit Momentum-Erhalt.
   * Wichtig: die klassische Quake-Formel (Projektion auf die Wunschrichtung)
   * unterdrückt seitliche Eingaben, sobald man vorwärts auf Maxspeed ist —
   * dadurch wäre Wallrun praktisch nicht ansteuerbar. Stattdessen wird direkt
   * in die Wunschrichtung beschleunigt und die Gesamtgeschwindigkeit begrenzt.
   * Die Obergrenze ist nie kleiner als die aktuelle Speed, d. h. Dash-, Slide-
   * und Walljump-Momentum bleiben erhalten und werden nur über Reibung abgebaut.
   */
  _accelerate(s, wx, wz, maxSpeed, accel, dt) {
    const l = Math.hypot(wx, wz) || 1;
    const dx = wx / l, dz = wz / l;
    const cur = Math.hypot(s.vel.x, s.vel.z);
    const cap = Math.max(cur, maxSpeed);
    s.vel.x += dx * accel * dt;
    s.vel.z += dz * accel * dt;
    const ns = Math.hypot(s.vel.x, s.vel.z);
    if (ns > cap) { const f = cap / ns; s.vel.x *= f; s.vel.z *= f; }
  }

  _endWallrun(s) {
    s.wallrunning = false;
    s.wallTimer = 0;
    s.wallCooldown = C.WALLRUN_COOLDOWN;
    s.wallNormal.x = 0; s.wallNormal.z = 0;
  }
}
