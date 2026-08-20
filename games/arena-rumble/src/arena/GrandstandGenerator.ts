import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import type { LoadedArena } from './ArenaLoader';
import type { ArenaDefinition } from '../config/arenas';

export interface Grandstand {
  root: THREE.Group;
  /** Points on the terraces where alive spectators can be dropped. */
  spectatorSpawns: THREE.Vector3[];
  /** Outer extent, used for fog and camera clamping. */
  outerRadius: number;
}

/**
 * Builds a stadium around whatever arena was loaded.
 *
 * Deliberately *not* a set of grey boxes: stepped terraces, moulded seats,
 * handrails, entrance tunnels, corner floodlight pylons, hanging speaker
 * clusters and a lit fascia band with the event name. Everything repeated is
 * an InstancedMesh, so a full seven-tier bowl is a couple of dozen draw calls.
 */
export class GrandstandGenerator {
  private materials: ReturnType<typeof buildMaterials> | null = null;

  build(arena: LoadedArena): Grandstand {
    const cfg = GAME_CONFIG.grandstand;
    const mood = arena.definition.mood;
    this.materials = buildMaterials(mood);
    const M = this.materials;

    const root = new THREE.Group();
    root.name = 'grandstand';

    // The bowl hugs the arena footprint, squared off to keep the terraces
    // parallel to the arena walls.
    const halfX = Math.max(6, (arena.footprint.maxX - arena.footprint.minX) / 2) + cfg.margin;
    const halfZ = Math.max(6, (arena.footprint.maxZ - arena.footprint.minZ) / 2) + cfg.margin;

    const spectatorSpawns: THREE.Vector3[] = [];

    this.buildBarrier(root, halfX, halfZ, M);
    this.buildTerraces(root, halfX, halfZ, M, spectatorSpawns);

    const outerX = halfX + cfg.tiers * cfg.stepDepth;
    const outerZ = halfZ + cfg.tiers * cfg.stepDepth;

    this.buildOuterWall(root, outerX, outerZ, M);
    this.buildPylons(root, outerX, outerZ, M, mood);
    this.buildFascia(root, outerX, outerZ, M, arena.definition);
    this.buildTunnels(root, halfX, halfZ, M);
    this.buildGroundApron(root, outerX, outerZ, M);

    root.updateMatrixWorld(true);

    return {
      root,
      spectatorSpawns,
      outerRadius: Math.hypot(outerX, outerZ),
    };
  }

