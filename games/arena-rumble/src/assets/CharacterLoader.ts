import * as THREE from 'three';
import type { AssetManager } from './AssetManager';
import {
  CHARACTERS,
  characterById,
  characterUrl,
  type AnimationState,
  type CharacterDefinition,
} from '../config/characters';

export interface CharacterInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  play: (state: AnimationState, speed?: number) => void;
  dispose: () => void;
}

/**
 * Builds the visible body used for *other* players. The local player never
 * sees their own body (first person), so this only ever runs for remotes and
 * for whoever a third person spectator is following.
 */
export class CharacterLoader {
  constructor(private assets: AssetManager) {}

  async create(characterId: string): Promise<CharacterInstance> {
    const definition = characterById(characterId) ?? CHARACTERS[0];
    const url = characterUrl(definition);

    const root = await this.assets.instance(url);
    const clips = await this.assets.animations(url);

    normalise(root, definition);

    const mixer = clips.length ? new THREE.AnimationMixer(root) : null;
    const actions = new Map<string, THREE.AnimationAction>();
    let currentName = '';

    const resolve = (state: AnimationState): THREE.AnimationClip | null => {
      const candidates = definition.clips[state] ?? [];
      for (const wanted of candidates) {
        const exact = clips.find((c) => c.name === wanted);
        if (exact) return exact;
        const loose = clips.find((c) =>
          c.name.toLowerCase().includes(wanted.toLowerCase()),
        );
        if (loose) return loose;
      }
      return clips[0] ?? null;
    };

    const play = (state: AnimationState, speed = 1): void => {
      if (!mixer) return;
      const clip = resolve(state);
      if (!clip) return;

      let action = actions.get(clip.name);
      if (!action) {
        action = mixer.clipAction(clip);
        actions.set(clip.name, action);
      }
      action.timeScale = speed;

      if (currentName === clip.name) return;
      const previous = currentName ? actions.get(currentName) : undefined;
      action.reset().fadeIn(0.22).play();
      previous?.fadeOut(0.22);
      currentName = clip.name;
    };

    play('idle');

    return {
      root,
      mixer,
      play,
      dispose: () => {
        mixer?.stopAllAction();
        root.removeFromParent();
      },
    };
  }
}

/** Scale to ~1.8 m, feet on y = 0, sensible shadow flags. */
function normalise(root: THREE.Group, definition: CharacterDefinition): void {
  root.scale.setScalar(definition.scale);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  if (height > 0.1) {
    const factor = 1.8 / height;
    root.scale.multiplyScalar(factor);
    root.updateMatrixWorld(true);
  }

  const adjusted = new THREE.Box3().setFromObject(root);
  root.position.y -= adjusted.min.y - definition.yOffset;

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // skinned bounds are unreliable
    mesh.userData.noCollision = true;
  });
}
