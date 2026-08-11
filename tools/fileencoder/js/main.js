/* main.js — routing and the shell. */

import { el, toast } from './ui.js';
import * as home from './views/home.js';
import * as encode from './views/encode.js';
import * as decode from './views/decode.js';
import * as qrtools from './views/qrtools.js';
import * as analyze from './views/analyze.js';

const ROUTES = [
  { route: 'encode', label: 'Encode File', module: encode, key: '1' },
  { route: 'decode', label: 'Decode Base64', module: decode, key: '2' },
  { route: 'qr', label: 'QR Tools', module: qrtools, key: '3' },
  { route: 'analyze', label: 'File Analysis', module: analyze, key: '4' },
];

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
let unmount = null;

tabs.append(...ROUTES.map(entry =>
  el('a', { href: `#/${entry.route}`, class: 'tab', dataset: { route: entry.route }, text: entry.label })));

const currentRoute = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';

function render() {
  const route = currentRoute();
  const entry = ROUTES.find(r => r.route === route);
  const module = route === 'home' ? home : entry?.module;

  try { unmount?.(); } catch (err) { console.warn('cleanup failed', err); }
  unmount = null;
  view.replaceChildren();

  for (const tab of tabs.children) {
    if (tab.dataset.route === route) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }

  if (!module) {
    view.append(el('section', { class: 'card' },
      el('h2', { class: 'card-title', text: 'No such section' }),
      el('p', { class: 'card-sub' }, 'Pick one from the tabs above, or go ',
        el('a', { href: '#/' }, 'back to the start'), '.')));
    document.title = 'Universal File Encoder';
    return;
  }

  try {
    unmount = module.mount(view) ?? null;
  } catch (err) {
    console.error('view failed to start', err);
    view.append(el('p', { class: 'notice', dataset: { kind: 'error' },
      text: `This section failed to start: ${err.message}` }));
  }

  document.title = entry ? `${entry.label} — Universal File Encoder` : 'Universal File Encoder';
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', render);
render();

/* ---------------- keyboard ---------------- */

document.addEventListener('keydown', event => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;
  if (event.metaKey || event.ctrlKey || event.altKey || typing) return;

  const numbered = ROUTES.find(entry => entry.key === event.key);
  if (numbered) location.hash = `#/${numbered.route}`;
  if (event.key === '?') toast('1–4 switch sections · Esc leaves a field', 'info', 4000);
});

/* Anything unhandled should say so rather than leave a blank page. */
window.addEventListener('error', event => {
  if (event.message) toast(`Something went wrong: ${event.message}`, 'error', 6000);
});
window.addEventListener('unhandledrejection', event => {
  toast(`Something went wrong: ${event.reason?.message ?? event.reason}`, 'error', 6000);
});

/* Files dropped anywhere land in the encoder. */
window.addEventListener('dragover', event => {
  if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault();
});
window.addEventListener('drop', event => {
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  // Only intercept drops that missed a dropzone, so the page never swallows a file.
  if (event.target.closest?.('.dropzone')) return;
  event.preventDefault();
});
