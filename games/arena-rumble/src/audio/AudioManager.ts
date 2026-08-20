import type { WeaponDefinition } from '../config/weapons';

/**
 * All audio is synthesised at runtime.
 *
 * That is a deliberate trade: shipping a set of licensed arena samples would
 * add megabytes and a licensing question to a private project, and the Web
 * Audio API can produce a convincing crowd, countdown and gunshot from noise
 * and oscillators. Drop real files into public/assets/audio and swap the
 * `play*` bodies if you ever want them.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;

  /** Must be called from a user gesture; browsers block audio otherwise. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = createNoiseBuffer(this.ctx, 2.5);
      this.startCrowd();
    } catch (err) {
      console.warn('[Audio] unavailable', err);
      this.enabled = false;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.55 : 0;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // ---------------------------------------------------------------- crowd

  private startCrowd(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    // band-passed noise reads as a distant crowd rather than static
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 620;
    band.Q.value = 0.55;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;

    source.connect(band).connect(gain).connect(this.master);
    source.start();

    this.crowdSource = source;
    this.crowdGain = gain;
  }

  /** 0 = silent lobby, 1 = full house during a fight. */
  setCrowdIntensity(intensity: number): void {
    if (!this.ctx || !this.crowdGain) return;
    const target = Math.max(0, Math.min(1, intensity)) * 0.1;
    this.crowdGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
  }

  /** A short swell, for a kill or the start of a round. */
  crowdSwell(): void {
    if (!this.ctx || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    const current = this.crowdGain.gain.value;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(current, t);
    this.crowdGain.gain.linearRampToValueAtTime(0.26, t + 0.25);
    this.crowdGain.gain.linearRampToValueAtTime(current, t + 2.4);
  }

  // ----------------------------------------------------------------- shot

  playWeapon(weapon: WeaponDefinition): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;

    switch (weapon.audio.tone) {
      case 'whoosh':
        this.noiseBurst(t, 0.22, 900 * weapon.audio.pitch, 'bandpass', 0.22, 3.2);
        break;
      case 'thump':
        this.noiseBurst(t, 0.2, 320 * weapon.audio.pitch, 'lowpass', 0.32, 1);
        this.tone(t, 84 * weapon.audio.pitch, 0.16, 0.22, 'triangle');
        break;
      case 'boom':
        this.noiseBurst(t, 0.34, 700 * weapon.audio.pitch, 'lowpass', 0.42, 1);
        this.tone(t, 62 * weapon.audio.pitch, 0.28, 0.3, 'sine');
        break;
      default:
        this.noiseBurst(t, 0.11, 2400 * weapon.audio.pitch, 'bandpass', 0.3, 1.5);
        this.tone(t, 180 * weapon.audio.pitch, 0.06, 0.14, 'square');
        break;
    }
  }

  playHit(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(this.ctx.currentTime, 1350, 0.05, 0.16, 'square');
  }

  playHurt(): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.18, 420, 'lowpass', 0.3, 1);
    this.tone(t, 140, 0.16, 0.2, 'sawtooth');
  }

  playCountdownBeep(final: boolean): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.tone(t, final ? 880 : 520, final ? 0.5 : 0.16, 0.24, 'sine');
    if (final) this.crowdSwell();
  }

  playElimination(): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.tone(t, 320, 0.5, 0.2, 'sawtooth', 90);
    this.crowdSwell();
  }

  playChampion(): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [392, 523, 659, 784].forEach((frequency, index) => {
      this.tone(t + index * 0.16, frequency, 0.7, 0.2, 'triangle');
    });
    this.crowdSwell();
  }

  playUi(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(this.ctx.currentTime, 660, 0.06, 0.08, 'sine');
  }

  // ------------------------------------------------------------- builders

  private tone(
    start: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private noiseBurst(
    start: number,
    duration: number,
    frequency: number,
    filterType: BiquadFilterType,
    volume: number,
    q: number,
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, frequency * 0.35),
      start + duration,
    );
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter).connect(gain).connect(this.master);
    source.start(start, Math.random() * 1.5, duration + 0.05);
  }

  dispose(): void {
    this.crowdSource?.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // a touch of brown noise makes the crowd bed less hissy
    previous = (previous + 0.02 * white) / 1.02;
    data[i] = white * 0.5 + previous * 3.2;
  }
  return buffer;
}
