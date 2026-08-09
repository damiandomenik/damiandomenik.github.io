/* main.js — routing, tabs and keyboard shortcuts. */

import { el, toast } from './ui.js';
import * as home from './views/home.js';
import * as regex from './views/regex.js';
import * as analyzer from './views/analyzer.js';
import * as builder from './views/builder.js';
import * as generator from './views/generator.js';

const ROUTES = [
  { route: 'regex', label: 'Regex Playground', module: regex, key: '1' },
  { route: 'analyzer', label: 'Password Analyzer', module: analyzer, key: '2' },
  { route: 'builder', label: 'Rule Builder', module: builder, key: '3' },
  { route: 'generator', label: 'Password Generator', module: generator, key: '4' },
];

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
let unmount = null;

tabs.append(...ROUTES.map(entry => el('a', {
  href: `#/${entry.route}`,
  class: 'tab',
  dataset: { route: entry.route },
  text: entry.label,
})));

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '').split('?')[0];
  return hash || 'home';
}

function render() {
  const route = currentRoute();
  const entry = ROUTES.find(r => r.route === route);
  const module = route === 'home' ? home : entry?.module;

  try { unmount?.(); } catch (err) { console.warn('cleanup failed', err); }
  unmount = null;
  view.replaceChildren();

  for (const tab of tabs.children) {
    const active = tab.dataset.route === route;
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }

  if (!module) {
    view.append(el('section', { class: 'card' },
      el('h2', { class: 'card-title', text: 'No such section' }),
      el('p', { class: 'card-sub' }, 'Pick one from the tabs above, or go ',
        el('a', { href: '#/' }, 'back to the start'), '.')
    ));
    document.title = 'PatternLab';
    return;
  }

  try {
    unmount = module.mount(view) ?? null;
  } catch (err) {
    console.error('view failed to start', err);
    view.append(el('p', { class: 'notice', dataset: { kind: 'error' },
      text: `This section failed to start: ${err.message}` }));
  }

  document.title = entry ? `${entry.label} — PatternLab` : 'PatternLab';
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', render);
render();

/* ---------------- keyboard shortcuts ---------------- */

document.addEventListener('keydown', event => {
  // Never steal a keystroke from someone typing a pattern or a password.
  const target = event.target;
  const typing = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable;

  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === '/' && !typing) {
    event.preventDefault();
    view.querySelector('input:not([type=checkbox]):not([type=number]), textarea')?.focus();
    return;
  }
  if (event.key === 'Escape' && typing) {
    target.blur();
    return;
  }
  if (typing) return;

  const numbered = ROUTES.find(entry => entry.key === event.key);
  if (numbered) {
    location.hash = `#/${numbered.route}`;
    return;
  }
  if (event.key === 'g') {
    if (currentRoute() === 'generator') {
      [...view.querySelectorAll('button')].find(b => b.textContent === 'Generate')?.click();
    } else {
      location.hash = '#/generator';
    }
  }
  if (event.key === '?') {
    toast('1-4 switch sections · g generate · / focus the first input · Esc leave a field', 'info', 5000);
  }
});

/* A last line of defence: a crash in a view should say so, not white-screen. */
window.addEventListener('error', event => {
  if (event.message) toast(`Something went wrong: ${event.message}`, 'error', 6000);
});
window.addEventListener('unhandledrejection', event => {
  toast(`Something went wrong: ${event.reason?.message ?? event.reason}`, 'error', 6000);
});
