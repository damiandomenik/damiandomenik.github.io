// SKYFALL — game.js
// Hauptschleife, Spielerlogik, Kampf, Host-Autorität, HUD, Lobby-Anbindung.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildIsland, Sky, CloudField, Rain, Lighting, WEATHER, CORE_MAX_HP, ISLAND_RADIUS } from './world.js';
import { buildAircraft, buildPilot, AIRCRAFT_SPECS, WEAPONS, TEAM_COLOR } from './models.js';
import { FX } from './fx.js';
import { sfx } from './audio.js';
import { net } from './multiplayer.js';

/* ================================================================== *
 *  Konstanten
 * ================================================================== */

const FOOT_Y        = 0.6;     // Oberkante des Insel-Decks
const PLAYER_HP     = 100;
const PLAYER_R      = 0.45;
const PLAYER_H      = 1.8;
const WALK          = 9.5;
const SPRINT        = 15;
const JUMP          = 9.0;
const GRAVITY       = 26;
const RESPAWN_TIME  = 3.0;
const MATCH_TIME    = 15 * 60;
const NET_RATE      = 1 / 20;
const DEATH_FLOOR   = -400;    // darunter ist man aus der Welt gefallen

const $ = (id) => document.getElementById(id);

/* ================================================================== *
 *  Globaler Zustand
 * ================================================================== */

const G = {
  scene: null, camera: null, renderer: null, composer: null, bloom: null,
  sky: null, clouds: null, rain: null, lighting: null, fx: null,
  islands: {}, remotes: new Map(), projectiles: [], projPool: [],
  me: null, weather: 'sunset', running: false, over: false,
  clock: null, time: 0, shake: 0, netAcc: 0, hostAcc: 0,
  matchTime: MATCH_TIME, intro: 0,
  coreHp: { blue: CORE_MAX_HP, red: CORE_MAX_HP },
  // Host-Only
  hostState: { hp: new Map(), dead: new Map(), lastHit: new Map(), destroyed: { blue: new Set(), red: new Set() } },
  lightning: 0, lightningT: 6
};

window.SKYFALL = G; // Debug-Zugriff

/* ================================================================== *
 *  Renderer / Szene
 * ================================================================== */

function initRenderer() {
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 12000);
  camera.position.set(0, 20, -820);
  G.camera = camera;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.55, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  G.composer = composer;
  G.bloom = bloom;

  G.sky = new Sky(scene);
  G.clouds = new CloudField(scene);
  G.rain = new Rain(scene);
  G.lighting = new Lighting(scene);
  G.fx = new FX(scene);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
}

function buildWorld() {
  G.islands.blue = buildIsland('blue');
  G.islands.red = buildIsland('red');
  G.scene.add(G.islands.blue.group, G.islands.red.group);
  initProjectilePool();
  applyWeather(G.weather);
}

function applyWeather(name) {
  const w = WEATHER[name] || WEATHER.sunset;
  G.weather = name;
  G.sky.apply(w);
  G.clouds.apply(w);
  G.lighting.apply(w);
  G.rain.setActive(!!w.rain);
  G.scene.fog = new THREE.FogExp2(w.fog, w.fogDensity);
  G.bloom.strength = w.bloom;
}

/* ================================================================== *
 *  Kollision
 * ================================================================== */

function islandOf(team) { return G.islands[team]; }

function nearestIsland(pos) {
  const b = G.islands.blue, r = G.islands.red;
  return pos.distanceToSquared(b.center) < pos.distanceToSquared(r.center) ? b : r;
}

function overIsland(pos, island, margin = 0) {
  const dx = pos.x - island.center.x, dz = pos.z - island.center.z;
  return dx * dx + dz * dz < (island.radius * 0.94 + margin) ** 2;
}

// Bewegt einen Kapsel-Spieler und löst Kollisionen mit den Insel-Boxen auf.
// Gibt zurück, ob der Spieler Bodenkontakt hat.
function moveWithCollision(pos, vel, dt) {
  pos.addScaledVector(vel, dt);
  let grounded = false;
  const island = nearestIsland(pos);

  // Deckboden
  if (overIsland(pos, island) && pos.y < FOOT_Y) {
    pos.y = FOOT_Y;
    if (vel.y < 0) vel.y = 0;
    grounded = true;
  }

  const min = new THREE.Vector3(pos.x - PLAYER_R, pos.y, pos.z - PLAYER_R);
  const max = new THREE.Vector3(pos.x + PLAYER_R, pos.y + PLAYER_H, pos.z + PLAYER_R);

  for (const box of island.colliders) {
    if (max.x <= box.min.x || min.x >= box.max.x) continue;
    if (max.y <= box.min.y || min.y >= box.max.y) continue;
    if (max.z <= box.min.z || min.z >= box.max.z) continue;

    const ox = Math.min(max.x - box.min.x, box.max.x - min.x);
    const oy = Math.min(max.y - box.min.y, box.max.y - min.y);
    const oz = Math.min(max.z - box.min.z, box.max.z - min.z);

    if (oy <= ox && oy <= oz) {
      if (pos.y + PLAYER_H / 2 > (box.min.y + box.max.y) / 2) {
        pos.y = box.max.y;                 // oben aufsetzen
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      } else {
        pos.y = box.min.y - PLAYER_H;      // Kopf anstoßen
        if (vel.y > 0) vel.y = 0;
      }
    } else if (ox <= oz) {
      pos.x += (max.x - box.min.x < box.max.x - min.x) ? -ox : ox;
      vel.x = 0;
    } else {
      pos.z += (max.z - box.min.z < box.max.z - min.z) ? -oz : oz;
      vel.z = 0;
    }
    min.set(pos.x - PLAYER_R, pos.y, pos.z - PLAYER_R);
    max.set(pos.x + PLAYER_R, pos.y + PLAYER_H, pos.z + PLAYER_R);
  }
  return grounded;
}

function pointInColliders(p, island) {
  for (const b of island.colliders) {
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
  }
  return false;
}

/* ================================================================== *
 *  Lokaler Spieler
 * ================================================================== */

class LocalPlayer {
  constructor(id, team, craftType) {
    this.id = id;
    this.team = team;
    this.craftType = craftType;
    this.mode = 'foot';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.hp = PLAYER_HP;
    this.grounded = false;
    this.respawnAt = 0;

    // Bodenwaffen
    this.weaponList = ['blaster', 'scatter', 'rocket'];
    this.weapon = 0;
    this.ammo = { blaster: WEAPONS.blaster.mag, scatter: WEAPONS.scatter.mag, rocket: WEAPONS.rocket.mag };
    this.reserve = { blaster: Infinity, scatter: 48, rocket: 16 };
    this.cool = 0;
    this.reloading = 0;

    // Flug
    this.craft = null;
    this.craftHp = 0;
    this.quat = new THREE.Quaternion();
    this.speed = 0;
    this.throttle = 0.6;
    this.boostFuel = 1;
    this.boosting = false;
    this.airCool = 0;
    this.heavyCool = 0;
    this.spawnGrace = 0;
    this.heavyAmmo = 0;
    this.stick = new THREE.Vector2();
    this.roll = 0;

    // Fallschirm
    this.chute = false;

    // Sichtbares Modell
    this.avatar = buildPilot(team);
    this.avatar.visible = false;
    G.scene.add(this.avatar);
    this.walkPhase = 0;
  }

  get spec() { return AIRCRAFT_SPECS[this.craftType]; }
  get weaponName() { return this.weaponList[this.weapon]; }
  get weaponDef() { return WEAPONS[this.weaponName]; }

  spawn() {
    const isl = islandOf(this.team);
    const p = isl.spawns[Math.floor(Math.random() * isl.spawns.length)];
    this.pos.copy(p);
    this.pos.y = FOOT_Y;
    this.vel.set(0, 0, 0);
    this.mode = 'foot';
    this.hp = PLAYER_HP;
    this.chute = false;
    this.yaw = isl.forwardYaw;
    this.pitch = 0;
    this.ammo = { blaster: WEAPONS.blaster.mag, scatter: WEAPONS.scatter.mag, rocket: WEAPONS.rocket.mag };
    this.reserve = { blaster: Infinity, scatter: 48, rocket: 16 };
    this.reloading = 0;
    this.destroyCraft(false);
    this.avatar.visible = true;
    sfx.engineStop();
  }

  destroyCraft(explode) {
    if (this.craft) {
      if (explode) {
        G.fx.explosion(this.craft.position, 2.2, 0xffa040);
        sfx.explosion(0, 1.6);
        addShake(0.9);
      }
      G.scene.remove(this.craft);
      this.craft = null;
    }
  }

