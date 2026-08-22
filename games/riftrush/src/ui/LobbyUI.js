/** Menü- und Lobby-Screen. */
export class LobbyUI {
  constructor(root = document) {
    this.root = root;
    this.overlay = root.getElementById('overlay');
    this.screens = {
      menu: root.getElementById('screen-menu'),
      lobby: root.getElementById('screen-lobby'),
      results: root.getElementById('screen-results'),
      pause: root.getElementById('screen-pause'),
    };
    this.codeEl = root.getElementById('lobby-code');
    this.playersEl = root.getElementById('lobby-players');
    this.transportEl = root.getElementById('lobby-transport');
    this.manualBox = root.getElementById('manual-signal');
    this.manualOut = root.getElementById('manual-out');
    this.manualIn = root.getElementById('manual-in');
    this.btnStart = root.getElementById('btn-start');
    this.btnReady = root.getElementById('btn-ready');

    this.handlers = {};
    this._bind();
    this._restore();
  }

  on(name, fn) { this.handlers[name] = fn; }
  _fire(name, arg) { this.handlers[name]?.(arg); }

  _bind() {
    const g = (id) => this.root.getElementById(id);
    const name = () => (g('input-name').value.trim() || 'Runner').slice(0, 14);
    const url = () => g('input-signal').value.trim();

    g('btn-create').onclick = () => { this._save(); this._fire('create', { name: name(), url: url() }); };
    g('btn-solo').onclick = () => { this._save(); this._fire('solo', { name: name() }); };
    g('btn-join').onclick = () => {
      this._save();
      const code = g('input-code').value.trim().toUpperCase();
      this._fire('join', { name: name(), url: url(), code });
    };
    g('input-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') g('btn-join').click(); });

    this.btnReady.onclick = () => {
      this._ready = !this._ready;
      this.btnReady.textContent = this._ready ? 'Nicht bereit' : 'Bereit';
      this._fire('ready', this._ready);
    };
    this.btnStart.onclick = () => this._fire('start');
    g('btn-leave').onclick = () => this._fire('leave');
    g('btn-copy-code').onclick = () => navigator.clipboard?.writeText(this.codeEl.textContent);
    g('btn-manual-copy').onclick = () => navigator.clipboard?.writeText(this.manualOut.value);
    g('btn-manual-apply').onclick = () => this._fire('manualPaste', this.manualIn.value);
    g('btn-resume').onclick = () => this._fire('resume');
    g('btn-quit').onclick = () => this._fire('quit');
  }

  _save() {
    try {
      localStorage.setItem('riftrush.name', this.root.getElementById('input-name').value);
      localStorage.setItem('riftrush.signal', this.root.getElementById('input-signal').value);
    } catch {}
  }
  _restore() {
    try {
      const n = localStorage.getItem('riftrush.name');
      const s = localStorage.getItem('riftrush.signal');
      if (n) this.root.getElementById('input-name').value = n;
      if (s) this.root.getElementById('input-signal').value = s;
    } catch {}
  }

  // ---------------------------------------------------------------- Screens
  showScreen(which) {
    this.overlay.classList.remove('hidden');
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== which);
  }
  hideOverlay() { this.overlay.classList.add('hidden'); }

  showMenu() { this._ready = false; this.btnReady.textContent = 'Bereit'; this.showScreen('menu'); }
  showLobby() { this.showScreen('lobby'); }
  showPause() { this.showScreen('pause'); }

  setLobby({ code, transport, isHost }) {
    this.codeEl.textContent = code;
    this.transportEl.textContent = `Verbindung: ${transport}` + (isHost ? ' · du bist Host' : '');
    this.btnStart.classList.toggle('hidden', !isHost);
  }

  setManual(visible, blob = '') {
    this.manualBox.classList.toggle('hidden', !visible);
    if (blob) this.manualOut.value = blob;
  }

  setPlayers(list, selfId) {
    this.playersEl.innerHTML = list.map((p) => {
      const col = '#' + (p.color || 0x888888).toString(16).padStart(6, '0');
      const tag = p.ready ? '<span class="tag ok">BEREIT</span>' : '<span class="tag">wartet</span>';
      const host = p.host ? ' <span class="tag">HOST</span>' : '';
      return `<div class="p"><span class="dot" style="background:${col}"></span>
        <span>${escapeHtml(p.name || 'Runner')}${p.id === selfId ? ' (du)' : ''}</span>${host}${tag}</div>`;
    }).join('');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
