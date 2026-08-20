import { el } from './dom';

/** Arena transition screen. */
export class LoadingUI {
  readonly root: HTMLElement;
  private nameNode: HTMLElement;
  private fillNode: HTMLElement;

  constructor() {
    this.nameNode = el('div', { class: 'loading__name', text: '' });
    this.fillNode = el('div', { class: 'loading__fill' });

    this.root = el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'loading' },
        el('div', { class: 'loading__title', text: 'Loading arena' }),
        this.nameNode,
        el('div', { class: 'loading__track' }, this.fillNode),
      ),
    );
  }

  set(fraction: number, arenaName: string): void {
    this.nameNode.textContent = arenaName;
    this.fillNode.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  }
}