  board() {
    const isl = islandOf(this.team);
    let pad = null, best = 1e9;
    for (const p of isl.pads) {
      const d = p.distanceTo(this.pos);
      if (d < best) { best = d; pad = p; }
    }
    if (!pad || best > 14) { toast('Zum Hangar gehen, um zu starten.'); return; }

    this.craft = buildAircraft(this.craftType, this.team);
    this.craft.position.copy(pad).setY(pad.y + 5);
    // Nase zeigt entlang der Startbahn zur gegnerischen Festung, leicht angestellt
    this.quat.setFromEuler(new THREE.Euler(0, isl.forwardYaw, 0));
    this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.22));
    this.craft.quaternion.copy(this.quat);
    G.scene.add(this.craft);

    this.craftHp = this.spec.hp;
    this.speed = this.spec.cruise;      // Katapultstart, kein Strömungsabriss
    this.spawnGrace = 1.2;
    this.throttle = 0.85;
    this.boostFuel = 1;
    this.heavyAmmo = this.spec.heavy ? this.spec.heavy.ammo : 0;
    this.mode = 'fly';
    this.avatar.visible = false;
    this.stick.set(0, 0);
    this.roll = 0;
    sfx.engineStart();
    G.fx.explosion(this.craft.position.clone().setY(pad.y), 0.6, 0xffd9a0);
    toast(`${this.spec.label} — Startfreigabe`);
    net.toHost({ t: 'board', c: this.craftType });
  }

  eject() {
    if (this.mode !== 'fly' || !this.craft) return;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    this.pos.copy(this.craft.position).addScaledVector(up, 3);
    this.vel.copy(forwardOf(this.quat).multiplyScalar(this.speed * 0.5)).addScaledVector(up, 14);
    this.mode = 'fall';
    this.chute = false;
    // Blickrichtung aus der Fluglage uebernehmen, damit die Sicht nicht springt
    const e = new THREE.Euler().setFromQuaternion(this.quat, 'YXZ');
    this.yaw = e.y;
    this.pitch = THREE.MathUtils.clamp(e.x, -1.35, 1.2);
    this.avatar.visible = true;
    this.avatar.userData.chute.visible = false;
    spawnWreck(this.craft, forwardOf(this.quat).multiplyScalar(this.speed), this.team);
    this.craft = null;
    net.toHost({ t: 'unboard' });
    sfx.engineStop();
    toast('AUSGESTIEGEN — LEERTASTE für Fallschirm');
  }

  deployChute() {
    if (this.mode !== 'fall' || this.chute) return;
    this.chute = true;
    this.mode = 'chute';
    this.avatar.userData.chute.visible = true;
    this.vel.y = Math.max(this.vel.y, -8);
    sfx.ui('ok');
  }

  die(cause) {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.respawnAt = G.time + RESPAWN_TIME;
    G.fx.explosion(this.pos.clone().setY(this.pos.y + 1), 1.0, 0xff7a3a);
    this.destroyCraft(true);
    this.avatar.visible = false;
    this.avatar.userData.chute.visible = false;
    sfx.death();
    addShake(0.7);
    $('respawn').classList.add('on');
    void cause;
  }
}

function forwardOf(q) { return new THREE.Vector3(0, 0, -1).applyQuaternion(q); }

/* ================================================================== *
 *  Herrenlose Wracks
 * ================================================================== */

const wrecks = [];
function spawnWreck(craft, vel, team) {
  craft.userData.wreckVel = vel.clone();
  craft.userData.wreckLife = 4.5;
  wrecks.push(craft);
  void team;
}
function updateWrecks(dt) {
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const w = wrecks[i];
    w.userData.wreckLife -= dt;
    w.userData.wreckVel.y -= 12 * dt;
    w.position.addScaledVector(w.userData.wreckVel, dt);
    w.rotateZ(dt * 2.4); w.rotateX(dt * 0.7);
    G.fx.damageSmoke(w.position, w.userData.wreckVel, 0.9);
    const isl = nearestIsland(w.position);
    const hitDeck = overIsland(w.position, isl) && w.position.y < FOOT_Y + 2;
    if (w.userData.wreckLife <= 0 || hitDeck || w.position.y < DEATH_FLOOR) {
      G.fx.explosion(w.position, 2.4, 0xffa040);
      sfx.explosion(w.position.distanceTo(G.camera.position), 1.8);
      G.scene.remove(w);
      wrecks.splice(i, 1);
    }
  }
}

/* ================================================================== *
 *  Remote-Spieler
 * ================================================================== */

class RemotePlayer {
  constructor(id, team, craftType, name) {
    this.id = id; this.team = team; this.name = name || 'PILOT';
    this.mode = 'foot';
    this.pos = new THREE.Vector3(0, -9999, 0);
    this.target = new THREE.Vector3(0, -9999, 0);
    this.quat = new THREE.Quaternion();
    this.tquat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.hp = PLAYER_HP;
    this.craftType = craftType || 'striker';
    this.throttle = 0; this.boost = false; this.chute = false;
    this.walkPhase = 0;

    this.avatar = buildPilot(team);
    this.avatar.visible = false;
    G.scene.add(this.avatar);
    this.craft = null;
  }

  ensureCraft(type) {
    if (this.craft && this.craftType === type) return;
    if (this.craft) G.scene.remove(this.craft);
    this.craftType = type;
    this.craft = buildAircraft(type, this.team);
    G.scene.add(this.craft);
  }

  applyState(m) {
    // Nach einem Kill bleibt der Spieler unsichtbar, bis der Host ihn respawnt.
    if (this.mode === 'dead' && m.m === 'dead') return;
    this.mode = m.m;
    this.target.set(m.x, m.y, m.z);
    this.tquat.set(m.qx, m.qy, m.qz, m.qw);
    this.vel.set(m.vx || 0, m.vy || 0, m.vz || 0);
    this.throttle = m.th || 0;
    this.boost = !!m.b;
    this.chute = !!m.ch;
    if (m.c) this.ensureCraft(m.c);
    if (this.pos.y < -9000) this.pos.copy(this.target);
  }

  update(dt) {
    const k = Math.min(1, dt * 12);
    this.pos.lerp(this.target, k);
    this.quat.slerp(this.tquat, Math.min(1, dt * 14));

    const flying = this.mode === 'fly';
    if (this.craft) this.craft.visible = flying;
    this.avatar.visible = this.mode === 'foot' || this.mode === 'fall' || this.mode === 'chute';

    if (flying && this.craft) {
      this.craft.position.copy(this.pos);
      this.craft.quaternion.copy(this.quat);
      animateEngines(this.craft, this.throttle, this.boost, dt);
      if (Math.random() < 0.5) {
        const back = forwardOf(this.quat).multiplyScalar(-1);
        G.fx.engineTrail(this.craft.position.clone().addScaledVector(back, 4), back, this.throttle, this.boost);
      }
    }
    if (this.avatar.visible) {
      this.avatar.position.copy(this.pos);
      const e = new THREE.Euler().setFromQuaternion(this.quat, 'YXZ');
      this.avatar.rotation.y = e.y;
      this.avatar.userData.chute.visible = this.chute;
      const moving = this.mode === 'foot' && this.vel.lengthSq() > 1;
      this.walkPhase += dt * (moving ? 9 : 2);
      animatePilot(this.avatar, this.walkPhase, moving, this.mode);
    }
  }

  dispose() {
    G.scene.remove(this.avatar);
    if (this.craft) G.scene.remove(this.craft);
  }
}

function animatePilot(av, phase, moving, mode) {
  const u = av.userData;
  const sw = moving ? Math.sin(phase) * 0.65 : Math.sin(phase * 0.3) * 0.05;
  if (mode === 'fall' || mode === 'chute') {
    u.legs[0].rotation.x = 0.5; u.legs[1].rotation.x = 0.2;
    u.arms[0].rotation.x = -0.6; u.arms[1].rotation.x = -1.4;
    u.arms[0].rotation.z = 0.5; u.arms[1].rotation.z = -0.5;
    u.hips.rotation.x = mode === 'chute' ? 0.15 : 0.5;
    return;
  }
  u.hips.rotation.x = 0;
  u.legs[0].rotation.x = sw;
  u.legs[1].rotation.x = -sw;
  u.arms[1].rotation.x = sw * 0.7;
  u.arms[0].rotation.x = -0.9;        // Waffenarm nach vorn
  u.arms[0].rotation.z = 0.1;
  u.hips.position.y = 0.9 + (moving ? Math.abs(Math.sin(phase)) * 0.06 : 0);
}

function animateEngines(craft, throttle, boost, dt) {
  const power = throttle * (boost ? 1.8 : 1);
  for (const e of craft.userData.engines || []) {
    const t = e.userData.thrust;
    const s = 0.35 + power * 1.15 + Math.random() * 0.12;
    t.flame.scale.set(0.8 + power * 0.4, 0.8 + power * 0.4, s);
    t.flame.material.opacity = 0.18 + power * 0.5;
    t.flame.material.color.setHex(boost ? 0x9fd8ff : 0xffc27a);
    t.glow.scale.setScalar((1.2 + power * 2.6) * 1.6);
    t.glow.material.color.setHex(boost ? 0x8fcfff : 0xffb066);
    t.glow.material.opacity = 0.4 + power * 0.5;
    t.core.material.color.setHex(boost ? 0xbfe6ff : 0xff9a3c);
  }
  void dt;
}

/* ================================================================== *
 *  Projektile
 * ================================================================== */

const projMats = {};
function projMat(color) {
  if (!projMats[color]) {
    projMats[color] = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }
  return projMats[color];
}

function initProjectilePool() {
  const geo = new THREE.CylinderGeometry(0.13, 0.06, 2.6, 6);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 260; i++) {
    const m = new THREE.Mesh(geo, projMat(0x8fe3ff));
    m.visible = false;
    m.frustumCulled = false;
    G.scene.add(m);
    G.projPool.push(m);
  }
}

let projHead = 0;
function fireProjectile(opts) {
  const mesh = G.projPool[projHead];
  projHead = (projHead + 1) % G.projPool.length;
  if (mesh.userData.proj) mesh.userData.proj.stale = true;
  mesh.visible = true;
  mesh.material = projMat(opts.color);
  mesh.position.copy(opts.pos);
  mesh.scale.setScalar(opts.big ? 2.2 : 1);

  const p = {
    mesh, pos: opts.pos.clone(), vel: opts.dir.clone().multiplyScalar(opts.speed),
    life: opts.life ?? 4, owner: opts.owner, team: opts.team, mine: !!opts.mine,
    dmg: opts.dmg, splash: opts.splash || 0, radius: opts.radius || 0,
    coreMul: opts.coreMul ?? 1, color: opts.color, kind: opts.kind || 'shot',
    gravity: opts.gravity || 0, trail: opts.trail !== false
  };
  mesh.userData.proj = p;
  G.projectiles.push(p);
  return p;
}

