import { formatTime } from '../core/Utils.js';

/** Minimalistisches In-Game-HUD. */
export class HUD {
  constructor(root = document) {
    this.el = root.getElementById('hud');
    this.time = root.getElementById('hud-time');
    this.cp = root.getElementById('hud-checkpoint');
    this.board = root.getElementById('hud-board');
    this.stateEl = root.getElementById('hud-state');
    this.toastEl = root.getElementById('hud-toast');
    this.countdownEl = root.getElementById('hud-countdown');
    this.peersEl = root.getElementById('net-peers');
    this.bossEl = root.getElementById('hud-boss');
    this.bossPhaseEl = this.bossEl ? this.bossEl.querySelector('.b-phase') : null;
    this.bossMechEls = this.bossEl ? [...this.bossEl.querySelectorAll('.b-mech span')] : [];
    this.bossTimerEl = this.bossEl ? this.bossEl.querySelector('.b-timer') : null;
    this.warnEl = root.getElementById('hud-warning');
    this._bossHash = '';
    this.abilityEls = {};
    root.querySelectorAll('#hud-abilities .ab').forEach((el) => {
      this.abilityEls[el.dataset.ab] = el.querySelector('.cd');
    });
    this._toastTimer = 0;
    this._boardHash = '';
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  setTime(ms) { this.time.textContent = formatTime(ms); }

  setCheckpoint(cur, total) {
    this.cp.textContent = `CHECKPOINT ${cur}/${total}`;
  }

  setPeers(n) { if (this.peersEl) this.peersEl.textContent = String(n); }

  setCountdown(msLeft) {
    if (msLeft < 0) { this.countdownEl.classList.add('hidden'); return; }
    this.countdownEl.classList.remove('hidden');
    const s = Math.ceil(msLeft / 1000);
    this.countdownEl.textContent = s > 0 ? String(s) : 'GO';
  }

  setCooldowns({ dash = 0, punch = 0, jump = 0 }) {
    if (this.abilityEls.dash) this.abilityEls.dash.style.width = `${dash * 100}%`;
    if (this.abilityEls.punch) this.abilityEls.punch.style.width = `${punch * 100}%`;
    if (this.abilityEls.jump) this.abilityEls.jump.style.width = `${jump * 100}%`;
  }

  setState(playerState, speed) {
    this.stateEl.innerHTML = `<b>${playerState.toUpperCase()}</b><br>${speed.toFixed(1)} m/s`;
  }

  setBoard(standings, selfId) {
    const hash = standings.map((e) => `${e.id}${e.place}${e.finished ? e.time : e.checkpoint}`).join('|');
    if (hash === this._boardHash) return;
    this._boardHash = hash;
    this.board.innerHTML = standings.slice(0, 8).map((e) => {
      const col = '#' + (e.color || 0x888888).toString(16).padStart(6, '0');
      const t = e.finished ? formatTime(e.finalTime ?? e.time) : `CP ${e.checkpoint}`;
      return `<div class="row-b ${e.id === selfId ? 'me' : ''} ${e.finished ? 'fin' : ''}">
        <span class="pos">${e.place}</span>
        <span class="dot" style="background:${col}"></span>
        <span class="nm">${escapeHtml(e.name)}</span>
        <span class="tm">${t}</span>
      </div>`;
    }).join('');
  }

  /** Boss-Anzeige: Phase, Mechanismen, Fluchtcountdown, Angriffswarnung. */
  setBoss(b) {
    if (!this.bossEl) return;
    if (!b || !b.active) {
      this.bossEl.classList.add('hidden');
      if (this.warnEl) this.warnEl.classList.remove('on');
      this._bossHash = '';
      return;
    }
    this.bossEl.classList.remove('hidden');
    const secs = Math.ceil(b.escapeMs / 1000);
    const hash = `${b.phase}|${b.mechanisms}|${secs}`;
    if (hash !== this._bossHash) {
      this._bossHash = hash;
      const label = b.phase === 'shield' ? `SCHILD AKTIV — ${b.mechanisms}/${b.mechanismsTotal} MECHANISMEN`
        : b.phase === 'core' ? 'KERN OFFEN — RAUF ZUM KERN'
        : b.phase === 'escape' ? 'ARENA STÜRZT EIN — RAUS HIER'
        : 'BESIEGT';
      this.bossPhaseEl.textContent = label;
      for (let i = 0; i < this.bossMechEls.length; i++) {
        this.bossMechEls[i].classList.toggle('on', i < b.mechanisms);
      }
      const showTimer = b.phase === 'escape';
      this.bossTimerEl.classList.toggle('hidden', !showTimer);
      if (showTimer) this.bossTimerEl.textContent = String(Math.max(0, secs)).padStart(2, '0');
    }
    if (this.warnEl) {
      this.warnEl.textContent = b.warning || '';
      this.warnEl.classList.toggle('on', !!b.warning);
    }
  }

  toast(text, ms = 900) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