  // --------------------------------------------------------------- barrier
  /** The wall between the fighting floor and the front row. */
  private buildBarrier(
    root: THREE.Group,
    halfX: number,
    halfZ: number,
    M: Materials,
  ): void {
    const h = GAME_CONFIG.grandstand.barrierHeight;
    const t = 0.35;
    const sides: Array<[number, number, number, number]> = [
      [0, halfZ, halfX * 2 + t * 2, t],
      [0, -halfZ, halfX * 2 + t * 2, t],
      [halfX, 0, t, halfZ * 2],
      [-halfX, 0, t, halfZ * 2],
    ];
    for (const [x, z, sx, sz] of sides) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), M.concrete);
      wall.position.set(x, h / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      root.add(wall);

      // glowing lip so the boundary reads instantly from inside the arena
      const lip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.09, sz + 0.06), M.trim);
      lip.position.set(x, h + 0.04, z);
      root.add(lip);
    }
  }

  // -------------------------------------------------------------- terraces
  private buildTerraces(
    root: THREE.Group,
    halfX: number,
    halfZ: number,
    M: Materials,
    spawns: THREE.Vector3[],
  ): void {
    const cfg = GAME_CONFIG.grandstand;
    const seatMatrices: THREE.Matrix4[] = [];
    const railPostMatrices: THREE.Matrix4[] = [];
    const railBarMatrices: THREE.Matrix4[] = [];

    const base = cfg.barrierHeight - cfg.stepHeight;

    for (let tier = 0; tier < cfg.tiers; tier++) {
      const y = base + tier * cfg.stepHeight;
      const inX = halfX + tier * cfg.stepDepth;
      const inZ = halfZ + tier * cfg.stepDepth;
      const outX = inX + cfg.stepDepth;
      const outZ = inZ + cfg.stepDepth;

      // The terrace itself: four slabs forming a ring.
      addRingSlab(root, M.terrace, inX, inZ, outX, outZ, y, cfg.stepHeight);

      // Riser face, slightly darker, so the steps read from the arena floor.
      addRingSlab(root, M.riser, inX - 0.04, inZ - 0.04, inX, inZ, y, cfg.stepHeight);

      // Seats along the four straights, skipping the corners.
      const seatY = y + cfg.stepHeight / 2;
      const seatInset = cfg.stepDepth * 0.55;
      placeRow(seatMatrices, spawns, {
        axis: 'x',
        span: inX - 1.2,
        fixed: inZ + seatInset,
        y: seatY,
        rotation: Math.PI,
        spacing: cfg.seatSpacing,
      });
      placeRow(seatMatrices, spawns, {
        axis: 'x',
        span: inX - 1.2,
        fixed: -(inZ + seatInset),
        y: seatY,
        rotation: 0,
        spacing: cfg.seatSpacing,
      });
      placeRow(seatMatrices, spawns, {
        axis: 'z',
        span: inZ - 1.2,
        fixed: inX + seatInset,
        y: seatY,
        rotation: -Math.PI / 2,
        spacing: cfg.seatSpacing,
      });
      placeRow(seatMatrices, spawns, {
        axis: 'z',
        span: inZ - 1.2,
        fixed: -(inX + seatInset),
        y: seatY,
        rotation: Math.PI / 2,
        spacing: cfg.seatSpacing,
      });

      // Handrail on the front edge of every second tier.
      if (tier % 2 === 0) {
        addRailing(railPostMatrices, railBarMatrices, inX, inZ, y + cfg.stepHeight);
      }
    }

    root.add(makeInstanced(seatGeometry(), M.seat, seatMatrices, 'seats'));
    root.add(makeInstanced(new THREE.BoxGeometry(0.07, 1.0, 0.07), M.metal, railPostMatrices, 'rail-posts'));
    root.add(makeInstanced(new THREE.BoxGeometry(1, 0.06, 0.06), M.metal, railBarMatrices, 'rail-bars'));
  }

  // ------------------------------------------------------------ outer wall
  private buildOuterWall(root: THREE.Group, outX: number, outZ: number, M: Materials): void {
    const h = GAME_CONFIG.grandstand.tiers * GAME_CONFIG.grandstand.stepHeight + 3.2;
    const t = 0.6;
    const sides: Array<[number, number, number, number]> = [
      [0, outZ + t / 2, outX * 2 + t * 2, t],
      [0, -(outZ + t / 2), outX * 2 + t * 2, t],
      [outX + t / 2, 0, t, outZ * 2 + t * 2],
      [-(outX + t / 2), 0, t, outZ * 2 + t * 2],
    ];
    for (const [x, z, sx, sz] of sides) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), M.concreteDark);
      wall.position.set(x, h / 2, z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      root.add(wall);
    }
  }

  // ---------------------------------------------------------------- pylons
  private buildPylons(
    root: THREE.Group,
    outX: number,
    outZ: number,
    M: Materials,
    mood: ArenaDefinition['mood'],
  ): void {
    const corners: Array<[number, number]> = [
      [outX, outZ],
      [-outX, outZ],
      [outX, -outZ],
      [-outX, -outZ],
    ];
    const height = 15;

    for (const [cx, cz] of corners) {
      const pylon = new THREE.Group();
      pylon.position.set(cx * 1.05, 0, cz * 1.05);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, height, 8), M.metal);
      mast.position.y = height / 2;
      mast.castShadow = true;
      pylon.add(mast);

      // guy struts, so the mast does not look like a floating pole
      for (const angle of [0.6, 2.2, 3.9, 5.5]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), M.metal);
        strut.position.set(Math.cos(angle) * 1.1, 2.0, Math.sin(angle) * 1.1);
        strut.rotation.z = Math.cos(angle) * 0.42;
        strut.rotation.x = -Math.sin(angle) * 0.42;
        pylon.add(strut);
      }

      const rig = new THREE.Group();
      rig.position.y = height;
      rig.lookAt(0, 6, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 0.3), M.metal);
      rig.add(frame);
      const lamps = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.5, 0.12), M.lamp);
      lamps.position.z = 0.22;
      rig.add(lamps);
      pylon.add(rig);

      const spot = new THREE.SpotLight(mood.sunColor, 260, 0, Math.PI / 5.2, 0.55, 1.6);
      spot.position.set(cx * 1.05, height, cz * 1.05);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = false;
      root.add(spot);
      root.add(spot.target);

      root.add(pylon);
    }
  }

  // ---------------------------------------------------------------- fascia
  /** Lit band above the top tier carrying the event branding. */
  private buildFascia(
    root: THREE.Group,
    outX: number,
    outZ: number,
    M: Materials,
    definition: ArenaDefinition,
  ): void {
    const y = GAME_CONFIG.grandstand.tiers * GAME_CONFIG.grandstand.stepHeight + 2.6;
    const texture = makeFasciaTexture(definition.name);
    const banner = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    const sides: Array<[number, number, number, number]> = [
      [0, outZ - 0.1, outX * 2, 0],
      [0, -(outZ - 0.1), outX * 2, Math.PI],
      [outX - 0.1, 0, outZ * 2, -Math.PI / 2],
      [-(outX - 0.1), 0, outZ * 2, Math.PI / 2],
    ];
    for (const [x, z, width, rotation] of sides) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.5), banner);
      plane.position.set(x, y, z);
      plane.rotation.y = rotation;
      plane.userData.noCollision = true;
      root.add(plane);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.14), M.trim);
      strip.position.set(x, y - 0.85, z);
      strip.rotation.y = rotation;
      root.add(strip);
    }

    // Speaker clusters hung on the long sides.
    for (const sign of [1, -1]) {
      for (const offset of [-0.45, 0.45]) {
        const cluster = new THREE.Group();
        cluster.position.set(outX * offset * 1.1, y - 0.4, sign * (outZ - 0.6));
        for (let i = 0; i < 3; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), M.concreteDark);
          box.position.y = -i * 0.6;
          box.rotation.x = sign * 0.18 * i;
          cluster.add(box);
        }
        root.add(cluster);
      }
    }
  }

  // --------------------------------------------------------------- tunnels
  /** Entrance mouths at the middle of each straight, purely for silhouette. */
  private buildTunnels(root: THREE.Group, halfX: number, halfZ: number, M: Materials): void {
    const depth = GAME_CONFIG.grandstand.tiers * GAME_CONFIG.grandstand.stepDepth;
    const placements: Array<[number, number, number]> = [
      [0, halfZ + depth / 2, 0],
      [0, -(halfZ + depth / 2), 0],
      [halfX + depth / 2, 0, Math.PI / 2],
      [-(halfX + depth / 2), 0, Math.PI / 2],
    ];
    for (const [x, z, rotation] of placements) {
      const mouth = new THREE.Group();
      mouth.position.set(x, 0, z);
      mouth.rotation.y = rotation;

      const left = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, depth), M.concreteDark);
      left.position.set(-1.5, 1.6, 0);
      const right = left.clone();
      right.position.x = 1.5;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, depth), M.concreteDark);
      lintel.position.y = 3.4;
      mouth.add(left, right, lintel);

      const glow = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 0.2), M.trim);
      glow.position.set(0, 3.16, -depth / 2 + 0.2);
      mouth.add(glow);

      root.add(mouth);
    }
  }

  // ----------------------------------------------------------------- apron
  private buildGroundApron(root: THREE.Group, outX: number, outZ: number, M: Materials): void {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(outX * 4, outZ * 4), M.ground);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.05;
    apron.receiveShadow = true;
    root.add(apron);
  }

  dispose(grandstand: Grandstand): void {
    grandstand.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    grandstand.root.removeFromParent();
    if (this.materials) {
      for (const material of Object.values(this.materials)) material.dispose();
      this.materials = null;
    }
  }
}