function updateProjectiles(dt) {
  const cam = G.camera.position;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.life -= dt;
    if (p.gravity) p.vel.y -= p.gravity * dt;
    const step = p.vel.clone().multiplyScalar(dt);
    const next = p.pos.clone().add(step);

    let hit = null;
    if (p.mine) hit = traceHit(p, p.pos, next);

    p.pos.copy(next);
    if (p.mesh.userData.proj === p) {
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.clone().add(p.vel));
    }

    if (p.trail && Math.random() < 0.6) {
      G.fx.sparks.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, p.color, 1.4, 0.14, { drag: 0 });
    }

    if (hit) {
      onProjectileHit(p, hit);
      retire(p, i);
      continue;
    }
    // Auch fremde Projektile brauchen eine visuelle Detonation
    if (!p.mine) {
      const isl = nearestIsland(p.pos);
      if ((overIsland(p.pos, isl) && p.pos.y < FOOT_Y) || pointInColliders(p.pos, isl)) {
        localBurst(p);
        retire(p, i);
        continue;
      }
    }
    if (p.life <= 0 || p.pos.y < DEATH_FLOOR || p.pos.distanceTo(cam) > 2600) retire(p, i);
  }
}

function retire(p, i) {
  if (p.mesh.userData.proj === p) { p.mesh.visible = false; p.mesh.userData.proj = null; }
  G.projectiles.splice(i, 1);
}

function localBurst(p) {
  if (p.splash) {
    G.fx.explosion(p.pos, p.radius > 12 ? 1.7 : 1.1, p.color);
    sfx.explosion(p.pos.distanceTo(G.camera.position), p.radius > 12 ? 1.4 : 1);
  } else {
    G.fx.impact(p.pos, p.vel.clone().normalize().negate(), p.color, 8);
    sfx.hit(p.pos.distanceTo(G.camera.position));
  }
}

// Trefferprüfung — läuft nur für eigene Projektile.
function traceHit(p, from, to) {
  const seg = to.clone().sub(from);
  const len = seg.length();
  const steps = Math.max(1, Math.ceil(len / 3));
  const step = seg.clone().divideScalar(steps);
  const probe = from.clone();

  for (let s = 0; s < steps; s++) {
    probe.add(step);

    // Gegnerische Spieler
    for (const r of G.remotes.values()) {
      if (r.team === p.team || r.mode === 'dead') continue;
      if (r.mode === 'fly' && r.craft) {
        const rad = AIRCRAFT_SPECS[r.craftType].radius + 1.2;
        if (probe.distanceToSquared(r.pos) < rad * rad) return { type: 'craft', id: r.id, point: probe.clone() };
      } else {
        const c = r.pos.clone(); c.y += 0.95;
        if (probe.distanceToSquared(c) < 1.3) return { type: 'player', id: r.id, point: probe.clone() };
      }
    }

    // Nur der gegnerische Core nimmt Schaden
    for (const team of ['blue', 'red']) {
      if (team === p.team) continue;
      const isl = G.islands[team];
      if (G.coreHp[team] <= 0) continue;
      if (probe.distanceToSquared(isl.corePos) < 64) {
        return { type: 'core', team, point: probe.clone() };
      }
    }

    // Zerstörbare Anlagen
    for (const team of ['blue', 'red']) {
      const isl = G.islands[team];
      for (let d = 0; d < isl.destructibles.length; d++) {
        const dd = isl.destructibles[d];
        if (dd.dead) continue;
        if (probe.distanceToSquared(dd.world) < dd.radius * dd.radius) {
          return { type: 'prop', team, idx: d, point: probe.clone() };
        }
      }
    }

    // Geometrie
    const isl = nearestIsland(probe);
    if (overIsland(probe, isl) && probe.y < FOOT_Y) return { type: 'world', point: probe.clone().setY(FOOT_Y) };
    if (pointInColliders(probe, isl)) return { type: 'world', point: probe.clone() };
  }
  return null;
}

function onProjectileHit(p, hit) {
  localBurst({ ...p, pos: hit.point });

  if (hit.type === 'world') return;

  // Direkttreffer + optionaler Splash werden als Anspruch an den Host gemeldet.
  const claims = [];
  if (hit.type === 'player') claims.push({ target: 'p:' + hit.id, amount: p.dmg });
  if (hit.type === 'craft') claims.push({ target: 'a:' + hit.id, amount: p.dmg });
  if (hit.type === 'core') claims.push({ target: 'c:' + hit.team, amount: p.dmg * p.coreMul });
  if (hit.type === 'prop') claims.push({ target: 'd:' + hit.team + ':' + hit.idx, amount: p.dmg });

  if (p.splash && p.radius) {
    const seen = new Set(claims.map(c => c.target));
    for (const r of G.remotes.values()) {
      if (r.team === p.team || r.mode === 'dead') continue;
      const key = (r.mode === 'fly' ? 'a:' : 'p:') + r.id;
      if (seen.has(key)) continue;
      const d = r.pos.distanceTo(hit.point);
      if (d < p.radius) claims.push({ target: key, amount: p.splash * (1 - d / p.radius) });
    }
    for (const team of ['blue', 'red']) {
      if (team === p.team) continue;
      const key = 'c:' + team;
      if (seen.has(key) || G.coreHp[team] <= 0) continue;
      const d = G.islands[team].corePos.distanceTo(hit.point);
      if (d < p.radius + 7) claims.push({ target: key, amount: p.splash * p.coreMul * (1 - d / (p.radius + 7)) });
    }
    // Splash trifft auch den Schützen selbst
    if (G.me && G.me.mode !== 'dead' && G.me.pos.distanceTo(hit.point) < p.radius) {
      const d = G.me.pos.distanceTo(hit.point);
      claims.push({ target: 'p:' + G.me.id, amount: p.splash * 0.5 * (1 - d / p.radius) });
    }
  }

  for (const c of claims) {
    net.toHost({ t: 'hit', target: c.target, amount: Math.round(c.amount), w: p.kind });
  }
}

/* ================================================================== *
 *  Eingabe
 * ================================================================== */

const keys = {};
const mouse = { dx: 0, dy: 0, left: false, right: false, locked: false };
let invertY = false;

