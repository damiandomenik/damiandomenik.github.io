// SKYFALL — game.js
// Hauptschleife, Spielerlogik, Kampf, Host-Autorität, HUD, Lobby-Anbindung.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildIsland, Sky, CloudField, Rain, Lighting, WEATHER, CORE_MAX_HP, ISLAND_RADIUS } from './world.js';
import { buildAircraft, buildPilot, disposeObject, glowTexture, AIRCRAFT_SPECS, WEAPONS, TEAM_COLOR } from './models.js';
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
  matchTime: MATCH_TIME, intro: 0, kills: 0,
  coreHp: { blue: CORE_MAX_HP, red: CORE_MAX_HP },
  // Host-Only
  drones: new Map(),
  hostState: { hp: new Map(), dead: new Map(), lastHit: new Map(), hist: new Map(), destroyed: { blue: new Set(), red: new Set() } },
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
  renderer.toneMappingExposure = 1.18;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 12000);
  camera.position.set(0, 20, -820);
  G.camera = camera;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.48, 0.5, 0.9);
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

// Wie hoch das Modell ueber dem Startplatz stehen muss, damit das
// Fahrwerk nicht im Boden steckt.
const PARK_HEIGHT = { interceptor: 1.5, striker: 2.3, bomber: 3.9 };

function buildWorld() {
  G.islands.blue = buildIsland('blue');
  G.islands.red = buildIsland('red');
  G.scene.add(G.islands.blue.group, G.islands.red.group);
  buildParkedAircraft();
  initProjectilePool();
  applyWeather(G.weather);
}

// Auf jedem Startplatz steht sichtbar die Maschine, die man dort besteigt.
function buildParkedAircraft() {
  for (const team of ['blue', 'red']) {
    const isl = G.islands[team];
    isl.parked = [];
    for (const pad of isl.pads) {
      const mesh = buildAircraft(pad.type, team);
      mesh.position.copy(pad.pos).setY(pad.pos.y + PARK_HEIGHT[pad.type]);
      mesh.rotation.y = isl.forwardYaw;
      animateEngines(mesh, 0.1, false, 0);
      G.scene.add(mesh);
      isl.parked.push({ mesh, pad, cooldown: 0 });
    }
  }
}

// Nach dem Start rollt die Maschine kurz aus dem Bild und ist dann wieder da.
// Rein visuell und lokal — der Bestand ist nicht limitiert.
function updateParked(dt) {
  const idle = 0.08 + Math.sin(G.time * 1.6) * 0.03;   // leichtes Pulsieren im Stand
  for (const team of ['blue', 'red']) {
    for (const p of G.islands[team].parked) {
      if (p.mesh.visible) animateEngines(p.mesh, idle, false, dt);
      if (p.cooldown <= 0) continue;
      p.cooldown -= dt;
      if (p.cooldown <= 0) p.mesh.visible = true;
    }
  }
}

// Naechster Startplatz auf der eigenen Insel
function nearestPad(me, maxDist = 16) {
  const isl = islandOf(me.team);
  let best = null, bd = maxDist;
  for (const p of isl.parked) {
    const d = p.pad.pos.distanceTo(me.pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
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

// Anteil noch stehender Schildknoten, 1 = voll geschuetzt
function shieldLevel(team) {
  const d = G.islands[team].destructibles;
  if (!d.length) return 0;
  let alive = 0;
  for (const n of d) if (!n.dead) alive++;
  return alive / d.length;
}

// Wie viel Schaden der Core tatsaechlich nimmt. Bei vollem Schild bleiben
// 15 Prozent uebrig — genug, damit Beschuss nicht voellig folgenlos wirkt,
// zu wenig, um den Core ohne Vorarbeit zu knacken.
function coreVulnerability(team) {
  return 0.15 + 0.85 * (1 - shieldLevel(team));
}

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

// Wurfwaffen haben keine Reserve — was man beim Spawn hat, ist alles.
function freshAmmo() {
  return {
    blaster: WEAPONS.blaster.mag, scatter: WEAPONS.scatter.mag, rocket: WEAPONS.rocket.mag,
    grenade: WEAPONS.grenade.mag, charge: WEAPONS.charge.mag
  };
}
function freshReserve() {
  return { blaster: Infinity, scatter: 48, rocket: 16, grenade: 0, charge: 0 };
}

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
    this.weaponList = ['blaster', 'scatter', 'rocket', 'grenade', 'charge'];
    this.weapon = 0;
    this.ammo = freshAmmo();
    this.reserve = freshReserve();
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
    if (this.diedFlying) { this.diedFlying = false; this.spawnAirborne(); return; }
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
    this.ammo = freshAmmo();
    this.reserve = freshReserve();
    this.weapon = 0;
    this.reloading = 0;
    this.destroyCraft(false);
    this.avatar.visible = true;
    sfx.engineStop();
  }

  // Start hoch ueber der eigenen Insel, Nase Richtung Gegner.
  spawnAirborne() {
    const isl = islandOf(this.team);
    this.hp = PLAYER_HP;
    this.chute = false;
    this.ammo = freshAmmo();
    this.reserve = freshReserve();
    this.weapon = 0;
    this.reloading = 0;
    this.destroyCraft(false);
    this.avatar.visible = false;

    const yaw = isl.forwardYaw;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
    this.pos.copy(isl.center).addScaledVector(dir, 40);
    this.pos.y = 190 + Math.random() * 40;
    this.yaw = yaw;
    this.pitch = 0;
    this.quat.setFromEuler(new THREE.Euler(0, yaw, 0));

    this.craft = buildAircraft(this.craftType, this.team);
    this.craft.position.copy(this.pos);
    this.craft.quaternion.copy(this.quat);
    G.scene.add(this.craft);

    this.craftHp = this.spec.hp;
    this.speed = this.spec.cruise;
    this.spawnGrace = 1.0;
    this.throttle = 0.9;
    this.boostFuel = 1;
    this.heavyAmmo = this.spec.heavy ? this.spec.heavy.ammo : 0;
    this.mode = 'fly';
    this.stick.set(0, 0);
    sfx.engineStart();
    net.toHost({ t: 'board', c: this.craftType });
    toast('WIEDER IN DER LUFT');
  }

  destroyCraft(explode) {
    if (this.craft) {
      if (explode) {
        G.fx.explosion(this.craft.position, 2.2, 0xffa040);
        sfx.explosion(0, 1.6);
        addShake(0.9);
      }
      G.scene.remove(this.craft);
      disposeObject(this.craft);
      this.craft = null;
    }
  }

  board() {
    const parked = nearestPad(this, 16);
    if (!parked) { toast('Zu einem Startplatz im Hangar gehen.'); return; }
    if (parked.cooldown > 0) { toast('Startplatz wird noch geräumt.'); return; }

    const pad = parked.pad.pos;
    this.craftType = parked.pad.type;      // die Maschine, vor der man steht
    parked.mesh.visible = false;
    parked.cooldown = 3;

    this.craft = buildAircraft(this.craftType, this.team);
    this.craft.position.copy(pad).setY(pad.y + PARK_HEIGHT[this.craftType]);
    // Nase zeigt entlang der Startbahn zur gegnerischen Festung, leicht angestellt
    this.quat.setFromEuler(new THREE.Euler(0, islandOf(this.team).forwardYaw, 0));
    this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.24));
    this.craft.quaternion.copy(this.quat);
    G.scene.add(this.craft);

    this.craftHp = this.spec.hp;
    this.speed = this.spec.cruise;      // Katapultstart, kein Strömungsabriss
    this.spawnGrace = 1.4;
    this.throttle = 0.85;
    this.boostFuel = 1;
    this.heavyAmmo = this.spec.heavy ? this.spec.heavy.ammo : 0;
    this.mode = 'fly';
    this.avatar.visible = false;
    this.stick.set(0, 0);
    this.roll = 0;
    sfx.engineStart();
    G.fx.explosion(this.craft.position.clone().setY(pad.y), 0.7, 0xffd9a0);
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
    toast('AUSGESTIEGEN — LEERTASTE ÖFFNET DEN SCHIRM');
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
    this.diedFlying = this.mode === 'fly';
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

// Wiederverwendbare Rechenpuffer. Ohne sie erzeugt die Hauptschleife
// mehrere hundert Vector3 pro Frame, was regelmaessige GC-Pausen ausloest.
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const _s4 = new THREE.Vector3(), _s5 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _sq = new THREE.Quaternion();

function forwardOf(q, out) {
  return (out || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(q);
}

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
      disposeObject(w);
      wrecks.splice(i, 1);
    }
  }
}

