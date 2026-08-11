/* ui.js — DOM helpers, drag and drop, downloads, toasts.
 *
 * No innerHTML: filenames, MIME types and decoded text all come from files the
 * tool was handed, and a filename is attacker-controlled text.
 */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = id => document.getElementById(id);

/* ---------------- toasts ---------------- */

export function toast(message, kind = 'info', ms = 2600) {
  const node = el('div', { class: 'toast', dataset: { kind }, role: 'status', text: message });
  $('toasts').append(node);
  setTimeout(() => { node.dataset.leaving = 'true'; setTimeout(() => node.remove(), 200); }, ms);
}

export function toastError(err, fallback = 'Something went wrong') {
  const message = typeof err === 'string' ? err : (err?.message || fallback);
  console.error(err);
  toast(message, 'error', 6000);
}

/* ---------------- building blocks ---------------- */

export function card(title, subtitle, ...content) {
  return el('section', { class: 'card' },
    title ? el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: title }),
      subtitle ? el('p', { class: 'card-sub', text: subtitle }) : null) : null,
    ...content
  );
}

export function button(label, { kind = '', onclick, title, disabled, ariaLabel } = {}) {
  return el('button', {
    class: `btn ${kind}`.trim(), type: 'button',
    onclick, title, 'aria-label': ariaLabel, disabled: disabled || false,
  }, label);
}

export function stat(label, value, hint) {
  return el('div', { class: 'stat' },
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-value', text: value }),
    hint ? el('span', { class: 'stat-hint', text: hint }) : null
  );
}

export function badge(text, kind = 'neutral') {
  return el('span', { class: 'badge', dataset: { kind }, text });
}

export function notice(text, kind = 'info') {
  return el('p', { class: 'notice', dataset: { kind }, text });
}

export function progressBar() {
  const fill = el('div', { class: 'progress-fill' });
  const label = el('span', { class: 'progress-label' });
  const node = el('div', { class: 'progress', hidden: true },
    el('div', { class: 'progress-track' }, fill), label);
  return {
    node,
    show(text = '') { node.hidden = false; label.textContent = text; fill.style.width = '0%'; },
    set(ratio, text) {
      fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
      if (text) label.textContent = text;
    },
    hide() { node.hidden = true; },
  };
}

/**
 * A code block that never puts more than `limit` characters into the DOM.
 * Large outputs would otherwise lock up layout for seconds.
 */
export function output(limit = 100_000) {
  const code = el('code', { class: 'output-text' });
  const note = el('p', { class: 'output-note', hidden: true });
  const node = el('div', { class: 'output' }, el('pre', { class: 'output-pre' }, code), note);
  return {
    node,
    set(text) {
      if (!text) { code.textContent = ''; note.hidden = true; return; }
      if (text.length > limit) {
        code.textContent = text.slice(0, limit);
        note.hidden = false;
        note.textContent = `Showing the first ${limit.toLocaleString()} of ${text.length.toLocaleString()} characters.`
          + ' The whole string is still available to copy or download — it is just not put on the page, which would make it crawl.';
      } else {
        code.textContent = text;
        note.hidden = true;
      }
    },
    clear() { code.textContent = ''; note.hidden = true; },
  };
}

/* ---------------- clipboard ---------------- */

export async function copyText(text, label = '✓ Copied to clipboard') {
  if (!text) { toast('There is nothing to copy', 'warn'); return; }
  if (text.length > 20_000_000) {
    toast('That string is too large for the clipboard — use the download instead.', 'warn', 5000);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'ok');
  } catch {
    toast('The browser blocked clipboard access. Use the download button instead.', 'warn', 5000);
  }
}

/* ---------------- files ---------------- */

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function safeFileName(raw, fallback = 'file') {
  let name = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '');
  name = name.split(/[/\\]/).pop() || '';
  name = name.replace(/^\.+/, '').replace(/[<>:"|?*]/g, '_').trim();
  if (!name) name = fallback;
  return name.length > 120 ? name.slice(0, 120) : name;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = el('a', { href: url, download: safeFileName(filename), style: 'display:none' });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise(resolve => {
    const input = el('input', { type: 'file', accept, multiple, style: 'display:none' });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.remove();
      resolve(files);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export function dropzone({ title, sub, accept = '', multiple = true, onFiles, compact = false }) {
  const node = el('div', {
    class: 'dropzone' + (compact ? ' compact' : ''),
    role: 'button', tabindex: '0', 'aria-label': title,
  },
    el('div', { class: 'dropzone-title', text: title }),
    el('div', { class: 'dropzone-sub', text: sub })
  );

  const open = async () => {
    const files = await pickFiles({ accept, multiple });
    if (files.length) onFiles(files);
  };
  node.addEventListener('click', open);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  });

  let depth = 0;
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  node.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; node.classList.add('over'); });
  node.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  node.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; node.classList.remove('over'); } });
  node.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    node.classList.remove('over');
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  });

  return node;
}

/** Read only the first bytes of a file — enough to identify it. */
export async function readHead(file, length = 4096) {
  const slice = file.slice(0, Math.min(length, file.size));
  return new Uint8Array(await slice.arrayBuffer());
}

export function debounce(fn, ms = 120) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