function initInput() {
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    keys[e.code] = true;
    if (!G.running) return;
    if (e.code === 'KeyE') onInteract();
    if (e.code === 'KeyF') G.me && G.me.eject();
    if (e.code === 'Space' && G.me && G.me.mode === 'fall') G.me.deployChute();
    if (e.code === 'Digit1') selectWeapon(0);
    if (e.code === 'Digit2') selectWeapon(1);
    if (e.code === 'Digit3') selectWeapon(2);
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyH') $('hud').classList.toggle('hidden');
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  const canvas = $('c');
  canvas.addEventListener('click', () => {
    if (G.running && !mouse.locked) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
    $('pauseHint').classList.toggle('on', G.running && !mouse.locked);
  });
  addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
  addEventListener('mousedown', (e) => {
    if (!mouse.locked) return;
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  addEventListener('contextmenu', (e) => { if (G.running) e.preventDefault(); });
  addEventListener('wheel', (e) => {
    if (!G.running || !G.me || G.me.mode !== 'foot') return;
    selectWeapon((G.me.weapon + (e.deltaY > 0 ? 1 : 2)) % 3);
  });
}

function selectWeapon(i) {
  const me = G.me;
  if (!me || me.mode !== 'foot' || i === me.weapon) return;
  me.weapon = i;
  me.reloading = 0;
  me.cool = 0.2;
  sfx.ui('click');
  updateHud();
}

function startReload() {
  const me = G.me;
  if (!me || me.mode !== 'foot' || me.reloading > 0) return;
  const w = me.weaponDef, n = me.weaponName;
  if (me.ammo[n] >= w.mag || me.reserve[n] <= 0) return;
  me.reloading = w.reload;
  sfx.ui('click');
}

function onInteract() {
  const me = G.me;
  if (!me) return;
  if (me.mode === 'foot') me.board();
  else if (me.mode === 'fly') me.eject();
}

/* ================================================================== *
 *  Spieler-Update
 * ================================================================== */

function updateLocal(dt) {
  const me = G.me;
  if (!me) return;

  // Mausdeltas abholen
  const sens = 0.0022;
  let mdx = mouse.dx, mdy = mouse.dy;
  mouse.dx = 0; mouse.dy = 0;
  if (!mouse.locked) { mdx = 0; mdy = 0; }

  if (me.mode === 'dead') {
    $('respawnCount').textContent = Math.max(0, Math.ceil(me.respawnAt - G.time));
    if (G.time >= me.respawnAt) {
      me.spawn();
      $('respawn').classList.remove('on');
      net.toHost({ t: 'iresp' });
    }
    return;
  }

  if (me.mode === 'fly') updateFlight(me, dt, mdx, mdy, sens);
  else updateOnFoot(me, dt, mdx, mdy, sens);

  // Aus der Welt gefallen
  if (me.pos.y < DEATH_FLOOR && me.mode !== 'dead') {
    net.toHost({ t: 'hit', target: 'p:' + me.id, amount: 999, w: 'void' });
    me.die('void');
  }
}

function updateOnFoot(me, dt, mdx, mdy, sens) {
  me.yaw -= mdx * sens;
  me.pitch -= (invertY ? -mdy : mdy) * sens;
  me.pitch = THREE.MathUtils.clamp(me.pitch, -1.35, 1.2);

  const inAir = me.mode === 'fall' || me.mode === 'chute';

  if (me.mode === 'foot') {
    const f = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    const r = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    const wish = new THREE.Vector3();
    if (keys.KeyW) wish.add(f);
    if (keys.KeyS) wish.sub(f);
    if (keys.KeyD) wish.add(r);
    if (keys.KeyA) wish.sub(r);
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(sprint ? SPRINT : WALK);

    const accel = me.grounded ? 22 : 6;
    me.vel.x += (wish.x - me.vel.x) * Math.min(1, accel * dt);
    me.vel.z += (wish.z - me.vel.z) * Math.min(1, accel * dt);
    me.vel.y -= GRAVITY * dt;
    if (keys.Space && me.grounded) { me.vel.y = JUMP; me.grounded = false; }

    me.grounded = moveWithCollision(me.pos, me.vel, dt);
    me.walkPhase += dt * (me.vel.length() > 1 ? 9 : 2);

    handleGroundFire(me, dt);
  } else {
    // Freier Fall / Fallschirm
    const drag = me.chute ? 3.2 : 0.25;
    const f = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    const steer = me.chute ? 11 : 4;
    if (keys.KeyW) me.vel.addScaledVector(f, steer * dt);
    if (keys.KeyS) me.vel.addScaledVector(f, -steer * dt);
    me.vel.y -= GRAVITY * dt;
    me.vel.y = Math.max(me.vel.y, me.chute ? -11 : -95);
    me.vel.x *= Math.max(0, 1 - drag * dt * 0.4);
    me.vel.z *= Math.max(0, 1 - drag * dt * 0.4);

    const wasFalling = me.vel.y;
    const ground = moveWithCollision(me.pos, me.vel, dt);
    if (ground) {
      if (!me.chute && wasFalling < -34) {
        net.toHost({ t: 'hit', target: 'p:' + me.id, amount: 200, w: 'fall' });
      }
      me.mode = 'foot';
      me.chute = false;
      me.avatar.userData.chute.visible = false;
      me.grounded = true;
    }
  }

  // Avatar setzen
  me.avatar.position.copy(me.pos);
  me.avatar.rotation.y = me.yaw;
  animatePilot(me.avatar, me.walkPhase, me.mode === 'foot' && me.vel.lengthSq() > 2, me.mode);

  updateFootCamera(me, dt, inAir);
  sfx.ambientSet(me.vel.length() * 2);
}

function handleGroundFire(me, dt) {
  me.cool -= dt;
  if (me.reloading > 0) {
    me.reloading -= dt;
    if (me.reloading <= 0) {
      const n = me.weaponName, w = WEAPONS[n];
      const need = w.mag - me.ammo[n];
      const take = Math.min(need, me.reserve[n]);
      me.ammo[n] += take;
      if (me.reserve[n] !== Infinity) me.reserve[n] -= take;
      updateHud();
    }
    return;
  }
  if (!mouse.left || me.cool > 0) return;

  const n = me.weaponName, w = WEAPONS[n];
  if (me.ammo[n] <= 0) { startReload(); sfx.ui('err'); return; }

  me.ammo[n]--;
  me.cool = w.rate;
  updateHud();

  const muzzle = new THREE.Vector3();
  me.avatar.userData.muzzle.getWorldPosition(muzzle);
  const aim = cameraAimDir(muzzle);

  for (let i = 0; i < w.pellets; i++) {
    const dir = aim.clone();
    if (w.spread) {
      dir.x += (Math.random() - 0.5) * w.spread * 2;
      dir.y += (Math.random() - 0.5) * w.spread * 2;
      dir.z += (Math.random() - 0.5) * w.spread * 2;
      dir.normalize();
    }
    const shot = {
      pos: muzzle, dir, speed: w.speed, dmg: w.dmg, color: w.color,
      splash: w.splash, radius: w.radius, coreMul: w.coreMul,
      owner: me.id, team: me.team, mine: true, kind: n,
      big: n === 'rocket', gravity: n === 'rocket' ? 3 : 0, life: 3.5
    };
    fireProjectile(shot);
    net.toHost({
      t: 'shot', k: n, x: muzzle.x, y: muzzle.y, z: muzzle.z,
      dx: dir.x, dy: dir.y, dz: dir.z, tm: me.team
    });
  }
  G.fx.muzzle(muzzle, aim, w.color);
  sfx.shot(n, 0);
  addShake(n === 'rocket' ? 0.5 : 0.12);
  G.camera.position.addScaledVector(aim, -0.12);
}

// Zielrichtung: von der Mündung auf den Punkt, den das Fadenkreuz anvisiert.
const _camDir = new THREE.Vector3();
function cameraAimDir(from) {
  G.camera.getWorldDirection(_camDir);
  const focus = G.camera.position.clone().addScaledVector(_camDir, 400);
  return focus.sub(from).normalize();
}

/* ---------------- Flug ---------------- */

function updateFlight(me, dt, mdx, mdy, sens) {
  const spec = me.spec;

  // Virtueller, selbstzentrierender Steuerknüppel
  me.stick.x = THREE.MathUtils.clamp(me.stick.x + mdx * sens * 1.4, -1, 1);
  me.stick.y = THREE.MathUtils.clamp(me.stick.y + (invertY ? -mdy : mdy) * sens * 1.4, -1, 1);
  const centering = Math.max(0, 1 - 2.6 * dt);
  me.stick.multiplyScalar(centering);

  let rollIn = 0;
  if (keys.KeyA) rollIn += 1;
  if (keys.KeyD) rollIn -= 1;
  rollIn += -me.stick.x * 0.85;
  let yawIn = 0;
  if (keys.KeyQ) yawIn += 1;
  if (keys.KeyE) yawIn -= 1;
  yawIn += -me.stick.x * 0.3;
  const pitchIn = -me.stick.y;

  // Schub
  if (keys.KeyW) me.throttle = Math.min(1, me.throttle + dt * 0.9);
  if (keys.KeyS) me.throttle = Math.max(0, me.throttle - dt * 0.9);
  const wantBoost = (keys.ShiftLeft || keys.ShiftRight) && me.boostFuel > 0.02;
  me.boosting = wantBoost;
  if (wantBoost) me.boostFuel = Math.max(0, me.boostFuel - dt / spec.boostFuel);
  else me.boostFuel = Math.min(1, me.boostFuel + dt * spec.boostRegen / spec.boostFuel);

  // Drehraten (bei geringem Tempo träger)
  const auth = THREE.MathUtils.clamp(me.speed / (spec.cruise * 0.7), 0.25, 1.25);
  const q = me.quat;
  const dq = new THREE.Quaternion();
  dq.setFromEuler(new THREE.Euler(
    pitchIn * spec.pitch * auth * dt,
    yawIn * spec.yaw * auth * dt,
    rollIn * spec.roll * auth * dt, 'XYZ'));
  q.multiply(dq).normalize();

  const fwd = forwardOf(q);

  // Geschwindigkeit
  const target = wantBoost ? spec.boost : spec.cruise + me.throttle * (spec.max - spec.cruise);
  me.speed += (target - me.speed) * Math.min(1, (wantBoost ? spec.accel * 1.8 : spec.accel) / Math.max(30, spec.max) * dt * 3);
  me.speed += -fwd.y * 34 * dt;                       // Sturzflug beschleunigt
  me.speed = THREE.MathUtils.clamp(me.speed, 12, spec.boost * 1.15);

  me.vel.copy(fwd).multiplyScalar(me.speed);
  me.vel.y -= (1 - THREE.MathUtils.clamp(me.speed / spec.cruise, 0, 1)) * 22;  // Strömungsabriss
  me.pos.copy(me.craft.position).addScaledVector(me.vel, dt);
  me.craft.position.copy(me.pos);
  me.craft.quaternion.copy(q);

  animateEngines(me.craft, me.throttle, me.boosting, dt);
  const back = fwd.clone().negate();
  for (const e of me.craft.userData.engines) {
    const wp = new THREE.Vector3();
    e.getWorldPosition(wp);
    G.fx.engineTrail(wp.addScaledVector(back, 2), back, me.throttle, me.boosting);
  }
  if (me.craftHp / spec.hp < 0.55) {
    G.fx.damageSmoke(me.pos, me.vel, 1 - me.craftHp / spec.hp);
  }

  handleAirFire(me, dt, fwd);
  if (me.spawnGrace > 0) me.spawnGrace -= dt;
  else checkCraftCollision(me);
  updateFlyCamera(me, dt);

  sfx.engineUpdate(me.throttle, me.boosting);
  sfx.ambientSet(me.speed);
}

function handleAirFire(me, dt, fwd) {
  me.airCool -= dt;
  me.heavyCool -= dt;
  const spec = me.spec;

  if (mouse.left && me.airCool <= 0) {
    me.airCool = spec.gun.rate;
    const ports = me.craft.userData.ports || [new THREE.Vector3(0, 0, -3)];
    for (const local of ports) {
      const wp = local.clone().applyMatrix4(me.craft.matrixWorld);
      const dir = fwd.clone();
      dir.x += (Math.random() - 0.5) * spec.gun.spread * 2;
      dir.y += (Math.random() - 0.5) * spec.gun.spread * 2;
      dir.z += (Math.random() - 0.5) * spec.gun.spread * 2;
      dir.normalize();
      fireProjectile({
        pos: wp, dir, speed: spec.gun.speed + me.speed, dmg: spec.gun.dmg,
        color: me.team === 'blue' ? 0x9fe0ff : 0xffd08a,
        coreMul: spec.gun.coreMul, owner: me.id, team: me.team, mine: true,
        kind: 'aircannon', life: 2.2
      });
      net.toHost({ t: 'shot', k: 'aircannon', x: wp.x, y: wp.y, z: wp.z, dx: dir.x, dy: dir.y, dz: dir.z, tm: me.team });
      G.fx.muzzle(wp, dir, 0xffd9a0);
    }
    sfx.shot('blaster', 0);
    addShake(0.06);
  }

  if (mouse.right && spec.heavy && me.heavyCool <= 0 && me.heavyAmmo > 0) {
    const h = spec.heavy;
    me.heavyCool = h.rate;
    me.heavyAmmo--;
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(me.quat);
    const wp = me.pos.clone().addScaledVector(down, 2.5);
    const dir = h.type === 'bomb' ? down.clone().lerp(fwd, 0.55).normalize() : fwd.clone();
    fireProjectile({
      pos: wp, dir, speed: h.speed + (h.type === 'bomb' ? me.speed : 0),
      dmg: h.dmg, splash: h.splash, radius: h.radius, coreMul: h.coreMul,
      color: 0xff9440, owner: me.id, team: me.team, mine: true,
      kind: h.type, big: true, gravity: h.type === 'bomb' ? 18 : 0, life: 8
    });
    net.toHost({ t: 'shot', k: h.type, x: wp.x, y: wp.y, z: wp.z, dx: dir.x, dy: dir.y, dz: dir.z, tm: me.team });
    sfx.shot(h.type, 0);
    addShake(0.35);
    updateHud();
  }
}

function checkCraftCollision(me) {
  const isl = nearestIsland(me.pos);
  const spec = me.spec;
  const r = spec.radius;

  const deckHit = overIsland(me.pos, isl, r) && me.pos.y < FOOT_Y + r;
  const structHit = pointInColliders(me.pos, isl);
  const coreHit = me.pos.distanceTo(isl.corePos) < 10 + r;

  if (!deckHit && !structHit && !coreHit) return;

  const level = Math.abs(forwardOf(me.quat).y) < 0.28;
  const gentle = me.speed < 55 && level && deckHit && !structHit && !coreHit;

  if (gentle) {
    // Landung: Pilot steigt aus
    me.pos.y = FOOT_Y;
    me.mode = 'foot';
    me.yaw = new THREE.Euler().setFromQuaternion(me.quat, 'YXZ').y;
    me.pitch = 0;
    me.avatar.visible = true;
    G.scene.remove(me.craft);
    me.craft = null;
    me.vel.set(0, 0, 0);
    moveWithCollision(me.pos, me.vel, 0);   // aus eventueller Geometrie herausschieben
    me.grounded = true;
    net.toHost({ t: 'unboard' });
    sfx.engineStop();
    toast('GELANDET');
  } else {
    net.toHost({ t: 'hit', target: 'p:' + me.id, amount: 999, w: 'crash' });
    me.die('crash');
  }
}

/* ================================================================== *
 *  Kamera
 * ================================================================== */

const camTmp = new THREE.Vector3();
const camGoal = new THREE.Vector3();
let camFov = 68;

function addShake(v) { G.shake = Math.min(1.6, G.shake + v); }

function updateFootCamera(me, dt, inAir) {
  G.camera.up.lerp(new THREE.Vector3(0, 1, 0), Math.min(1, dt * 8));
  const off = new THREE.Vector3(0.95, 1.95, 4.3);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(me.pitch, me.yaw, 0, 'YXZ'));
  camGoal.copy(off).applyQuaternion(q).add(me.pos);

  // Nicht durch Wände klemmen
  const island = nearestIsland(me.pos);
  const from = me.pos.clone().setY(me.pos.y + 1.5);
  const dirv = camGoal.clone().sub(from);
  const dist = dirv.length();
  dirv.normalize();
  let clip = dist;
  for (let s = 1; s <= 6; s++) {
    const t = (s / 6) * dist;
    camTmp.copy(from).addScaledVector(dirv, t);
    if (pointInColliders(camTmp, island) || (overIsland(camTmp, island) && camTmp.y < FOOT_Y + 0.3)) { clip = t - 0.4; break; }
  }
  camGoal.copy(from).addScaledVector(dirv, Math.max(1.2, clip));

  G.camera.position.lerp(camGoal, Math.min(1, dt * (inAir ? 9 : 16)));
  const look = me.pos.clone().setY(me.pos.y + 1.55).addScaledVector(
    new THREE.Vector3(0, 0, -1).applyQuaternion(q), 12);
  G.camera.lookAt(look);
  applyShake(dt);
  camFov += ((inAir ? 82 : 70) - camFov) * Math.min(1, dt * 4);
  setFov(camFov);
}

function updateFlyCamera(me, dt) {
  const spec = me.spec;
  const back = 12 + spec.radius * 2.4;
  const off = new THREE.Vector3(0, spec.radius * 0.9 + 3.2, back);
  camGoal.copy(off).applyQuaternion(me.quat).add(me.pos);
  G.camera.position.lerp(camGoal, Math.min(1, dt * 6.5));

  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(me.quat).lerp(new THREE.Vector3(0, 1, 0), 0.25);
  G.camera.up.lerp(up, Math.min(1, dt * 6));
  G.camera.lookAt(me.pos.clone().addScaledVector(forwardOf(me.quat), 42));
  applyShake(dt);

  const speedT = THREE.MathUtils.clamp(me.speed / spec.boost, 0, 1);
  const goalFov = 70 + speedT * 16 + (me.boosting ? 8 : 0);
  camFov += (goalFov - camFov) * Math.min(1, dt * 3.5);
  setFov(camFov);
  if (me.boosting) addShake(dt * 0.9);
}

function setFov(f) {
  if (Math.abs(G.camera.fov - f) < 0.01) return;
  G.camera.fov = f;
  G.camera.updateProjectionMatrix();
}

function applyShake(dt) {
  if (G.shake <= 0.001) { G.shake = 0; return; }
  const s = G.shake;
  G.camera.position.x += (Math.random() - 0.5) * s * 0.85;
  G.camera.position.y += (Math.random() - 0.5) * s * 0.85;
  G.camera.position.z += (Math.random() - 0.5) * s * 0.85;
  G.shake = Math.max(0, G.shake - dt * 2.6);
}

/* ================================================================== *
 *  Intro-Kamera
 * ================================================================== */

function updateIntro(dt) {
  G.intro -= dt;
  const me = G.me;
  const isl = islandOf(me.team);
  const t = 3.6 - G.intro;
  const a = 0.6 + t * 0.35;
  const center = isl.pads[1].clone();
  G.camera.position.set(
    center.x + Math.cos(a) * (34 - t * 3),
    center.y + 16 - t * 2.2,
    center.z + Math.sin(a) * (34 - t * 3));
  G.camera.up.set(0, 1, 0);
  G.camera.lookAt(center.x, center.y + 4, center.z);
  setFov(58 + t * 3);

  if (Math.random() < 0.5) {
    G.fx.smoke.spawn(center.x + (Math.random() - 0.5) * 24, center.y - 0.5, center.z + (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 2, 1.4, (Math.random() - 0.5) * 2, 0x3a3f45, 8, 2.4, { alpha: 0.3, drag: 0.6, grow: 5 });
  }

  if (G.intro <= 0) {
    $('introCard').classList.remove('on');
    $('c').requestPointerLock();
  }
}

/* ================================================================== *
 *  Geschütztürme (Optik lokal, Schaden nur beim Host)
 * ================================================================== */

const _tv = new THREE.Vector3();
function updateTurrets(dt) {
  for (const team of ['blue', 'red']) {
    const isl = G.islands[team];
    if (G.coreHp[team] <= 0) continue;
    for (const t of isl.turrets) {
      if (t.dead) continue;
      const tgt = nearestEnemyAir(team, t.world, 420);
      const o = t.obj.userData;
      if (tgt) {
        _tv.copy(tgt).sub(t.world);
        const yaw = Math.atan2(-_tv.x, -_tv.z) - (team === 'red' ? Math.PI : 0);
        const pitch = Math.atan2(_tv.y, Math.hypot(_tv.x, _tv.z));
        o.yaw.rotation.y = lerpAngle(o.yaw.rotation.y, yaw, Math.min(1, dt * 2.2));
        o.pitch.rotation.x = THREE.MathUtils.lerp(o.pitch.rotation.x, -pitch, Math.min(1, dt * 2.2));
      } else {
        o.yaw.rotation.y += dt * 0.15;
        o.pitch.rotation.x = THREE.MathUtils.lerp(o.pitch.rotation.x, -0.25, Math.min(1, dt * 1.2));
      }

      // Feuer nur beim Host, Schaden autoritativ
      if (!net.isHost) continue;
      t.cool -= dt;
      if (!tgt || t.cool > 0) continue;
      t.cool = 0.55 + Math.random() * 0.4;
      const muzzle = new THREE.Vector3();
      o.muzzle.getWorldPosition(muzzle);
      const dir = tgt.clone().sub(muzzle).normalize();
      net.publish({
        t: 'shot', k: 'turret', x: muzzle.x, y: muzzle.y, z: muzzle.z,
        dx: dir.x, dy: dir.y, dz: dir.z, tm: team
      });
      hostTurretDamage(team, tgt);
    }
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function nearestEnemyAir(team, from, range) {
  let best = null, bd = range * range;
  const check = (pos, ptm, mode) => {
    if (ptm === team || mode !== 'fly') return;
    const d = from.distanceToSquared(pos);
    if (d < bd) { bd = d; best = pos; }
  };
  for (const r of G.remotes.values()) check(r.pos, r.team, r.mode);
  if (G.me) check(G.me.pos, G.me.team, G.me.mode);
  return best ? best.clone() : null;
}

function hostTurretDamage(team, targetPos) {
  // Der Host prüft, welches Flugzeug an dieser Position ist, und trifft mit 60 % Chance.
  if (Math.random() > 0.6) return;
  for (const [id, p] of allPlayers()) {
    if (p.team === team || p.mode !== 'fly') continue;
    if (p.pos.distanceTo(targetPos) > 8) continue;
    hostApplyDamage('a:' + id, 14, 'turret', null);
    return;
  }
}

function* allPlayers() {
  if (G.me) yield [G.me.id, G.me];
  for (const [id, r] of G.remotes) yield [id, r];
}

/* ================================================================== *
 *  Host-Autorität
 * ================================================================== */

function hostInit() {
  G.hostState.hp.clear();
  G.hostState.dead.clear();
  G.hostState.lastHit.clear();
  G.hostState.destroyed = { blue: new Set(), red: new Set() };
  for (const p of net.players.values()) {
    G.hostState.hp.set(p.id, { player: PLAYER_HP, craft: 0 });
  }
}

// Erlaubte Höchstwerte pro Treffer — verhindert triviale Manipulation.
const MAX_CLAIM = { blaster: 20, scatter: 20, rocket: 150, aircannon: 22, bomb: 300, turret: 20, fall: 200, crash: 999, void: 999 };

function hostOnMsg(m) {
  if (!net.isHost) return;
  switch (m.t) {
    case 'shot':
      // Schüsse sind rein visuell; weiterreichen an alle außer dem Schützen.
      net.relay({ ...m, by: m.from }, m.from);
      break;
    case 'hit': {
      const cap = MAX_CLAIM[m.w] ?? 25;
      if (typeof m.amount !== 'number' || m.amount <= 0 || m.amount > cap) return;
      // Grobe Feuerraten-Bremse: max. 40 Trefferereignisse pro Sekunde je Spieler
      const last = G.hostState.lastHit.get(m.from) || { t: 0, n: 0 };
      const now = G.time;
      if (now - last.t > 1) { last.t = now; last.n = 0; }
      if (++last.n > 40) return;
      G.hostState.lastHit.set(m.from, last);
      hostApplyDamage(m.target, m.amount, m.w, m.from);
      break;
    }
    case 'iresp': {
      const s = G.hostState.hp.get(m.from);
      if (s) { s.player = PLAYER_HP; s.craft = 0; }
      G.hostState.dead.delete(m.from);
      net.publish({ t: 'php', id: m.from, hp: PLAYER_HP });
      break;
    }
    case 'board': {
      const s = G.hostState.hp.get(m.from);
      if (s && AIRCRAFT_SPECS[m.c]) s.craft = AIRCRAFT_SPECS[m.c].hp;
      break;
    }
    case 'unboard': {
      const s = G.hostState.hp.get(m.from);
      if (s) s.craft = 0;
      break;
    }
  }
}

function hostApplyDamage(target, amount, kind, by) {
  if (G.over) return;
  const [type, a, b] = target.split(':');

  if (type === 'c') {
    const team = a;
    if (G.coreHp[team] <= 0) return;
    G.coreHp[team] = Math.max(0, G.coreHp[team] - amount);
    net.publish({ t: 'core', team, hp: G.coreHp[team], by, amt: amount });
    if (G.coreHp[team] <= 0) {
      G.over = true;
      net.publish({ t: 'end', winner: team === 'blue' ? 'red' : 'blue' });
    }
    return;
  }

  if (type === 'd') {
    const team = a, idx = parseInt(b, 10);
    const set = G.hostState.destroyed[team];
    if (set.has(idx)) return;
    const isl = G.islands[team];
    const d = isl.destructibles[idx];
    if (!d) return;
    d.hp -= amount;
    if (d.hp <= 0) { set.add(idx); net.publish({ t: 'destroy', team, idx }); }
    return;
  }

  const id = a;
  const s = G.hostState.hp.get(id);
  if (!s || G.hostState.dead.has(id)) return;

  if (type === 'a') {
    if (s.craft <= 0) return;
    s.craft -= amount;
    net.publish({ t: 'ahp', id, hp: Math.max(0, s.craft), by });
    if (s.craft <= 0) {
      G.hostState.dead.set(id, G.time + RESPAWN_TIME);
      net.publish({ t: 'kill', id, by, cause: kind });
    }
    return;
  }

  s.player -= amount;
  net.publish({ t: 'php', id, hp: Math.max(0, s.player), by });
  if (s.player <= 0) {
    G.hostState.dead.set(id, G.time + RESPAWN_TIME);
    net.publish({ t: 'kill', id, by, cause: kind });
  }
}

function hostTick(dt) {
  if (!net.isHost || !G.running) return;
  G.hostAcc += dt;
  if (G.hostAcc < 1) return;
  G.hostAcc = 0;

  if (!G.over) {
    G.matchTime -= 1;
    if (G.matchTime <= 0) {
      G.over = true;
      const winner = G.coreHp.blue === G.coreHp.red ? 'draw' : (G.coreHp.blue > G.coreHp.red ? 'blue' : 'red');
      net.publish({ t: 'end', winner });
    }
  }
  net.publish({ t: 'tick', time: G.matchTime, cb: G.coreHp.blue, cr: G.coreHp.red });

  // Neue Spieler ins HP-Register aufnehmen
  for (const p of net.players.values()) {
    if (!G.hostState.hp.has(p.id)) G.hostState.hp.set(p.id, { player: PLAYER_HP, craft: 0 });
  }
}

/* ================================================================== *
 *  Autoritative Nachrichten anwenden (auf allen Clients)
 * ================================================================== */

function onAuthMsg(m) {
  switch (m.t) {
    case 'st': {
      let r = G.remotes.get(m.id);
      if (!r) {
        const info = net.players.get(m.id);
        if (!info || m.id === net.myId) return;
        r = new RemotePlayer(m.id, info.team, info.craft, info.name);
        G.remotes.set(m.id, r);
      }
      r.applyState(m);
      break;
    }
    case 'shot': {
      if (m.by === net.myId) break;
      spawnRemoteShot(m);
      break;
    }
    case 'core': {
      const prev = G.coreHp[m.team];
      G.coreHp[m.team] = m.hp;
      const isl = G.islands[m.team];
      isl.core.setHP(m.hp);
      G.fx.coreBurst(isl.corePos, TEAM_COLOR[m.team]);
      sfx.coreHit(isl.corePos.distanceTo(G.camera.position));
      if (G.me && G.me.team === m.team) {
        onCoreUnderAttack(m.team, prev, m.hp);
      }
      if (m.hp <= 0) coreDestroyed(m.team);
      updateHud();
      break;
    }
    case 'php': {
      if (m.id === net.myId && G.me) {
        const dropped = m.hp < G.me.hp;
        G.me.hp = m.hp;
        if (dropped) { flashDamage(); addShake(0.25); }
        if (m.hp <= 0) G.me.die('shot');
        updateHud();
      } else {
        const r = G.remotes.get(m.id);
        if (r) {
          r.hp = m.hp;
          if (m.hp >= PLAYER_HP && r.mode === 'dead') r.mode = 'foot';
        }
      }
      break;
    }
    case 'ahp': {
      if (m.id === net.myId && G.me) {
        const dropped = m.hp < G.me.craftHp;
        G.me.craftHp = m.hp;
        if (dropped) { flashDamage(); addShake(0.3); }
        if (m.hp <= 0 && G.me.mode === 'fly') G.me.die('shotdown');
        updateHud();
      } else {
        const r = G.remotes.get(m.id);
        if (r) r.craftHp = m.hp;
      }
      break;
    }
    case 'kill': {
      const victim = net.players.get(m.id);
      const killer = m.by ? net.players.get(m.by) : null;
      killFeed(killer ? killer.name : 'SKYFALL', victim ? victim.name : '???', m.cause);
      if (m.id === net.myId && G.me && G.me.mode !== 'dead') G.me.die(m.cause);
      else {
        const r = G.remotes.get(m.id);
        if (r) {
          G.fx.explosion(r.pos.clone().setY(r.pos.y + 1), r.mode === 'fly' ? 2.2 : 1.0, 0xff8a3c);
          sfx.explosion(r.pos.distanceTo(G.camera.position), r.mode === 'fly' ? 1.6 : 1);
          r.mode = 'dead';
          r.avatar.visible = false;
          if (r.craft) r.craft.visible = false;
        }
      }
      break;
    }
    case 'destroy': {
      const isl = G.islands[m.team];
      const d = isl.destructibles[m.idx];
      if (!d || d.dead) break;
      d.dead = true;
      d.mesh.visible = false;
      for (const e of d.extra || []) e.visible = false;
      G.fx.explosion(d.world, 2.6, 0xffa040);
      sfx.explosion(d.world.distanceTo(G.camera.position), 2);
      if (G.me && G.me.team === m.team) toast('ANLAGE ZERSTÖRT');
      break;
    }
    case 'tick': {
      G.matchTime = m.time;
      if (Math.abs(G.coreHp.blue - m.cb) > 0.5) { G.coreHp.blue = m.cb; G.islands.blue.core.setHP(m.cb); }
      if (Math.abs(G.coreHp.red - m.cr) > 0.5) { G.coreHp.red = m.cr; G.islands.red.core.setHP(m.cr); }
      updateHud();
      break;
    }
    case 'end':
      showEnd(m.winner);
      break;
  }
}

function spawnRemoteShot(m) {
  const def = m.k === 'turret'
    ? { speed: 400, color: m.tm === 'blue' ? 0x9fe0ff : 0xffb066, dmg: 0 }
    : m.k === 'aircannon'
      ? { speed: 560, color: m.tm === 'blue' ? 0x9fe0ff : 0xffd08a }
      : m.k === 'bomb' || m.k === 'rocket'
        ? { speed: m.k === 'bomb' ? 40 : 140, color: 0xff9440, big: true, gravity: m.k === 'bomb' ? 18 : 3 }
        : { speed: WEAPONS[m.k] ? WEAPONS[m.k].speed : 240, color: WEAPONS[m.k] ? WEAPONS[m.k].color : 0x8fe3ff };

  const pos = new THREE.Vector3(m.x, m.y, m.z);
  fireProjectile({
    pos, dir: new THREE.Vector3(m.dx, m.dy, m.dz), speed: def.speed, dmg: 0,
    color: def.color, owner: m.by, team: m.tm, mine: false,
    kind: m.k, big: def.big, gravity: def.gravity || 0, life: 4,
    splash: (m.k === 'rocket' || m.k === 'bomb') ? 1 : 0, radius: m.k === 'bomb' ? 16 : 8
  });
  G.fx.muzzle(pos, new THREE.Vector3(m.dx, m.dy, m.dz), def.color);
  sfx.shot(m.k === 'aircannon' ? 'blaster' : m.k, pos.distanceTo(G.camera.position));
}

let lastAlarm = 0;
function onCoreUnderAttack(team, prev, hp) {
  if (G.time - lastAlarm < 6) return;
  lastAlarm = G.time;
  alertBanner('CORE UNTER BESCHUSS', `${Math.round(hp)} / ${CORE_MAX_HP}`);
  sfx.alarm();
  void team; void prev;
}

function coreDestroyed(team) {
  const isl = G.islands[team];
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const p = isl.corePos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 40));
      G.fx.explosion(p, 2 + Math.random() * 2, 0xffb050);
      sfx.explosion(p.distanceTo(G.camera.position), 2);
      addShake(1.4);
    }, i * 190);
  }
  G.fx.explosion(isl.corePos, 6, 0xffe0a0);
  addShake(1.6);
  isl.core.destroyed = true;
  for (const t of isl.turrets) t.dead = true;
}

