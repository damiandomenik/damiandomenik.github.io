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
export const BOSS_PHASE = { IDLE: 'idle', ACTIVE: 'active', DONE: 'done' };

/* Angriffsfolge des Bosses. Der Takt zieht mit der Zeit an, damit Trödeln
 * teurer wird — der Boss ist die gemeinsame Bedrohung, das Rennen läuft aber
 * zwischen den Spielern. */
const ATTACKS = ['shock', 'sweep', 'proj', 'laser', 'shock', 'sweep', 'collapse', 'proj', 'laser', 'slam'];
const INTERVAL_START = 5.2;
const INTERVAL_MIN = 3.0;
/* Arenaweite Angriffe (Schockwelle, Laser, Rotorarme) treffen ueberall im Ring.
 * Zwei davon gleichzeitig sind nicht ausweichbar — man muesste zur selben Zeit
 * springen und die Ebene wechseln. Deshalb laeuft immer nur einer davon. */
const WIDE = new Set(['shock', 'laser', 'sweep']);
const INTERVAL_RAMP = 75;      // Sekunden bis zum schnellsten Takt
const SWEEP_INNER = 4.0;       // Rotorarme beginnen ausserhalb des Bosskoerpers

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
    /* Mechanismen sind PRO SPIELER. Wer sie berührt, schaltet sie nur für sich
     * frei — für die anderen zählt das nicht. Deshalb liegt der Zustand lokal
     * und wird nicht als gemeinsame Wahrheit synchronisiert. */
    this.mechanisms = [false, false, false];
    this.portalOpen = false;
    this.escaped = false;
    this.portalFirstBy = null;
    this.portalFirstAt = null;
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
    this._hud = { active: false, phase: '', mechanisms: 0, mechanismsTotal: 3, escapeMs: 0,
      warning: '', goal: '', goalDist: 0, portalOpen: false, escaped: false };
    this.peerProgress = new Map();
    this.invulnUntil = 0;      // kurze Schonzeit nach einem Respawn
    this.goalText = '';
    this.goalDist = 0;
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

    // Portal über der Arenamitte — erscheint erst, wenn dieser Spieler
    // alle drei Mechanismen berührt hat.
    this.mat.portal = new THREE.MeshBasicMaterial({
      color: COLORS.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.portal = new THREE.Group();
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.22, 8, 32), this.mat.portal);
    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.10, 6, 26), this.mat.portal);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 28), this.mat.portal);
    this.portal.add(ringOuter, ringInner, disc);
    this.portal.position.set(A.portal.x, A.portal.y, A.portal.z);
    this.portal.visible = false;
    this.portal.renderOrder = 2;
    this.scene.add(this.portal);
    this._portalParts = { ringOuter, ringInner, disc };

    // Wegweiser: Lichtsäule + Bodenring am aktuellen Ziel
    this.mat.goal = new THREE.MeshBasicMaterial({
      color: COLORS.goal, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.beacon = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 26, 12, 1, true), this.mat.goal);
    col.position.y = 13;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.5, 22), this.mat.goal);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    this.beacon.add(col, ring);
    this.beacon.visible = false;
    this.beacon.renderOrder = 2;
    this.scene.add(this.beacon);
    this._beaconRing = ring;

    // Sweep-Arme: rotieren auf Plattform- bzw. Kletterhöhe und zwingen dazu,
    // oben in Bewegung zu bleiben — dort war der Boss vorher harmlos.
    this.mat.sweep = new THREE.MeshBasicMaterial({
      color: COLORS.danger, transparent: true, opacity: 0.85, toneMapped: false,
    });
    this.sweep = new THREE.Group();
    /* Balken reichen exakt vom Bosskörper bis zur Arenawand — also genau über
     * den Bereich, in dem sie auch treffen (SWEEP_INNER .. radius). Vorher waren
     * sie 44 m lang und ragten 7 m durch die Wand und quer durch den Boss. */
    const barLen = A.radius - SWEEP_INNER;
    const barMid = SWEEP_INNER + barLen / 2;
    const barGeo = new THREE.BoxGeometry(0.62, 0.9, barLen);
    for (const off of [0, Math.PI]) {
      const bar = new THREE.Mesh(barGeo, this.mat.sweep);
      bar.position.set(Math.sin(off) * barMid, 0, Math.cos(off) * barMid);
      bar.rotation.y = off;
      this.sweep.add(bar);
    }
    this.sweepReach = { inner: SWEEP_INNER, outer: A.radius };
    this.sweep.visible = false;
    this.scene.add(this.sweep);

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

  _setPhase(phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.phaseStart = this.time;
    this.attackIndex = 0;
    this.nextAttackAt = this.time + 3.0;
    this.audio.phaseTransition({ phase });
    if (phase === BOSS_PHASE.ACTIVE) {
      this.model.setState('shielded');
      this.audio.bossIntro({});
    }
  }

  /** Vom lokalen Spieler ausgelöst (Trigger im Room). */
  activateMechanism(index, byId) {
    if (this.phase === BOSS_PHASE.IDLE || this.mechanisms[index] || this.escaped) return false;
    this.mechanisms[index] = true;
    const m = this.arena.mechanisms[index];
    if (m) {
      m.pad.setState('active');
      m.trigger.active = false;              // nur fuer diesen Client
      this.fx?.burst(m.world.x, m.world.y + 1.5, m.world.z, COLORS.accent, 16,
        { speed: 5, size: 0.2, life: 0.7, up: 1.2, gravity: 0.4 });
    }
    const done = this.mechanisms.filter(Boolean).length;
    this.audio.mechanismActivated({ index, done });
    // Nur zur Information der Mitspieler — nicht als gemeinsamer Zustand
    this.onEvent({ k: 'prog', n: done, by: byId });
    if (done === this.mechanisms.length) this._openPortal();
    return true;
  }

  /** Alle drei berührt: das Portal über der Arenamitte öffnet sich. */
  _openPortal() {
    if (this.portalOpen) return;
    this.portalOpen = true;
    this.arena.portalTrigger.active = true;
    this.model.setState('vulnerable');
    this.audio.shieldDestroyed({});
    this.audio.emit('boss:portal-open', {});
    const p = this.arena.portal;
    this.fx?.burst(p.x, p.y, p.z, COLORS.goal, 30,
      { speed: 8, size: 0.26, life: 0.9, up: 0.6, gravity: 0.1 });
  }

  /**
   * Vom lokalen Spieler ausgelöst: ins Portal gesprungen.
   * Gibt den Zielpunkt zurück, an den das Spiel den Spieler versetzt.
   */
  enterPortal(byId, raceTimeMs = 0) {
    if (!this.portalOpen || this.escaped) return null;
    this.escaped = true;
    this.arena.portalTrigger.active = false;
    const p = this.arena.portal;
    this.fx?.burst(p.x, p.y, p.z, COLORS.accent2, 26,
      { speed: 7, size: 0.22, life: 0.7, up: 0.4, gravity: 0.1 });
    this.audio.emit('boss:portal-enter', { by: byId });
    this.onEvent({ k: 'portal', by: byId, t: raceTimeMs });
    if (this.isHost) this._resolvePortal(byId, raceTimeMs);
    return this.arena.finalSpawn || null;
  }

  /**
   * Nur Host: wer war zuerst durch?
   * Entschieden wird über die RENNZEIT, nicht über die Reihenfolge der
   * Pakete — sonst gewinnt bei Latenz der mit der besseren Leitung.
   * Trifft später eine kleinere Zeit ein, wird korrigiert.
   */
  _resolvePortal(byId, raceTimeMs = 0) {
    if (this.portalFirstAt != null && raceTimeMs >= this.portalFirstAt) return;
    this.portalFirstBy = byId;
    this.portalFirstAt = raceTimeMs;
    this.onEvent({ k: 'first', by: byId, t: raceTimeMs });
  }

  /** Netzwerk-Ereignisse anwenden. */
  applyEvent(e, fromId) {
    switch (e.k) {
      case 'begin':
        if (this.phase === BOSS_PHASE.IDLE) this._setPhase(BOSS_PHASE.ACTIVE);
        break;
      case 'prog':
        // rein informativ: der Fortschritt der anderen zählt nicht fuer uns
        this.peerProgress.set(fromId, e.n);
        break;
      case 'portal':
        this.model.hit();
        this.audio.bossHit({ by: e.by || fromId });
        if (this.isHost) this._resolvePortal(e.by || fromId, e.t || 0);
        break;
      case 'first':
        this.portalFirstBy = e.by || fromId;
        this.portalFirstAt = e.t || 0;
        break;
      case 'atk':
        this._startAttack(e.a, e.s >>> 0);
        break;
    }
  }

  /** Zustand für Späteinsteiger. */
  snapshot() {
    // Nur gemeinsamer Zustand: Kampf laeuft, und wer zuerst durch war.
    // Die Mechanismen sind pro Spieler und werden bewusst NICHT uebertragen.
    return { p: this.phase, f: this.portalFirstBy, ft: this.portalFirstAt };
  }

  applySnapshot(s) {
    if (!s) return;
    this.portalFirstBy = s.f || null;
    this.portalFirstAt = s.ft ?? null;
    if (s.p && s.p !== this.phase) this._setPhase(s.p);
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
      if (anyone) { this._setPhase(BOSS_PHASE.ACTIVE); this.onEvent({ k: 'begin' }); }
    }

    // Angriffe planen (Host). Der Takt zieht mit der Kampfdauer an.
    if (this.isHost && this.phase === BOSS_PHASE.ACTIVE) {
      if (this.time >= this.nextAttackAt) {
        const a = ATTACKS[this.attackIndex % ATTACKS.length];
        if (WIDE.has(a) && this.active.some((x) => WIDE.has(x.kind))) {
          this.nextAttackAt = this.time + 0.8;      // warten, nicht ueberlagern
          return this;
        }
        this.attackIndex++;
        const seed = (this.rng() * 0xffffffff) >>> 0;
        const ramp = Math.min(1, (this.time - this.phaseStart) / INTERVAL_RAMP);
        this.nextAttackAt = this.time + (INTERVAL_START - (INTERVAL_START - INTERVAL_MIN) * ramp);
        this.onEvent({ k: 'atk', a, s: seed });
        this._startAttack(a, seed);
      }
    }
    this._updateBeacon(dt, local.state.pos);
    this._updatePortal(dt);

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

  _updatePortal(dt) {
    this.portal.visible = this.portalOpen && !this.escaped;
    if (!this.portal.visible) return;
    const t = this.time;
    this._portalParts.ringOuter.rotation.z = t * 0.8;
    this._portalParts.ringInner.rotation.z = -t * 1.5;
    this._portalParts.ringOuter.rotation.x = Math.sin(t * 0.4) * 0.15;
    this._portalParts.disc.scale.setScalar(0.9 + Math.sin(t * 3) * 0.08);
    this.mat.portal.opacity = 0.45 + Math.sin(t * 2.4) * 0.14;
    // sanftes Funkeln, damit es aus der Ferne auffällt
    if (this.fx && Math.random() < 0.35) {
      const a = Math.random() * Math.PI * 2;
      const p = this.arena.portal;
      this.fx.spawn(p.x + Math.cos(a) * 2.4, p.y + (Math.random() - 0.5) * 1.6, p.z + Math.sin(a) * 2.4,
        -Math.cos(a) * 1.2, 0.4, -Math.sin(a) * 1.2, COLORS.accent, 0.12, 0.6, 0.05);
    }
  }

  /**
   * Wegweiser auf das jeweils nächste Ziel: Mechanismus -> Kern -> Ausgang.
   * Ohne das weiß niemand, wie es weitergeht — die Arena ist groß.
   */
  _updateBeacon(dt, p) {
    const A = this.arena;
    let target = null, text = '';
    if (this.escaped) {
      this.beacon.visible = false;
      this.goalText = '';
      this.goalDist = 0;
      return;
    }
    if (this.portalOpen) {
      target = A.portal;
      text = 'PORTAL — HINEINSPRINGEN';
    } else if (this.phase !== BOSS_PHASE.IDLE) {
      let best = Infinity;
      for (let i = 0; i < this.mechanisms.length; i++) {
        if (this.mechanisms[i]) continue;
        const m = A.mechanisms[i];
        const d = Math.hypot(m.world.x - p.x, m.world.z - p.z);
        if (d < best) { best = d; target = m.world; }
      }
      const done = this.mechanisms.filter(Boolean).length;
      text = `MECHANISMUS ${done + 1}/${this.mechanisms.length}`;
    }

    if (!target) {
      this.beacon.visible = false;
      this.goalText = '';
      this.goalDist = 0;
      return;
    }
    this.beacon.visible = true;
    this.beacon.position.set(target.x, target.y ?? A.floorY, target.z);
    this._beaconRing.rotation.z += dt * 1.2;
    const pulse = 0.16 + Math.sin(this.time * 3) * 0.07;
    this.mat.goal.opacity = pulse;
    this.goalText = text;
    this.goalDist = Math.round(Math.hypot(target.x - p.x, target.z - p.z));
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
    else if (kind === 'laser') {
      at.warn = 1.6; at.dur = 3.4;
      at.data.a0 = rng() * Math.PI * 2;
      at.data.dir = rng.chance(0.5) ? 1 : -1;
      // mal knapp über dem Boden, mal auf Plattformhöhe
      at.data.y = this.arena.floorY + (rng.chance(0.45) ? 6.9 : 1.5);
      this.audio.laserWarning({ height: at.data.y });
    }
    else if (kind === 'proj') {
      at.warn = 1.5; at.dur = 2.6;
      at.data.spots = [];
      const n = this.portalOpen ? 6 : 4;
      const plats = this.arena.platforms || [];
      for (let i = 0; i < n; i++) {
        // Jeder dritte Einschlag zielt auf eine Hochplattform statt auf den Boden
        if (plats.length && i % 3 === 2) {
          const t = plats[Math.floor(rng() * plats.length)];
          at.data.spots.push({ x: t.world.x, y: t.world.y, z: t.world.z, hit: false });
        } else {
          const ang = rng() * Math.PI * 2, r = 5 + rng() * 17;
          at.data.spots.push({
            x: this.arena.center.x + Math.cos(ang) * r,
            y: this.arena.floorY,
            z: this.arena.center.z + Math.sin(ang) * r, hit: false,
          });
        }
      }
      this.audio.projectiles({ count: n });
    } else if (kind === 'slam') { at.warn = 1.2; at.dur = 1.4; }
    else if (kind === 'sweep') {
      at.warn = 1.3; at.dur = 3.6;
      // Drei Ebenen: Hochplattformen, Kletterroute und Laufsteg am Kern.
      // Ohne die dritte waere der Laufsteg ein voellig sicherer Hafen.
      at.data.y = this.arena.floorY + [6.6, 10.8, 13.2][rng.int(0, 2)];
      at.data.a0 = rng() * Math.PI * 2;
      at.data.dir = rng.chance(0.5) ? 1 : -1;
      this.audio.emit('boss:sweep', { height: at.data.y });
    }
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
      const y = at.data.y ?? A.laserY;
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
        if (d > 3 && Math.abs(along) > 0 && side < 1.3 && p.y < y + 0.9 && p.y > y - 2.4) {
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
          m.position.set(spots[i].x, (spots[i].y ?? A.floorY) + 0.08, spots[i].z);
          const s = 0.7 + (at.t / at.warn) * 0.4;
          m.scale.setScalar(s);
          const sh = this.shots[i];
          sh.visible = true;
          sh.position.set(spots[i].x, (spots[i].y ?? A.floorY) + 26 - (at.t / at.warn) * 8, spots[i].z);
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
        const gy = s.y ?? A.floorY;
        sh.position.y = gy + 18 * (1 - Math.min(1, u * 3.2));
        if (sh.position.y <= gy + 0.6) {
          s.hit = true;
          sh.visible = false;
          this.fx?.burst(s.x, gy + 0.3, s.z, COLORS.danger, 14, { speed: 6, size: 0.18, life: 0.5, up: 0.9, gravity: 1.2 });
          if (inside) {
            const d = Math.hypot(p.x - s.x, p.z - s.z);
            if (d < 3.4 && Math.abs(p.y - gy) < 3) {
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

    if (at.kind === 'sweep') {
      const y = at.data.y;
      const ang = at.data.a0 + (warming ? at.t * 0.25 : (u * 5.2 + at.warn * 0.25)) * at.data.dir;
      this.sweep.visible = true;
      this.sweep.position.set(A.center.x, y, A.center.z);
      this.sweep.rotation.y = ang;
      if (warming) {
        this.warning = 'ROTORARME';
        this.mat.sweep.opacity = 0.20 + Math.sin(at.t * 14) * 0.14;
        return true;
      }
      if (u > 1) return false;
      this.mat.sweep.opacity = 0.85;
      if (inside && this.time >= this.invulnUntil) {
        const dx = p.x - A.center.x, dz = p.z - A.center.z;
        const d = Math.hypot(dx, dz);
        const py = p.y + 0.9;                       // Körpermitte
        if (d > SWEEP_INNER - 0.5 && d < A.radius && Math.abs(py - y) < 1.5) {
          const pa = Math.atan2(dx, dz);            // Achse des Arms zeigt entlang +Z
          const tol = Math.atan2(1.0, d);
          let diff = Math.abs(((pa - ang + Math.PI) % (Math.PI * 2)) - Math.PI);
          diff = Math.min(diff, Math.abs(Math.PI - diff));
          if (diff < tol) this._hitPlayer(ctx, dx / (d || 1), dz / (d || 1), 0, 0, 'ROTORARM');
        }
      }
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
    if (at.kind === 'sweep') this.sweep.visible = false;
    if (at.kind === 'shock') this.shock.visible = false;
    if (at.kind === 'laser') { this.beam.visible = false; this.beamWarn.visible = false; }
    if (at.kind === 'proj') { this.marks.forEach((m) => (m.visible = false)); this.shots.forEach((s) => (s.visible = false)); }
  }

  /**
   * Treffer durch den Boss: zurück zum letzten Checkpoint.
   * Danach 2,5 s Schonzeit, sonst würde man beim Respawn direkt wieder in
   * dieselbe Schockwelle laufen. Gesammelte Mechanismen bleiben erhalten —
   * verloren geht Zeit und Position, nicht der Fortschritt.
   */
  _hitPlayer(ctx, nx, nz, force, up, label) {
    if (this.time < this.invulnUntil) return;
    this.invulnUntil = this.time + 3.0;
    ctx.controller?.addShake(1.2);
    this.audio.playerHit({ source: label });
    const p = ctx.localPlayer.state.pos;
    this.fx?.burst(p.x, p.y + 0.9, p.z, COLORS.danger, 18,
      { speed: 6, size: 0.18, life: 0.6, up: 0.8, gravity: 0.6 });
    if (ctx.onKill) ctx.onKill(label);
    else ctx.localPlayer.applyKnockback(nx * force, up, nz * force);
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


  /** Kompakter Zustand fürs HUD. */
  get hud() {
    const h = this._hud;            // wiederverwendet: kein Objekt pro Frame
    h.active = this.phase !== BOSS_PHASE.IDLE && this.phase !== BOSS_PHASE.DONE;
    h.phase = this.phase;
    h.mechanisms = this.mechanisms.filter(Boolean).length;
    h.mechanismsTotal = this.mechanisms.length;
    h.warning = this.warning;
    h.goal = this.goalText;
    h.goalDist = this.goalDist;
    h.portalOpen = this.portalOpen;
    h.escaped = this.escaped;
    h.escapeMs = 0;
    return h;
  }

  dispose() {
    this.model.dispose();
    this.scene.remove(this.shock, this.beam, this.beamWarn, this.beacon, this.portal, this.sweep);
    this.sweep.children.forEach((m) => m.geometry.dispose());
    this._portalParts && Object.values(this._portalParts).forEach((m) => m.geometry.dispose());
    this.beacon.children.forEach((c) => c.geometry.dispose());
    this.marks.forEach((m) => { this.scene.remove(m); m.geometry.dispose(); });
    this.shots.forEach((s) => { this.scene.remove(s); s.geometry.dispose(); });
    this.shock.geometry.dispose();
    this.beam.geometry.dispose();
    this.beamWarn.geometry.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
  }
}
