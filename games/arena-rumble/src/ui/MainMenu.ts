import { el, button } from './dom';
import { normaliseRoomCode } from '../network/SignalingClient';

export interface MainMenuCallbacks {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, code: string) => void;
}

/**
 * Title screen. Two doors: open a room, or walk into one.
 * The player's name is remembered locally so friends do not retype it.
 */
export class MainMenu {
  readonly root: HTMLElement;
  private nameInput: HTMLInputElement;
  private codeInput: HTMLInputElement;
  private errorNode: HTMLElement;
  private busy = false;
  private buttons: HTMLButtonElement[] = [];

  constructor(private callbacks: MainMenuCallbacks) {
    this.nameInput = el('input', {
      id: 'player-name',
      maxlength: 14,
      placeholder: 'Your name',
      autocomplete: 'off',
      spellcheck: 'false',
      value: localStorage.getItem('arena-rumble:name') ?? '',
    }) as HTMLInputElement;

    this.codeInput = el('input', {
      id: 'room-code',
      maxlength: 6,
      placeholder: 'ABC123',
      autocomplete: 'off',
      spellcheck: 'false',
      style: 'text-transform:uppercase;letter-spacing:0.24em;font-family:var(--mono)',
    }) as HTMLInputElement;
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = normaliseRoomCode(this.codeInput.value);
    });

    this.errorNode = el('div', { class: 'error' });

    const create = button('Create room', () => this.submitCreate(), 'btn btn--primary');
    const join = button('Join room', () => this.submitJoin());
    this.buttons = [create, join];

    this.root = el(
      'div',
      { class: 'screen' },
      el(
        'header',
        { class: 'brand' },
        el('h1', { class: 'brand__mark', text: 'ARENA\nRUMBLE' }),
        el(
          'div',
          { class: 'brand__bar' },
          el('div', { class: 'rule' }),
          el('div', { class: 'brand__tag', text: 'Live Arena' }),
          el('div', { class: 'rule' }),
        ),
      ),
      el(
        'div',
        { class: 'menu' },
        el('div', { class: 'field' }, el('label', { for: 'player-name', text: 'Player name' }), this.nameInput),
        el('div', { class: 'field' }, el('label', { for: 'room-code', text: 'Room code' }), this.codeInput),
        this.errorNode,
        el('div', { class: 'menu__row' }, create, join),
        el('p', {
          class: 'menu__note',
          text:
            'Up to 8 players. One of you creates the room and runs the match; ' +
            'everyone else joins with the code. Leave the code empty to create.',
        }),
      ),
    );

    this.root.querySelector('.brand__mark')!.innerHTML = 'ARENA<br>RUMBLE';

    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.codeInput.value ? this.submitJoin() : this.submitCreate();
    });
    this.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submitJoin();
    });
  }

  private get playerName(): string | null {
    const name = this.nameInput.value.trim();
    if (name.length < 2) {
      this.showError('Enter a name with at least two characters.');
      this.nameInput.focus();
      return null;
    }
    localStorage.setItem('arena-rumble:name', name);
    return name;
  }

  private submitCreate(): void {
    if (this.busy) return;
    const name = this.playerName;
    if (!name) return;
    this.showError('');
    this.callbacks.onCreateRoom(name);
  }

  private submitJoin(): void {
    if (this.busy) return;
    const name = this.playerName;
    if (!name) return;
    const code = normaliseRoomCode(this.codeInput.value);
    if (code.length !== 6) {
      this.showError('A room code is six characters long.');
      this.codeInput.focus();
      return;
    }
    this.showError('');
    this.callbacks.onJoinRoom(name, code);
  }

  showError(message: string): void {
    this.errorNode.textContent = message;
  }

  setBusy(busy: boolean, label?: string): void {
    this.busy = busy;
    for (const node of this.buttons) node.disabled = busy;
    if (label) this.showError(label);
  }

  focus(): void {
    if (!this.nameInput.value) this.nameInput.focus();
  }
}