/* ================================================================== *
 *  HUD
 * ================================================================== */

function updateHud() {
  const me = G.me;
  if (!me) return;
  const mine = me.team, foe = me.team === 'blue' ? 'red' : 'blue';

  const pctA = Math.max(0, G.coreHp[mine] / CORE_MAX_HP);
  const pctB = Math.max(0, G.coreHp[foe] / CORE_MAX_HP);
  $('coreMineFill').style.width = (pctA * 100).toFixed(1) + '%';
  $('coreFoeFill').style.width = (pctB * 100).toFixed(1) + '%';
  $('coreMineVal').textContent = Math.round(G.coreHp[mine]);
  $('coreFoeVal').textContent = Math.round(G.coreHp[foe]);
  $('coreMine').className = 'corebar ' + mine + (pctA <= 0.25 ? ' critical' : '');
  $('coreFoe').className = 'corebar ' + foe + (pctB <= 0.25 ? ' critical' : '');

  const flying = me.mode === 'fly';
  $('hpFill').style.width = flying
    ? Math.max(0, me.craftHp / me.spec.hp * 100) + '%'
    : Math.max(0, me.hp / PLAYER_HP * 100) + '%';
  $('hpVal').textContent = flying ? Math.max(0, Math.round(me.craftHp)) : Math.max(0, Math.round(me.hp));
  $('hpLabel').textContent = flying ? 'HULL' : 'VITALS';

  $('boostWrap').style.display = flying ? '' : 'none';
  if (flying) {
    $('boostFill').style.width = (me.boostFuel * 100) + '%';
    $('spdVal').textContent = Math.round(me.speed);
    $('weapName').textContent = me.spec.label;
    $('ammoVal').textContent = me.spec.heavy ? me.heavyAmmo : '—';
    $('ammoLabel').textContent = me.spec.heavy ? (me.spec.heavy.type === 'bomb' ? 'BOMBEN' : 'RAKETEN') : 'KANONE';
  } else {
    const n = me.weaponName, w = WEAPONS[n];
    $('weapName').textContent = w.label;
    $('ammoVal').textContent = me.reloading > 0 ? 'LADEN' : me.ammo[n];
    $('ammoLabel').textContent = me.reserve[n] === Infinity ? 'ZELLE' : 'RESERVE ' + me.reserve[n];
    $('spdVal').textContent = '';
  }
  $('modeVal').textContent = { foot: 'ZU FUSS', fly: 'IM FLUG', fall: 'FREIER FALL', chute: 'FALLSCHIRM', dead: 'GEFALLEN' }[me.mode];
  for (let i = 0; i < 3; i++) {
    $('slot' + i).classList.toggle('active', !flying && me.weapon === i);
    $('slot' + i).style.display = flying ? 'none' : '';
  }
}

