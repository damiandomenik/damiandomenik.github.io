/* main.js — hash router and app bootstrap. */

import { el, toast, showError, setStatus } from './ui.js';
import { TOOLS } from './routes.js';

import * as home from './views/home.js';
import * as merge from './views/merge.js';
import * as organize from './views/organize.js';
import * as split from './views/split.js';
import * as rotate from './views/rotate.js';
import * as builder from './views/builder.js';
import * as imagesToPdf from './views/images-to-pdf.js';
import * as pdfToImages from './views/pdf-to-images.js';

const VIEWS = { home, merge, organize, split, rotate, builder, imagesToPdf, pdfToImages };

const root = document.getElementById('view');
const nav = document.getElementById('topnav');
let unmount = null;

/* ---------- missing libraries are a hard stop, so say it plainly ---------- */

const missing = [
  !window.pdfjsLib && 'pdf.js',
  !window.PDFLib && 'pdf-lib',
  !window.JSZip && 'JSZip',
].filter(Boolean);

if (missing.length) {
  root.append(el('div', { class: 'notice err' },
    el('b', { text: `Could not load: ${missing.join(', ')}` }),
    el('p', { text: 'The tool needs these libraries to do anything. Check your connection or an ad/script blocker, then reload. Once loaded, they work offline — and they never see your files.' })
  ));
  throw new Error(`Missing libraries: ${missing.join(', ')}`);
}

/* ---------- navigation ---------- */

nav.append(...TOOLS.map(t => el('a', { href: `#/${t.route}`, text: t.label })));

function currentRoute() {
  return (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
}

function render() {
  const route = currentRoute();
  const tool = TOOLS.find(t => t.route === route);
  const module = route === 'home' ? VIEWS.home : (tool && VIEWS[tool.view]);

  try { unmount?.(); } catch (err) { console.warn('cleanup failed', err); }
  unmount = null;
  root.replaceChildren();
  setStatus('idle');

  for (const link of nav.children) {
    if (link.getAttribute('href') === `#/${route}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  if (!module) {
    root.append(el('div', { class: 'notice warn' },
      el('b', { text: `No tool called "${route}"` }),
      el('p', {}, 'Pick one from the top bar, or go ', el('a', { href: '#/' }, 'back to the start'), '.')
    ));
    document.title = 'pdf-toolbox';
    return;
  }

  try {
    unmount = module.mount(root) ?? null;
  } catch (err) {
    showError(err, 'This tool failed to start');
  }

  document.title = tool ? `${tool.label} — pdf-toolbox` : 'pdf-toolbox';
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', render);
render();

/* ---------- last-resort error reporting ---------- */

window.addEventListener('unhandledrejection', e => {
  showError(e.reason, 'Something went wrong');
});
window.addEventListener('error', e => {
  if (e.message) toast('Something went wrong', e.message, 'err', 8000);
});

/* Files are only in memory; a reload loses them. Warn if work is in progress. */
window.addEventListener('beforeunload', e => {
  if (document.querySelector('.pcell, .filelist li')) {
    e.preventDefault();
    e.returnValue = '';
  }
});
