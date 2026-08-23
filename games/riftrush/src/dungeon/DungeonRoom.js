import { Collider } from '../core/Physics.js';

/**
 * Builder-Kontext für einen Room.
 * Lokale Koordinaten: +X rechts, +Y oben, -Z = Laufrichtung (vorwärts).
 * Der Kontext übersetzt alles in Weltkoordinaten (origin) und sammelt
 * Boxen (Rendering), Collider (Physik), dynamische Objekte und Trigger.
 */
export class RoomContext {
  constructor(dungeon, origin, roomIndex) {
    this.dungeon = dungeon;
    this.origin = origin;               // { x, y, z }
    this.roomIndex = roomIndex;
  }

  // ---------- statische Geometrie ----------
  /** x/z = Mittelpunkt, y = Unterkante der Box (lokale Koordinaten). */
  box(x, y, z, w, h, d, kind = 'solid') {
    const wx = x + this.origin.x, wy = y + this.origin.y, wz = z + this.origin.z;
    this.dungeon.boxes.push({ x: wx, y: wy, z: wz, w, h, d, kind });
    const col = new Collider(wx, wy, wz, w, h, d, kind === 'hazard' ? 'hazard' : 'solid');
    this.dungeon.physics.add(col);
    return col;
  }

  /** Plattform: Oberkante liegt auf y. */
  plat(x, y, z, w, d, kind = 'solid', thickness = 0.8) {
    return this.box(x, y - thickness, z, w, thickness, d, kind);
  }

  wall(x, y, z, w, h, d, kind = 'solid') { return this.box(x, y, z, w, h, d, kind); }

  /**
   * Wallrun-Wand: nur an diesen Flächen kann der Spieler laufen.
   * Sie sind auch optisch markiert (eigenes Material + Leuchtstreifen),
   * damit sofort erkennbar ist, wo Wallrun vorgesehen ist.
   */
  runWall(x, y, z, w, h, d) {
    const col = this.box(x, y, z, w, h, d, 'runwall');
    col.runnable = true;
    return col;
  }

  hazard(x, y, z, w, h, d) {
    const wx = x + this.origin.x, wy = y + this.origin.y, wz = z + this.origin.z;
    this.dungeon.boxes.push({ x: wx, y: wy, z: wz, w, h, d, kind: 'hazard' });
    const col = new Collider(wx, wy, wz, w, h, d, 'hazard');
    this.dungeon.physics.add(col);
    return col;
  }

  // ---------- Trigger ----------
  trigger(x, y, z, w, h, d, data) {
    const col = new Collider(x + this.origin.x, y + this.origin.y, z + this.origin.z, w, h, d, 'trigger');
    col.userData = data;
    this.dungeon.physics.add(col);
    return col;
  }

  // ---------- dynamische Objekte ----------
  /**
   * Bewegliche Plattform.
   * axis: 'x' | 'y' | 'z', amp = Amplitude, speed = Zyklen pro Sekunde
   */
  moving(x, y, z, w, h, d, { axis = 'x', amp = 4, speed = 0.4, phase = 0, kind = 'accent' } = {}) {
    const base = { x: x + this.origin.x, y: y + this.origin.y, z: z + this.origin.z };
    const col = new Collider(base.x, base.y, base.z, w, h, d, kind === 'hazard' ? 'hazard' : 'solid');
    col.dynamic = true;
    this.dungeon.physics.add(col);
    const obj = {
      collider: col, kind, w, h, d, base, mesh: null,
      update(t) {
        const o = Math.sin((t * speed + phase) * Math.PI * 2) * amp;
        col.moveTo(base.x + (axis === 'x' ? o : 0), base.y + (axis === 'y' ? o : 0), base.z + (axis === 'z' ? o : 0));
      },
    };
    this.dungeon.dynamics.push(obj);
    return obj;
  }

  /** Verschwindende Plattform (deterministisch über die Match-Zeit). */
  blinker(x, y, z, w, d, { period = 3.0, phase = 0, onRatio = 0.62, thickness = 0.7 } = {}) {
    const col = new Collider(x + this.origin.x, y - thickness + this.origin.y, z + this.origin.z, w, thickness, d, 'solid');
    col.dynamic = true;
    this.dungeon.physics.add(col);
    const obj = {
      collider: col, kind: 'blink', w, h: thickness, d, mesh: null, on: true,
      base: { x: col.minX + w / 2, y: col.minY, z: col.minZ + d / 2 },
      update(t) {
        const p = ((t / period) + phase) % 1;
        obj.on = p < onRatio;
        col.active = obj.on;
      },
    };
    this.dungeon.dynamics.push(obj);
    return obj;
  }