/* ================================================================== *
 *  Remote-Spieler
 * ================================================================== */

const _remEuler = new THREE.Euler();
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

    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: TEAM_COLOR[team], transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    this.marker.visible = false;
    G.scene.add(this.marker);
  }

  ensureCraft(type) {
    if (this.craft && this.craftType === type) return;
    if (this.craft) { G.scene.remove(this.craft); disposeObject(this.craft); }
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
        const back = forwardOf(this.quat, _s1).multiplyScalar(-1);
        G.fx.engineTrail(_s2.copy(this.craft.position).addScaledVector(back, 4), back, this.throttle, this.boost);
      }
    }
    if (this.avatar.visible) {
      this.avatar.position.copy(this.pos);
      _remEuler.setFromQuaternion(this.quat, 'YXZ');
      const e = _remEuler;
      this.avatar.rotation.y = e.y;
      this.avatar.userData.chute.visible = this.chute;
      const mv = localMove(this.vel, e.y);
      const sp = Math.hypot(mv.f, mv.r);
      this.walkPhase += dt * (sp > 1.2 ? 4.5 + sp * 0.5 : 2);
      animatePilot(this.avatar, this.walkPhase, mv, this.mode);
    }
    this.updateMarker();
  }

  // Blendet zwischen 60 m und 220 m ein und skaliert mit der Entfernung,
  // damit der Marker in jeder Distanz gleich gross wirkt.
  updateMarker() {
    if (this.mode === 'dead') { this.marker.visible = false; return; }
    const d = this.pos.distanceTo(G.camera.position);
    const a = THREE.MathUtils.clamp((d - 60) / 160, 0, 1) * 0.75;
    if (a <= 0.01) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.material.opacity = a;
    this.marker.position.copy(this.pos);
    this.marker.position.y += this.mode === 'fly' ? AIRCRAFT_SPECS[this.craftType].radius + 4 : 2.6;
    this.marker.scale.setScalar(Math.max(2, d * 0.028));
  }

  dispose() {
    G.scene.remove(this.marker);
    disposeObject(this.marker);
    G.scene.remove(this.avatar);
    disposeObject(this.avatar);
    if (this.craft) { G.scene.remove(this.craft); disposeObject(this.craft); }
  }
}

// mv = Bewegung im lokalen Raum der Figur: f = vorwaerts, r = rechts.
// Die Figur schaut immer in Blickrichtung, laeuft aber sichtbar seitwaerts.
function animatePilot(av, phase, mv, mode) {
  const u = av.userData;

  if (mode === 'fall' || mode === 'chute') {
    u.legs[0].rotation.set(0.5, 0, 0.25);
    u.legs[1].rotation.set(0.2, 0, -0.25);
    u.arms[0].rotation.set(-0.6, 0, 0.5);
    u.arms[1].rotation.set(-1.4, 0, -0.5);
    u.hips.rotation.set(mode === 'chute' ? 0.15 : 0.5, 0, 0);
    u.hips.position.y = 0.9;
    return;
  }

  const speed = Math.hypot(mv.f, mv.r);
  const moving = speed > 1.2;
  const swing = Math.sin(phase);
  const fwd = speed > 0.01 ? mv.f / speed : 1;
  const side = speed > 0.01 ? mv.r / speed : 0;
  const amp = moving ? Math.min(1, speed / 10) : 0;

  // Vorwaerts/rueckwaerts: klassisches Schrittpendeln
  u.legs[0].rotation.x = swing * 0.68 * fwd * amp;
  u.legs[1].rotation.x = -swing * 0.68 * fwd * amp;
  // Seitwaerts: Scherenschritt, Beine gehen auf und zu
  u.legs[0].rotation.z = swing * 0.34 * side * amp;
  u.legs[1].rotation.z = swing * 0.34 * side * amp;

  u.arms[1].rotation.x = -swing * 0.55 * fwd * amp;
  u.arms[1].rotation.z = -0.08 - Math.abs(side) * 0.25 * amp;
  u.arms[0].rotation.x = -0.95;          // Waffenarm bleibt vorn
  u.arms[0].rotation.z = 0.1;

  // Koerper lehnt sich leicht in die Laufrichtung
  u.hips.rotation.z = -side * 0.14 * amp;
  u.hips.rotation.x = Math.max(0, fwd) * 0.09 * amp;
  u.hips.rotation.y = side * 0.18 * amp;
  u.hips.position.y = 0.9 + (moving ? Math.abs(swing) * 0.055 * amp : 0);
}

// Weltgeschwindigkeit in den lokalen Raum der Figur umrechnen
function localMove(vel, yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { f: vel.x * fx + vel.z * fz, r: vel.x * rx + vel.z * rz };
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
    gravity: opts.gravity || 0, trail: opts.trail !== false,
    fuse: opts.fuse ?? null, stuck: false
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

    // Wurfwaffen: Zuender laeuft, danach Detonation am Liegeplatz
    if (p.fuse !== null) {
      p.fuse -= dt;
      if (p.fuse <= 0) {
        detonate(p);
        retire(p, i);
        continue;
      }
      if (p.stuck) {
        blinkFuse(p);
        continue;
      }
    }

    if (p.gravity) p.vel.y -= p.gravity * dt;
    _s1.copy(p.vel).multiplyScalar(dt);          // Schrittvektor
    _s2.copy(p.pos).add(_s1);                    // Zielposition

    let hit = null;
    if (p.mine) hit = traceHit(p, p.pos, _s2);


    p.pos.copy(_s2);
    if (p.mesh.userData.proj === p) {
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(_s3.copy(p.pos).add(p.vel));
    }

    if (p.trail && Math.random() < 0.6) {
      G.fx.sparks.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, p.color, 1.4, 0.14, { drag: 0 });
    }

    if (hit) {
      if (p.fuse !== null) {
        if (hit.type === 'world') { stick(p, hit.point); continue; }
        hit = null;                      // Wurfwaffen fliegen an Gegnern vorbei
      }
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
        if (p.fuse !== null) {
          stick(p, _s3.copy(p.pos).setY(Math.max(p.pos.y, FOOT_Y + 0.2)));
          continue;
        }
        localBurst(p);
        retire(p, i);
        continue;
      }
    }
    if (p.life <= 0 || p.pos.y < DEATH_FLOOR || p.pos.distanceTo(cam) > 2600) retire(p, i);
  }
}

// Wurfwaffe kommt zum Liegen
function stick(p, point) {
  p.pos.copy(point);
  p.vel.set(0, 0, 0);
  p.gravity = 0;
  p.stuck = true;
  p.trail = false;
  if (p.mesh.userData.proj === p) p.mesh.position.copy(p.pos);
  G.fx.impact(p.pos, _up, p.color, 4);
}

// Blinkendes Zuenderlicht, schneller je naeher die Detonation
function blinkFuse(p) {
  if (Math.random() > 0.25 + (1 - p.fuse / 4) * 0.5) return;
  G.fx.sparks.spawn(p.pos.x, p.pos.y + 0.3, p.pos.z, 0, 1, 0, p.color, 2.2, 0.12, { drag: 2 });
}

// Detonation einer Wurfwaffe: reiner Flaechenschaden, kein Direkttreffer
function detonate(p) {
  G.fx.explosion(p.pos, p.radius > 12 ? 2.0 : 1.4, p.color);
  sfx.explosion(p.pos.distanceTo(G.camera.position), p.radius > 12 ? 1.8 : 1.3);
  if (p.pos.distanceTo(G.camera.position) < 40) addShake(0.8);
  if (!p.mine) return;
  for (const c of splashClaims(p, p.pos, new Set())) {
    net.toHost({
      t: 'hit', target: c.target, amount: Math.round(c.amount), w: p.kind,
      hx: r2(p.pos.x), hy: r2(p.pos.y), hz: r2(p.pos.z)
    });
  }
}

function retire(p, i) {
  if (p.mesh.userData.proj === p) { p.mesh.visible = false; p.mesh.userData.proj = null; }
  G.projectiles.splice(i, 1);
}

function localBurst(p) {
  const pos = p.pos;
  if (p.splash) {
    G.fx.explosion(pos, p.radius > 12 ? 1.7 : 1.1, p.color);
    sfx.explosion(pos.distanceTo(G.camera.position), p.radius > 12 ? 1.4 : 1);
  } else {
    G.fx.impact(p.pos, p.vel.clone().normalize().negate(), p.color, 8);
    sfx.hit(pos.distanceTo(G.camera.position));
  }
}

