import { el } from './dom';

/** Deliberately small: a name and the two keys that change it. */
export class SpectatorUI {
  readonly root: HTMLElement;
  private nameNode: HTMLElement;

  constructor() {
    this.nameNode = el('div', { class: 'spectator__name', text: '—' });

    const keys = el('div', { class: 'spectator__keys' });
    keys.innerHTML = '<kbd>Q</kbd> prev &nbsp; <kbd>E</kbd> next &nbsp; <kbd>Wheel</kbd> switch';

    this.root = el(
      'div',
      { class: 'screen screen--transparent' },
      el(
        'div',
        { class: 'spectator' },
        el('div', { class: 'spectator__label', text: 'Spectating' }),
        this.nameNode,
        keys,
      ),
    );
    (this.root.querySelector('.spectator') as HTMLElement).style.pointerEvents = 'auto';
  }

  setTarget(name: string | null): void {
    this.nameNode.textContent = name ?? '—';
  }
}