// =============================================================== helpers

type Materials = ReturnType<typeof buildMaterials>;

function buildMaterials(mood: ArenaDefinition['mood']) {
  const tint = new THREE.Color(mood.horizon);
  return {
    concrete: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x2c3038).lerp(tint, 0.22),
      roughness: 0.88,
      metalness: 0.04,
    }),
    concreteDark: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1b1e24).lerp(tint, 0.18),
      roughness: 0.92,
      metalness: 0.03,
    }),
    terrace: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x3a3f49).lerp(tint, 0.16),
      roughness: 0.84,
      metalness: 0.05,
    }),
    riser: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x22262d).lerp(tint, 0.2),
      roughness: 0.9,
      metalness: 0.04,
    }),
    seat: new THREE.MeshStandardMaterial({
      color: 0x27313f,
      roughness: 0.62,
      metalness: 0.08,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x6f7885,
      roughness: 0.42,
      metalness: 0.72,
    }),
    trim: new THREE.MeshBasicMaterial({ color: 0xf2b544, toneMapped: false }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff3d6, toneMapped: false }),
    ground: new THREE.MeshStandardMaterial({
      color: new THREE.Color(mood.ground),
      roughness: 1,
      metalness: 0,
    }),
  };
}

/** A moulded stadium seat: pan, back, and a pair of legs. */
function seatGeometry(): THREE.BufferGeometry {
  const pan = new THREE.BoxGeometry(0.46, 0.09, 0.42);
  pan.translate(0, 0.42, 0);
  const back = new THREE.BoxGeometry(0.46, 0.42, 0.08);
  back.translate(0, 0.62, -0.19);
  const legs = new THREE.BoxGeometry(0.36, 0.38, 0.1);
  legs.translate(0, 0.19, -0.1);

  const merged = mergeSimple([pan, back, legs]);
  pan.dispose();
  back.dispose();
  legs.dispose();
  return merged;
}

