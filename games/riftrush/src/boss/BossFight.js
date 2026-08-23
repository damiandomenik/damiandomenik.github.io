import * as THREE from 'three';
import { COLORS } from '../core/Config.js';
import { makeRng } from '../core/Utils.js';
import { BossModel } from './BossModel.js';

/**
 * Boss-Encounter "Rift Guardian".
 *
 * Kein HP-Balken, kein RPG-Kampf: der Boss erzeugt Bewegungsaufgaben.
 * Drei Phasen —
 *   1) SHIELD  drei Mechanismen per Parkour aktivieren (Schockwelle, Geschosse)
 *   2) CORE    über Wallrun/Lift zum offenen Kern (Laser, Einsturz, Schockwelle)
 *   3) ESCAPE  30 s Countdown, Arena bricht zusammen, Rennen zum Ausgang
 *
 * Autorität: der Host schaltet Phasen und plant Angriffe; verschickt werden nur
 * seltene, ereignisbasierte Nachrichten (kein High-Frequency-Traffic).
 * Treffer wertet jeder Client für den eigenen Spieler aus — wie beim
 * bestehenden Knockback-System.
 */
export const BOSS_PHASE = { IDLE: 'idle', SHIELD: 'shield', CORE: 'core', ESCAPE: 'escape', DONE: 'done' };

const ATTACKS = {
  shield: ['shock', 'proj', 'shock', 'proj', 'slam'],
  core: ['laser', 'shock', 'collapse', 'proj', 'laser', 'slam'],
  escape: ['shock', 'proj', 'laser', 'shock'],
};
const INTERVAL = { shield: 4.6, core: 3.8, escape: 2.9 };
export const ESCAPE_SECONDS = 30;

export class BossFight {
  constructor({ scene, dungeon, arena, fx, audio, seed = 1 }) {
    this.scene = scene;
    this.dungeon = dungeon;
    this.arena = arena;
    this.fx = fx;
    this.audio = audio;
    this.rng = makeRng(seed >>> 0);

    this.isHost = false;
    this.phase = BOSS_PHASE.IDLE;
    this.mechanisms = [false, false, false];
    this.coreFirstBy = null;
    this.escapeEndsAt = 0;
    this.phaseStart = 0;
    this.time = 0;
    this.nextAttackAt = 0;
    this.attackIndex = 0;
    this.collapseIndex = 0;
    this.nextCollapseAt = 0;
    this.warning = '';
    this.onEvent = () => {};          // wird vom Game ins Netzwerk gereicht

    this.model = new BossModel(scene, arena.bossPos);
    this._buildVisuals();
    this.active = [];                  // laufende Angriffe
    this._hud = { active: false, phase: '', mechanisms: 0, mechanismsTotal: 3, escapeMs: 0, warning: '' };
  }

