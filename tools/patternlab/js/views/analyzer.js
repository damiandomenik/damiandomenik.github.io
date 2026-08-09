/* views/analyzer.js — live password analysis, entirely local. */

import { el, section, button, meter, checkList, notice, empty, debounce } from '../ui.js';
import { analyzePassword } from '../password/strength.js';
import { takeHandoffPassword } from '../state.js';

const PRESET_RULES = [
  { label: 'At least 8 characters', test: v => v.length >= 8 },
  { label: 'At least 12 characters', test: v => v.length >= 12 },
  { label: 'At least 16 characters', test: v => v.length >= 16 },
  { label: 'Lowercase letter', test: v => /[a-z]/.test(v) },
  { label: 'Uppercase letter', test: v => /[A-Z]/.test(v) },
  { label: 'Number', test: v => /\d/.test(v) },
  { label: 'Special character', test: v => /[^A-Za-z0-9]/.test(v) },
];

export function mount(root, options = {}) {
  const input = el('input', {
    type: 'password', class: 'input mono password-input', autocomplete: 'new-password',
    autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Password to analyse',
    placeholder: 'Type or paste a password…',
  });
  // A password handed over from the generator, if there is one. Read once.
  const handed = options.initial ?? takeHandoffPassword();
  if (handed) {
    input.value = handed;
    input.type = 'text';
  }

  const reveal = button(handed ? 'Hide' : 'Show', {
    kind: 'ghost small',
    onclick: () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      reveal.textContent = hidden ? 'Hide' : 'Show';
    },
  });

  const strength = meter();
  const rules = checkList();
  const stats = el('div', { class: 'stats' });
  const warnings = el('div', { class: 'stack' });
  const patterns = el('div', { class: 'stack' });
  const times = el('div', { class: 'times' });

  const update = () => {
    const value = input.value;
    const analysis = analyzePassword(value);

    strength.set(
      value ? analysis.score : -1,
      value ? analysis.label : 'Waiting for input',
      value ? `${analysis.bits} bits of estimated entropy` : ''
    );

    rules.set(PRESET_RULES.map(rule => ({ label: rule.label, ok: value ? rule.test(value) : false })));

    stats.replaceChildren(
      stat('Length', value.length),
      stat('Lowercase', analysis.counts.lower),
      stat('Uppercase', analysis.counts.upper),
      stat('Numbers', analysis.counts.digit),
      stat('Symbols', analysis.counts.symbol + analysis.counts.other),
      stat('Character pool', value ? analysis.poolSize : 0)
    );

    warnings.replaceChildren(
      ...analysis.warnings.map(text => notice(text, 'warn')),
      ...(value && !analysis.warnings.length ? [notice('No obvious weak patterns found.', 'ok')] : []),
      ...analysis.suggestions.map(text => notice(text, 'info'))
    );

    patterns.replaceChildren(
      ...(analysis.matches.length
        ? [el('p', { class: 'field-hint', text: 'Recognisable pieces an attacker would try early:' }),
           el('div', { class: 'chips' }, ...analysis.matches.map(match =>
             el('span', { class: 'chip', dataset: { kind: match.kind } },
               el('code', { text: match.token }),
               el('span', { text: PATTERN_LABELS[match.kind] || match.kind })
             )))]
        : value ? [empty('No dictionary words, runs or repeats were recognised in this one.')] : [])
    );

    times.replaceChildren(...(value
      ? Object.values(analysis.crackTimes).map(entry => el('div', { class: 'time-row' },
          el('span', { class: 'time-label', text: entry.label }),
          el('span', { class: 'time-value', text: entry.text })))
      : []));
  };

  input.addEventListener('input', debounce(update, 60));

  root.append(
    section('Password analyzer', 'Typed here, analysed here. Nothing is transmitted, stored, or written to disk.',
      el('div', { class: 'password-row' }, input, reveal),
      strength.node,
      el('div', { class: 'two-col' },
        el('div', {}, el('h3', { class: 'sub-title', text: 'Common requirements' }), rules.node),
        el('div', {}, el('h3', { class: 'sub-title', text: 'Composition' }), stats)
      )
    ),
    section('How long would it take to guess?',
      'Estimated from the character pool and the predictable pieces below. It cannot know whether this password has appeared in a breach.',
      times, patterns),
    section('Findings', null, warnings)
  );

  update();
  return () => { input.value = ''; };
}

const PATTERN_LABELS = {
  common: 'known password',
  word: 'dictionary word',
  sequence: 'consecutive run',
  repeat: 'repeated character',
  keyboard: 'keyboard pattern',
  year: 'year',
};

function stat(label, value) {
  return el('div', { class: 'stat' },
    el('span', { class: 'stat-value', text: String(value) }),
    el('span', { class: 'stat-label', text: label })
  );
}