// Trefferprüfung — läuft nur für eigene Projektile.
const _seg = new THREE.Vector3(), _step = new THREE.Vector3();
const _probe = new THREE.Vector3(), _ctr = new THREE.Vector3();
function traceHit(p, from, to) {
  const seg = _seg.copy(to).sub(from);
  const len = seg.length();
  const steps = Math.max(1, Math.min(24, Math.ceil(len / 3)));
  const step = _step.copy(seg).divideScalar(steps);
  const probe = _probe.copy(from);

  for (let s = 0; s < steps; s++) {
    probe.add(step);

    // Gegnerische Spieler
    for (const r of G.remotes.values()) {
      if (r.team === p.team || r.mode === 'dead') continue;
      if (r.mode === 'fly' && r.craft) {
        const rad = AIRCRAFT_SPECS[r.craftType].radius + 1.2;
        if (probe.distanceToSquared(r.pos) < rad * rad) return { type: 'craft', id: r.id, point: probe.clone() };
      } else {
        _ctr.copy(r.pos); _ctr.y += 0.95;
        if (probe.distanceToSquared(_ctr) < 1.3) return { type: 'player', id: r.id, point: probe.clone() };
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

    // Zerstörbare Anlagen — nur die der Gegenseite
    for (const team of ['blue', 'red']) {
      if (team === p.team) continue;
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

// Flaechenschaden-Ansprueche um einen Detonationspunkt. `seen` enthaelt Ziele,
// die bereits einen Direkttreffer bekommen haben.
function splashClaims(p, point, seen) {
  const out = [];
  if (!p.splash || !p.radius) return out;

  for (const r of G.remotes.values()) {
    if (r.team === p.team || r.mode === 'dead') continue;
    const key = (r.mode === 'fly' ? 'a:' : 'p:') + r.id;
    if (seen.has(key)) continue;
    const d = r.pos.distanceTo(point);
    if (d < p.radius) out.push({ target: key, amount: p.splash * (1 - d / p.radius) });
  }
  for (const team of ['blue', 'red']) {
    if (team === p.team) continue;
    const key = 'c:' + team;
    if (seen.has(key) || G.coreHp[team] <= 0) continue;
    const d = G.islands[team].corePos.distanceTo(point);
    if (d < p.radius + 7) out.push({ target: key, amount: p.splash * p.coreMul * (1 - d / (p.radius + 7)) });
  }
  for (const team of ['blue', 'red']) {
    if (team === p.team) continue;
    const isl = G.islands[team];
    for (let i = 0; i < isl.destructibles.length; i++) {
      const dd = isl.destructibles[i];
      if (dd.dead) continue;
      const key = 'd:' + team + ':' + i;
      if (seen.has(key)) continue;
      const d = dd.world.distanceTo(point);
      if (d < p.radius + dd.radius) out.push({ target: key, amount: p.splash * (1 - d / (p.radius + dd.radius)) });
    }
  }
  // Die eigene Explosion tut auch dem Werfer weh
  if (G.me && G.me.mode !== 'dead') {
    const d = G.me.pos.distanceTo(point);
    if (d < p.radius) out.push({ target: 'p:' + G.me.id, amount: p.splash * 0.5 * (1 - d / p.radius) });
  }
  return out;
}

function onProjectileHit(p, hit) {
  localBurst({ ...p, pos: hit.point });
  if (hit.type === 'world') return;

  // Direkttreffer und Flaechenschaden werden als Anspruch an den Host gemeldet.
  // Der Host prueft die Geometrie gegen seinen Positionsverlauf.
  const claims = [];
  if (hit.type === 'player') claims.push({ target: 'p:' + hit.id, amount: p.dmg });
  if (hit.type === 'craft') claims.push({ target: 'a:' + hit.id, amount: p.dmg });
  if (hit.type === 'core') claims.push({ target: 'c:' + hit.team, amount: p.dmg * p.coreMul });
  if (hit.type === 'prop') claims.push({ target: 'd:' + hit.team + ':' + hit.idx, amount: p.dmg });

  const seen = new Set(claims.map(c => c.target));
  claims.push(...splashClaims(p, hit.point, seen));

  for (const c of claims) {
    net.toHost({
      t: 'hit', target: c.target, amount: Math.round(c.amount), w: p.kind,
      hx: r2(hit.point.x), hy: r2(hit.point.y), hz: r2(hit.point.z)
    });
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
    keys[e.code] = true;
    if (!G.running) return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'KeyE') onInteract();
    if (e.code === 'KeyF') G.me && G.me.eject();
    if (e.code === 'Space' && G.me && G.me.mode === 'fall') G.me.deployChute();
    if (e.code === 'Digit1') selectWeapon(0);
    if (e.code === 'Digit2') selectWeapon(1);
    if (e.code === 'Digit3') selectWeapon(2);
    if (e.code === 'Digit4') selectWeapon(3);
    if (e.code === 'Digit5') selectWeapon(4);
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
    const n = G.me.weaponList.length;
  selectWeapon((G.me.weapon + (e.deltaY > 0 ? 1 : n - 1)) % n);
  });
}

function selectWeapon(i) {
  const me = G.me;
  if (!me || me.mode !== 'foot' || i === me.weapon || i >= me.weaponList.length) return;
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
    const f = _s1.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    const r = _s2.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    const wish = _s3.set(0, 0, 0);
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
    const hspeed = Math.hypot(me.vel.x, me.vel.z);
    me.walkPhase += dt * (hspeed > 1.2 ? 4.5 + hspeed * 0.5 : 2);

    // Avatar erst setzen, dann feuern - sonst kommt der Schuss aus der
    // Position des letzten Frames (nach dem Respawn sogar vom Sterbeort).
    me.avatar.position.copy(me.pos);
    me.avatar.rotation.y = me.yaw;
    me.avatar.updateMatrixWorld(true);
    handleGroundFire(me, dt);
  } else {
    // Freier Fall und Fallschirm.
    // Der Schirm ist bewusst als Transportmittel ausgelegt: flacher Sinkflug,
    // damit man aus der Hoehe tatsaechlich die gegnerische Insel erreicht.
    const f = _s1.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    const r = _s2.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    const steer = me.chute ? 17 : 5;
    if (keys.KeyW) me.vel.addScaledVector(f, steer * dt);
    if (keys.KeyS) me.vel.addScaledVector(f, -steer * dt * 0.6);
    if (keys.KeyD) me.vel.addScaledVector(r, steer * dt * 0.7);
    if (keys.KeyA) me.vel.addScaledVector(r, -steer * dt * 0.7);

    me.vel.y -= GRAVITY * dt;
    me.vel.y = Math.max(me.vel.y, me.chute ? -7 : -95);
    const hDrag = me.chute ? 0.9 : 0.32;
    const damp = Math.max(0, 1 - hDrag * dt);
    me.vel.x *= damp;
    me.vel.z *= damp;

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
      me.vel.x *= 0.2; me.vel.z *= 0.2;
      toast(overIsland(me.pos, islandOf(me.team)) ? 'GELANDET' : 'AUF FEINDGEBIET GELANDET');
    }
  }

  // Avatar setzen
  me.avatar.position.copy(me.pos);
  me.avatar.rotation.y = me.yaw;
  animatePilot(me.avatar, me.walkPhase, localMove(me.vel, me.yaw), me.mode);

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
  if (me.ammo[n] <= 0) {
    sfx.ui('err');
    me.cool = 0.35;
    if (me.reserve[n] > 0) startReload();
    else toast(w.label + ' AUFGEBRAUCHT');
    return;
  }

  me.ammo[n]--;
  me.cool = w.rate;
  updateHud();

  const muzzle = new THREE.Vector3();
  me.avatar.userData.muzzle.getWorldPosition(muzzle);
  const aim = cameraAimDir(muzzle);

  if (w.fuse) {
    // Wurf: leicht nach oben angestellt, damit ein brauchbarer Bogen entsteht
    const dir = aim.clone();
    dir.y += w.arc;
    dir.normalize();
    const start = _s4.copy(muzzle).addScaledVector(dir, 0.6);
    fireProjectile({
      pos: start, dir, speed: w.speed, dmg: 0, color: w.color,
      splash: w.splash, radius: w.radius, coreMul: w.coreMul,
      owner: me.id, team: me.team, mine: true, kind: n,
      big: true, gravity: 20, life: w.fuse + 1, fuse: w.fuse, trail: false
    });
    net.toHost({
      t: 'shot', k: n, x: start.x, y: start.y, z: start.z,
      dx: dir.x, dy: dir.y, dz: dir.z, tm: me.team
    });
    sfx.shot('scatter', 0);
    updateHud();
    return;
  }

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
const _focus = new THREE.Vector3();
function cameraAimDir(from) {
  G.camera.getWorldDirection(_camDir);
  return _focus.copy(G.camera.position).addScaledVector(_camDir, 400).sub(from).normalize();
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
  const back = _s4.copy(fwd).negate();
  for (const e of me.craft.userData.engines) {
    e.getWorldPosition(_s5);
    G.fx.engineTrail(_s5.addScaledVector(back, 2), back, me.throttle, me.boosting);
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
      const wp = local.clone().applyQuaternion(me.quat).add(me.pos);
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

const _wingL = new THREE.Vector3(), _wingR = new THREE.Vector3();
function checkCraftCollision(me) {
  const isl = nearestIsland(me.pos);
  const spec = me.spec;
  const r = spec.radius;

  // Rumpfmitte plus beide Flügelspitzen — ein einzelner Punkt liess grosse
  // Maschinen durch Gebaeude hindurchfliegen.
  const halfSpan = r * 1.9;
  _wingL.set(-halfSpan, 0, 0).applyQuaternion(me.quat).add(me.pos);
  _wingR.set(halfSpan, 0, 0).applyQuaternion(me.quat).add(me.pos);

  const deckHit = (overIsland(me.pos, isl, r) && me.pos.y < FOOT_Y + r)
    || (overIsland(_wingL, isl, 1) && _wingL.y < FOOT_Y + 1)
    || (overIsland(_wingR, isl, 1) && _wingR.y < FOOT_Y + 1);
  const structHit = pointInColliders(me.pos, isl)
    || pointInColliders(_wingL, isl) || pointInColliders(_wingR, isl);
  const coreHit = me.pos.distanceTo(isl.corePos) < 10 + r;

  if (!deckHit && !structHit && !coreHit) return;

  const level = Math.abs(forwardOf(me.quat, _s1).y) < 0.30;
  const landSpeed = Math.max(50, spec.cruise * 0.72);
  const gentle = me.speed < landSpeed && level && deckHit && !structHit && !coreHit;

  if (gentle) {
    // Landung: Pilot steigt aus
    me.pos.y = FOOT_Y;
    me.mode = 'foot';
    me.yaw = new THREE.Euler().setFromQuaternion(me.quat, 'YXZ').y;
    me.pitch = 0;
    me.avatar.visible = true;
    G.scene.remove(me.craft);
    disposeObject(me.craft);
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

const _camEuler = new THREE.Euler();
const CAM_PIVOT_Y = 2.05;   // Drehpunkt knapp ueber dem Helm
const CAM_DIST = 5.0;
const camTmp = new THREE.Vector3();
const camGoal = new THREE.Vector3();
let camFov = 68;

function addShake(v) { G.shake = Math.min(1.6, G.shake + v); }

function updateFootCamera(me, dt, inAir) {
  G.camera.up.lerp(_up, Math.min(1, dt * 8));

  // Die Kamera kreist um einen Punkt ueber dem Kopf, nicht um die Schulter.
  // Dadurch bleibt die Figur waagerecht immer mittig, egal ob sie strafet.
  const pivot = _s5.copy(me.pos).setY(me.pos.y + CAM_PIVOT_Y);
  _camEuler.set(me.pitch, me.yaw, 0, 'YXZ');
  const q = _sq.setFromEuler(_camEuler);
  camGoal.copy(pivot).add(_s1.set(0, 0, CAM_DIST).applyQuaternion(q));

  // Nicht durch Wände klemmen
  const island = nearestIsland(me.pos);
  const dirv = _s2.copy(camGoal).sub(pivot);
  const dist = dirv.length();
  dirv.normalize();
  let clip = dist;
  for (let step = 1; step <= 6; step++) {
    const t = (step / 6) * dist;
    camTmp.copy(pivot).addScaledVector(dirv, t);
    if (pointInColliders(camTmp, island) || (overIsland(camTmp, island) && camTmp.y < FOOT_Y + 0.3)) { clip = t - 0.4; break; }
  }
  camGoal.copy(pivot).addScaledVector(dirv, Math.max(1.4, clip));

  G.camera.position.lerp(camGoal, Math.min(1, dt * (inAir ? 9 : 16)));
  // Blickachse laeuft durch den Pivot hindurch -> Kopf sitzt knapp unter der Bildmitte
  G.camera.lookAt(_s3.copy(pivot).addScaledVector(dirv, -40));
  applyShake(dt);
  camFov += ((inAir ? 82 : 70) - camFov) * Math.min(1, dt * 4);
  setFov(camFov);
}

function updateFlyCamera(me, dt) {
  const spec = me.spec;
  const back = 12 + spec.radius * 2.4;
  camGoal.set(0, spec.radius * 0.9 + 3.2, back).applyQuaternion(me.quat).add(me.pos);
  G.camera.position.lerp(camGoal, Math.min(1, dt * 6.5));

  _s1.set(0, 1, 0).applyQuaternion(me.quat).lerp(_up, 0.25);
  G.camera.up.lerp(_s1, Math.min(1, dt * 6));
  G.camera.lookAt(_s2.copy(me.pos).addScaledVector(forwardOf(me.quat, _s3), 42));
  applyShake(dt);

  const speedT = THREE.MathUtils.clamp(me.speed / spec.boost, 0, 1);
  const goalFov = 70 + speedT * 18 + (me.boosting ? 15 : 0);
  camFov += (goalFov - camFov) * Math.min(1, dt * (me.boosting ? 7 : 3.5));
  setFov(camFov);
  if (me.boosting) {
    addShake(dt * 1.8);
    // Geschwindigkeitsstreifen: ziehen seitlich an der Kanzel vorbei
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, rad = 6 + Math.random() * 14;
      _s4.set(Math.cos(a) * rad, Math.sin(a) * rad, -10 - Math.random() * 30)
        .applyQuaternion(me.quat).add(me.pos);
      G.fx.sparks.spawn(_s4.x, _s4.y, _s4.z,
        -me.vel.x * 0.45, -me.vel.y * 0.45, -me.vel.z * 0.45,
        0xbfe4ff, 1.1, 0.16, { drag: 0 });
    }
  }
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
  const center = isl.pads[0].pos.clone();
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

// Flak-Werte. Bewusst als Abschreckung ausgelegt, nicht als Todeszone:
// die Tuerme sollen den Anflug unangenehm machen, nicht ihn verbieten.
const TURRET = {
  range: 250,        // nur der Nahbereich der Insel, nicht der halbe Luftraum
  cooldown: 1.8,     // plus Zufall
  lockTime: 1.0,     // so lange muss ein Ziel im Visier bleiben
  damage: 7,
  baseHit: 0.55
};

function updateTurrets(dt) {
  for (const team of ['blue', 'red']) {
    const isl = G.islands[team];
    if (G.coreHp[team] <= 0) continue;
    for (const t of isl.turrets) {
      if (t.dead) continue;
      const tgt = nearestEnemyAir(team, t.world, TURRET.range);
      const o = t.obj.userData;

      if (tgt) {
        _tv.copy(tgt).sub(t.world);
        const yaw = Math.atan2(-_tv.x, -_tv.z) - (team === 'red' ? Math.PI : 0);
        const pitch = Math.atan2(_tv.y, Math.hypot(_tv.x, _tv.z));
        o.yaw.rotation.y = lerpAngle(o.yaw.rotation.y, yaw, Math.min(1, dt * 2.2));
        o.pitch.rotation.x = THREE.MathUtils.lerp(o.pitch.rotation.x, -pitch, Math.min(1, dt * 2.2));
        t.lock = (t.lock || 0) + dt;
      } else {
        o.yaw.rotation.y += dt * 0.15;
        o.pitch.rotation.x = THREE.MathUtils.lerp(o.pitch.rotation.x, -0.25, Math.min(1, dt * 1.2));
        t.lock = 0;
      }

      // Feuer nur beim Host, Schaden autoritativ
      if (!net.isHost) continue;
      t.cool -= dt;
      if (!tgt || t.cool > 0 || t.lock < TURRET.lockTime) continue;
      t.cool = TURRET.cooldown + Math.random();
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
  for (const [id, p] of allPlayers()) {
    if (p.team === team || p.mode !== 'fly') continue;
    if (p.pos.distanceTo(targetPos) > 10) continue;
    // Wer schnell fliegt oder boostet, wird schlechter getroffen.
    const speed = p.vel ? p.vel.length() : 0;
    let chance = TURRET.baseHit * (1 - Math.min(0.65, speed / 300));
    if (p.boosting || p.boost) chance *= 0.5;
    if (Math.random() > chance) return;
    hostApplyDamage('a:' + id, TURRET.damage, 'turret', null);
    return;
  }
}

function* allPlayers() {
  if (G.me) yield [G.me.id, G.me];
  for (const [id, r] of G.remotes) yield [id, r];
}

/* ================================================================== *
 *  Drohnen (nur der Host simuliert, alle sehen sie als Remote-Spieler)
 * ================================================================== */

const SQUAD_SIZE = 3;                 // Zielstaerke je Team, Spieler inklusive
const DRONE = {
  hp: 150, speed: 96, turn: 1.25, fireRange: 420, fireCone: 0.985,
  dmg: 8, rate: 0.22, burst: 4, burstPause: 1.4, respawn: 6, senseRange: 900
};

function droneId(team, i) { return 'AI' + team[0].toUpperCase() + i; }

function hostSpawnDrones() {
  G.drones.clear();
  if (!net.isHost) return;
  for (const team of ['blue', 'red']) {
    const humans = [...net.players.values()].filter(p => p.team === team).length;
    for (let i = 0; i < Math.max(0, SQUAD_SIZE - humans); i++) {
      const id = droneId(team, i);
      G.drones.set(id, makeDrone(id, team, i));
      G.hostState.hp.set(id, { player: 999, craft: DRONE.hp });
    }
  }
}

function makeDrone(id, team, i) {
  const isl = islandOf(team);
  const yaw = isl.forwardYaw;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
  const pos = isl.center.clone().addScaledVector(dir, 30 + i * 25);
  pos.x += (i - 1) * 45;
  pos.y = 150 + i * 30;
  return {
    id, team, type: i === 0 ? 'interceptor' : 'striker',
    pos, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    vel: new THREE.Vector3(), speed: DRONE.speed,
    cool: Math.random(), burst: 0, pause: 0, dead: 0, target: null, retarget: 0
  };
}

function hostUpdateDrones(dt) {
  if (!net.isHost || !G.running || G.over) return;
  for (const d of G.drones.values()) {
    if (d.dead > 0) {
      d.dead -= dt;
      if (d.dead <= 0) reviveDrone(d);
      continue;
    }
    steerDrone(d, dt);
    fireDrone(d, dt);
    recordHistory(d.id, d.pos.x, d.pos.y, d.pos.z, 'fly');
  }
}

function reviveDrone(d) {
  const fresh = makeDrone(d.id, d.team, d.id.charCodeAt(d.id.length - 1) - 48);
  d.pos.copy(fresh.pos); d.quat.copy(fresh.quat);
  d.speed = DRONE.speed; d.target = null; d.burst = 0; d.pause = 0;
  const s = G.hostState.hp.get(d.id);
  if (s) s.craft = DRONE.hp;
}

// Zielsuche: naechster lebender Gegner in der Luft oder am Boden.
function droneTarget(d) {
  let best = null, bd = DRONE.senseRange ** 2;
  const consider = (id, pos, team, mode) => {
    if (team === d.team || mode === 'dead') return;
    const dist = d.pos.distanceToSquared(pos);
    if (dist < bd) { bd = dist; best = { id, pos, mode }; }
  };
  if (G.me && G.me.team !== d.team) consider(G.me.id, G.me.pos, G.me.team, G.me.mode);
  for (const r of G.remotes.values()) if (!G.drones.has(r.id)) consider(r.id, r.pos, r.team, r.mode);
  for (const o of G.drones.values()) if (o !== d && o.dead <= 0) consider(o.id, o.pos, o.team, 'fly');
  return best;
}

const _dTo = new THREE.Vector3(), _dFwd = new THREE.Vector3();
const _dq = new THREE.Quaternion(), _dBank = new THREE.Quaternion();
const _dm = new THREE.Matrix4(), _zAxis = new THREE.Vector3(0, 0, 1);
function steerDrone(d, dt) {
  d.retarget -= dt;
  if (d.retarget <= 0 || !d.target) { d.target = droneTarget(d); d.retarget = 1.2; }

  const enemyIsl = islandOf(d.team === 'blue' ? 'red' : 'blue');
  let goal;
  if (d.target) {
    goal = _dTo.copy(d.target.pos);
    // Vorhalt: auf den Punkt zielen, an dem das Ziel gleich sein wird
    goal.y += d.target.mode === 'fly' ? 0 : 30;
  } else {
    // Kein Ziel: ueber der gegnerischen Insel kreisen, damit sie praesent bleiben
    const t = G.time * 0.25 + (d.id.charCodeAt(3) || 0);
    goal = _dTo.set(
      enemyIsl.center.x + Math.cos(t) * 220,
      170,
      enemyIsl.center.z + Math.sin(t) * 220);
  }

  // Mindesthoehe, damit Drohnen nicht in die Insel fliegen
  if (goal.y < 90) goal.y = 90;

  forwardOf(d.quat, _dFwd);
  const to = goal.sub(d.pos);
  const dist = to.length();
  to.normalize();

  // Zu nah dran: abdrehen statt rammen
  if (dist < 70 && d.target) to.negate().y = 0.3;

  // Ausrichtung ueber lookAt statt ueber eine freie Rotation: so bleibt die
  // Maschine aufrecht statt beliebig zu rollen.
  _dTo.copy(d.pos).addScaledVector(to, 100);
  _dm.lookAt(d.pos, _dTo, _up);
  _dq.setFromRotationMatrix(_dm);
  // In die Kurve legen — das ist der halbe Grund, warum Flugzeuge gut aussehen
  const side = _dFwd.x * to.z - _dFwd.z * to.x;
  _dBank.setFromAxisAngle(_zAxis, THREE.MathUtils.clamp(side * 2.2, -0.9, 0.9));
  _dq.multiply(_dBank);
  d.quat.slerp(_dq, Math.min(1, DRONE.turn * dt)).normalize();

  forwardOf(d.quat, _dFwd);
  d.speed += ((d.target ? DRONE.speed * 1.25 : DRONE.speed) - d.speed) * Math.min(1, dt);
  d.vel.copy(_dFwd).multiplyScalar(d.speed);
  d.pos.addScaledVector(d.vel, dt);
  if (d.pos.y < 70) d.pos.y = 70;
}

function fireDrone(d, dt) {
  d.cool -= dt;
  d.pause -= dt;
  if (!d.target || d.pause > 0 || d.cool > 0) return;

  const dist = d.pos.distanceTo(d.target.pos);
  if (dist > DRONE.fireRange) return;
  forwardOf(d.quat, _dFwd);
  _dTo.copy(d.target.pos).sub(d.pos).normalize();
  if (_dFwd.dot(_dTo) < DRONE.fireCone) return;   // nur bei sauberer Ausrichtung

  d.cool = DRONE.rate;
  if (++d.burst >= DRONE.burst) { d.burst = 0; d.pause = DRONE.burstPause; }

  const muzzle = _s1.copy(d.pos).addScaledVector(_dFwd, 5);
  net.publish({
    t: 'shot', k: 'aircannon', x: r2(muzzle.x), y: r2(muzzle.y), z: r2(muzzle.z),
    dx: r3(_dFwd.x), dy: r3(_dFwd.y), dz: r3(_dFwd.z), tm: d.team
  });

  // Drohnen treffen absichtlich nicht perfekt — sie sollen Druck machen,
  // nicht unfehlbar sein. Naeher und besser ausgerichtet trifft haeufiger.
  const quality = (_dFwd.dot(_dTo) - DRONE.fireCone) / (1 - DRONE.fireCone);
  if (Math.random() > 0.32 + quality * 0.3) return;
  const t = d.target;
  hostApplyDamage((t.mode === 'fly' ? 'a:' : 'p:') + t.id, DRONE.dmg, 'aircannon', d.id);
}

// Drohnenzustaende gehen im selben Format wie Spieler-Transforms raus
function broadcastDrones() {
  if (!net.isHost) return;
  for (const d of G.drones.values()) {
    net.publish({
      t: 'st', id: d.id, m: d.dead > 0 ? 'dead' : 'fly', ai: 1, tm: d.team,
      x: r2(d.pos.x), y: r2(d.pos.y), z: r2(d.pos.z),
      qx: r3(d.quat.x), qy: r3(d.quat.y), qz: r3(d.quat.z), qw: r3(d.quat.w),
      vx: r2(d.vel.x), vy: r2(d.vel.y), vz: r2(d.vel.z),
      c: d.type, th: 0.9, b: false, ch: false
    });
  }
}

/* ================================================================== *
 *  Host-Autorität
 * ================================================================== */

// Wie weit der Host zurueckblickt, wenn er einen Trefferanspruch prueft.
// Deckt Ping und die 20-Hz-Updaterate der Clients ab.
const REWIND_WINDOW = 0.45;

function recordHistory(id, x, y, z, mode) {
  const h = G.hostState.hist;
  let arr = h.get(id);
  if (!arr) { arr = []; h.set(id, arr); }
  arr.push({ t: G.time, x, y, z, mode });
  // Alles aelter als das Fenster verwerfen
  while (arr.length && G.time - arr[0].t > REWIND_WINDOW) arr.shift();
}

// War das Ziel im Rueckblickfenster jemals nahe genug am behaupteten Einschlag?
function targetWasNear(id, point, tol) {
  const arr = G.hostState.hist.get(id);
  if (!arr || !arr.length) return true;   // noch kein Verlauf: nicht bestrafen
  const t2 = tol * tol;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    const dx = s.x - point.x, dy = s.y - point.y, dz = s.z - point.z;
    if (dx * dx + dy * dy + dz * dz < t2) return true;
  }
  return false;
}

function shooterCouldReach(id, point, weapon) {
  const reach = MAX_REACH[weapon];
  if (!reach) return true;
  const arr = G.hostState.hist.get(id);
  if (!arr || !arr.length) return true;
  const r2v = (reach * 1.25) ** 2;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    const dx = s.x - point.x, dy = s.y - point.y, dz = s.z - point.z;
    if (dx * dx + dy * dy + dz * dz < r2v) return true;
  }
  return false;
}

// Geometrische Plausibilitaet eines Trefferanspruchs.
function validateHit(m) {
  const [type, a] = m.target.split(':');
  // Schaden an sich selbst (Splash, Absturz, Sturz, Weltgrenze) braucht keine Pruefung
  if ((type === 'p' || type === 'a') && a === m.from) return true;
  if (typeof m.hx !== 'number') return true;   // aeltere Nachricht ohne Ort

  _hitPt.set(m.hx, m.hy, m.hz);
  if (!shooterCouldReach(m.from, _hitPt, m.w)) return false;

  if (type === 'c') {
    const isl = G.islands[a];
    return isl ? isl.corePos.distanceTo(_hitPt) < 26 : false;
  }
  if (type === 'd') {
    const isl = G.islands[a];
    const d = isl && isl.destructibles[parseInt(m.target.split(':')[2], 10)];
    return d ? d.world.distanceTo(_hitPt) < d.radius + 22 : false;
  }
  // Spieler zu Fuss: enge Toleranz. Flugzeuge: Rumpfradius plus Puffer.
  const tol = type === 'a' ? 30 : 9;
  return targetWasNear(a, _hitPt, tol);
}

const _hitPt = new THREE.Vector3();

function hostInit() {
  G.hostState.hp.clear();
  G.hostState.hist.clear();
  G.hostState.dead.clear();
  G.hostState.lastHit.clear();
  G.hostState.destroyed = { blue: new Set(), red: new Set() };
  for (const p of net.players.values()) {
    G.hostState.hp.set(p.id, { player: PLAYER_HP, craft: 0 });
  }
}

// Erlaubte Höchstwerte pro Treffer — verhindert triviale Manipulation.
const MAX_CLAIM = {
  blaster: 20, scatter: 20, rocket: 150, aircannon: 22, bomb: 300,
  grenade: 120, charge: 260, turret: 20, fall: 200, crash: 999, void: 999
};

// Maximale Entfernung zwischen Schuetze und Einschlag, ueber die eine Waffe
// ueberhaupt wirken kann. Grosszuegig bemessen, es geht nur darum, Ansprueche
// quer ueber die Karte auszuschliessen.
const MAX_REACH = {
  blaster: 900, scatter: 720, rocket: 520, aircannon: 1600, bomb: 900,
  grenade: 220, charge: 220, turret: 400
};

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
      if (!validateHit(m)) return;
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

// Team eines Spielers laut Lobby-Register des Hosts
function teamOf(id) {
  const p = net.players.get(id);
  if (p) return p.team;
  const d = G.drones.get(id);
  if (d) return d.team;
  const r = G.remotes.get(id);
  return r ? r.team : null;
}

function hostApplyDamage(target, amount, kind, by) {
  if (G.over) return;
  const [type, a, b] = target.split(':');

  // Kein Eigenbeschuss zwischen Teamkameraden. Schaden an sich selbst
  // (Splash, Absturz, Sturz, Weltgrenze) bleibt erlaubt.
  if (by && (type === 'p' || type === 'a') && by !== a) {
    const t1 = teamOf(by), t2 = teamOf(a);
    if (t1 && t2 && t1 === t2) return;
  }
  if (by && type === 'c' && teamOf(by) === a) return;
  if (by && type === 'd' && teamOf(by) === a) return;

  if (type === 'c') {
    const team = a;
    if (G.coreHp[team] <= 0) return;
    const effective = amount * coreVulnerability(team);
    if (effective < 0.5) {
      // Schild haelt: dem Schuetzen zurueckmelden, warum nichts passiert
      net.publish({ t: 'shielded', team, by: by || null });
      return;
    }
    G.coreHp[team] = Math.max(0, G.coreHp[team] - effective);
    net.publish({ t: 'core', team, hp: G.coreHp[team], by: by || null, amt: effective });
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
  const droneRef = G.drones.get(id);
  if (droneRef && droneRef.dead > 0) return;

  if (type === 'a') {
    if (s.craft <= 0) return;
    s.craft -= amount;
    net.publish({ t: 'ahp', id, hp: Math.max(0, s.craft), by: by || null, k: kind });
    if (s.craft <= 0) {
      const drone = G.drones.get(id);
      if (drone) {
        drone.dead = DRONE.respawn;
        net.publish({ t: 'kill', id, by: by || null, cause: kind });
      } else {
        G.hostState.dead.set(id, G.time + RESPAWN_TIME);
        net.publish({ t: 'kill', id, by: by || null, cause: kind });
      }
    }
    return;
  }

  s.player -= amount;
  net.publish({ t: 'php', id, hp: Math.max(0, s.player), by: by || null, k: kind });
  if (s.player <= 0) {
    G.hostState.dead.set(id, G.time + RESPAWN_TIME);
    net.publish({ t: 'kill', id, by: by || null, cause: kind });
  }
}

function hostTick(dt) {
  if (!net.isHost || !G.running) return;
  G.hostAcc += dt;
  if (G.hostAcc < 1) return;
  G.hostAcc -= 1;

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
        if (m.id === net.myId) return;
        if (m.ai) {
          r = new RemotePlayer(m.id, m.tm, m.c, 'DROHNE ' + m.id.slice(-1));
          r.isAI = true;
        } else {
          const info = net.players.get(m.id);
          if (!info) return;
          r = new RemotePlayer(m.id, info.team, info.craft, info.name);
        }
        G.remotes.set(m.id, r);
      }
      r.applyState(m);
      if (net.isHost && !m.ai) recordHistory(m.id, m.x, m.y, m.z, m.m);
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
        if (dropped) { flashDamage(); addShake(0.25); showDamageFrom(m.by); }
        if (m.hp <= 0) G.me.die('shot');
        updateHud();
      } else {
        const r = G.remotes.get(m.id);
        if (r) {
          const dropped = m.hp < r.hp;
          r.hp = m.hp;
          if (dropped && m.by === net.myId) hitMarker(m.hp <= 0);
          if (m.hp >= PLAYER_HP && r.mode === 'dead') r.mode = 'foot';
        }
      }
      break;
    }
    case 'ahp': {
      if (m.id === net.myId && G.me) {
        const dropped = m.hp < G.me.craftHp;
        G.me.craftHp = m.hp;
        if (dropped) {
          flashDamage(); addShake(0.3); showDamageFrom(m.by);
          if (m.k === 'turret') warnFlak();
        }
        if (m.hp <= 0 && G.me.mode === 'fly') G.me.die('shotdown');
        updateHud();
      } else {
        const r = G.remotes.get(m.id);
        if (r) {
          const dropped = m.hp < (r.craftHp ?? Infinity);
          r.craftHp = m.hp;
          if (dropped && m.by === net.myId) hitMarker(m.hp <= 0);
        }
      }
      break;
    }
    case 'kill': {
      killFeed(nameOf(m.by), nameOf(m.id), m.cause);
      if (m.by === net.myId && m.id !== net.myId) {
        G.kills++;
        $('killCount').textContent = 'ABSCHÜSSE ' + G.kills;
      }
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
    case 'shielded': {
      if (m.by === net.myId) {
        const left = Math.round(shieldLevel(m.team) * G.islands[m.team].destructibles.length);
        toast(`SCHILD HÄLT — NOCH ${left} SCHILDKNOTEN`);
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
      G.fx.explosion(d.world, 3.2, 0xffa040);
      sfx.explosion(d.world.distanceTo(G.camera.position), 2.2);
      addShake(d.world.distanceTo(G.camera.position) < 200 ? 0.7 : 0.2);

      const left = Math.round(shieldLevel(m.team) * isl.destructibles.length);
      const mine = G.me && G.me.team === m.team;
      if (left === 0) {
        // Der dramatischste Moment des Matches: der Schild bricht zusammen
        alertBanner(mine ? 'SCHILD GEFALLEN' : 'GEGNERISCHER SCHILD GEFALLEN',
                    mine ? 'Der Core liegt offen' : 'Jetzt den Core zerlegen');
        sfx.alarm();
        collapseShield(m.team);
      } else {
        toast(mine ? `SCHILDKNOTEN VERLOREN — NOCH ${left}` : `SCHILDKNOTEN ZERSTÖRT — NOCH ${left}`);
        sfx.ui(mine ? 'err' : 'ok');
      }
      updateHud();
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
        : { speed: WEAPONS[m.k] ? WEAPONS[m.k].speed : 240, color: WEAPONS[m.k] ? WEAPONS[m.k].color : 0x8fe3ff,
            big: !!(WEAPONS[m.k] && WEAPONS[m.k].fuse), gravity: WEAPONS[m.k] && WEAPONS[m.k].fuse ? 20 : 0 };

  const thrown = WEAPONS[m.k] && WEAPONS[m.k].fuse;
  const pos = new THREE.Vector3(m.x, m.y, m.z);
  fireProjectile({
    pos, dir: new THREE.Vector3(m.dx, m.dy, m.dz), speed: def.speed, dmg: 0,
    color: def.color, owner: m.by, team: m.tm, mine: false,
    kind: m.k, big: def.big, gravity: def.gravity || 0,
    life: thrown ? WEAPONS[m.k].fuse + 1 : 4,
    fuse: thrown ? WEAPONS[m.k].fuse : null, trail: !thrown,
    splash: (m.k === 'rocket' || m.k === 'bomb' || thrown) ? 1 : 0,
    radius: m.k === 'bomb' ? 16 : (thrown ? WEAPONS[m.k].radius : 8)
  });
  if (!thrown) G.fx.muzzle(pos, new THREE.Vector3(m.dx, m.dy, m.dz), def.color);
  sfx.shot(m.k === 'aircannon' ? 'blaster' : thrown ? 'scatter' : m.k, pos.distanceTo(G.camera.position));
}

let lastFlak = 0;
function warnFlak() {
  if (G.time - lastFlak < 4) return;
  lastFlak = G.time;
  toast('FLAK-FEUER — TEMPO HALTEN ODER AUSWEICHEN');
}

let lastAlarm = 0;
function onCoreUnderAttack(team, prev, hp) {
  if (G.time - lastAlarm < 6) return;
  lastAlarm = G.time;
  alertBanner('CORE UNTER BESCHUSS', `${Math.round(hp)} / ${CORE_MAX_HP}`);
  sfx.alarm();
  void team; void prev;
}

// Sichtbarer Zusammenbruch der Kuppel
function collapseShield(team) {
  const isl = G.islands[team];
  const c = TEAM_COLOR[team];
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const a = Math.random() * Math.PI * 2;
      const p = isl.corePos.clone().add(new THREE.Vector3(
        Math.cos(a) * 20, (Math.random() - 0.3) * 16, Math.sin(a) * 20));
      G.fx.coreBurst(p, c);
    }, i * 90);
  }
  G.fx.coreBurst(isl.corePos, 0xffffff);
  addShake(isl.corePos.distanceTo(G.camera.position) < 320 ? 1.1 : 0.3);
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
  renderShieldPips('shieldMine', mine);
  renderShieldPips('shieldFoe', foe);

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
    $('ammoLabel').textContent = me.reserve[n] === Infinity ? 'ZELLE'
      : w.fuse ? 'PRO LEBEN' : 'RESERVE ' + me.reserve[n];
    $('spdVal').textContent = '';
  }
  $('modeVal').textContent = { foot: 'ZU FUSS', fly: 'IM FLUG', fall: 'FREIER FALL', chute: 'FALLSCHIRM', dead: 'GEFALLEN' }[me.mode];
  for (let i = 0; i < 5; i++) {
    const el = $('slot' + i);
    el.classList.toggle('active', !flying && me.weapon === i);
    el.classList.toggle('empty', !flying && me.ammo[me.weaponList[i]] <= 0 && me.reserve[me.weaponList[i]] <= 0);
    el.style.display = flying ? 'none' : '';
  }
}

// Ein Punkt je Schildknoten. Erloschene Punkte zeigen den Fortschritt.
function renderShieldPips(elId, team) {
  const nodes = G.islands[team].destructibles;
  const el = $(elId);
  if (el.children.length !== nodes.length) {
    el.innerHTML = '';
    for (let i = 0; i < nodes.length; i++) el.appendChild(document.createElement('i'));
  }
  for (let i = 0; i < nodes.length; i++) {
    el.children[i].className = nodes[i].dead ? 'down' : '';
  }
  el.className = 'pips' + (shieldLevel(team) === 0 ? ' broken' : '');
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

const SELF_CAUSE = {
  crash: 'zerschellt', void: 'ins Leere gestürzt', fall: 'aus der Höhe gestürzt', turret: 'von Flak geholt'
};
// Spieler stehen in der Lobby, Drohnen nur in den Remote-Objekten
function nameOf(id) {
  if (!id) return 'SKYFALL';
  const p = net.players.get(id);
  if (p) return p.name;
  const r = G.remotes.get(id);
  if (r) return r.name;
  const d = G.drones.get(id);
  return d ? 'DROHNE ' + id.slice(-1) : '???';
}

function killFeed(killer, victim, cause) {
  const el = document.createElement('div');
  el.className = 'kf';
  // Unfaelle und Flak haben keinen Schuetzen — dann nur das Opfer nennen.
  el.innerHTML = SELF_CAUSE[cause]
    ? `<span class="d">${victim}</span> <span class="v">${SELF_CAUSE[cause]}</span>`
    : `<span class="k">${killer}</span> <span class="v">schaltet aus</span> <span class="d">${victim}</span>`;
  $('killfeed').prepend(el);
  setTimeout(() => el.remove(), 6000);
  while ($('killfeed').children.length > 5) $('killfeed').lastChild.remove();
}

// Kurzes Kreuz am Fadenkreuz, wenn ein eigener Schuss gesessen hat.
let lastHitMark = 0;
function hitMarker(lethal) {
  if (!lethal && G.time - lastHitMark < 0.1) return;
  lastHitMark = G.time;
  const el = $('hitmark');
  el.classList.remove('on', 'kill');
  void el.offsetWidth;
  el.classList.add('on');
  if (lethal) el.classList.add('kill');
  sfx.ui(lethal ? 'ok' : 'click');
}

const _dmgDir = new THREE.Vector3();
function showDamageFrom(byId) {
  const src = byId === net.myId ? null : (G.remotes.get(byId) || G.drones.get(byId));
  const el = $('dmgDir');
  if (!src || !G.me) { el.classList.remove('on'); return; }
  _dmgDir.copy(src.pos).sub(G.me.pos);
  _dmgDir.y = 0;
  if (_dmgDir.lengthSq() < 1) return;
  _dmgDir.normalize();
  // Winkel relativ zur Blickrichtung der Kamera
  G.camera.getWorldDirection(_camDir);
  const fx = -_camDir.x, fz = -_camDir.z;
  const len = Math.hypot(fx, fz) || 1;
  const cos = (-_dmgDir.x * fx + -_dmgDir.z * fz) / len;
  const sin = (-_dmgDir.z * fx - -_dmgDir.x * fz) / len;
  const deg = Math.atan2(sin, cos) * 180 / Math.PI;
  el.style.transform = `translate(-50%, -50%) rotate(${deg.toFixed(0)}deg)`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
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
  let heading = me.yaw;
  if (me.mode === 'fly') {
    forwardOf(me.quat, _s1);
    heading = Math.atan2(-_s1.x, -_s1.z);
  }
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
  broadcastDrones();
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
  if (net.isHost) recordHistory(me.id, me.pos.x, me.pos.y, me.pos.z, me.mode);
}
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ================================================================== *
 *  Hauptschleife
 * ================================================================== */

// Blendet den Einsteigen-Hinweis ein, wenn man vor einer Maschine steht.
function updatePrompt() {
  const el = $('prompt');
  const me = G.me;
  if (me && me.mode === 'fall') {
    $('promptText').textContent = 'FALLSCHIRM ÖFFNEN';
    el.querySelector('b').textContent = '␣';
    el.classList.add('on');
    return;
  }
  el.querySelector('b').textContent = 'E';
  if (!me || me.mode !== 'foot') { el.classList.remove('on'); return; }
  const parked = nearestPad(me, 16);
  if (!parked || parked.cooldown > 0) { el.classList.remove('on'); return; }
  $('promptText').textContent = AIRCRAFT_SPECS[parked.pad.type].label + ' BESTEIGEN';
  el.classList.add('on');
}


const _leadPos = new THREE.Vector3(), _leadTmp = new THREE.Vector3();
function updateLeadMarker() {
  const el = $('lead');
  const me = G.me;
  if (!me || me.mode !== 'fly') { el.classList.remove('on'); return; }

  forwardOf(me.quat, _s1);
  let best = null, bestDot = 0.86;      // nur, was ungefaehr vor der Nase liegt
  for (const r of G.remotes.values()) {
    if (r.team === me.team || r.mode === 'dead') continue;
    _leadTmp.copy(r.pos).sub(me.pos);
    const dist = _leadTmp.length();
    if (dist > 900 || dist < 25) continue;
    _leadTmp.divideScalar(dist);
    const dot = _leadTmp.dot(_s1);
    if (dot > bestDot) { bestDot = dot; best = { r, dist }; }
  }
  if (!best) { el.classList.remove('on'); return; }

  // Wo das Ziel sein wird, wenn das Projektil ankommt
  const shotSpeed = me.spec.gun.speed + me.speed;
  const t = best.dist / shotSpeed;
  _leadPos.copy(best.r.pos).addScaledVector(best.r.vel, t);
  _leadPos.project(G.camera);
  if (_leadPos.z > 1) { el.classList.remove('on'); return; }

  el.style.left = ((_leadPos.x * 0.5 + 0.5) * 100).toFixed(2) + '%';
  el.style.top = ((-_leadPos.y * 0.5 + 0.5) * 100).toFixed(2) + '%';
  el.classList.add('on');
  el.classList.toggle('close', best.dist < 260);
}

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
    hostUpdateDrones(dt);
    updateParked(dt);
    updatePrompt();
    sendState(dt);
    hostTick(dt);
    drawRadar();
    updateLeadMarker();
    hudAcc += dt;
    if (hudAcc > 0.1) { hudAcc = 0; updateHud(); updateTimer(); }

    if (toastT && G.time > toastT) { $('toast').classList.remove('on'); toastT = 0; }
  }

  G.islands.blue.core.setShield(shieldLevel('blue'));
  G.islands.red.core.setShield(shieldLevel('red'));
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
  net.on('lateJoin', (id) => {
    if (!net.isHost || !G.running) return;
    // Der Neue bekommt denselben Startbefehl plus den aktuellen Matchstand.
    net.sendTo(id, {
      t: 'start',
      weather: G.weather,
      players: [...net.players.values()],
      resume: {
        time: G.matchTime,
        cb: G.coreHp.blue,
        cr: G.coreHp.red,
        destroyed: {
          blue: [...G.hostState.destroyed.blue],
          red: [...G.hostState.destroyed.red]
        }
      }
    });
    G.hostState.hp.set(id, { player: PLAYER_HP, craft: 0 });
    toast('SPIELER TRITT BEI');
  });
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
  net.on('disconnected', (msg) => {
    toastMenu(msg);
    if (G.running) {
      // Ohne Host gibt es keine Autorität mehr — die Runde sauber beenden.
      G.running = false;
      document.exitPointerLock();
      sfx.engineStop();
      $('endTitle').textContent = 'VERBINDUNG VERLOREN';
      $('endTitle').className = 'lose';
      $('endSub').textContent = msg;
      showScreen('endScreen');
      $('hud').classList.remove('on');
    }
  });
  $('btnAbort').onclick = () => location.reload();
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
  resetMatchState();
  G.matchTime = MATCH_TIME;
  G.over = false;
  G.kills = 0;

  // Spaetzugang: laufenden Matchstand uebernehmen statt bei null anzufangen
  if (m.resume) {
    G.matchTime = m.resume.time;
    G.coreHp.blue = m.resume.cb;
    G.coreHp.red = m.resume.cr;
    G.islands.blue.core.setHP(m.resume.cb);
    G.islands.red.core.setHP(m.resume.cr);
    for (const team of ['blue', 'red']) {
      for (const idx of m.resume.destroyed[team] || []) {
        const d = G.islands[team].destructibles[idx];
        if (!d) continue;
        d.dead = true;
        d.mesh.visible = false;
        for (const e of d.extra || []) e.visible = false;
      }
      if ((team === 'blue' ? m.resume.cb : m.resume.cr) <= 0) {
        for (const t of G.islands[team].turrets) t.dead = true;
      }
    }
  }
  $('killCount').textContent = 'ABSCHÜSSE 0';

  const info = net.players.get(net.myId);
  const team = info ? info.team : 'blue';
  const craft = info ? info.craft : 'striker';

  G.me = new LocalPlayer(net.myId, team, craft);
  G.me.spawn();

  for (const p of net.players.values()) {
    if (p.id === net.myId) continue;
    if (!G.remotes.has(p.id)) G.remotes.set(p.id, new RemotePlayer(p.id, p.team, p.craft, p.name));
  }

  if (net.isHost) { hostInit(); hostSpawnDrones(); }

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

// Alles zuruecksetzen, was eine vorige Runde veraendert hat.
function resetMatchState() {
  for (const team of ['blue', 'red']) {
    const isl = G.islands[team];
    G.coreHp[team] = CORE_MAX_HP;
    isl.core.setHP(CORE_MAX_HP);
    for (const t of isl.turrets) { t.dead = false; t.cool = Math.random() * 2; t.lock = 0; }
    for (const d of isl.destructibles) {
      d.dead = false;
      d.hp = d.maxHp;
      d.mesh.visible = true;
      for (const e of d.extra || []) e.visible = true;
    }
    for (const p of isl.parked) { p.cooldown = 0; p.mesh.visible = true; }
  }
  for (const p of G.projectiles) if (p.mesh.userData.proj === p) { p.mesh.visible = false; p.mesh.userData.proj = null; }
  G.projectiles.length = 0;
  for (const w of wrecks) { G.scene.remove(w); disposeObject(w); }
  wrecks.length = 0;
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

// Scheitert der Start, darf der Ladebalken nicht einfach weiterlaufen —
// dann sieht niemand, was schiefgegangen ist. Fehler werden angezeigt.
function safeBoot() {
  try {
    boot();
  } catch (err) {
    console.error('SKYFALL: Start fehlgeschlagen', err);
    showBootError(err);
  }
}

function showBootError(err) {
  const el = $('loading');
  el.classList.add('on', 'failed');
  el.innerHTML = `
    <div class="load-mark">SKYFALL</div>
    <h3>START FEHLGESCHLAGEN</h3>
    <p>${escapeHtml(String(err && err.message ? err.message : err))}</p>
    <pre>${escapeHtml(String(err && err.stack ? err.stack : '')).slice(0, 900)}</pre>
    <p class="hint">Häufigste Ursachen: keine Verbindung zu den CDNs (Three.js, PeerJS)
    oder kein WebGL im Browser. Details stehen in der Entwicklerkonsole.</p>`;
}

function escapeHtml(t) {
  return t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Auch Fehler in der laufenden Schleife sollen sichtbar werden statt still
// einen schwarzen Bildschirm zu hinterlassen.
addEventListener('error', (e) => {
  if (!G.renderer) showBootError(e.error || e.message);
});

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', safeBoot);
else safeBoot();
