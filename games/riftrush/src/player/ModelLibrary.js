import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/utils/SkeletonUtils.js';

/**
 * Lädt das GLB-Charaktermodell einmal und gibt pro Spieler eine geklonte
 * Instanz heraus. Skinned Meshes lassen sich nicht mit .clone() kopieren —
 * dafür ist SkeletonUtils.clone zuständig, sonst teilen sich alle Spieler
 * ein Skelett und bewegen sich identisch.
 */
let _promise = null;
let _model = null;
let _clips = [];

export function preloadPlayerModel(url = './assets/RiftRush_Player.glb') {
  if (_promise) return _promise;
  _promise = new Promise((resolve) => {
    let loader;
    try {
      loader = new GLTFLoader();
    } catch (e) {
      resolve({ ok: false, error: e });
      return;
    }
    // load() kann je nach Umgebung auch synchron werfen (z. B. bei einer
    // nicht aufloesbaren URL) — das darf das Spiel nicht mitreissen.
    try {
      loader.load(url, (gltf) => {
        _model = gltf.scene;
        _clips = gltf.animations || [];
        _model.updateMatrixWorld(true);
        resolve({ ok: true, clips: _clips.map((c) => c.name) });
      }, undefined, (err) => {
        console.warn('[RiftRush] Charaktermodell nicht geladen, nutze prozedurale Figur.', err?.message || err);
        resolve({ ok: false, error: err });
      });
    } catch (e) {
      console.warn('[RiftRush] Charaktermodell nicht ladbar, nutze prozedurale Figur.', e?.message || e);
      resolve({ ok: false, error: e });
    }
  });
  return _promise;
}

/** Direktes Setzen eines bereits geparsten Modells (Tests, Vorab-Ladung). */
export function adoptPlayerModel(scene, animations) {
  _model = scene;
  _clips = animations || [];
  _model.updateMatrixWorld(true);
  _promise = Promise.resolve({ ok: true, clips: _clips.map((c) => c.name) });
  return true;
}

export function hasPlayerModel() { return !!_model; }
export function playerClips() { return _clips; }

/** Frische, unabhängige Instanz inklusive eigener Materialien. */
export function instantiatePlayerModel() {
  if (!_model) return null;
  const root = cloneSkinned(_model);
  const materials = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;          // Skinning verschiebt die Bounding Box
    const name = o.material.name;
    if (!materials[name]) materials[name] = o.material.clone();
    o.material = materials[name];
  });
  return { root, materials, clips: _clips };
}
