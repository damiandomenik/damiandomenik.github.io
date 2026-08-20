import { GAME_CONFIG } from '../config/gameConfig';

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  fire: boolean;
  reload: boolean;
}

/**
 * Keyboard + pointer lock. Nothing here knows about the game; it just exposes
 * the current button state and accumulated mouse delta.
 */
export class InputManager {
  readonly movement: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    fire: false,
    reload: false,
  };

  /** Consumed once per frame by the camera. */
  mouseDeltaX = 0;
  mouseDeltaY = 0;

  private locked = false;
  private enabled = false;
  private keyHandlers = new Map<string, () => void>();
  private onLockChange?: (locked: boolean) => void;

  constructor(private element: HTMLElement) {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('blur', this.releaseAll);
  }

  /** Only when enabled do keys and clicks reach gameplay. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  onPointerLockChange(handler: (locked: boolean) => void): void {
    this.onLockChange = handler;
  }

  requestLock(): void {
    if (!this.locked) void this.element.requestPointerLock();
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Register an action key such as Q / E for spectator switching. */
  bind(code: string, handler: () => void): () => void {
    this.keyHandlers.set(code, handler);
    return () => this.keyHandlers.delete(code);
  }

  consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const handler = this.keyHandlers.get(event.code);
    if (handler && this.enabled) handler();
    if (!this.enabled) return;
    this.setKey(event.code, true);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.setKey(event.code, false);
  };

  private setKey(code: string, down: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.movement.forward = down;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.movement.backward = down;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.movement.left = down;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.movement.right = down;
        break;
      case 'Space':
        this.movement.jump = down;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.movement.sprint = down;
        break;
      case 'KeyR':
        this.movement.reload = down;
        break;
      default:
        break;
    }
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked || !this.enabled) return;
    const sensitivity = GAME_CONFIG.player.mouseSensitivity;
    this.mouseDeltaX += event.movementX * sensitivity;
    this.mouseDeltaY += event.movementY * sensitivity;
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (!this.locked || !this.enabled) return;
    if (event.button === 0) this.movement.fire = true;
  };

  private handleMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.movement.fire = false;
  };

  private handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element;
    if (!this.locked) this.releaseAll();
    this.onLockChange?.(this.locked);
  };

  private releaseAll = (): void => {
    for (const key of Object.keys(this.movement) as Array<keyof MovementInput>) {
      this.movement[key] = false;
    }
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  };

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('blur', this.releaseAll);
  }
}
