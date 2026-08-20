import * as THREE from 'three';
import type { CollisionWorld } from '../arena/CollisionWorld';
import type { WeaponDefinition } from '../config/weapons';

export interface HitCandidate {
  id: string;
  /** Feet position. */
  position: THREE.Vector3;
  radius: number;
  height: number;
}

export interface ResolvedShot {
  point: THREE.Vector3;
  targetId: string | null;
  distance: number;
}

const _segment = new THREE.Line3();
const _closestOnRay = new THREE.Vector3();
const _closestOnSegment = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

/**
 * Resolves a single pellet.
 *
 * Runs on the host only. The world is checked first so a shot cannot travel
 * through a wall, then every candidate capsule is tested and the nearest hit
 * in front of the wall wins.
 */
export function resolvePellet(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  collision: CollisionWorld,
  candidates: HitCandidate[],
): ResolvedShot {
  const dir = direction.clone().normalize();

  const worldHit = collision.ready
    ? collision.raycast(origin, dir, maxDistance)
    : null;
  let closestDistance = worldHit ? worldHit.distance : maxDistance;
  let point = worldHit
    ? worldHit.point.clone()
    : origin.clone().addScaledVector(dir, maxDistance);
  let targetId: string | null = null;

  for (const candidate of candidates) {
    const distance = rayCapsuleDistance(origin, dir, candidate, closestDistance);
    if (distance !== null && distance < closestDistance) {
      closestDistance = distance;
      point = origin.clone().addScaledVector(dir, distance);
      targetId = candidate.id;
    }
  }

  return { point, targetId, distance: closestDistance };
}

/**
 * Distance along the ray at which it first enters the capsule, or null.
 *
 * Uses the closest approach between the ray and the capsule's core segment.
 * That is an approximation at grazing angles but is stable, cheap, and more
 * than accurate enough for player-sized targets.
 */
function rayCapsuleDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  candidate: HitCandidate,
  maxDistance: number,
): number | null {
  _segment.start.set(
    candidate.position.x,
    candidate.position.y + candidate.radius,
    candidate.position.z,
  );
  _segment.end.set(
    candidate.position.x,
    candidate.position.y + candidate.height - candidate.radius,
    candidate.position.z,
  );

  // Broad phase: is the capsule even roughly in front of us and in range?
  _toTarget.subVectors(_segment.start, origin);
  const along = _toTarget.dot(direction);
  if (along < -candidate.height || along > maxDistance + candidate.height) return null;

  const separation = closestPointsRaySegment(
    origin,
    direction,
    _segment,
    _closestOnRay,
    _closestOnSegment,
  );
  if (separation > candidate.radius) return null;

  const distance = _closestOnRay.distanceTo(origin);
  if (distance < 0 || distance > maxDistance) return null;

  // step back to the capsule surface so tracers stop at the body, not inside it
  const backoff = Math.sqrt(
    Math.max(0, candidate.radius * candidate.radius - separation * separation),
  );
  return Math.max(0, distance - backoff);
}

/** Shortest distance between a ray and a line segment. */
function closestPointsRaySegment(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  segment: THREE.Line3,
  outRay: THREE.Vector3,
  outSegment: THREE.Vector3,
): number {
  const segmentDirection = new THREE.Vector3().subVectors(segment.end, segment.start);
  const w0 = new THREE.Vector3().subVectors(origin, segment.start);

  const a = direction.dot(direction);
  const b = direction.dot(segmentDirection);
  const c = segmentDirection.dot(segmentDirection);
  const d = direction.dot(w0);
  const e = segmentDirection.dot(w0);

  const denominator = a * c - b * b;
  let sc: number;
  let tc: number;

  if (denominator < 1e-8) {
    sc = 0;
    tc = c > 1e-8 ? e / c : 0;
  } else {
    sc = (b * e - c * d) / denominator;
    tc = (a * e - b * d) / denominator;
  }

  sc = Math.max(0, sc);
  tc = Math.min(1, Math.max(0, tc));

  outRay.copy(origin).addScaledVector(direction, sc);
  outSegment.copy(segment.start).addScaledVector(segmentDirection, tc);
  return outRay.distanceTo(outSegment);
}

/** Spread cone: rotate `direction` by a random offset within `halfAngle`. */
export function applySpread(
  direction: THREE.Vector3,
  halfAngle: number,
  random: () => number,
): THREE.Vector3 {
  if (halfAngle <= 0) return direction.clone().normalize();

  const dir = direction.clone().normalize();
  const angle = halfAngle * Math.sqrt(random());
  const roll = random() * Math.PI * 2;

  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const actualUp = new THREE.Vector3().crossVectors(right, dir).normalize();

  return dir
    .clone()
    .addScaledVector(right, Math.cos(roll) * Math.tan(angle))
    .addScaledVector(actualUp, Math.sin(roll) * Math.tan(angle))
    .normalize();
}

/** Melee reach test: a short forward cone rather than a single ray. */
export function resolveMelee(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  weapon: WeaponDefinition,
  candidates: HitCandidate[],
): ResolvedShot | null {
  const dir = direction.clone().normalize();
  let best: ResolvedShot | null = null;

  for (const candidate of candidates) {
    const centre = new THREE.Vector3(
      candidate.position.x,
      candidate.position.y + candidate.height * 0.55,
      candidate.position.z,
    );
    const toCentre = new THREE.Vector3().subVectors(centre, origin);
    const distance = toCentre.length();
    if (distance > weapon.range) continue;

    const angle = toCentre.normalize().angleTo(dir);
    // spread doubles as the swing arc for melee weapons
    if (angle > weapon.spread * 4.5) continue;

    if (!best || distance < best.distance) {
      best = {
        point: origin.clone().addScaledVector(dir, Math.max(0.4, distance - 0.4)),
        targetId: candidate.id,
        distance,
      };
    }
  }
  return best;
}
