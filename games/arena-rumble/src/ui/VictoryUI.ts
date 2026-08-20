import { el, button } from './dom';

/** End of the whole match series. */
export class VictoryUI {
  readonly root: HTMLElement;
  private nameNode: HTMLElement;
  private winsNode: HTMLElement;
  private roundsNode: HTMLElement;
  private actions: HTMLElement;

  constructor(onBackToLobby: () => void) {
    this.nameNode = el('div', { class: 'result__name', text: '' });
    this.winsNode = el('div', { class: 'champion__statValue', text: '0' });
    this.roundsNode = el('div', { class: 'champion__statValue', text: '0' });
    this.actions = el('div', { style: 'margin-top:36px' }, button('Back to room', onBackToLobby));

    this.root = el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'result' },
        el('div', { class: 'champion__crown', text: '🏆' }),
        el('div', { class: 'result__label', text: 'Champion' }),
        this.nameNode,
        el(
          'div',
          { class: 'champion__stats' },
          el('div', { class: 'champion__stat' }, this.winsNode, el('div', { class: 'card__metaLabel', text: 'Wins' })),
          el('div', { class: 'champion__stat' }, this.roundsNode, el('div', { class: 'card__metaLabel', text: 'Rounds' })),
        ),
        this.actions,
      ),
    );
  }

  show(name: string, wins: number, rounds: number, isHost: boolean): void {
    this.nameNode.textContent = name;
    this.winsNode.textContent = String(wins);
    this.roundsNode.textContent = String(rounds);
    this.actions.style.display = isHost ? '' : 'none';
  }
}
