/* Everything DOM. No three.js in here; the scene talks to this through
   plain callbacks so either side can be reworked on its own. */

import { CATEGORY_LABELS, formatCoords, haversine } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      loader: $('loader'), loaderText: $('loader-text'), loaderBar: $('loader-bar'),
      start: $('start'), startNote: $('start-note'),
      topbar: $('topbar'), filters: $('filters'), status: $('status'),
      statCount: $('stat-count'), statSrc: $('stat-src'), statSun: $('stat-sun'),
      search: $('search'), suggest: $('suggest'),
      panel: $('panel'), panelTitle: $('panel-title'), panelPlace: $('panel-place'),
      panelBadge: $('panel-badge'), panelMedia: $('panel-media'), panelMeta: $('panel-meta'),
      panelOpen: $('panel-open'), panelSource: $('panel-source'),
      toast: $('toast'), settings: $('settings'), keyInput: $('key-input')
    };
    this.onSelect = null;      // (point) => void
    this.onSearchPick = null;  // (point) => void
    this.onFilter = null;      // (category) => void
    this.category = 'all';
    this.points = [];
    this._suggestIndex = -1;
    this._wire();
  }

  /* ---------------- chrome ---------------- */

  setLoading(text, progress) {
    if (text) this.el.loaderText.textContent = text;
    if (progress != null) this.el.loaderBar.style.width = Math.round(progress * 100) + '%';
  }

  hideLoader() {
    this.el.loader.classList.add('fading');
    setTimeout(() => this.el.loader.classList.add('hidden'), 700);
  }

  showStart(note) {
    this.el.start.classList.remove('hidden');
    if (note) this.el.startNote.textContent = note;
  }

  hideStart() {
    this.el.start.classList.add('fading');
    setTimeout(() => this.el.start.classList.add('hidden'), 700);
    this.el.topbar.classList.remove('hidden');
    this.el.filters.classList.remove('hidden');
    this.el.status.classList.remove('hidden');
  }

  /* ---------------- data-driven chrome ---------------- */

  setPoints(points, source) {
    this.points = points;
    this.source = source;
    this._buildFilters();
    this.el.statSrc.className = 'pill ' + (source === 'demo' ? 'demo' : 'live');
    this.el.statSrc.textContent =
      source === 'demo' ? 'DEMO DATA' :
      source === 'exported' ? 'WINDY WEBCAMS' : 'WINDY WEBCAMS · LIVE LIST';
  }

  setVisibleCount(n, total) {
    const noun = this.source === 'demo' ? 'demo marker' : 'camera';
    this.el.statCount.textContent =
      n.toLocaleString() + ' of ' + total.toLocaleString() + ' ' + noun + (total === 1 ? '' : 's') + ' in view';
  }

  setSun(point) {
    const t = new Date();
    this.el.statSun.textContent = 'sun over ' + formatCoords(point.lat, point.lon) +
      ' · ' + t.toISOString().slice(11, 16) + ' UTC';
  }

  _buildFilters() {
    const counts = { all: this.points.length };
    for (const p of this.points) counts[p.category] = (counts[p.category] || 0) + 1;
    const order = Object.keys(CATEGORY_LABELS).filter((k) => k === 'all' || counts[k]);

    this.el.filters.innerHTML = '';
    for (const key of order) {
      const b = document.createElement('button');
      b.className = 'chip' + (key === this.category ? ' on' : '');
      b.textContent = CATEGORY_LABELS[key];
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = counts[key] || 0;
      b.appendChild(n);
      b.onclick = () => {
        this.category = key;
        [...this.el.filters.children].forEach((c) => c.classList.toggle('on', c === b));
        if (this.onFilter) this.onFilter(key);
      };
      this.el.filters.appendChild(b);
    }
  }

  /* ---------------- camera panel ---------------- */

  showPoint(p) {
    const e = this.el;
    e.panel.classList.remove('hidden');
    e.panelTitle.textContent = p.title;
    e.panelPlace.textContent = [p.city, p.region, p.country].filter(Boolean).join(', ') || '—';

    if (p.demo) {
      e.panelBadge.className = 'badge demo';
      e.panelBadge.textContent = 'DEMO DATA';
    } else if (p.status === 'stream') {
      e.panelBadge.className = 'badge live';
      e.panelBadge.textContent = '● LIVE STREAM';
    } else if (p.status && /active/i.test(p.status)) {
      e.panelBadge.className = 'badge live';
      e.panelBadge.textContent = '● ACTIVE — STILL IMAGE, UPDATED PERIODICALLY';
    } else {
      e.panelBadge.className = 'badge';
      e.panelBadge.textContent = p.status ? p.status.toUpperCase() : 'STATUS UNKNOWN';
    }

    // Media — the embedded player first, because that is the live view.
    e.panelMedia.innerHTML = '';
    if (p.embed) {
      const frame = document.createElement('iframe');
      frame.src = p.embed;
      frame.title = 'Live view from ' + p.title;
      frame.loading = 'lazy';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.setAttribute('allow', 'fullscreen');
      e.panelMedia.appendChild(frame);
      // If the provider refuses to be framed, say so instead of showing a blank box.
      const guard = setTimeout(() => {
        if (!frame.dataset.loaded) {
          e.panelMedia.innerHTML = '';
          e.panelMedia.appendChild(this._placeholder(
            'Camera currently unavailable in an embedded player. Use “Open camera” to view it on the provider\'s own page.'));
        }
      }, 6000);
      frame.addEventListener('load', () => { frame.dataset.loaded = '1'; clearTimeout(guard); });
    } else if (p.image) {
      const img = document.createElement('img');
      img.alt = 'Latest still from ' + p.title;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        e.panelMedia.innerHTML = '';
        e.panelMedia.appendChild(this._placeholder(
          'Camera currently unavailable. The provider\'s image link did not load — free-tier links expire after about ten minutes.'));
      };
      img.src = p.image;
      e.panelMedia.appendChild(img);
    } else if (p.demo) {
      e.panelMedia.appendChild(this._placeholder(
        'Placeholder marker at real coordinates. There is no camera behind this point — add a Windy key under Source to load real ones.'));
    } else {
      e.panelMedia.appendChild(this._placeholder('No preview image was provided for this camera.'));
    }

    // Meta
    e.panelMeta.innerHTML = '';
    const rows = [
      ['Coordinates', formatCoords(p.lat, p.lon)],
      ['Category', CATEGORY_LABELS[p.category] || p.category],
      ['Camera ID', p.demo ? null : p.id],
      ['Last updated', p.lastUpdated ? new Date(p.lastUpdated).toLocaleString() : null],
      ['Source', p.demo ? 'Local demo set' : 'Windy Webcams']
    ];
    for (const [k, v] of rows) {
      if (v == null) continue;
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      row.append(dt, dd);
      e.panelMeta.appendChild(row);
    }

    if (p.link) {
      e.panelOpen.href = p.link;
      e.panelOpen.classList.remove('hidden');
      e.panelOpen.textContent = 'Open camera';
    } else {
      e.panelOpen.classList.add('hidden');
    }

    e.panelSource.innerHTML = '';
    if (p.demo) {
      e.panelSource.textContent = 'Demo entry. Nothing here is a live feed.';
    } else {
      e.panelSource.appendChild(document.createTextNode(
        'The camera is operated by a third party, not by this site. '));
      const viaYouTube = p.embed && /youtube/.test(p.embed);
      const a = document.createElement('a');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (viaYouTube) {
        a.href = p.link || 'https://www.youtube.com/';
        a.textContent = 'Watch on YouTube';
      } else {
        a.href = 'https://www.windy.com/';
        a.textContent = 'Webcams provided by windy.com';
      }
      e.panelSource.appendChild(a);
    }
  }

  _placeholder(text) {
    const d = document.createElement('div');
    d.className = 'placeholder';
    d.textContent = text;
    return d;
  }

  hidePanel() { this.el.panel.classList.add('hidden'); }

  /* ---------------- search ---------------- */

  _matches(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const scored = [];
    for (const p of this.points) {
      const hay = [p.title, p.city, p.region, p.country].filter(Boolean).join(' ').toLowerCase();
      const at = hay.indexOf(needle);
      if (at < 0) continue;
      scored.push({ p, score: at + (hay.startsWith(needle) ? -5 : 0) });
      if (scored.length > 400) break;
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 8).map((s) => s.p);
  }

  _renderSuggest(list) {
    const s = this.el.suggest;
    s.innerHTML = '';
    this._suggestList = list;
    this._suggestIndex = -1;
    if (!list.length) { s.classList.add('hidden'); return; }
    list.forEach((p, i) => {
      const li = document.createElement('li');
      li.textContent = p.title;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = [p.city !== p.title ? p.city : null, p.country].filter(Boolean).join(', ');
      li.appendChild(sub);
      li.onclick = () => this._pick(i);
      s.appendChild(li);
    });
    s.classList.remove('hidden');
  }

  _pick(i) {
    const p = this._suggestList && this._suggestList[i];
    if (!p) return;
    this.el.suggest.classList.add('hidden');
    this.el.search.blur();
    if (this.onSearchPick) this.onSearchPick(p);
  }

  /* ---------------- toast ---------------- */

  toast(message, actionLabel, action) {
    const t = this.el.toast;
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = message;
    t.appendChild(span);
    if (actionLabel) {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = actionLabel;
      b.onclick = () => { t.classList.add('hidden'); action && action(); };
      t.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'btn small ghost';
    close.textContent = 'Dismiss';
    close.onclick = () => t.classList.add('hidden');
    t.appendChild(close);
    t.classList.remove('hidden');
  }

  hideToast() { this.el.toast.classList.add('hidden'); }

  /* ---------------- wiring ---------------- */

  _wire() {
    const e = this.el;

    e.search.addEventListener('input', () => this._renderSuggest(this._matches(e.search.value)));
    e.search.addEventListener('keydown', (ev) => {
      const list = this._suggestList || [];
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (!list.length) return;
        this._suggestIndex = (this._suggestIndex + (ev.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        [...e.suggest.children].forEach((c, i) => c.classList.toggle('on', i === this._suggestIndex));
      } else if (ev.key === 'Enter') {
        this._pick(this._suggestIndex >= 0 ? this._suggestIndex : 0);
      } else if (ev.key === 'Escape') {
        e.suggest.classList.add('hidden');
        e.search.blur();
      }
    });
    document.addEventListener('click', (ev) => {
      if (!e.suggest.contains(ev.target) && ev.target !== e.search) e.suggest.classList.add('hidden');
    });

    $('panel-close').onclick = () => { this.hidePanel(); if (this.onSelect) this.onSelect(null); };
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !e.panel.classList.contains('hidden')) {
        this.hidePanel();
        if (this.onSelect) this.onSelect(null);
      }
    });

    $('settings-open').onclick = () => {
      e.keyInput.value = '';
      e.settings.classList.remove('hidden');
    };
    $('settings-close').onclick = () => e.settings.classList.add('hidden');
    e.settings.addEventListener('click', (ev) => {
      if (ev.target === e.settings) e.settings.classList.add('hidden');
    });
  }

  /** Nearest point to a lat/lon, used after a search or a random jump. */
  nearest(lat, lon, list) {
    let best = null, bestD = Infinity;
    for (const p of (list || this.points)) {
      const d = haversine(lat, lon, p.lat, p.lon);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
