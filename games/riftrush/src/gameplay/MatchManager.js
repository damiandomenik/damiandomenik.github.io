import { CONFIG as C } from '../core/Config.js';
import { Phase } from '../core/GameState.js';

/**
 * Steuert den Match-Flow.
 * Der Host bestimmt Seed und Startzeitpunkt; alle Clients bauen daraufhin
 * denselben Dungeon und starten ihren lokalen Countdown.
 */
export class MatchManager {
  constructor(game) {
    this.game = game;
    this.finishTimeoutAt = 0;
  }

  /** Nur Host: Match starten. */
  requestStart() {
    const game = this.game;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const countdown = C.COUNTDOWN_SECONDS * 1000;
    if (!game.state.solo) game.network.startMatch(seed, countdown);
    this.beginMatch(seed, countdown);
  }

  /**
   * Wird auf allen Clients ausgeführt (lokal oder per Netzwerk-Event).
   * elapsedMs > 0 bedeutet: das Match läuft bereits, wir steigen mitten ein.
   */
  beginMatch(seed, countdownMs, elapsedMs = 0) {
    const game = this.game;
    game.buildDungeon(seed);
    game.resetPlayersForRun();

    game.state.seed = seed;
    game.state.results = [];
    if (elapsedMs > 0) {
      game.state.startAt = performance.now() - elapsedMs;
      game.state.matchTime = elapsedMs / 1000;
      game.state.countdownEnds = 0;
      game.state.set(Phase.RUNNING);
      game.hud.setCountdown(-1);
      game.hud.toast('LAUFENDES MATCH — GO!', 2000);
    } else {
      game.state.startAt = 0;
      game.state.matchTime = 0;
      game.state.countdownEnds = performance.now() + countdownMs;
      game.state.set(Phase.COUNTDOWN);
    }
    game.ui.showWorld();
    game.controller.resetCamera();
    game.input.requestLock();
    this.finishTimeoutAt = 0;
  }

  update(dt) {
    const game = this.game;
    const st = game.state;

    if (st.phase === Phase.COUNTDOWN) {
      const left = st.countdownEnds - performance.now();
      game.hud.setCountdown(left);
      if (left <= 0) {
        st.startAt = performance.now();
        st.set(Phase.RUNNING);
        game.hud.setCountdown(-1);
        game.hud.toast('GO!');
      }
    }

    if (st.phase === Phase.RUNNING) {
      // Alle fertig -> Ergebnisse; sonst Nachlauf-Fenster nach dem ersten Finish
      const race = game.race;
      const anyFinished = [...race.entries.values()].some((e) => e.finished);
      if (race.allFinished) this.finish();
      else if (anyFinished) {
        // Nachlauf-Fenster, sobald der erste Spieler im Ziel ist
        if (!this.finishTimeoutAt) {
          this.finishTimeoutAt = performance.now() + C.FINISH_GRACE_SECONDS * 1000;
          game.hud.toast(`NOCH ${C.FINISH_GRACE_SECONDS}s`, 2000);
        }
        if (performance.now() > this.finishTimeoutAt) this.finish();
      }
    }
  }

  finish() {
    const game = this.game;
    if (game.state.phase === Phase.RESULTS) return;
    game.state.results = game.race.standings().map((e) => ({ ...e }));
    game.state.set(Phase.RESULTS);
    game.input.exitLock();
    game.ui.showResults(game.state.results);
  }

  /** Zurück in die Lobby (Rematch-Vorbereitung). */
  toLobby() {
    const game = this.game;
    game.state.set(Phase.LOBBY);
    game.input.exitLock();
    game.ui.showLobby();
  }
}
