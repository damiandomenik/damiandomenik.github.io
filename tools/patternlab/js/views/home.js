/* views/home.js — the dashboard. */

import { el, section, button } from '../ui.js';
import { goTo } from '../state.js';

const CARDS = [
  { route: 'regex', title: 'Regex Playground', text: 'Write a pattern, watch it match, and read what every piece of it actually does.' },
  { route: 'analyzer', title: 'Password Analyzer', text: 'How long would this password really survive? Rule counting says one thing; guessing says another.' },
  { route: 'builder', title: 'Rule Builder', text: 'Describe a password policy in plain fields and get the regex — or paste a regex and get the policy back.' },
  { route: 'generator', title: 'Password Generator', text: 'Cryptographically random, and guaranteed to satisfy the rules you set.' },
];

export function mount(root) {
  root.append(
    el('section', { class: 'hero' },
      el('h1', { class: 'hero-title' }, 'Pattern', el('span', { class: 'hero-accent', text: 'Lab' })),
      el('p', { class: 'hero-sub', text: 'Build, test and understand patterns.' })
    ),
    el('div', { class: 'card-grid' },
      ...CARDS.map(card => el('button', {
        class: 'tile', type: 'button', onclick: () => goTo(card.route),
      },
        el('span', { class: 'tile-title', text: card.title }),
        el('span', { class: 'tile-text', text: card.text }),
        el('span', { class: 'tile-arrow', 'aria-hidden': 'true', text: '→' })
      ))
    ),
    el('ul', { class: 'promises' },
      el('li', { text: '100% client-side' }),
      el('li', { text: 'No accounts' }),
      el('li', { text: 'No uploads' }),
      el('li', { text: 'Your passwords stay in your browser' })
    ),
    el('p', { class: 'fineprint', text: 'Nothing you type here is transmitted, and nothing is written to storage — not the passwords, not the patterns. Reload the page and it is all gone.' })
  );
  return () => {};
}
