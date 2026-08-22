import { CONFIG } from './Config.js';

/** true, wenn der Fokus in einem Eingabefeld liegt (Tastatur nicht abfangen). */
export function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/**
 * Tastatur- / Maus-Input inkl. Pointer Lock.
 * Liefert pro Frame: bewegungsachsen, "pressed"-Flags (edge triggered) und Mouse-Delta.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // in diesem Frame neu gedrückt
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = true;
    this.lastShiftTap = -1;
    this.doubleTapSprint = false;
    this._listeners = { lock: [], unlock: [] };

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (isTyping(e.target)) return;      // Formularfelder nicht blockieren
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(code)) e.preventDefault();
      if (!this.keys.has(code)) {
        this.pressed.add(code);
        if (code === 'ShiftLeft' || code === 'ShiftRight') {
          const now = performance.now();
          this.doubleTapSprint = (now - this.lastShiftTap) < 280;
          this.lastShiftTap = now;
        }
      }
      this.keys.add(code);
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.locked) return;
      this.pressed.add(e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : 'Mouse1');
      this.keys.add(e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : 'Mouse1');
    };
    this._onMouseUp = (e) => {
      this.keys.delete(e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : 'Mouse1');
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.keys.clear();
      (this.locked ? this._listeners.lock : this._listeners.unlock).forEach((f) => f());
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(evt, fn) { this._listeners[evt].push(fn); }
  requestLock() {
    if (this.locked) return;
    try {
      // Chrome 113+ liefert ein Promise; ohne User-Geste schlägt es fehl.
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }
  exitLock() { if (this.locked) document.exitPointerLock?.(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  /** Bewegungsvektor in lokalen Achsen (x = strafe, z = vorwärts) */
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  get crouch() { return this.down('ControlLeft') || this.down('KeyC') || this.down('ControlRight'); }
  get jumpPressed() { return this.hit('Space'); }
  get jumpHeld() { return this.down('Space'); }
  get dashPressed() { return this.hit('KeyQ') || this.doubleTapSprint || this.hit('Mouse2'); }
  get punchPressed() { return this.hit('Mouse0') || this.hit('KeyF'); }
  get crouchPressed() { return this.hit('ControlLeft') || this.hit('KeyC') || this.hit('ControlRight'); }

  consumeMouse() {
    const dx = this.mouseDX * CONFIG.MOUSE_SENSITIVITY;
    const dy = this.mouseDY * CONFIG.MOUSE_SENSITIVITY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  /** Am Ende jedes Frames aufrufen. */
  endFrame() {
    this.pressed.clear();
    this.doubleTapSprint = false;
  }
}