function updateTimer() {
  const t = Math.max(0, G.matchTime);
  $('timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  $('ping').textContent = net.isHost ? 'HOST' : (net.stats.ping ? net.stats.ping + ' ms' : '—');
}

let toastT = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  toastT = G.time + 2.4;
}

function alertBanner(title, sub) {
  const el = $('alert');
  $('alertTitle').textContent = title;
  $('alertSub').textContent = sub || '';
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 3200);
}

function killFeed(killer, victim, cause) {
  const el = document.createElement('div');
  const verb = cause === 'crash' ? 'zerschellt' : cause === 'void' ? 'ist gefallen' :
    cause === 'fall' ? 'Aufprall' : cause === 'turret' ? 'Flak' : '×';
  el.className = 'kf';
  el.innerHTML = `<span class="k">${killer}</span> <span class="v">${verb}</span> <span class="d">${victim}</span>`;
  $('killfeed').prepend(el);
  setTimeout(() => el.remove(), 6000);
  while ($('killfeed').children.length > 5) $('killfeed').lastChild.remove();
}

function flashDamage() {
  const el = $('dmgFlash');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

/* ---------------- Radar ---------------- */

let radarCtx = null;
function drawRadar() {
  const me = G.me;
  if (!me) return;
  if (!radarCtx) radarCtx = $('radar').getContext('2d');
  const c = radarCtx, S = 132, R = S / 2;
  const RANGE = 1500;
  c.clearRect(0, 0, S, S);

  c.strokeStyle = 'rgba(150,180,200,0.18)';
  c.lineWidth = 1;
  c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(R, R, (R - 2) * 0.5, 0, Math.PI * 2); c.stroke();

  const cos = Math.cos(-me.yaw), sin = Math.sin(-me.yaw);
  const heading = me.mode === 'fly'
    ? Math.atan2(-forwardOf(me.quat).x, -forwardOf(me.quat).z)
    : me.yaw;
  const ch = Math.cos(-heading), sh = Math.sin(-heading);
  void cos; void sin;

  const plot = (pos, color, size) => {
    let dx = pos.x - me.pos.x, dz = pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > RANGE) { dx *= RANGE / d; dz *= RANGE / d; }
    const rx = dx * ch - dz * sh, rz = dx * sh + dz * ch;
    const x = R + (rx / RANGE) * (R - 6);
    const y = R + (rz / RANGE) * (R - 6);
    c.fillStyle = color;
    c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.fill();
  };

  for (const team of ['blue', 'red']) {
    if (G.coreHp[team] <= 0) continue;
    plot(G.islands[team].corePos, team === me.team ? '#4fd0ff' : '#ff6a55', 4.5);
  }
  for (const r of G.remotes.values()) {
    if (r.mode === 'dead') continue;
    plot(r.pos, r.team === me.team ? '#7fe0a0' : '#ff5a44', r.mode === 'fly' ? 3.2 : 2.4);
  }

  c.fillStyle = '#f4efe3';
  c.beginPath();
  c.moveTo(R, R - 6); c.lineTo(R - 4, R + 5); c.lineTo(R + 4, R + 5);
  c.closePath(); c.fill();
}

