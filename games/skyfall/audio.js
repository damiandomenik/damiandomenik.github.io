// SKYFALL — audio.js
// Alle Geräusche werden mit der Web Audio API synthetisiert.
// assets/sounds/ ist vorbereitet, falls später echte Samples dazukommen —
// der Prototyp braucht keine.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.7;
    this._noiseBuf = null;
    this._engine = null;
    this._ambient = null;
  }

  // Browser erlauben Audio erst nach einer Nutzergeste.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // Wiederverwendbarer Rauschpuffer
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  get t() { return this.ctx.currentTime; }

  _noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf;
    s.loop = true;
    return s;
  }

  _env(node, gain, attack, decay, delay = 0) {
    const g = this.ctx.createGain();
    const t = this.t + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  // Lautstärke nach Entfernung (Distanz in Weltmetern)
  _dist(d) {
    return Math.max(0, 1 - d / 480) ** 2;
  }

  /* ---------------- Waffen ---------------- */

  shot(kind = 'blaster', dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const a = this._dist(dist);
    if (a < 0.02) return;

    if (kind === 'rocket' || kind === 'bomb') {
      const n = this._noise();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      n.connect(f);
      this._env(f, 0.35 * a, 0.01, 0.5);
      n.start(); n.stop(this.t + 0.6);
      return;
    }
    if (kind === 'scatter') {
      const n = this._noise();
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
      n.connect(f);
      this._env(f, 0.4 * a, 0.005, 0.22);
      n.start(); n.stop(this.t + 0.3);
      return;
    }
    // Energie-Blaster: abfallender Sweep
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1500, this.t);
    o.frequency.exponentialRampToValueAtTime(240, this.t + 0.09);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 3000;
    o.connect(f);
    this._env(f, 0.16 * a, 0.004, 0.1);
    o.start(); o.stop(this.t + 0.14);
  }

  /* ---------------- Treffer / Explosionen ---------------- */

  hit(dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const a = this._dist(dist);
    if (a < 0.02) return;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(420, this.t);
    o.frequency.exponentialRampToValueAtTime(120, this.t + 0.07);
    this._env(o, 0.13 * a, 0.002, 0.08);
    o.start(); o.stop(this.t + 0.12);
  }

  explosion(dist = 0, size = 1) {
    if (!this.ctx || !this.enabled) return;
    const a = this._dist(dist) * size;
    if (a < 0.02) return;

    const n = this._noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, this.t);
    f.frequency.exponentialRampToValueAtTime(120, this.t + 0.9 * size);
    n.connect(f);
    this._env(f, 0.55 * a, 0.008, 1.1 * size);
    n.start(); n.stop(this.t + 1.4 * size);

    // Tiefer Druckstoß
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 / size, this.t);
    o.frequency.exponentialRampToValueAtTime(28, this.t + 0.6 * size);
    this._env(o, 0.5 * a, 0.01, 0.7 * size);
    o.start(); o.stop(this.t + 0.9 * size);
  }

  /* ---------------- Triebwerk (nur lokaler Spieler) ---------------- */

  engineStart() {
    if (!this.ctx || this._engine) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = 90;
    const n = this._noise();

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 400;
    filt.Q.value = 3;

    const nGain = this.ctx.createGain();
    nGain.gain.value = 0.25;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    osc.connect(filt); sub.connect(filt);
    n.connect(nGain); nGain.connect(filt);
    filt.connect(gain); gain.connect(this.master);

    osc.start(); sub.start(); n.start();
    this._engine = { osc, sub, filt, gain, n };
  }

  engineStop() {
    if (!this._engine) return;
    const e = this._engine;
    e.gain.gain.cancelScheduledValues(this.t);
    e.gain.gain.setValueAtTime(Math.max(0.0002, e.gain.gain.value), this.t);
    e.gain.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.35);
    e.osc.stop(this.t + 0.4); e.sub.stop(this.t + 0.4); e.n.stop(this.t + 0.4);
    this._engine = null;
  }

  // throttle 0..1, boost bool
  engineUpdate(throttle, boost) {
    if (!this._engine) return;
    const e = this._engine;
    const target = 55 + throttle * 95 + (boost ? 70 : 0);
    e.osc.frequency.setTargetAtTime(target, this.t, 0.12);
    e.sub.frequency.setTargetAtTime(target * 1.49, this.t, 0.12);
    e.filt.frequency.setTargetAtTime(320 + throttle * 900 + (boost ? 1400 : 0), this.t, 0.15);
    e.gain.gain.setTargetAtTime(0.09 + throttle * 0.12 + (boost ? 0.1 : 0), this.t, 0.15);
  }

  /* ---------------- Ambience / Wind ---------------- */

  ambientStart() {
    if (!this.ctx || this._ambient) return;
    const n = this._noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start();
    this._ambient = { n, f, g };
  }

  ambientSet(speed) {
    if (!this._ambient) return;
    this._ambient.f.frequency.setTargetAtTime(220 + speed * 3.2, this.t, 0.4);
    this._ambient.g.gain.setTargetAtTime(0.03 + Math.min(0.09, speed * 0.0009), this.t, 0.4);
  }

  /* ---------------- Alarm / Core / UI ---------------- */

  alarm() {
    if (!this.ctx || !this.enabled) return;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(620, this.t + i * 0.36);
      o.frequency.linearRampToValueAtTime(430, this.t + i * 0.36 + 0.28);
      this._env(o, 0.1, 0.03, 0.26, i * 0.36);
      o.start(this.t + i * 0.36); o.stop(this.t + i * 0.36 + 0.34);
    }
  }

  coreHit(dist = 0) {
    if (!this.ctx || !this.enabled) return;
    const a = this._dist(dist);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, this.t);
    o.frequency.exponentialRampToValueAtTime(60, this.t + 0.3);
    this._env(o, 0.2 * a, 0.005, 0.32);
    o.start(); o.stop(this.t + 0.4);
  }

  thunder() {
    if (!this.ctx || !this.enabled) return;
    const delay = 0.2 + Math.random() * 0.8;
    const n = this._noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 240;
    n.connect(f);
    this._env(f, 0.3, 0.15, 2.0, delay);
    n.start(this.t + delay); n.stop(this.t + delay + 2.4);
  }

  ui(kind = 'click') {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    const base = kind === 'ok' ? 660 : kind === 'err' ? 180 : 440;
    o.frequency.setValueAtTime(base, this.t);
    o.frequency.exponentialRampToValueAtTime(kind === 'err' ? 90 : base * 1.5, this.t + 0.07);
    this._env(o, 0.06, 0.004, 0.07);
    o.start(); o.stop(this.t + 0.12);
  }

  death() {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, this.t);
    o.frequency.exponentialRampToValueAtTime(40, this.t + 0.9);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 800;
    o.connect(f);
    this._env(f, 0.18, 0.02, 0.95);
    o.start(); o.stop(this.t + 1.1);
  }
}

export const sfx = new Sfx();