/** Minimal merge that only needs position + normal, avoiding a util import. */
function mergeSimple(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of geometries) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    positions.push(...Array.from(nonIndexed.getAttribute('position').array));
    normals.push(...Array.from(nonIndexed.getAttribute('normal').array));
    if (nonIndexed !== g) nonIndexed.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return out;
}

function addRingSlab(
  root: THREE.Group,
  material: THREE.Material,
  inX: number,
  inZ: number,
  outX: number,
  outZ: number,
  y: number,
  height: number,
): void {
  const depthX = outX - inX;
  const depthZ = outZ - inZ;
  const pieces: Array<[number, number, number, number]> = [
    [0, (inZ + outZ) / 2, outX * 2, depthZ],
    [0, -(inZ + outZ) / 2, outX * 2, depthZ],
    [(inX + outX) / 2, 0, depthX, inZ * 2],
    [-(inX + outX) / 2, 0, depthX, inZ * 2],
  ];
  for (const [x, z, sx, sz] of pieces) {
    if (sx <= 0.001 || sz <= 0.001) continue;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sx, height, sz), material);
    slab.position.set(x, y + height / 2, z);
    slab.receiveShadow = true;
    slab.castShadow = true;
    root.add(slab);
  }
}

interface RowOptions {
  axis: 'x' | 'z';
  span: number;
  fixed: number;
  y: number;
  rotation: number;
  spacing: number;
}

function placeRow(
  out: THREE.Matrix4[],
  spawns: THREE.Vector3[],
  options: RowOptions,
): void {
  const count = Math.max(0, Math.floor((options.span * 2) / options.spacing));
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, options.rotation, 0),
  );
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = -options.span + (i + 0.5) * options.spacing;
    if (options.axis === 'x') position.set(t, options.y, options.fixed);
    else position.set(options.fixed, options.y, t);

    out.push(new THREE.Matrix4().compose(position, quaternion, scale));

    // one spawn candidate every few seats, in front of the seat
    if (i % 5 === 2) {
      const forward = new THREE.Vector3(0, 0, 0.8).applyQuaternion(quaternion);
      spawns.push(
        new THREE.Vector3(position.x + forward.x, options.y + 0.1, position.z + forward.z),
      );
    }
  }
}

function addRailing(
  posts: THREE.Matrix4[],
  bars: THREE.Matrix4[],
  halfX: number,
  halfZ: number,
  y: number,
): void {
  const spacing = 2.4;
  const identity = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  const sides: Array<{ axis: 'x' | 'z'; span: number; fixed: number; rotation: number }> = [
    { axis: 'x', span: halfX, fixed: halfZ, rotation: 0 },
    { axis: 'x', span: halfX, fixed: -halfZ, rotation: 0 },
    { axis: 'z', span: halfZ, fixed: halfX, rotation: Math.PI / 2 },
    { axis: 'z', span: halfZ, fixed: -halfX, rotation: Math.PI / 2 },
  ];

  for (const side of sides) {
    const count = Math.max(2, Math.floor((side.span * 2) / spacing));
    const step = (side.span * 2) / count;
    for (let i = 0; i <= count; i++) {
      const t = -side.span + i * step;
      const p =
        side.axis === 'x'
          ? new THREE.Vector3(t, y + 0.5, side.fixed)
          : new THREE.Vector3(side.fixed, y + 0.5, t);
      posts.push(new THREE.Matrix4().compose(p, identity, scale));
    }
    const barQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, side.rotation, 0),
    );
    for (const height of [0.98, 0.55]) {
      const p =
        side.axis === 'x'
          ? new THREE.Vector3(0, y + height, side.fixed)
          : new THREE.Vector3(side.fixed, y + height, 0);
      bars.push(
        new THREE.Matrix4().compose(
          p,
          barQuaternion,
          new THREE.Vector3(side.span * 2, 1, 1),
        ),
      );
    }
  }
}

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  mesh.name = name;
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Seats and rails are decoration; keeping them out of the BVH saves a lot of
  // triangles and players never reach them anyway (they walk the terraces).
  mesh.userData.noCollision = true;
  return mesh;
}

/** Canvas texture for the fascia band: event name + arena name. */
function makeFasciaTexture(arenaName: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(8,10,15,0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f2b544';
  ctx.fillRect(0, 0, canvas.width, 4);
  ctx.fillRect(0, canvas.height - 4, canvas.width, 4);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = `ARENA RUMBLE   ·   ${arenaName.toUpperCase()}   ·   `;
  ctx.font = 'bold 62px "Bebas Neue", "Arial Narrow", sans-serif';

  const width = ctx.measureText(label).width;
  let x = 0;
  while (x < canvas.width + width) {
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(label, x + width / 2, canvas.height / 2 + 4);
    x += width;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