/* ================================================================== *
 *  Netzwerk-Anbindung
 * ================================================================== */

function sendState(dt) {
  G.netAcc += dt;
  if (G.netAcc < NET_RATE || !G.me) return;
  G.netAcc = 0;
  const me = G.me;
  const q = me.mode === 'fly' ? me.quat : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, me.yaw, 0));
  net.toHost({
    t: 'st', m: me.mode,
    x: r2(me.pos.x), y: r2(me.pos.y), z: r2(me.pos.z),
    qx: r3(q.x), qy: r3(q.y), qz: r3(q.z), qw: r3(q.w),
    vx: r2(me.vel.x), vy: r2(me.vel.y), vz: r2(me.vel.z),
    c: me.craftType, th: r2(me.throttle), b: me.boosting, ch: me.chute
  });
  net.measurePing();
}
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ================================================================== *
 *  Hauptschleife
 * ================================================================== */

let hudAcc = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, G.clock.getDelta());
  G.time += dt;

  if (G.running) {
    if (G.intro > 0) updateIntro(dt);
    else updateLocal(dt);

    for (const r of G.remotes.values()) r.update(dt);
    updateProjectiles(dt);
    updateWrecks(dt);
    updateTurrets(dt);
    sendState(dt);
    hostTick(dt);
    updateTimer();
    drawRadar();
    hudAcc += dt;
    if (hudAcc > 0.1) { hudAcc = 0; updateHud(); }

    if (toastT && G.time > toastT) { $('toast').classList.remove('on'); toastT = 0; }
  }

  G.islands.blue.core.update(dt, G.time);
  G.islands.red.core.update(dt, G.time);
  G.clouds.update(dt);
  G.rain.update(dt, G.camera);
  G.fx.update(dt);
  G.sky.follow(G.camera);
  G.lighting.follow(G.me ? G.me.pos : G.camera.position);

  updateLightning(dt);

  G.composer.render();
}

