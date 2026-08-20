import * as THREE from 'three';
import type { CollisionWorld } from './CollisionWorld';
import type { LoadedArena } from './ArenaLoader';
import { GAME_CONFIG } from '../config/gameConfig';

export interface SpawnPoint {
  position: THREE.Vector3;
  yaw: number;
}

/**
 * Works out where people can stand.
 *
 * Fighter spawns are discovered by probing a grid over the arena floor: a cell
 * is valid if a downward ray finds ground near floor level and there is enough
 * headroom above it. The two spawns handed out each round are the pair with the
 * largest separation, so fighters never start on top of each other — again,
 * without any per-arena authoring.
 */
export class SpawnManager {
  private fighterSpawns: SpawnPoint[] = [];
  private spectatorSpawns: SpawnPoint[] = [];

  rebuild(arena: LoadedArena, collision: CollisionWorld, terraceSpawns: THREE.Vector3[]): void {
    this.fighterSpawns = this.probeArenaFloor(arena, collision);
    this.spectatorSpawns = terraceSpawns.map((position) => ({
      position: position.clone(),
      // spectators look towards the middle of the arena
      yaw: Math.atan2(-position.x, -position.z),
    }));

    if (!this.fighterSpawns.length) {
      console.warn('[SpawnManager] no floor found, falling back to arena centre');
      this.fighterSpawns = [
        { position: new THREE.Vector3(-3, 0.1, 0), yaw: Math.PI / 2 },
        { position: new THREE.Vector3(3, 0.1, 0), yaw: -Math.PI / 2 },
      ];
    }
  }

  private probeArenaFloor(arena: LoadedArena, collision: CollisionWorld): SpawnPoint[] {
    const points: SpawnPoint[] = [];
    if (!collision.ready) return points;

    const { footprint } = arena;
    const inset = 2.2;
    const minX = footprint.minX + inset;
    const maxX = footprint.maxX - inset;
    const minZ = footprint.minZ + inset;
    const maxZ = footprint.maxZ - inset;

    const step = 2.0;
    const headroom = GAME_CONFIG.player.height + 0.4;
    const down = new THREE.Vector3(0, -1, 0);
    const up = new THREE.Vector3(0, 1, 0);

    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        const hit = collision.raycast(new THREE.Vector3(x, 40, z), down, 80);
        if (!hit) continue;
        // Only the main floor and low platforms, not rooftops.
        if (hit.point.y < -0.6 || hit.point.y > 3.2) continue;

        const ceiling = collision.raycast(
          new THREE.Vector3(x, hit.point.y + 0.25, z),
          up,
          headroom,
        );
        if (ceiling) continue;

        points.push({
          position: new THREE.Vector3(x, hit.point.y + 0.06, z),
          yaw: 0,
        });
      }
    }
    return points;
  }

  /** The two most distant valid floor cells, facing each other. */
  fighterPair(): [SpawnPoint, SpawnPoint] {
    const points = this.fighterSpawns;
    if (points.length < 2) {
      const a = points[0] ?? { position: new THREE.Vector3(-3, 0.1, 0), yaw: 0 };
      const b = {
        position: a.position.clone().add(new THREE.Vector3(6, 0, 0)),
        yaw: 0,
      };
      return faceEachOther(a, b);
    }

    let best: [SpawnPoint, SpawnPoint] = [points[0], points[1]];
    let bestDistance = -1;
    // Sampling instead of the full O(n^2) sweep keeps this instant on the big
    // arenas, and any near-maximal pair is fine.
    const candidates = points.length > 120 ? sampleEvery(points, 120) : points;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const distance = candidates[i].position.distanceToSquared(candidates[j].position);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = [candidates[i], candidates[j]];
        }
      }
    }
    return faceEachOther(best[0], best[1]);
  }

  /** A terrace slot for an alive spectator, spread out by index. */
  spectatorSpawn(index: number): SpawnPoint {
    if (!this.spectatorSpawns.length) {
      return { position: new THREE.Vector3(0, 4, 20), yaw: Math.PI };
    }
    const stride = Math.max(1, Math.floor(this.spectatorSpawns.length / GAME_CONFIG.maxPlayers));
    const spawn = this.spectatorSpawns[(index * stride) % this.spectatorSpawns.length];
    return { position: spawn.position.clone(), yaw: spawn.yaw };
  }

  get fighterSpawnCount(): number {
    return this.fighterSpawns.length;
  }
}

function faceEachOther(a: SpawnPoint, b: SpawnPoint): [SpawnPoint, SpawnPoint] {
  const toB = new THREE.Vector3().subVectors(b.position, a.position);
  const yaw = Math.atan2(-toB.x, -toB.z);
  return [
    { position: a.position.clone(), yaw },
    { position: b.position.clone(), yaw: yaw + Math.PI },
  ];
}

function sampleEvery<T>(items: T[], count: number): T[] {
  const stride = Math.max(1, Math.floor(items.length / count));
  const out: T[] = [];
  for (let i = 0; i < items.length; i += stride) out.push(items[i]);
  return out;
}
