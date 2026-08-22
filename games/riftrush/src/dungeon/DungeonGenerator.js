import * as THREE from 'three';
import { makeRng } from '../core/Utils.js';
import { CONFIG } from '../core/Config.js';
import { ROOM_BY_ID, PLAYABLE_ROOMS } from './RoomRegistry.js';
import { RoomContext, DungeonRoom } from './DungeonRoom.js';
import { Checkpoint } from './Checkpoint.js';
import { UNIT_BOX, createMaterials, createDynamicMesh, syncDynamicMesh } from './Hazards.js';

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
    const shared = new Set(Object.values(this.materials));
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
    for (const [kind, list] of byKind) {
      const mat = this.materials[kind] || this.materials.solid;
      const inst = new THREE.InstancedMesh(UNIT_BOX, mat, list.length);
      inst.frustumCulled = false;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        _p.set(b.x, b.y + b.h / 2, b.z);
        _s.set(b.w, b.h, b.d);
        _m.compose(_p, _q, _s);
        inst.setMatrixAt(i, _m);
      }
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }

    // Dynamische Objekte
    for (const obj of this.dynamics) {
      obj.mesh = createDynamicMesh(obj, this.materials);
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
