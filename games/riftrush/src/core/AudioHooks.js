/**
 * Audio-Hooks.
 *
 * Das Spiel hat (noch) kein Soundsystem. Damit später Sounds ergänzt werden
 * können, ohne Gameplay-Code anzufassen, feuert alles hier benannte Ereignisse.
 * Anbinden später z. B. so:
 *
 *   RIFTRUSH.audio.on('boss:shockwave', () => playSound('shockwave.ogg'));
 */
export class AudioHooks {
  constructor() {
    this.listeners = new Map();
    this.log = [];          // letzte Ereignisse (Debug / Tests)
    this.enabled = true;
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
    return this;
  }

  emit(name, data = {}) {
    if (!this.enabled) return;
    this.log.push({ name, t: Date.now() });
    if (this.log.length > 64) this.log.shift();
    const l = this.listeners.get(name);
    if (l) for (const fn of l) { try { fn(data); } catch (e) { console.warn('[audio]', e); } }
    const any = this.listeners.get('*');
    if (any) for (const fn of any) { try { fn(name, data); } catch {} }
  }

  // ---- benannte Hooks: das ist die Schnittstelle für spätere Sounds ----
  bossIntro(d) { this.emit('boss:intro', d); }
  mechanismActivated(d) { this.emit('boss:mechanism', d); }
  shieldDestroyed(d) { this.emit('boss:shield-down', d); }
  shockwave(d) { this.emit('boss:shockwave', d); }
  laserWarning(d) { this.emit('boss:laser-warning', d); }
  laserFire(d) { this.emit('boss:laser-fire', d); }
  projectiles(d) { this.emit('boss:projectiles', d); }
  floorCollapse(d) { this.emit('boss:floor-collapse', d); }
  bossSlam(d) { this.emit('boss:slam', d); }
  bossHit(d) { this.emit('boss:hit', d); }
  phaseTransition(d) { this.emit('boss:phase', d); }
  escapeCountdown(d) { this.emit('boss:escape', d); }
  playerHit(d) { this.emit('player:hit', d); }
  finalFinish(d) { this.emit('race:finish', d); }
}
