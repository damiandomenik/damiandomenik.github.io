import * as THREE from 'three';
import type { AssetManager } from './AssetManager';
import { weaponUrl, type WeaponDefinition } from '../config/weapons';

/**
 * Loads a weapon GLB and returns it ready to be parented either to the first
 * person camera rig or to a remote player's hand.
 *
 * The GLBs were sliced out of the source kits in a way that already puts the
 * grip at the origin and the muzzle down -Z, so no per weapon fix-up code is
 * needed here — new weapons only need an entry in config/weapons.ts.
 */
export class WeaponLoader {
  constructor(private assets: AssetManager) {}

  async create(definition: WeaponDefinition, forViewModel: boolean): Promise<THREE.Group> {
    const model = await this.assets.instance(weaponUrl(definition));

    const holder = new THREE.Group();
    holder.name = `weapon:${definition.id}`;
    holder.add(model);

    if (forViewModel) {
      const [x, y, z] = definition.view.position;
      const [rx, ry, rz] = definition.view.rotation;
      holder.position.set(x, y, z);
      holder.rotation.set(rx, ry, rz);
      holder.scale.setScalar(definition.view.scale);
    }

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !forViewModel;
      mesh.receiveShadow = false;
      // The view model must never be clipped by the near plane or occluded by
      // the world, so it renders last with depth cleared.
      mesh.frustumCulled = false;
      mesh.userData.noCollision = true;
      if (forViewModel) mesh.renderOrder = 10;
    });

    return holder;
  }
}
