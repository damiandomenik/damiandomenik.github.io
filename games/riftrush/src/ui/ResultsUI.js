import { formatTime } from '../core/Utils.js';

/** Ergebnis-Screen nach dem Run. */
export class ResultsUI {
  constructor(lobbyUI, root = document) {
    this.lobby = lobbyUI;
    this.list = root.getElementById('results-list');
    root.getElementById('btn-rematch').onclick = () => this.handlers.rematch?.();
    root.getElementById('btn-to-lobby').onclick = () => this.handlers.toLobby?.();
    this.handlers = {};
  }

  on(name, fn) { this.handlers[name] = fn; }

  show(results, selfId, isHost) {
    this.list.innerHTML = results.map((e, i) => {
      const col = '#' + (e.color || 0x888888).toString(16).padStart(6, '0');
      const t = e.finished ? formatTime(e.finalTime ?? e.time) : 'DNF';
      const bonus = e.bonus ? `<span class="bonus">Boss ${(e.bonus / 1000).toFixed(1)}s</span>` : '';
      return `<div class="r ${i === 0 ? 'first' : ''}">
        <span class="pos">${i + 1}</span>
        <span class="dot" style="width:12px;height:12px;border-radius:50%;background:${col};display:inline-block"></span>
        <span>${escapeHtml(e.name)}${e.id === selfId ? ' (du)' : ''}</span>
        <span class="sub">${e.deaths || 0} Deaths</span>${bonus}
        <span class="tm">${t}</span>
      </div>`;
    }).join('');
    const btn = document.getElementById('btn-rematch');
    btn.classList.toggle('hidden', !isHost);
    this.lobby.showScreen('results');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
