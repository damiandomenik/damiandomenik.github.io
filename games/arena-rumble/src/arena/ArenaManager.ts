import * as THREE from 'three';
import type { ArenaDefinition } from '../config/arenas';
import { ArenaLoader, type LoadedArena } from './ArenaLoader';
import { GrandstandGenerator, type Grandstand } from './GrandstandGenerator';
import { CollisionWorld } from './CollisionWorld';
import { SpawnManager } from './SpawnManager';
import type { AssetManager } from '../assets/AssetManager';
import { disposeObject } from '../assets/AssetManager';
import type { Environment } from '../render/Environment';

/**
 * Owns the current world. Loading a new arena tears down the previous one
 * completely — arena mesh, grandstand, collision BVH and spawn cache — so
 * nothing leaks between rounds.
 */
export class ArenaManager {
  readonly collision = new CollisionWorld();
  readonly spawns = new SpawnManager();

  private loader: ArenaLoader;
  private grandstandGenerator = new GrandstandGenerator();

  private current: LoadedArena | null = null;
  private grandstand: Grandstand | null = null;

  constructor(
    private scene: THREE.Scene,
    assets: AssetManager,
    private environment: Environment,
  ) {
    this.loader = new ArenaLoader(assets);
  }

  get currentDefinition(): ArenaDefinition | null {
    return this.current?.definition ?? null;
  }

  get outerRadius(): number {
    return this.grandstand?.outerRadius ?? 40;
  }

  async loadArena(
    definition: ArenaDefinition,
    onProgress?: (fraction: number, label: string) => void,
  ): Promise<void> {
    onProgress?.(0.02, definition.name);
    this.unload();

    const arena = await this.loader.load(definition, (loaded, total) => {
      onProgress?.(0.02 + (loaded / Math.max(1, total)) * 0.55, definition.name);
    });
    this.scene.add(arena.root);
    this.current = arena;
    onProgress?.(0.62, definition.name);

    // Yield to the browser so the loading bar actually paints between the
    // heavy synchronous steps below.
    await nextFrame();

    const grandstand = this.grandstandGenerator.build(arena);
    this.scene.add(grandstand.root);
    this.grandstand = grandstand;
    onProgress?.(0.78, definition.name);
    await nextFrame();

    this.collision.build([arena.root, grandstand.root]);
    onProgress?.(0.92, definition.name);
    await nextFrame();

    this.spawns.rebuild(arena, this.collision, grandstand.spectatorSpawns);
    this.environment.applyMood(definition.mood, grandstand.outerRadius);
    onProgress?.(1, definition.name);
  }

  unload(): void {
    if (this.current) {
      disposeObject(this.current.root);
      this.current = null;
    }
    if (this.grandstand) {
      this.grandstandGenerator.dispose(this.grandstand);
      this.grandstand = null;
    }
    this.collision.dispose();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
