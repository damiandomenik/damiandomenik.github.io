import { el } from './dom';
import { GAME_CONFIG } from '../config/gameConfig';

/**
 * In-fight overlay. Health bottom left, weapon bottom right, opponent name up
 * top, and nothing else — the design brief asks for no permanent HUD walls.
 */
export class HUD {
  readonly root: HTMLElement;

  private hpValue: HTMLElement;
  private hpFill: HTMLElement;
  private weaponName: HTMLElement;
  private ammoNode: HTMLElement;
  private opponentName: HTMLElement;
  private opponentFill: HTMLElement;
  private damageFlash: HTMLElement;
  private hitmarker: HTMLElement;
  private toasts: HTMLElement;
  private crosshair: HTMLElement;

  constructor() {
    this.hpValue = el('div', { class: 'hud__hpValue', text: '100' });
    this.hpFill = el('div', { class: 'hud__barFill' });
    this.weaponName = el('div', { class: 'hud__weaponName', text: '' });
    this.ammoNode = el('div', { class: 'hud__ammo', text: '' });
    this.opponentName = el('div', { class: 'hud__opponentName', text: '' });
    this.opponentFill = el('div', { class: 'hud__barFill' });
    this.damageFlash = el('div', { class: 'damage-flash' });
    this.hitmarker = el('div', { class: 'hitmarker' });
    this.toasts = el('div', { class: 'toasts' });
    this.crosshair = el('div', { class: 'crosshair' });

    this.root = el(
      'div',
      { class: 'hud' },
      this.damageFlash,
      this.crosshair,
      this.hitmarker,
      el(
        'div',
        { class: 'hud__live' },
        el('span', { class: 'hud__liveDot' }),
        el('span', { text: 'Live' }),
      ),
      el(
        'div',
        { class: 'hud__opponent' },
        this.opponentName,
        el('div', { class: 'hud__bar' }, this.opponentFill),
      ),
      el(
        'div',
        { class: 'hud__health' },
        el(
          'div',
          { class: 'hud__healthTop' },
          this.hpValue,
          el('div', { class: 'card__metaLabel', text: 'Health' }),
        ),
        el('div', { class: 'hud__bar' }, this.hpFill),
      ),
      el('div', { class: 'hud__weapon' }, this.weaponName, this.ammoNode),
      this.toasts,
    );
  }

  setFighterMode(isFighter: boolean): void {
    this.crosshair.style.display = isFighter ? '' : 'none';
    (this.root.querySelector('.hud__health') as HTMLElement).style.display = isFighter ? '' : 'none';
    (this.root.querySelector('.hud__weapon') as HTMLElement).style.display = isFighter ? '' : 'none';
    (this.root.querySelector('.hud__opponent') as HTMLElement).style.display = isFighter ? '' : 'none';
    (this.root.querySelector('.hud__live') as HTMLElement).style.display = isFighter ? '' : 'none';
  }

  setHealth(health: number): void {
    const fraction = Math.max(0, health) / GAME_CONFIG.player.maxHealth;
    this.hpValue.textContent = String(Math.max(0, Math.round(health)));
    this.hpFill.style.width = `${fraction * 100}%`;
    this.hpFill.classList.toggle('hud__barFill--low', fraction <= 0.3);
  }

  setOpponent(name: string | null, health: number): void {
    this.opponentName.textContent = name ?? '';
    const fraction = Math.max(0, health) / GAME_CONFIG.player.maxHealth;
    this.opponentFill.style.width = `${fraction * 100}%`;
    this.opponentFill.classList.toggle('hud__barFill--low', fraction <= 0.3);
  }

  setWeapon(name: string, ammo: number, magazine: number, reloading: boolean): void {
    this.weaponName.textContent = name;
    if (magazine === 0) {
      this.ammoNode.textContent = 'Melee';
      this.ammoNode.classList.remove('hud__ammo--reloading');
      return;
    }
    this.ammoNode.textContent = reloading ? 'Reloading' : `${ammo} / ${magazine}`;
    this.ammoNode.classList.toggle('hud__ammo--reloading', reloading);
  }

  flashDamage(): void {
    this.damageFlash.classList.add('damage-flash--on');
    window.setTimeout(() => this.damageFlash.classList.remove('damage-flash--on'), 60);
  }

  showHitmarker(): void {
    this.hitmarker.classList.remove('hitmarker--on');
    void this.hitmarker.offsetHeight;
    this.hitmarker.classList.add('hitmarker--on');
  }

  toast(message: string, tone: 'info' | 'kill' | 'warn' = 'info'): void {
    const node = el('div', {
      class: tone === 'kill' ? 'toast toast--kill' : 'toast',
      text: message,
    });
    this.toasts.append(node);
    window.setTimeout(() => {
      node.style.transition = 'opacity 300ms ease';
      node.style.opacity = '0';
      window.setTimeout(() => node.remove(), 320);
    }, 3600);
  }
}
