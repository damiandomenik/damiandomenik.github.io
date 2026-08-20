import * as THREE from 'three';
import type { WeaponDefinition } from '../config/weapons';
import type { WeaponLoader } from '../assets/WeaponLoader';
import { damp } from '../core/MathUtils';

/**
 * The local player's held weapon: the first person view model, the fire rate
 * gate, the local ammo counter and the sway / kick animation.
 *
 * Ammo shown here is predicted; the host's `ammo_update` is what actually
 * counts and overwrites it.
 */
export class WeaponSystem {
  private anchor = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private definition: WeaponDefinition | null = null;
  private loadToken = 0;

  ammo = 0;
  reloading = false;
  reloadEndsAt = 0;

  private lastFireTime = -Infinity;
  private kick = 0;
  private swayX = 0;
  private swayY = 0;
  private swingPhase = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private loader: WeaponLoader,
  ) {
    this.anchor.name = 'weapon-anchor';
    // The view model hangs off the camera, so it never drifts in world space.
    this.camera.add(this.anchor);
  }

  get current(): WeaponDefinition | null {
    return this.definition;
  }

  async equip(definition: WeaponDefinition | null): Promise<void> {
    const token = ++this.loadToken;
    this.clearModel();
    this.definition = definition;
    this.lastFireTime = -Infinity;
    this.reloading = false;
    this.ammo = definition ? definition.magazineSize : 0;
    if (!definition) return;

    try {
      const model = await this.loader.create(definition, true);
      if (token !== this.loadToken) return; // a newer equip won
      this.model = model;
      this.anchor.add(model);
    } catch (err) {
      console.warn('[WeaponSystem] could not load view model', definition.id, err);
    }
  }

  private clearModel(): void {
    if (this.model) {
      this.model.removeFromParent();
      this.model = null;
    }
  }

  /** True if the trigger can be pulled right now. */
  canFire(now: number): boolean {
    if (!this.definition) return false;
    if (this.reloading) return false;
    if (this.definition.magazineSize > 0 && this.ammo <= 0) return false;
    const interval = 1000 / this.definition.fireRate;
    return now - this.lastFireTime >= interval;
  }

  /** Records a local shot for prediction and plays the kick. */
  registerFire(now: number): void {
    if (!this.definition) return;
    this.lastFireTime = now;
    if (this.definition.magazineSize > 0) this.ammo = Math.max(0, this.ammo - 1);
    this.kick = 1;
    this.swingPhase = this.definition.kind === 'melee' ? 1 : 0;
  }

  beginReload(now: number): boolean {
    if (!this.definition || this.definition.magazineSize === 0) return false;
    if (this.reloading || this.ammo >= this.definition.magazineSize) return false;
    this.reloading = true;
    this.reloadEndsAt = now + this.definition.reloadTime * 1000;
    return true;
  }

  /** The host is the source of truth for ammo. */
  syncAmmo(ammo: number, reloadEndsAt: number, now: number): void {
    this.ammo = ammo;
    this.reloadEndsAt = reloadEndsAt;
    this.reloading = reloadEndsAt > now;
  }

  update(dt: number, now: number, moveSpeed: number, lookDeltaX: number, lookDeltaY: number): void {
    if (this.reloading && now >= this.reloadEndsAt) this.reloading = false;
    if (!this.model || !this.definition) return;

    const [baseX, baseY, baseZ] = this.definition.view.position;

    // sway opposite to the mouse, damped back to rest
    this.swayX = damp(this.swayX, THREE.MathUtils.clamp(-lookDeltaX * 1.4, -0.05, 0.05), 9, dt);
    this.swayY = damp(this.swayY, THREE.MathUtils.clamp(lookDeltaY * 1.4, -0.05, 0.05), 9, dt);

    // walk bob
    const bob = Math.min(1, moveSpeed / 7);
    const t = now * 0.006;
    const bobX = Math.sin(t) * 0.012 * bob;
    const bobY = Math.abs(Math.cos(t)) * 0.014 * bob;

    this.kick = damp(this.kick, 0, 11, dt);
    this.swingPhase = damp(this.swingPhase, 0, 7.5, dt);

    const isMelee = this.definition.kind === 'melee';
    const kickBack = isMelee ? 0 : this.kick * 0.055;
    const swing = this.swingPhase;

    this.model.position.set(
      baseX + this.swayX + bobX - swing * 0.1,
      baseY + this.swayY - bobY - swing * 0.06,
      baseZ + kickBack + swing * 0.24,
    );

    const [rx, ry, rz] = this.definition.view.rotation;
    this.model.rotation.set(
      rx - this.kick * 0.14 + swing * 1.35,
      ry + this.swayX * 1.6,
      rz + swing * 0.5,
    );
  }

  setVisible(visible: boolean): void {
    this.anchor.visible = visible;
  }

  dispose(): void {
    this.clearModel();
    this.anchor.removeFromParent();
  }
}