  /** Tür / Barriere, die von einem Schalter geöffnet wird. */
  door(x, y, z, w, h, d, id) {
    const col = new Collider(x + this.origin.x, y + this.origin.y, z + this.origin.z, w, h, d, 'solid');
    col.dynamic = true;
    this.dungeon.physics.add(col);
    const obj = {
      collider: col, kind: 'door', w, h, d, mesh: null, open: false, id,
      base: { x: col.minX + w / 2, y: col.minY, z: col.minZ + d / 2 },
      update() {
        const target = obj.open ? obj.base.y - h * 1.05 : obj.base.y;
        const cur = col.minY;
        const ny = cur + (target - cur) * 0.12;
        col.moveTo(obj.base.x, ny, obj.base.z);
        col.active = !obj.open || Math.abs(ny - target) > 0.4;
      },
    };
    this.dungeon.dynamics.push(obj);
    this.dungeon.doors.set(id, obj);
    return obj;
  }

  /** Schalter-Pad: aktiviert eine Tür (netzwerksynchronisiert). */
  switchPad(x, y, z, doorId) {
    const pad = this.box(x, y, z, 3, 0.4, 3, 'switch');
    const trg = this.trigger(x, y, z, 3.4, 2.4, 3.4, { type: 'switch', doorId });
    return { pad, trg };
  }

  /**
   * Verfolgende Gefahrenwand.
   * Wichtig: sie parkt HINTER dem Eingang (zStart > 0) und ist inaktiv, bis der
   * Spieler tief genug im Room ist. Stünde sie auf Höhe des Checkpoints, würde
   * der Respawn direkt wieder in die Wand setzen — eine Endlos-Todesschleife.
   */
  chaseWall(zStart, width, height, speed, zEnd, triggerZ = -12) {
    const col = new Collider(this.origin.x, this.origin.y - 6, this.origin.z + zStart, width, height, 3, 'hazard');
    col.dynamic = true;
    col.active = false;
    this.dungeon.physics.add(col);
    const originZ = this.origin.z;
    const obj = {
      collider: col, kind: 'hazard', w: width, h: height, d: 3, mesh: null,
      started: false, z: zStart,
      base: { x: this.origin.x, y: this.origin.y - 6, z: originZ + zStart },
      reset() {
        obj.started = false;
        obj.z = zStart;
        col.active = false;
        col.moveTo(obj.base.x, obj.base.y, originZ + zStart);
      },
      update(t, dt, player) {
        if (!obj.started) {
          if (player && player.z < originZ + triggerZ && player.z > originZ + zEnd) {
            obj.started = true;
            col.active = true;
          } else return;
        }
        obj.z -= speed * dt;
        if (obj.z < zEnd) { obj.reset(); return; }
        col.moveTo(obj.base.x, obj.base.y, originZ + obj.z);
      },
    };
    this.dungeon.dynamics.push(obj);
    return obj;
  }

  /**
   * Steuerbare Kachel: Plattform mit eigenem Material, die zur Laufzeit
   * umgefärbt oder abgeschaltet werden kann (Boss-Arena: Einsturzböden,
   * Mechanismus-Podeste).
   * Zustände: 'normal' | 'active' | 'warn' | 'gone'
   */
  tile(x, y, z, w, d, { thickness = 0.9, state = 'normal' } = {}) {
    const col = new Collider(x + this.origin.x, y - thickness + this.origin.y, z + this.origin.z,
      w, thickness, d, 'solid');
    col.dynamic = true;
    this.dungeon.physics.add(col);
    const obj = {
      collider: col, kind: 'tile', w, h: thickness, d, mesh: null,
      visualState: state, _applied: null, shake: 0,
      base: { x: col.minX + w / 2, y: col.minY, z: col.minZ + d / 2 },
      setState(s) {
        obj.visualState = s;
        col.active = s !== 'gone';
      },
      update(t) {
        if (!obj.mesh) return;
        if (obj._applied !== obj.visualState) {
          obj._applied = obj.visualState;
          const m = obj.mesh.material;
          if (obj.visualState === 'warn') { m.emissive.setHex(0xff4d6d); m.emissiveIntensity = 0.85; }
          else if (obj.visualState === 'active') { m.emissive.setHex(0x38f2c8); m.emissiveIntensity = 0.8; }
          else { m.emissive.setHex(0x6f7bff); m.emissiveIntensity = 0.22; }
        }
        if (obj.visualState === 'warn') {
          const s = Math.sin(t * 22) * 0.06;
          col.moveTo(obj.base.x + s, obj.base.y, obj.base.z);
        } else if (obj.visualState !== 'gone' && (col.minX + w / 2) !== obj.base.x) {
          col.moveTo(obj.base.x, obj.base.y, obj.base.z);
        }
      },
    };
    this.dungeon.dynamics.push(obj);
    return obj;
  }

  light(x, y, z, color, intensity = 1.4, distance = 26) {
    this.dungeon.lights.push({ x: x + this.origin.x, y: y + this.origin.y, z: z + this.origin.z, color, intensity, distance });
  }
}

export class DungeonRoom {
  constructor(def, origin, index) {
    this.def = def;
    this.origin = origin;
    this.index = index;
    this.length = def.length;
    this.exitY = def.exitY || 0;
  }
  get entrance() { return { x: this.origin.x, y: this.origin.y, z: this.origin.z }; }
  get exit() { return { x: this.origin.x, y: this.origin.y + this.exitY, z: this.origin.z - this.length }; }
}