  // ================================================================ Visuals
  _buildVisuals() {
    const A = this.arena;
    this.mat = {
      shock: new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.75, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }),
      telegraph: new THREE.MeshBasicMaterial({ color: COLORS.risk, transparent: true, opacity: 0.35, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }),
      laser: new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
      mark: new THREE.MeshBasicMaterial({ color: COLORS.risk, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      shot: new THREE.MeshBasicMaterial({ color: COLORS.danger, toneMapped: false }),
    };

    this.shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.42, 6, 40), this.mat.shock);
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.visible = false;
    this.scene.add(this.shock);

    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, A.radius * 2), this.mat.laser);
    this.beam.visible = false;
    this.scene.add(this.beam);
    this.beamWarn = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, A.radius * 2), this.mat.telegraph);
    this.beamWarn.visible = false;
    this.scene.add(this.beamWarn);

    this.marks = [];
    this.shots = [];
    const ringGeo = new THREE.RingGeometry(1.6, 3.2, 20);
    const shotGeo = new THREE.OctahedronGeometry(0.9, 0);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(ringGeo, this.mat.mark);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.marks.push(m);
      const s = new THREE.Mesh(shotGeo, this.mat.shot);
      s.visible = false;
      this.scene.add(s);
      this.shots.push(s);
    }
  }

  // ================================================================ Steuerung
  setHost(v) { this.isHost = !!v; }

  /** Ist eine Position innerhalb der Arena? */
  inArena(p) {
    return p.x > this.arena.minX && p.x < this.arena.maxX &&
           p.z > this.arena.minZ && p.z < this.arena.maxZ &&
           p.y > this.arena.floorY - 12;
  }

  _setPhase(phase, extra = {}) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.phaseStart = this.time;
    this.attackIndex = 0;
    this.nextAttackAt = this.time + (phase === BOSS_PHASE.SHIELD ? 3.0 : 2.0);
    this.audio.phaseTransition({ phase });

    if (phase === BOSS_PHASE.SHIELD) {
      this.model.setState('shielded');
      this.audio.bossIntro({});
    } else if (phase === BOSS_PHASE.CORE) {
      this.model.setState('vulnerable');
      this.arena.coreTrigger.active = true;
      this.audio.shieldDestroyed({});
    } else if (phase === BOSS_PHASE.ESCAPE) {
      this.model.setState('unstable');
      this.arena.coreTrigger.active = false;
      this.escapeEndsAt = this.time + ESCAPE_SECONDS;
      this.nextCollapseAt = this.time + 1.5;
      this.collapseIndex = 0;
      this.dungeon.openDoor(this.arena.doorId);
      if (extra.first) this.coreFirstBy = extra.first;
      this.audio.escapeCountdown({ seconds: ESCAPE_SECONDS });
    }
  }

  /** Vom lokalen Spieler ausgelöst (Trigger im Room). */
  activateMechanism(index, byId) {
    if (this.phase !== BOSS_PHASE.SHIELD || this.mechanisms[index]) return false;
    this._applyMechanism(index);
    this.onEvent({ k: 'mech', i: index, by: byId });
    return true;
  }

  _applyMechanism(index) {
    if (this.mechanisms[index]) return;
    this.mechanisms[index] = true;
    const m = this.arena.mechanisms[index];
    if (m) {
      m.pad.setState('active');
      m.trigger.active = false;
      this.fx?.burst(m.world.x, m.world.y + 1.5, m.world.z, COLORS.accent, 16,
        { speed: 5, size: 0.2, life: 0.7, up: 1.2, gravity: 0.4 });
    }
    this.audio.mechanismActivated({ index, done: this.mechanisms.filter(Boolean).length });
  }

  /** Vom lokalen Spieler ausgelöst: Kern berührt. */
  hitCore(byId) {
    if (this.phase !== BOSS_PHASE.CORE) return false;
    this.model.hit();
    this.audio.bossHit({ by: byId });
    this.fx?.burst(this.arena.center.x, this.arena.coreY, this.arena.center.z, COLORS.goal, 24,
      { speed: 7, size: 0.24, life: 0.8, up: 0.8, gravity: 0.2 });
    this.onEvent({ k: 'core', by: byId });
    if (this.isHost) this._resolveCoreHit(byId);
    return true;
  }

  /** Nur Host: entscheidet, wer zuerst am Kern war. */
  _resolveCoreHit(byId) {
    if (this.coreFirstBy) return;
    this.coreFirstBy = byId;
    this.onEvent({ k: 'phase', p: BOSS_PHASE.ESCAPE, first: byId });
    this._setPhase(BOSS_PHASE.ESCAPE, { first: byId });
  }

  /** Netzwerk-Ereignisse anwenden. */
  applyEvent(e, fromId) {
    switch (e.k) {
      case 'begin':
        if (this.phase === BOSS_PHASE.IDLE) this._setPhase(BOSS_PHASE.SHIELD);
        break;
      case 'mech':
        this._applyMechanism(e.i);
        break;
      case 'core':
        this.model.hit();
        this.audio.bossHit({ by: e.by || fromId });
        if (this.isHost) this._resolveCoreHit(e.by || fromId);
        break;
      case 'phase':
        this._setPhase(e.p, { first: e.first });
        break;
      case 'atk':
        this._startAttack(e.a, e.s >>> 0);
        break;
    }
  }

  /** Zustand für Späteinsteiger. */
  snapshot() {
    return {
      p: this.phase, m: this.mechanisms.slice(), f: this.coreFirstBy,
      e: this.phase === BOSS_PHASE.ESCAPE ? Math.max(0, this.escapeEndsAt - this.time) : 0,
    };
  }

  applySnapshot(s) {
    if (!s) return;
    for (let i = 0; i < 3; i++) if (s.m && s.m[i]) this._applyMechanism(i);
    this.coreFirstBy = s.f || null;
    if (s.p && s.p !== this.phase) this._setPhase(s.p, { first: s.f });
    if (s.p === BOSS_PHASE.ESCAPE && s.e) this.escapeEndsAt = this.time + s.e;
  }

  // ================================================================ Update
  update(dt, ctx) {
    this.time += dt;
    this.model.update(dt);
    this.warning = '';

    const local = ctx.localPlayer;
    const inside = this.inArena(local.state.pos);

    // Kampf beginnt, sobald jemand die Arena betritt (Host entscheidet)
    if (this.phase === BOSS_PHASE.IDLE && this.isHost) {
      let anyone = inside;
      if (!anyone && ctx.remotePlayers) {
        for (const rp of ctx.remotePlayers.values()) if (this.inArena(rp.render)) { anyone = true; break; }
      }
      if (anyone) { this._setPhase(BOSS_PHASE.SHIELD); this.onEvent({ k: 'begin' }); }
    }

    // Alle Mechanismen aktiv -> Schild fällt (Host)
    if (this.isHost && this.phase === BOSS_PHASE.SHIELD && this.mechanisms.every(Boolean)) {
      this.onEvent({ k: 'phase', p: BOSS_PHASE.CORE });
      this._setPhase(BOSS_PHASE.CORE);
    }

    // Angriffe planen (Host)
    if (this.isHost && this.phase !== BOSS_PHASE.IDLE && this.phase !== BOSS_PHASE.DONE) {
      if (this.time >= this.nextAttackAt) {
        const list = ATTACKS[this.phase] || ATTACKS.shield;
        const a = list[this.attackIndex % list.length];
        this.attackIndex++;
        const seed = (this.rng() * 0xffffffff) >>> 0;
        this.nextAttackAt = this.time + (INTERVAL[this.phase] || 4);
        this.onEvent({ k: 'atk', a, s: seed });
        this._startAttack(a, seed);
      }
    }

    if (this.phase === BOSS_PHASE.ESCAPE) this._updateEscape(dt);

    // laufende Angriffe
    for (let i = this.active.length - 1; i >= 0; i--) {
      const at = this.active[i];
      at.t += dt;
      if (!this._stepAttack(at, dt, ctx, inside)) {
        this._endAttack(at);
        this.active.splice(i, 1);
      }
    }
    return this;
  }

  // ---------------------------------------------------------------- Angriffe
  _startAttack(kind, seed) {
    if (kind === 'collapse') { this._collapseWave(seed, 3); return; }
    // Schockwelle, Laser und Geschosse teilen sich feste Meshes. Zwei gleiche
    // Angriffe parallel würden sich die Visuals gegenseitig wegnehmen.
    if (this.active.some((a) => a.kind === kind)) return;
    const rng = makeRng(seed);
    const at = { kind, t: 0, rng, seed, phase: 'warn', data: {} };
    if (kind === 'shock') { at.warn = 1.15; at.dur = 2.4; this.audio.shockwave({}); }
    else if (kind === 'laser') { at.warn = 1.6; at.dur = 4.6; at.data.a0 = rng() * Math.PI * 2; at.data.dir = rng.chance(0.5) ? 1 : -1; this.audio.laserWarning({}); }
    else if (kind === 'proj') {
      at.warn = 1.5; at.dur = 2.6;
      at.data.spots = [];
      const n = 4 + (this.phase === BOSS_PHASE.SHIELD ? 0 : 2);
      for (let i = 0; i < n; i++) {
        const ang = rng() * Math.PI * 2, r = 5 + rng() * 17;
        at.data.spots.push({ x: this.arena.center.x + Math.cos(ang) * r, z: this.arena.center.z + Math.sin(ang) * r, hit: false });
      }
      this.audio.projectiles({ count: n });
    } else if (kind === 'slam') { at.warn = 1.2; at.dur = 1.4; }
    this.active.push(at);
  }

  _stepAttack(at, dt, ctx, inside) {
    const A = this.arena;
    const local = ctx.localPlayer;
    const p = local.state.pos;
    const warming = at.t < at.warn;
    const u = (at.t - at.warn) / at.dur;

    if (at.kind === 'shock') {
      const maxR = A.radius + 4;
      if (warming) {
        this.warning = 'SCHOCKWELLE';
        this.shock.visible = true;
        this.shock.material = this.mat.telegraph;
        this.shock.position.set(A.center.x, A.floorY + 0.25, A.center.z);
        const s = 2 + Math.sin(at.t * 12) * 0.5;
        this.shock.scale.set(s, s, 1.6);
        return true;
      }
      if (u > 1) return false;
      const r = 2 + u * maxR;
      this.shock.material = this.mat.shock;
      this.shock.scale.set(r, r, 1.5);
      this.mat.shock.opacity = 0.8 * (1 - u * 0.7);
      // Treffer: am Boden im Ring -> muss übersprungen werden
      if (inside && !at.data.hitLocal) {
        const d = Math.hypot(p.x - A.center.x, p.z - A.center.z);
        if (Math.abs(d - r) < 1.5 && p.y < A.floorY + 1.4) {
          at.data.hitLocal = true;
          this._hitPlayer(ctx, (p.x - A.center.x) / (d || 1), (p.z - A.center.z) / (d || 1), 17, 7.5, 'SCHOCKWELLE');
        }
      }
      return true;
    }

    if (at.kind === 'laser') {
      const ang = at.data.a0 + (warming ? 0 : u * 2.2 * at.data.dir);
      const y = A.laserY;
      const set = (mesh) => {
        mesh.visible = true;
        mesh.position.set(A.center.x, y, A.center.z);
        mesh.rotation.set(0, ang, 0);
      };
      if (warming) { this.warning = 'LASER'; set(this.beamWarn); this.mat.telegraph.opacity = 0.25 + Math.sin(at.t * 14) * 0.2; return true; }
      if (u > 1) return false;
      this.beamWarn.visible = false;
      set(this.beam);
      if (!at.data.fired) { at.data.fired = true; this.audio.laserFire({}); }
      if (inside && (at.data.cool || 0) <= 0) {
        const dx = p.x - A.center.x, dz = p.z - A.center.z;
        const d = Math.hypot(dx, dz);
        // Strahlachse: der Balken zeigt entlang -Z, um ang gedreht
        const bx = -Math.sin(ang), bz = -Math.cos(ang);
        const along = dx * bx + dz * bz;
        const side = Math.abs(dx * -bz + dz * bx);
        if (d > 3 && Math.abs(along) > 0 && side < 1.3 && p.y < A.laserY + 0.9) {
          at.data.cool = 0.8;
          this._hitPlayer(ctx, dx / (d || 1), dz / (d || 1), 13, 6.5, 'LASER');
        }
      }
      if (at.data.cool > 0) at.data.cool -= dt;
      return true;
    }

    if (at.kind === 'proj') {
      const spots = at.data.spots;
      if (warming) {
        this.warning = 'EINSCHLAG';
        for (let i = 0; i < spots.length && i < this.marks.length; i++) {
          const m = this.marks[i];
          m.visible = true;
          m.position.set(spots[i].x, A.floorY + 0.08, spots[i].z);
          const s = 0.7 + (at.t / at.warn) * 0.4;
          m.scale.setScalar(s);
          const sh = this.shots[i];
          sh.visible = true;
          sh.position.set(spots[i].x, A.floorY + 26 - (at.t / at.warn) * 8, spots[i].z);
          sh.rotation.y += dt * 4;
        }
        this.mat.mark.opacity = 0.35 + Math.sin(at.t * 16) * 0.25;
        return true;
      }
      if (u > 1) return false;
      for (let i = 0; i < spots.length && i < this.shots.length; i++) {
        const sh = this.shots[i];
        const s = spots[i];
        if (s.hit) { sh.visible = false; this.marks[i].visible = false; continue; }
        sh.position.y = A.floorY + 18 * (1 - Math.min(1, u * 3.2));
        if (sh.position.y <= A.floorY + 0.6) {
          s.hit = true;
          sh.visible = false;
          this.fx?.burst(s.x, A.floorY + 0.3, s.z, COLORS.danger, 14, { speed: 6, size: 0.18, life: 0.5, up: 0.9, gravity: 1.2 });
          if (inside) {
            const d = Math.hypot(p.x - s.x, p.z - s.z);
            if (d < 3.4 && p.y < A.floorY + 3) {
              this._hitPlayer(ctx, (p.x - s.x) / (d || 1), (p.z - s.z) / (d || 1), 14, 8, 'EINSCHLAG');
            }
          }
        }
      }
      return true;
    }

    if (at.kind === 'tile') {
      if (at.t < at.warn) return true;
      if (!at.data.gone) {
        at.data.gone = true;
        at.tile.setState('gone');
        const b = at.tile.base;
        this.fx?.burst(b.x, b.y, b.z, COLORS.danger, 10, { speed: 4, size: 0.16, life: 0.5, up: 0.4, gravity: 1.4 });
      }
      if (at.t > at.warn + at.dur) { at.tile.setState('normal'); return false; }
      return true;
    }

    if (at.kind === 'slam') {
      if (warming) {
        this.warning = 'STAMPFER';
        if (!at.data.armed) { at.data.armed = true; this.model.slam(); this.audio.bossSlam({}); }
        return true;
      }
      if (u > 1) return false;
      if (!at.data.done) {
        at.data.done = true;
        this.fx?.burst(A.center.x, A.floorY + 0.4, A.center.z, COLORS.danger, 22, { speed: 9, size: 0.2, life: 0.6, up: 0.5, gravity: 1 });
        ctx.controller?.addShake(1.1);
        if (inside) {
          const dx = p.x - A.center.x, dz = p.z - A.center.z;
          const d = Math.hypot(dx, dz);
          if (d < 13 && p.y < A.floorY + 6) {
            this._hitPlayer(ctx, dx / (d || 1), dz / (d || 1), 22, 9, 'STAMPFER');
          }
        }
      }
      return true;
    }
    return false;
  }

  _endAttack(at) {
    // Nur ausblenden, wenn kein weiterer Angriff derselben Art die Meshes nutzt
    if (this.active.some((a) => a !== at && a.kind === at.kind)) return;
    if (at.kind === 'shock') this.shock.visible = false;
    if (at.kind === 'laser') { this.beam.visible = false; this.beamWarn.visible = false; }
    if (at.kind === 'proj') { this.marks.forEach((m) => (m.visible = false)); this.shots.forEach((s) => (s.visible = false)); }
  }

  _hitPlayer(ctx, nx, nz, force, up, label) {
    ctx.localPlayer.applyKnockback(nx * force, up, nz * force);
    ctx.controller?.addShake(0.9);
    this.audio.playerHit({ source: label });
    ctx.onHit?.(label);
  }

  /** Einsturzwelle: markiert Kacheln, lässt sie kurz verschwinden. */
  _collapseWave(seed, count) {
    const rng = makeRng(seed);
    const pool = this.arena.tiles.filter((t) => t.collapsible && t.visualState !== 'gone');
    this.audio.floorCollapse({ count });
    for (let i = 0; i < count && pool.length; i++) {
      const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      t.setState('warn');
      this.active.push({
        kind: 'tile', t: 0, warn: 1.4, dur: 4.5, tile: t,
        rng: null, data: {}, phase: 'warn',
      });
    }
  }

  _updateEscape(dt) {
    if (this.time >= this.nextCollapseAt) {
      const pool = this.arena.tiles.filter((t) => t.collapsible && t.visualState === 'normal');
      if (pool.length) {
        const t = pool[Math.floor(this.rng() * pool.length)];
        t.setState('warn');
        this.active.push({ kind: 'tile', t: 0, warn: 1.0, dur: 1e6, tile: t, data: {}, phase: 'warn' });
      }
      this.nextCollapseAt = this.time + 2.2;
    }
  }

  get escapeRemainingMs() {
    if (this.phase !== BOSS_PHASE.ESCAPE) return 0;
    return Math.max(0, (this.escapeEndsAt - this.time) * 1000);
  }

  /** Kompakter Zustand fürs HUD. */
  get hud() {
    const h = this._hud;            // wiederverwendet: kein Objekt pro Frame
    h.active = this.phase !== BOSS_PHASE.IDLE && this.phase !== BOSS_PHASE.DONE;
    h.phase = this.phase;
    h.mechanisms = this.mechanisms.filter(Boolean).length;
    h.mechanismsTotal = this.mechanisms.length;
    h.escapeMs = this.escapeRemainingMs;
    h.warning = this.warning;
    return h;
  }

  dispose() {
    this.model.dispose();
    this.scene.remove(this.shock, this.beam, this.beamWarn);
    this.marks.forEach((m) => { this.scene.remove(m); m.geometry.dispose(); });
    this.shots.forEach((s) => { this.scene.remove(s); s.geometry.dispose(); });
    this.shock.geometry.dispose();
    this.beam.geometry.dispose();
    this.beamWarn.geometry.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
  }
}
