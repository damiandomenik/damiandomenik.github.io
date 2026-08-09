/* ui.js — DOM helpers, toasts, progress overlay, dialogs.
   Knows nothing about PDFs. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- toasts ---------- */

const toastRoot = () => document.getElementById('toasts');

export function toast(title, detail = '', kind = 'ok', ms = 5000) {
  const node = el('div', { class: `toast ${kind}` },
    el('b', { text: title }),
    detail ? el('span', { text: detail }) : null
  );
  toastRoot().append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

/** Turn any thrown value into a message a person can act on. */
export function showError(err, context = '') {
  const msg = friendlyError(err);
  console.error(context, err);
  toast(context || 'That did not work', msg, 'err', 9000);
}

export function friendlyError(err) {
  if (!err) return 'Unknown error.';
  if (typeof err === 'string') return err;
  const name = err.name || '';
  const raw = err.message || String(err);

  if (name === 'PasswordException' || /password/i.test(raw))
    return 'This PDF is password protected. Remove the protection first, or use PDF → images with the password.';
  if (name === 'InvalidPDFException' || /invalid pdf|no pdf header|failed to parse/i.test(raw))
    return 'The file is not a readable PDF — it may be damaged or only named .pdf.';
  if (/encrypted/i.test(raw))
    return 'This PDF is encrypted. pdf-lib cannot rewrite encrypted files; remove the protection first.';
  if (/out of memory|allocation|Array buffer allocation failed/i.test(raw))
    return 'The browser ran out of memory. Try fewer pages, a smaller file, or a lower resolution.';
  if (/detached|ArrayBuffer is detached/i.test(raw))
    return 'The file data became unavailable. Load the file again.';
  return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
}

/* ---------- status line ---------- */

export function setStatus(text) {
  const node = document.getElementById('statusinfo');
  if (node) node.textContent = text;
}

/* ---------- progress overlay ---------- */

const ov = () => document.getElementById('overlay');

export function progress(title = 'Working…') {
  const box = ov();
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-sub').textContent = '';
  document.getElementById('overlay-bar').style.width = '0%';
  box.hidden = false;
  return {
    set(ratio, sub = '') {
      document.getElementById('overlay-bar').style.width =
        `${Math.max(0, Math.min(1, ratio)) * 100}%`;
      if (sub) document.getElementById('overlay-sub').textContent = sub;
    },
    title(t) { document.getElementById('overlay-title').textContent = t; },
    done() { box.hidden = true; },
  };
}

/** Give the browser a frame so the UI can repaint during long loops. */
export function tick() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/* ---------- password prompt ---------- */

export function askPassword(fileName) {
  return new Promise(resolve => {
    const input = el('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Password' });
    const close = (value) => { wrap.remove(); resolve(value); };
    const box = el('div', { class: 'prompt-box', role: 'dialog', 'aria-modal': 'true' },
      el('h2', { text: 'Password required' }),
      el('p', { text: `${fileName} is protected. The password is used here in the page only.` }),
      input,
      el('div', { class: 'prompt-actions' },
        el('button', { class: 'btn', onclick: () => close(null) }, 'Cancel'),
        el('button', { class: 'btn primary', onclick: () => close(input.value) }, 'Unlock'))
    );
    const wrap = el('div', { class: 'overlay' }, box);
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    });
    document.body.append(wrap);
    input.focus();
  });
}

/* ---------- small formatting helpers ---------- */

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function pageHead(title, sub) {
  return el('div', { class: 'page-head' }, el('h1', { text: title }), el('p', { text: sub }));
}
