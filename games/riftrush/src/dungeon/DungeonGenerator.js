import * as THREE from 'three';
import { makeRng } from '../core/Utils.js';
import { CONFIG } from '../core/Config.js';
import { ROOM_BY_ID, PLAYABLE_ROOMS } from './RoomRegistry.js';
import { RoomContext, DungeonRoom } from './DungeonRoom.js';
import { Checkpoint } from './Checkpoint.js';
import { UNIT_BOX, createMaterials, createRimMaterials, createDynamicMesh, syncDynamicMesh } from './Hazards.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Baut aus den Room-Modulen einen kompletten Dungeon.
 * Gleicher Seed => exakt gleicher Dungeon auf allen Clients.
 */
export class DungeonGenerator {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.materials = createMaterials();
    this.rimMaterials = createRimMaterials();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this._reset();
  }

  _reset() {
    this.boxes = [];
    this.dynamics = [];
    this.lights = [];
    this.doors = new Map();
    this.rooms = [];
    this.checkpoints = [];
    this.finishTrigger = null;
    this.seed = 0;
  }

  dispose() {
    const shared = new Set([...Object.values(this.materials), ...Object.values(this.rimMaterials)]);
    while (this.group.children.length) {
      const c = this.group.children.pop();
      if (c.geometry && c.geometry !== UNIT_BOX) c.geometry.dispose();
      if (c.isInstancedMesh) c.dispose();
      // pro Match geklonte Materialien (Hazards) freigeben
      if (c.material && !Array.isArray(c.material) && !shared.has(c.material)) c.material.dispose();
      this.group.remove(c);
    }
    this.checkpoints.forEach((cp) => cp.dispose(this.scene));
    this.physics.clear();
    this._reset();
  }

  /** Erzeugt die Room-Reihenfolge aus dem Seed. */
  planRoute(rng, count) {
    const pool = [];
    for (const r of PLAYABLE_ROOMS) for (let i = 0; i < r.weight; i++) pool.push(r.id);
    const route = ['start'];
    let last = null;
    const must = ['split_path', 'pvp_arena', 'vertical_shaft'];
    for (let i = 0; i < count; i++) {
      let id = null;
      // Pflicht-Rooms einstreuen, aber nie zweimal denselben Typ hintereinander
      if (i > 0 && must.length && rng.chance(0.45) && must[0] !== last) id = must.shift();
      if (!id) {
        let guard = 0;
        do { id = rng.pick(pool); guard++; } while (id === last && guard < 12);
      }
      route.push(id);
      last = id;
    }
    for (const m of must) {
      if (m === route[route.length - 1]) route.splice(route.length - 1, 0, m);
      else route.push(m);
    }
    route.push('final_room', 'finish');
    return route;
  }

  generate(seed, roomCount = CONFIG.ROOM_COUNT) {
    this.dispose();
    this.seed = seed >>> 0;
    const rng = makeRng(this.seed);
    const route = this.planRoute(rng, roomCount);

    const origin = { x: 0, y: 0, z: 0 };
    route.forEach((id, index) => {
      const def = ROOM_BY_ID[id];
      if (!def) return;
      const room = new DungeonRoom(def, { ...origin }, index);
      const ctx = new RoomContext(this, room.origin, index);
      def.build(ctx, rng, index);
      this.rooms.push(room);

      const isFinish = def.tag === 'finish';
      const cp = new Checkpoint(index, { x: origin.x, y: origin.y + 0.05, z: origin.z - 2.5 },
        this.scene, this.physics, isFinish);
      if (index === 0) cp.activate();
      this.checkpoints.push(cp);

      origin.y += def.exitY;
      origin.z -= def.length;
    });

    this.physics.build();
    this._buildMeshes();

    this.spawn = { x: 0, y: 0.1, z: -3 };
    this.totalLength = -origin.z;
    this.endZ = origin.z;
    return this;
  }

  _buildMeshes() {
    // Statische Boxen als InstancedMesh pro Kind => wenige Draw Calls
    const byKind = new Map();
    for (const b of this.boxes) {
      if (!byKind.has(b.kind)) byKind.set(b.kind, []);
      byKind.get(b.kind).push(b);
    }
    let gi = 0;   // fortlaufend über ALLE Kinds, sonst bekämen Boxen gleichen
                  // Index in verschiedenen Materialgruppen denselben Versatz
    for (const [kind, list] of byKind) {
      const mat = this.materials[kind] || this.materials.solid;
      const inst = new THREE.InstancedMesh(UNIT_BOX, mat, list.length);
      inst.frustumCulled = false;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        // Räume überlappen sich an den Nahtstellen bewusst (durchgehender Boden).
        // Exakt koplanare Flächen flimmern aber (Z-Fighting), daher bekommt jede
        // Box einen deterministischen Mikro-Versatz von wenigen Millimetern.
        // Rein visuell — die Physik arbeitet weiter mit den exakten Werten.
        const e = ((gi++ * 0.6180339887) % 1) * 0.012 + 0.001;
        _p.set(b.x, b.y + (b.h - e) / 2, b.z);
        _s.set(b.w - e * 0.3, b.h - e, b.d - e * 0.3);
        _m.compose(_p, _q, _s);
        inst.setMatrixAt(i, _m);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.receiveShadow = CONFIG.SHADOWS;
      this.group.add(inst);
    }

    // Kantenleuchten auf begehbaren Plattformen (rein visuell, keine Collider)
    this._buildRims(byKind);

    // Dynamische Objekte
    for (const obj of this.dynamics) {
      obj.mesh = createDynamicMesh(obj, this.materials);
      obj.mesh.receiveShadow = CONFIG.SHADOWS && obj.kind !== 'hazard';
      this.group.add(obj.mesh);
      syncDynamicMesh(obj);
    }

    // Punktlichter (Anzahl begrenzt: jedes Licht kostet in jedem Fragment-Shader)
    const lights = this.lights.slice(0, CONFIG.MAX_POINT_LIGHTS);
    for (const l of lights) {
      const pl = new THREE.PointLight(l.color, l.intensity * CONFIG.LIGHT_POWER, l.distance, 2);
      pl.position.set(l.x, l.y, l.z);
      this.group.add(pl);
    }
  }

  /**
   * Legt auf jede begehbare Plattform vier dünne Leuchtkanten.
   * Das gibt dem Dungeon die gleiche "Panel + Emissive"-Sprache wie den
   * Figuren, ohne zusätzliche Draw Calls (ein InstancedMesh je Farbe).
   */
  _buildRims(byKind) {
    const IN = 0.22, TH = 0.075, WID = 0.14;
    const groups = new Map();
    for (const [kind, list] of byKind) {
      const mat = this.rimMaterials[kind];
      if (!mat) continue;
      const bars = [];
      for (const b of list) {
        if (b.h > 1.8 || b.w < 2.2 || b.d < 2.2) continue;   // nur Plattformen
        const top = b.y + b.h;
        bars.push({ x: b.x, y: top, z: b.z - b.d / 2 + IN, w: b.w - IN * 2.4, d: WID });
        bars.push({ x: b.x, y: top, z: b.z + b.d / 2 - IN, w: b.w - IN * 2.4, d: WID });
        bars.push({ x: b.x - b.w / 2 + IN, y: top, z: b.z, w: WID, d: b.d - IN * 2.4 });
        bars.push({ x: b.x + b.w / 2 - IN, y: top, z: b.z, w: WID, d: b.d - IN * 2.4 });
      }
      if (bars.length) groups.set(kind, bars);
    }
    for (const [kind, bars] of groups) {
      const inst = new THREE.InstancedMesh(UNIT_BOX, this.rimMaterials[kind], bars.length);
      inst.frustumCulled = false;
      for (let i = 0; i < bars.length; i++) {
        const r = bars[i];
        const e = ((i * 0.6180339887) % 1) * 0.008;
        _p.set(r.x, r.y - TH * 0.5 + e, r.z);   // Oberkante bündig mit der Plattform
        _s.set(r.w, TH, r.d);
        _m.compose(_p, _q, _s);
        inst.setMatrixAt(i, _m);
      }
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }
  }

  setShadows(on) {
    this.group.traverse((o) => {
      if (o.isInstancedMesh || o.isMesh) o.receiveShadow = on && !o.material?.transparent;
    });
  }

  openDoor(id) {
    const d = this.doors.get(id);
    if (d) d.open = true;
  }

  resetDynamics() {
    for (const obj of this.dynamics) {
      if (obj.reset) obj.reset();
      if (obj.kind === 'door') obj.open = false;
    }
  }

  update(dt, time, localPos) {
    // Gefahren pulsieren gemeinsam — ein Material, kein Zusatzaufwand
    this.materials.hazard.emissiveIntensity = 0.62 + Math.sin(time * 4.5) * 0.22;
    this.materials.switch.emissiveIntensity = 0.5 + Math.sin(time * 2.0) * 0.18;
    this.materials.goal.emissiveIntensity = 0.42 + Math.sin(time * 1.6) * 0.14;

    for (let i = 0; i < this.dynamics.length; i++) {
      const obj = this.dynamics[i];
      obj.update(time, dt, localPos);
      syncDynamicMesh(obj);
    }
    for (let i = 0; i < this.checkpoints.length; i++) this.checkpoints[i].update(time);
  }

  checkpointPosition(index) {
    const cp = this.checkpoints[Math.max(0, Math.min(index, this.checkpoints.length - 1))];
    return cp ? cp.position : this.spawn;
  }

  get checkpointCount() { return this.checkpoints.length; }
}
