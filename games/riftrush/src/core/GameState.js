/** Match-Phasen (Flow: MENU -> LOBBY -> COUNTDOWN -> RUNNING -> RESULTS). */
export const Phase = {
  MENU: 'menu',
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  RESULTS: 'results',
  PAUSED: 'paused',
};

export class GameState {
  constructor() {
    this.phase = Phase.MENU;
    this.seed = 0;
    this.startAt = 0;          // performance.now() beim Start des Timers
    this.countdownEnds = 0;
    this.matchTime = 0;        // Sekunden seit Start (für deterministische Hazards)
    this.results = [];
    this.solo = false;
    this.prevPhase = Phase.MENU;
  }

  set(phase) {
    this.prevPhase = this.phase;
    this.phase = phase;
  }

  get running() { return this.phase === Phase.RUNNING; }
  get inWorld() {
    return this.phase === Phase.COUNTDOWN || this.phase === Phase.RUNNING ||
           this.phase === Phase.RESULTS || this.phase === Phase.PAUSED;
  }
  get elapsedMs() {
    if (!this.startAt) return 0;
    return performance.now() - this.startAt;
  }
}
