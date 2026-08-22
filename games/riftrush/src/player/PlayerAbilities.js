import * as THREE from 'three';
import { CONFIG as C } from '../core/Config.js';

/**
 * Modulares Ability-System.
 * Jede Ability: { id, cooldown, canUse(ctx), use(ctx) }
 * Weitere Fähigkeiten (Shockwave, Trap, ...) lassen sich einfach registrieren.
 */
export class Ability {
  constructor({ id, cooldown, use, canUse }) {
    this.id = id;
    this.cooldown = cooldown;
    this.timer = 0;
    this._use = use;
    this._canUse = canUse;
  }
  get ready() { return this.timer <= 0; }
  get ratio() { return this.cooldown ? Math.max(0, this.timer / this.cooldown) : 0; }
  tick(dt) { this.timer = Math.max(0, this.timer - dt); }
  trigger(ctx) {
    if (!this.ready) return false;
    if (this._canUse && !this._canUse(ctx)) return false;
    this._use(ctx);
    this.timer = this.cooldown;
    return true;
  }
}

/** Kurzlebiger Punch-Effekt (Ring). */
function spawnPunchFx(scene, x, y, z, color) {
  const geo = new THREE.SphereGeometry(0.55, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, wireframe: true });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  scene.add(m);
  let life = 0.28;
  return {
    update(dt) {
      life -= dt;
      m.scale.multiplyScalar(1 + dt * 9);
      mat.opacity = Math.max(0, life / 0.28) * 0.8;
      if (life <= 0) { scene.remove(m); geo.dispose(); mat.dispose(); return false; }
      return true;
    },
  };
}

export class AbilityManager {
  constructor(game) {
    this.game = game;
    this.fx = [];
    this.abilities = new Map();

    this.register(new Ability({
      id: 'punch',
      cooldown: C.PUNCH_COOLDOWN,
      use: (ctx) => this.doPunch(ctx),
    }));
  }

  register(ab) { this.abilities.set(ab.id, ab); }
  get(id) { return this.abilities.get(id); }

  update(dt) {
    for (const ab of this.abilities.values()) ab.tick(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      if (!this.fx[i].update(dt)) this.fx.splice(i, 1);
    }
  }

  /** Nahkampfangriff: trifft Remote-Spieler im Kegel vor dem Spieler. */
  doPunch() {
    const game = this.game;
    const p = game.localPlayer;
    const s = p.state;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const ox = s.pos.x + fx * 0.6, oy = s.pos.y + s.height * 0.6, oz = s.pos.z + fz * 0.6;
    this.fx.push(spawnPunchFx(game.scene, ox, oy, oz, p.color));

    let hits = 0;
    for (const rp of game.remotePlayers.values()) {
      const dx = rp.render.x - s.pos.x;
      const dy = rp.render.y - s.pos.y;
      const dz = rp.render.z - s.pos.z;
      const dist = Math.hypot(dx, dy * 0.6, dz);
      if (dist > C.PUNCH_RANGE || dist < 0.001) continue;
      const dot = (dx / dist) * fx + (dz / dist) * fz;
      if (dot < C.PUNCH_ARC) continue;
      const l = Math.hypot(dx, dz) || 1;
      game.network.sendEventTo(rp.id, {
        t: 'hit',
        target: rp.id,
        kx: (dx / l) * C.PUNCH_KNOCKBACK,
        ky: C.PUNCH_KNOCKBACK_UP,
        kz: (dz / l) * C.PUNCH_KNOCKBACK,
      });
      rp.flash();
      hits++;
    }
    game.hud.toast(hits > 0 ? 'HIT!' : 'PUNCH');
  }
}
