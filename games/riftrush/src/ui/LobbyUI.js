/** Menü- und Lobby-Screen. */
export class LobbyUI {
  constructor(root = document, defaultUrl = '') {
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
    this.listEl = root.getElementById('lobby-list');
    this.codeBoxEl = root.getElementById('code-box');
    this.manualStatusEl = root.getElementById('manual-status');
    this.signalWarnEl = root.getElementById('signal-warn');
    this.stepEls = [1, 2, 3].map((i) => root.getElementById(`mstep-${i}`));
    this.browserStatusEl = root.getElementById('browser-status');

    this.handlers = {};
    this._bind();
    this._restore(defaultUrl);
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
    g('btn-refresh').onclick = () => this._fire('refreshLobbies');
    g('btn-direct').onclick = () => { this._save(); this._fire('direct', { name: name() }); };
    g('btn-manual-paste').onclick = async () => {
      try {
        const txt = await navigator.clipboard.readText();
        g('manual-in').value = txt.trim();
        this._fire('manualPaste', txt);
      } catch {
        this.setManualStatus('Zwischenablage nicht lesbar — bitte mit Strg+V einfügen.', false);
      }
    };
    g('input-signal').addEventListener('change', () => { this._save(); this._fire('signalChanged', url()); });
    g('btn-resume').onclick = () => this._fire('resume');
    g('btn-quit').onclick = () => this._fire('quit');
  }

  _save() {
    try {
      localStorage.setItem('riftrush.name', this.root.getElementById('input-name').value);
      localStorage.setItem('riftrush.signal', this.root.getElementById('input-signal').value);
    } catch {}
  }
  /** @param {string} defaultUrl aus CONFIG.SIGNALING_URL */
  _restore(defaultUrl = '') {
    let saved = null;
    try {
      const n = localStorage.getItem('riftrush.name');
      saved = localStorage.getItem('riftrush.signal');
      if (n) this.root.getElementById('input-name').value = n;
    } catch {}
    // Voreingestellter Server gewinnt, solange der Spieler nichts eigenes gesetzt hat
    const url = (saved && saved.trim()) ? saved : defaultUrl;
    if (url) this.root.getElementById('input-signal').value = url;
  }

  /** Liste offener Lobbys im Menü. */
  setLobbyList(browser) {
    if (!this.listEl) return;
    const st = this.browserStatusEl;
    if (st) {
      st.className = browser.status === 'online' ? 'online' : browser.status === 'error' ? 'error' : '';
      st.textContent = browser.status === 'online' ? '· verbunden'
        : browser.status === 'connecting' ? '· verbinde …'
        : browser.status === 'error' ? '· Server nicht erreichbar' : '';
    }
    if (!browser.available) {
      this.listEl.innerHTML = '<div class="empty">Für eine Lobby-Liste wird ein Signaling-Server ' +
        'benötigt — trag ihn oben unter „Verbindungs-Einstellungen“ ein. ' +
        'Ohne Server funktioniert nur der manuelle Code-Austausch.</div>';
      return;
    }
    if (!browser.rooms.length) {
      this.listEl.innerHTML = `<div class="empty">${browser.status === 'online'
        ? 'Gerade ist keine Lobby offen. Erstell einfach eine — sie taucht dann bei den anderen auf.'
        : 'Warte auf den Server …'}</div>`;
      return;
    }
    this.listEl.innerHTML = browser.rooms.map((r) => `
      <div class="lob ${r.state === 'running' ? 'running' : ''}" data-code="${escapeHtml(r.code)}">
        <span class="code">${escapeHtml(r.code)}</span>
        <span class="who">${escapeHtml(r.host)}</span>
        <span class="st">${r.state === 'running' ? 'LÄUFT' : 'OFFEN'}</span>
        <span class="cnt">${r.players}/${r.max}</span>
      </div>`).join('');
    this.listEl.querySelectorAll('.lob').forEach((el) => {
      el.onclick = () => this._fire('joinLobby', el.dataset.code);
    });
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

  /** Blendet Room-Code-Feld bzw. Direktverbindung passend zum Modus ein. */
  /**
   * Browser blockieren ws:// auf HTTPS-Seiten. Ohne Hinweis sieht es so aus,
   * als sei der Server kaputt.
   */
  checkSignalUrl(url) {
    if (!this.signalWarnEl) return true;
    const u = (url || '').trim();
    // Protokoll des eigenen Dokuments nehmen, nicht ein globales `location`
    const loc = this.root.defaultView?.location
      || (typeof location !== 'undefined' ? location : null);
    const insecurePage = loc?.protocol === 'https:';
    if (u && /^ws:\/\//i.test(u) && insecurePage) {
      this.signalWarnEl.textContent =
        'Diese Seite läuft über HTTPS — der Browser blockiert ws://. Der Server muss über wss:// erreichbar sein.';
      return false;
    }
    this.signalWarnEl.textContent = '';
    return true;
  }

  setServerMode(hasServer) {
    this.root.getElementById('field-code').classList.toggle('hidden', !hasServer);
    this.root.getElementById('field-direct').classList.toggle('hidden', !!hasServer);
  }

  setManual(visible, blob = '') {
    this.manualBox.classList.toggle('hidden', !visible);
    // Ohne Server gibt es keinen sinnvollen Room Code — er wurde bisher
    // trotzdem angezeigt und alle haben vergeblich versucht, ihn einzutippen.
    if (this.codeBoxEl) this.codeBoxEl.classList.toggle('hidden', visible);
    if (blob) {
      this.manualOut.value = blob;
      this.setStep(2);
    }
  }

  setStep(n) {
    this.stepEls.forEach((el, i) => {
      if (!el) return;
      el.classList.toggle('on', i === n - 1);
      el.classList.toggle('done', i < n - 1);
    });
  }

  setManualStatus(text, ok) {
    if (!this.manualStatusEl) return;
    this.manualStatusEl.textContent = text || '';
    this.manualStatusEl.className = ok === true ? 'ok' : ok === false ? 'err' : '';
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
