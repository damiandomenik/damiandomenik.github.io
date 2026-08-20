import * as THREE from 'three';
import type { ThirdPersonSpectatorCamera } from '../camera/ThirdPersonSpectatorCamera';
import type { InputManager } from '../player/InputManager';
import type { GameState } from '../game/GameState';
import type { PlayerManager } from '../player/PlayerManager';

/**
 * Drives the eliminated player's view: which body is being followed, and the
 * Q / E / mouse wheel controls for switching between them.
 */
export class SpectatorController {
  private targetIndex = 0;
  private targets: string[] = [];
  private unbind: Array<() => void> = [];
  private active = false;

  onTargetChanged?: (name: string | null) => void;

  constructor(
    private camera: ThirdPersonSpectatorCamera,
    private input: InputManager,
    private players: PlayerManager,
  ) {}

  enable(): void {
    if (this.active) return;
    this.active = true;
    this.camera.reset();
    this.unbind.push(this.input.bind('KeyQ', () => this.cycle(-1)));
    this.unbind.push(this.input.bind('KeyE', () => this.cycle(1)));
    window.addEventListener('wheel', this.handleWheel, { passive: true });
  }

  disable(): void {
    if (!this.active) return;
    this.active = false;
    for (const off of this.unbind) off();
    this.unbind = [];
    window.removeEventListener('wheel', this.handleWheel);
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Refresh the follow list; keeps the current target if it is still valid. */
  refreshTargets(state: GameState): void {
    const previous = this.targets[this.targetIndex];
    this.targets = state.spectatableIds();
    const found = previous ? this.targets.indexOf(previous) : -1;
    this.targetIndex = found >= 0 ? found : 0;
    this.notify(state);
  }

  private cycle(direction: number): void {
    if (!this.targets.length) return;
    this.targetIndex =
      (this.targetIndex + direction + this.targets.length) % this.targets.length;
    this.camera.reset();
  }

  private handleWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    if (event.shiftKey) {
      this.camera.zoom(event.deltaY * 0.004);
    } else {
      this.cycle(event.deltaY > 0 ? 1 : -1);
    }
  };

  currentTargetId(): string | null {
    return this.targets[this.targetIndex] ?? null;
  }

  update(state: GameState, dt: number): void {
    if (!this.active) return;

    const delta = this.input.consumeMouseDelta();
    if (this.input.isLocked) this.camera.look(delta.x, delta.y);

    const id = this.currentTargetId();
    if (!id) return;

    const record = state.player(id);
    const body = this.players.get(id);
    const position = body
      ? body.root.position
      : record
        ? new THREE.Vector3(record.position.x, record.position.y, record.position.z)
        : null;
    if (!position) return;

    this.camera.update(position, record?.yaw ?? 0, dt);
    this.notify(state);
  }

  private notify(state: GameState): void {
    const id = this.currentTargetId();
    this.onTargetChanged?.(id ? (state.player(id)?.name ?? null) : null);
  }
}