function updateLightning(dt) {
  if (G.weather !== 'storm') { G.sky.flash = 0; return; }
  G.lightningT -= dt;
  if (G.lightningT <= 0) {
    G.lightningT = 5 + Math.random() * 11;
    G.lightning = 0.55;
    sfx.thunder();
  }
  if (G.lightning > 0) {
    G.lightning = Math.max(0, G.lightning - dt * 2.4);
    const f = G.lightning * (Math.random() < 0.5 ? 1 : 0.3);
    G.sky.flash = f;
    G.lighting.ambient.intensity = WEATHER.storm.ambientIntensity + f * 2.4;
  } else {
    G.sky.flash = 0;
    G.lighting.ambient.intensity = WEATHER.storm.ambientIntensity;
  }
}

/* ================================================================== *
 *  Menü / Lobby
 * ================================================================== */

let selectedCraft = 'striker';
let myTeam = 'blue';
let ready = false;

function initUI() {
  const nameInput = $('inpName');
  nameInput.value = localStorage.getItem('skyfall.name') || 'PILOT-' + Math.floor(Math.random() * 900 + 100);

  $('btnCreate').onclick = () => {
    sfx.init(); sfx.resume(); sfx.ui('ok');
    saveName();
    net.createRoom(nameInput.value.trim() || 'PILOT');
    showScreen('lobby');
    $('lobbyStatus').textContent = 'Raum wird geöffnet …';
  };

  $('btnJoin').onclick = () => { sfx.init(); sfx.ui('click'); $('joinBox').classList.add('on'); $('inpCode').focus(); };
  $('btnJoinCancel').onclick = () => $('joinBox').classList.remove('on');
  $('btnJoinGo').onclick = () => {
    sfx.init(); sfx.resume(); saveName();
    const code = $('inpCode').value.trim().toUpperCase();
    if (code.length < 4) { toastMenu('Room-Code eingeben.'); return; }
    net.joinRoom(code, nameInput.value.trim() || 'PILOT');
    showScreen('lobby');
    $('lobbyStatus').textContent = `Verbinde mit Raum ${code} …`;
  };
  $('inpCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoinGo').click(); });
  $('inpCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });

  $('btnTeamBlue').onclick = () => setTeam('blue');
  $('btnTeamRed').onclick = () => setTeam('red');
  $('btnReady').onclick = () => {
    ready = !ready;
    net.toHost({ t: 'ready', v: ready });
    sfx.ui(ready ? 'ok' : 'click');
    renderLobby();
  };
  $('btnStart').onclick = () => {
    if (!net.isHost) return;
    net.startMatch($('weatherSel').value);
  };
  $('btnLeave').onclick = () => location.reload();
  $('btnQuit').onclick = () => location.reload();

  document.querySelectorAll('[data-craft]').forEach(b => {
    b.onclick = () => {
      selectedCraft = b.dataset.craft;
      net.toHost({ t: 'craft', craft: selectedCraft });
      sfx.ui('click');
      renderLobby();
    };
  });

  $('btnCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(net.code || '');
      $('btnCopy').textContent = 'KOPIERT';
      setTimeout(() => ($('btnCopy').textContent = 'CODE KOPIEREN'), 1500);
    } catch (e) {
      toastMenu('Kopieren nicht möglich — Code bitte manuell weitergeben.');
    }
  };

  net.on('open', () => renderLobby());
  net.on('lobby', () => renderLobby());
  net.on('start', (m) => beginMatch(m));
  net.on('msg', (m) => onAuthMsg(m));
  net.on('hostMsg', (m) => hostOnMsg(m));
  net.on('peerJoin', (p) => { toastMenu(`${p.name} ist beigetreten.`); sfx.ui('ok'); });
  net.on('leave', (m) => {
    const r = G.remotes.get(m.id);
    if (r) { r.dispose(); G.remotes.delete(m.id); }
    G.hostState.hp.delete(m.id);
    G.hostState.dead.delete(m.id);
    renderLobby();
  });
  net.on('error', (msg) => { toastMenu(msg); $('lobbyStatus').textContent = msg; });
  net.on('disconnected', (msg) => { toastMenu(msg); alertBanner('VERBINDUNG VERLOREN', msg); });
}

function saveName() { localStorage.setItem('skyfall.name', $('inpName').value.trim()); }

function setTeam(team) {
  myTeam = team;
  ready = false;
  net.toHost({ t: 'team', team });
  net.toHost({ t: 'ready', v: false });
  sfx.ui('click');
  renderLobby();
}

function showScreen(name) {
  for (const id of ['menu', 'lobby', 'endScreen']) $(id).classList.toggle('on', id === name);
  $('hud').classList.toggle('on', name === 'game');
}

function toastMenu(msg) {
  const el = $('menuToast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 3600);
}

function renderLobby() {
  if (!net.code) return;
  $('roomCode').textContent = net.code;
  $('lobbyStatus').textContent = net.isHost
    ? 'Raum offen — gib den Code an deine Mitspieler.'
    : 'Verbunden.';

  const me = net.players.get(net.myId);
  if (me) { myTeam = me.team; ready = me.ready; selectedCraft = me.craft; }

  for (const team of ['blue', 'red']) {
    const box = $('list' + (team === 'blue' ? 'Blue' : 'Red'));
    box.innerHTML = '';
    const members = [...net.players.values()].filter(p => p.team === team);
    for (let i = 0; i < 3; i++) {
      const p = members[i];
      const row = document.createElement('div');
      row.className = 'slot' + (p ? ' filled' : '') + (p && p.ready ? ' ready' : '');
      row.innerHTML = p
        ? `<span class="nm">${p.name}${p.host ? ' <em>HOST</em>' : ''}</span>
           <span class="cf">${AIRCRAFT_SPECS[p.craft].label}</span>
           <span class="rd">${p.ready ? 'BEREIT' : '…'}</span>`
        : `<span class="nm empty">FREIER PLATZ</span>`;
      box.appendChild(row);
    }
  }

  $('btnTeamBlue').classList.toggle('sel', myTeam === 'blue');
  $('btnTeamRed').classList.toggle('sel', myTeam === 'red');
  document.querySelectorAll('[data-craft]').forEach(b => b.classList.toggle('sel', b.dataset.craft === selectedCraft));
  $('btnReady').textContent = ready ? 'BEREIT ✓' : 'BEREIT';
  $('btnReady').classList.toggle('sel', ready);

  $('hostOnly').style.display = net.isHost ? '' : 'none';
  const canStart = net.canStart();
  $('btnStart').disabled = !canStart;
  $('btnStart').textContent = canStart
    ? (net.playerCount === 1 ? 'ALLEIN STARTEN (TRAINING)' : 'MATCH STARTEN')
    : 'WARTE AUF BEREITSCHAFT';
}

/* ================================================================== *
 *  Matchstart
 * ================================================================== */

function beginMatch(m) {
  applyWeather(m.weather in WEATHER ? m.weather : 'sunset');
  G.coreHp.blue = CORE_MAX_HP;
  G.coreHp.red = CORE_MAX_HP;
  G.islands.blue.core.setHP(CORE_MAX_HP);
  G.islands.red.core.setHP(CORE_MAX_HP);
  G.matchTime = MATCH_TIME;
  G.over = false;

  const info = net.players.get(net.myId);
  const team = info ? info.team : 'blue';
  const craft = info ? info.craft : 'striker';

  G.me = new LocalPlayer(net.myId, team, craft);
  G.me.spawn();

  for (const p of net.players.values()) {
    if (p.id === net.myId) continue;
    if (!G.remotes.has(p.id)) G.remotes.set(p.id, new RemotePlayer(p.id, p.team, p.craft, p.name));
  }

  if (net.isHost) hostInit();

  sfx.init(); sfx.resume(); sfx.ambientStart();
  showScreen('game');
  $('hud').classList.add('on');
  G.running = true;
  G.intro = 3.6;

  $('introTeam').textContent = team === 'blue' ? 'BLAUE FESTUNG' : 'ROTE FESTUNG';
  $('introTeam').className = 'team-' + team;
  $('introCard').classList.add('on');
  updateHud();
}

function showEnd(winner) {
  G.running = false;
  G.over = true;
  document.exitPointerLock();
  sfx.engineStop();
  const mine = G.me ? G.me.team : 'blue';
  const win = winner === mine;
  $('endTitle').textContent = winner === 'draw' ? 'UNENTSCHIEDEN' : (win ? 'SIEG' : 'NIEDERLAGE');
  $('endTitle').className = winner === 'draw' ? '' : (win ? 'win' : 'lose');
  $('endSub').textContent = winner === 'draw'
    ? 'Zeit abgelaufen — beide Cores halten.'
    : `${winner === 'blue' ? 'BLAU' : 'ROT'} hat den gegnerischen Core zerstört.`;
  showScreen('endScreen');
  $('hud').classList.remove('on');
}

/* ================================================================== *
 *  Start
 * ================================================================== */

function boot() {
  initRenderer();
  buildWorld();
  initInput();
  initUI();
  G.clock = new THREE.Clock();

  // Menü-Hintergrund: langsame Kamerafahrt über der blauen Insel
  const isl = G.islands.blue;
  let a = 0;
  const menuCam = () => {
    if (G.running || G.intro > 0) return;
    a += 0.0012;
    G.camera.position.set(
      isl.center.x + Math.cos(a) * 260,
      120 + Math.sin(a * 0.7) * 30,
      isl.center.z + Math.sin(a) * 260);
    G.camera.up.set(0, 1, 0);
    G.camera.lookAt(isl.center.x, 10, isl.center.z);
    setFov(52);
  };
  setInterval(menuCam, 16);

  $('loading').classList.remove('on');
  showScreen('menu');
  loop();
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
