import { el, button, clear } from './dom';
import { GAME_CONFIG } from '../config/gameConfig';
import type { PlayerRecord } from '../game/GameState';

export interface LobbyCallbacks {
  onStart: () => void;
  onLeave: () => void;
}

/** The waiting room: who is here, the code to share, and the start button. */
export class LobbyUI {
  readonly root: HTMLElement;
  private codeNode: HTMLElement;
  private rosterNode: HTMLElement;
  private countNode: HTMLElement;
  private startButton: HTMLButtonElement;
  private hintNode: HTMLElement;

  constructor(callbacks: LobbyCallbacks) {
    this.codeNode = el('div', { class: 'roomcode__value', text: '------' });
    this.rosterNode = el('ul', { class: 'roster' });
    this.countNode = el('div', { class: 'eyebrow', text: '0 / 8 players' });
    this.hintNode = el('div', { class: 'menu__note', text: '' });

    this.startButton = button('Start match', callbacks.onStart, 'btn btn--primary');
    this.startButton.disabled = true;

    const copy = button(
      'Copy code',
      () => {
        void navigator.clipboard?.writeText(this.codeNode.textContent ?? '');
        copy.textContent = 'Copied';
        window.setTimeout(() => (copy.textContent = 'Copy code'), 1400);
      },
      'btn btn--ghost',
    );

    this.root = el(
      'div',
      { class: 'screen' },
      el(
        'section',
        { class: 'lobby' },
        el(
          'div',
          { class: 'lobby__head' },
          el('h2', { class: 'lobby__title', text: 'Waiting room' }),
          this.countNode,
        ),
        el(
          'div',
          { class: 'roomcode' },
          el('div', { class: 'eyebrow', text: 'Room code' }),
          this.codeNode,
          copy,
        ),
        this.rosterNode,
        el(
          'div',
          { class: 'lobby__foot' },
          button('Leave', callbacks.onLeave, 'btn btn--ghost'),
          this.startButton,
        ),
      ),
      this.hintNode,
    );
  }

  setRoomCode(code: string): void {
    this.codeNode.textContent = code;
  }

  setHostControls(isHost: boolean): void {
    this.startButton.style.display = isHost ? '' : 'none';
    this.hintNode.textContent = isHost
      ? 'Share the code. You run the match, and you fight in it like everyone else.'
      : 'Waiting for the host to start the match.';
  }

  update(players: PlayerRecord[], canStart: boolean): void {
    clear(this.rosterNode);

    players.forEach((player, index) => {
      this.rosterNode.append(
        el(
          'li',
          { class: 'roster__item' },
          el('span', { class: 'roster__slot', text: String(index + 1).padStart(2, '0') }),
          el('span', { text: player.name }),
          player.isHost ? el('span', { class: 'roster__badge', text: 'Host' }) : null,
        ),
      );
    });

    for (let i = players.length; i < GAME_CONFIG.maxPlayers; i++) {
      this.rosterNode.append(
        el(
          'li',
          { class: 'roster__item roster__item--empty' },
          el('span', { class: 'roster__slot', text: String(i + 1).padStart(2, '0') }),
          el('span', { text: 'Open slot' }),
        ),
      );
    }

    this.countNode.textContent = `${players.length} / ${GAME_CONFIG.maxPlayers} players`;
    this.startButton.disabled = !canStart;
    this.startButton.textContent =
      players.length < GAME_CONFIG.minPlayersToStart ? 'Need 2 players' : 'Start match';
  }
}
