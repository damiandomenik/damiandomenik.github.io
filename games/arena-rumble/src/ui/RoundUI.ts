import { el, labelledValue } from './dom';

export interface FightCardData {
  roundIndex: number;
  fighterA: string;
  fighterB: string;
  arenaName: string;
  weaponName: string;
}

export interface RoundResultData {
  winnerName: string;
  loserName: string;
  nextArenaName?: string;
  nextWeaponName?: string;
  isFinalRound: boolean;
}

/**
 * The signature screen: a bout card, the way a fight night lower third would
 * announce it. It carries the countdown so the last thing you read before the
 * fight starts is who you are fighting.
 */
export class RoundUI {
  readonly root: HTMLElement;
  private roundNode: HTMLElement;
  private leftNode: HTMLElement;
  private rightNode: HTMLElement;
  private metaNode: HTMLElement;
  private countNode: HTMLElement;

  constructor() {
    this.roundNode = el('div', { class: 'card__round', text: 'Round 01' });
    this.leftNode = el('div', { class: 'card__fighter card__fighter--left', text: '' });
    this.rightNode = el('div', { class: 'card__fighter card__fighter--right', text: '' });
    this.metaNode = el('div', { class: 'card__meta' });
    this.countNode = el('div', { class: 'card__count', text: '' });

    this.root = el(
      'div',
      { class: 'screen screen--transparent' },
      el(
        'div',
        { class: 'card' },
        this.roundNode,
        el(
          'div',
          { class: 'card__bout' },
          this.leftNode,
          el('div', { class: 'card__vs', text: 'VS' }),
          this.rightNode,
        ),
        this.metaNode,
        this.countNode,
      ),
    );
  }

  showCard(data: FightCardData): void {
    this.roundNode.textContent = `Round ${String(data.roundIndex).padStart(2, '0')}`;
    this.leftNode.textContent = data.fighterA;
    this.rightNode.textContent = data.fighterB;
    this.metaNode.replaceChildren(
      labelledValue('Arena', data.arenaName),
      labelledValue('Weapon', data.weaponName),
    );
    this.countNode.textContent = '';
    this.countNode.className = 'card__count';
  }

  /** Called every frame during the countdown phase. */
  setCountdown(secondsRemaining: number): void {
    const value = Math.ceil(secondsRemaining);
    const label = value <= 0 ? 'FIGHT' : String(value);
    if (this.countNode.textContent === label) return;
    this.countNode.textContent = label;
    this.countNode.className = value <= 0 ? 'card__count card__count--go' : 'card__count';
    // restart the pop animation
    this.countNode.style.animation = 'none';
    void this.countNode.offsetHeight;
    this.countNode.style.animation = '';
  }

  clearCountdown(): void {
    this.countNode.textContent = '';
  }
}

/** Shown for a few seconds between rounds. */
export class RoundResultUI {
  readonly root: HTMLElement;
  private labelNode: HTMLElement;
  private nameNode: HTMLElement;
  private subNode: HTMLElement;
  private nextNode: HTMLElement;

  constructor() {
    this.labelNode = el('div', { class: 'result__label', text: 'Round complete' });
    this.nameNode = el('div', { class: 'result__name', text: '' });
    this.subNode = el('div', { class: 'result__sub', text: '' });
    this.nextNode = el('div', { class: 'result__next' });

    this.root = el(
      'div',
      { class: 'screen' },
      el('div', { class: 'result' }, this.labelNode, this.nameNode, this.subNode, this.nextNode),
    );
  }

  show(data: RoundResultData): void {
    this.labelNode.textContent = 'Winner';
    this.nameNode.textContent = data.winnerName;
    this.subNode.textContent = `${data.loserName} is out of the match.`;

    if (data.isFinalRound) {
      this.nextNode.replaceChildren(labelledValue('Next', 'Champion'));
      return;
    }
    this.nextNode.replaceChildren(
      labelledValue('Next arena', data.nextArenaName ?? 'Drawing…'),
      labelledValue('Next weapon', data.nextWeaponName ?? 'Drawing…'),
    );
  }
}

/** Full screen "you are out" beat before the spectator camera takes over. */
export class EliminationUI {
  readonly root: HTMLElement;
  private nameNode: HTMLElement;

  constructor() {
    this.nameNode = el('div', { class: 'result__name', text: '' });
    this.root = el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'result' },
        el('div', { class: 'result__label result__label--out', text: 'Eliminated' }),
        this.nameNode,
        el('div', { class: 'result__sub', text: 'You are out. Switching to spectator…' }),
      ),
    );
  }

  show(name: string): void {
    this.nameNode.textContent = name;
  }
}
