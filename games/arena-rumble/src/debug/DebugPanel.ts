import { el, button } from '../ui/dom';
import { ARENAS } from '../config/arenas';
import { WEAPONS } from '../config/weapons';
import type { Game } from '../game/Game';

/**
 * Developer overlay, opened with ?debug=true.
 *
 * Lets you walk an arena on your own, force a specific arena or weapon for the
 * next round, and watch the numbers that usually go wrong first.
 */
export class DebugPanel {
  readonly root: HTMLElement;
  private statsNode: HTMLElement;
  private arenaSelect: HTMLSelectElement;
  private weaponSelect: HTMLSelectElement;
  private timer = 0;

  constructor(private game: Game) {
    this.arenaSelect = el('select', {}) as HTMLSelectElement;
    for (const arena of ARENAS) {
      this.arenaSelect.append(el('option', { value: arena.id }, arena.name));
    }

    this.weaponSelect = el('select', {}) as HTMLSelectElement;
    this.weaponSelect.append(el('option', { value: '' }, 'Random weapon'));
    for (const weapon of WEAPONS) {
      this.weaponSelect.append(el('option', { value: weapon.id }, weapon.name));
    }

    this.statsNode = el('div', {});

    this.root = el(
      'aside',
      { class: 'debug' },
      el('div', { class: 'debug__head', text: 'Debug' }),
      el(
        'div',
        { class: 'debug__body' },
        this.arenaSelect,
        button('Walk this arena', () => {
          void this.game.debugLoadArena(this.arenaSelect.value);
        }),
        this.weaponSelect,
        button('Force next round', () => {
          this.game.matchManager?.forceNextRound(
            this.arenaSelect.value,
            this.weaponSelect.value || undefined,
          );
        }),
        button('Start match', () => this.game.matchManager?.startMatch()),
        button('Eliminate a fighter', () => {
          const fighters = this.game.gameState.fighters;
          if (fighters.length) this.game.matchManager?.concludeRound(fighters[0].id);
        }),
        button('Toggle audio', () => {
          const audio = this.game.audioManager;
          audio.setEnabled(!audio.isEnabled);
        }),
        el('div', { class: 'rule' }),
        this.statsNode,
      ),
    );
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer < 0.25) return;
    this.timer = 0;

    const stats = this.game.debugStats();
    this.statsNode.replaceChildren(
      ...Object.entries(stats).map(([key, value]) =>
        el(
          'div',
          { class: 'debug__stat' },
          el('span', { text: key }),
          el('span', { text: value }),
        ),
      ),
    );
  }

  static isEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('debug') === 'true';
  }
}
