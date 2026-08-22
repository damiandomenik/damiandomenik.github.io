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

export class AbilityManager {
  constructor(game) {
    this.game = game;
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
  }

  /** Nahkampfangriff: trifft Remote-Spieler im Kegel vor dem Spieler. */
  doPunch() {
    const game = this.game;
    const p = game.localPlayer;
    const s = p.state;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const ox = s.pos.x + fx * 0.9, oy = s.pos.y + s.height * 0.62, oz = s.pos.z + fz * 0.9;
    game.fx.burst(ox, oy, oz, p.character.palette.visor, 10,
      { speed: 3.0, size: 0.13, life: 0.3, up: 0.35, gravity: 0.4 });

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
