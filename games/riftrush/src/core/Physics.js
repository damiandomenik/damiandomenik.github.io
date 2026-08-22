/**
 * Sehr leichtgewichtige AABB-Physik.
 * Alle Level-Geometrien sind achsenparallele Boxen -> extrem schnelle Kollision,
 * kein Physik-Framework nötig. Statische Boxen liegen in einem Spatial Hash,
 * bewegliche Plattformen in einer kleinen linearen Liste.
 */
const CELL = 6;

export class Collider {
  constructor(cx, y, cz, w, h, d, kind = 'solid') {
    this.kind = kind;                 // solid | hazard | trigger
    this.solid = kind === 'solid';
    this.active = true;
    this.runnable = false;      // nur markierte Wände erlauben Wallrun
    this.dynamic = false;
    this.delta = { x: 0, y: 0, z: 0 };
    this.userData = null;
    this.set(cx, y, cz, w, h, d);
  }
  /** cx/cz = Mittelpunkt, y = Unterkante */
  set(cx, y, cz, w, h, d) {
    this.minX = cx - w / 2; this.maxX = cx + w / 2;
    this.minY = y;          this.maxY = y + h;
    this.minZ = cz - d / 2; this.maxZ = cz + d / 2;
    this.w = w; this.h = h; this.d = d;
  }
  moveTo(cx, y, cz) {
    this.delta.x = cx - (this.minX + this.w / 2);
    this.delta.y = y - this.minY;
    this.delta.z = cz - (this.minZ + this.d / 2);
    this.set(cx, y, cz, this.w, this.h, this.d);
  }
}

export class PhysicsWorld {
  constructor() { this.clear(); }

  clear() {
    this.statics = [];
    this.dynamics = [];
    this.triggers = [];
    this.grid = new Map();
    this._scratch = [];
  }

  add(col) {
    if (col.kind === 'trigger') this.triggers.push(col);
    else if (col.dynamic) this.dynamics.push(col);
    else this.statics.push(col);
    return col;
  }

  build() {
    this.grid.clear();
    for (let i = 0; i < this.statics.length; i++) {
      const c = this.statics[i];
      const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
      const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = x * 73856093 ^ z * 19349663;
          let arr = this.grid.get(key);
          if (!arr) { arr = []; this.grid.set(key, arr); }
          arr.push(c);
        }
      }
    }
  }

  /** Alle Collider die eine Box überlappen könnten (statisch + dynamisch). */
  query(minX, minY, minZ, maxX, maxY, maxZ) {
    const out = this._scratch;
    out.length = 0;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(x * 73856093 ^ z * 19349663);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (!c.active) continue;
          if (out.indexOf(c) === -1) out.push(c);
        }
      }
    }
    for (let i = 0; i < this.dynamics.length; i++) {
      const c = this.dynamics[i];
      if (c.active) out.push(c);
    }
    return out;
  }

  static overlaps(c, minX, minY, minZ, maxX, maxY, maxZ) {
    return c.maxX > minX && c.minX < maxX &&
           c.maxY > minY && c.minY < maxY &&
           c.maxZ > minZ && c.minZ < maxZ;
  }

  /**
   * Bewegt eine Player-Kapsel (als AABB approximiert) und löst Kollisionen achsenweise auf.
   * p: { x, y, z } (y = Füße), r = Radius, h = Höhe
   * Rückgabe: Kollisionsinfo für das Movement-System.
   */
  movePlayer(p, r, h, dx, dy, dz, info) {
    info.grounded = false;
    info.ceiling = false;
    info.wallX = 0; info.wallZ = 0;
    info.wall = false;
    info.wallCol = null;
    info.ground = null;
    info.stepped = false;

    // --- X ---
    if (dx !== 0) {
      p.x += dx;
      const list = this.query(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.solid) continue;
        if (!PhysicsWorld.overlaps(c, p.x - r, p.y + 0.02, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
        const step = c.maxY - p.y;
        if (step > 0 && step <= 0.55 && dy <= 0) { p.y = c.maxY; info.stepped = true; continue; }
        if (dx > 0) { p.x = c.minX - r; info.wallX = -1; }
        else { p.x = c.maxX + r; info.wallX = 1; }
        info.wall = true;
        info.wallCol = c;
      }
    }

    // --- Z ---
    if (dz !== 0) {
      p.z += dz;
      const list = this.query(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.solid) continue;
        if (!PhysicsWorld.overlaps(c, p.x - r, p.y + 0.02, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
        const step = c.maxY - p.y;
        if (step > 0 && step <= 0.55 && dy <= 0) { p.y = c.maxY; info.stepped = true; continue; }
        if (dz > 0) { p.z = c.minZ - r; info.wallZ = -1; }
        else { p.z = c.maxZ + r; info.wallZ = 1; }
        info.wall = true;
        info.wallCol = c;
      }
    }

    // --- Y ---
    p.y += dy;
    const list = this.query(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.solid) continue;
      if (!PhysicsWorld.overlaps(c, p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
      if (dy <= 0 && p.y < c.maxY) {
        p.y = c.maxY; info.grounded = true; info.ground = c;
      } else if (dy > 0) {
        p.y = c.minY - h; info.ceiling = true;
      }
    }

    // Bodenkontakt auch bei dy == 0 (z.B. auf sinkender Plattform)
    if (!info.grounded) {
      const l2 = this.query(p.x - r, p.y - 0.08, p.z - r, p.x + r, p.y + 0.02, p.z + r);
      for (let i = 0; i < l2.length; i++) {
        const c = l2[i];
        if (!c.solid) continue;
        if (PhysicsWorld.overlaps(c, p.x - r * 0.95, p.y - 0.08, p.z - r * 0.95, p.x + r * 0.95, p.y + 0.02, p.z + r * 0.95)) {
          if (dy <= 0.001) { info.grounded = true; info.ground = c; p.y = Math.max(p.y, c.maxY); }
        }
      }
    }
    return info;
  }

  /** Prüft, ob die Spielerbox eine Hazard-Box berührt. */
  hitsHazard(p, r, h) {
    const list = this.query(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.kind !== 'hazard' || !c.active) continue;
      if (PhysicsWorld.overlaps(c, p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r)) return c;
    }
    return null;
  }

  /** Alle Trigger, die aktuell berührt werden. */
  triggersAt(p, r, h, out) {
    out.length = 0;
    for (let i = 0; i < this.triggers.length; i++) {
      const c = this.triggers[i];
      if (!c.active) continue;
      if (PhysicsWorld.overlaps(c, p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r)) out.push(c);
    }
    return out;
  }

  /** Ray gegen alle soliden Boxen; gibt Distanz oder Infinity. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    const minX = Math.min(ox, ox + dx * maxDist), maxX = Math.max(ox, ox + dx * maxDist);
    const minZ = Math.min(oz, oz + dz * maxDist), maxZ = Math.max(oz, oz + dz * maxDist);
    const minY = Math.min(oy, oy + dy * maxDist), maxY = Math.max(oy, oy + dy * maxDist);
    const list = this.query(minX, minY, minZ, maxX, maxY, maxZ);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.solid) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, c);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, c) {
  let tmin = -Infinity, tmax = Infinity;
  const inv = [1 / (dx || 1e-9), 1 / (dy || 1e-9), 1 / (dz || 1e-9)];
  const o = [ox, oy, oz];
  const lo = [c.minX, c.minY, c.minZ];
  const hi = [c.maxX, c.maxY, c.maxZ];
  for (let i = 0; i < 3; i++) {
    let t1 = (lo[i] - o[i]) * inv[i];
    let t2 = (hi[i] - o[i]) * inv[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return -1;
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : -1);
}
