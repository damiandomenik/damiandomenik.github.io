import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type ProgressHandler = (loaded: number, total: number, label: string) => void;

/**
 * Loads and caches GLBs. Arenas are used as-is (one instance at a time),
 * characters and weapons are cloned per player, so the cache stores the
 * original and hands out copies.
 */
export class AssetManager {
  private loader: GLTFLoader;
  private cache = new Map<string, Promise<GLTF>>();

  constructor() {
    const manager = new THREE.LoadingManager();
    this.loader = new GLTFLoader(manager);

    // Optional: only used if a GLB actually ships Draco compressed meshes.
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.loader.setDRACOLoader(draco);
  }

  load(url: string, onProgress?: ProgressHandler, label = ''): Promise<GLTF> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const promise = new Promise<GLTF>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf),
        (event) => {
          if (onProgress && event.lengthComputable) {
            onProgress(event.loaded, event.total, label);
          }
        },
        (err) => reject(new Error(`Could not load ${url}: ${String(err)}`)),
      );
    });

    this.cache.set(url, promise);
    promise.catch(() => this.cache.delete(url));
    return promise;
  }

  /** A fresh, independent copy of a loaded scene (skinned meshes included). */
  async instance(url: string): Promise<THREE.Group> {
    const gltf = await this.load(url);
    return skeletonClone(gltf.scene) as THREE.Group;
  }

  async animations(url: string): Promise<THREE.AnimationClip[]> {
    const gltf = await this.load(url);
    return gltf.animations;
  }

  /** Warms the cache so a round transition does not stutter. */
  async preload(urls: string[], onProgress?: (done: number, total: number) => void) {
    let done = 0;
    await Promise.all(
      urls.map(async (url) => {
        try {
          await this.load(url);
        } catch (err) {
          console.warn('[AssetManager] preload failed', url, err);
        } finally {
          done++;
          onProgress?.(done, urls.length);
        }
      }),
    );
  }

  dispose(): void {
    this.cache.clear();
  }
}

/** Frees GPU memory for a subtree that is about to be dropped. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
  root.removeFromParent();
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
  }
  material.dispose();
}
