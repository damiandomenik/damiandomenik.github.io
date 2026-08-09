/* views/builder.js — rules to regex, regex to rules, and a tester for both.
 *
 * The shared rule set lives here and the generator reads it, which is what
 * makes "generate a password that satisfies my rules" actually mean something.
 */

import {
  el, section, button, checkbox, numberInput, codeBlock, checkList,
  notice, empty, toast, debounce,
} from '../ui.js';
import { rulesToRegex, testPassword, validateRules, describeRules, DEFAULT_SPECIALS } from '../password/rules.js';
import { interpretRegex } from '../regex/interpret.js';
import { sharedRules, setSharedRules, goTo } from '../state.js';

export function mount(root) {
  const rules = { ...sharedRules() };

  const regexOut = codeBlock(() => rulesToRegex(rules), { label: 'Copy regex' });
  const summary = el('ul', { class: 'rule-summary' });
  const problems = el('div', { class: 'stack' });
  const controls = el('div', { class: 'rule-grid' });

  const testInput = el('input', {
    type: 'text', class: 'input mono', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Password to test against these rules', placeholder: 'test a password against these rules…',
  });
  const testResults = checkList();
  const testScore = el('p', { class: 'case-score' });

  /* ---- rule controls ----
   * Built exactly once. An earlier version rebuilt them inside sync(), which
   * meant every keystroke replaced the field being typed into — you could not
   * enter "12", because the input vanished after the "1".
   */

  const countInputs = {};

  function counterRow(key, label) {
    const count = numberInput(Math.max(1, rules[key] || 1), {
      min: 1, max: 32, width: '4.2rem', ariaLabel: `How many ${label}`,
      onChange: value => { if (rules[key] > 0) { rules[key] = value; sync(); } },
    });
    count.disabled = rules[key] === 0;
    countInputs[key] = count;

    const box = checkbox(label, rules[key] > 0, checked => {
      rules[key] = checked ? Math.max(1, Number(count.value) || 1) : 0;
      count.disabled = !checked;
      sync();
    });

    return el('div', { class: 'rule-row' }, box.node,
      el('span', { class: 'rule-count' }, count, el('span', { class: 'field-hint', text: 'required' })));
  }

  const specialsField = el('input', { class: 'input mono', 'aria-label': 'Allowed special characters', spellcheck: 'false' });
  specialsField.value = rules.specialSet;
  specialsField.addEventListener('input', debounce(() => {
    rules.specialSet = specialsField.value || DEFAULT_SPECIALS;
    sync();
  }, 150));

  controls.append(
    el('div', { class: 'rule-row' },
      el('span', { class: 'field-label', text: 'Minimum length' }),
      numberInput(rules.minLength, {
        min: 1, max: 256, ariaLabel: 'Minimum length',
        onChange: v => { rules.minLength = v; sync(); },
      })
    ),
    el('div', { class: 'rule-row' },
      el('span', { class: 'field-label', text: 'Maximum length' }),
      numberInput(rules.maxLength, {
        min: 0, max: 256, ariaLabel: 'Maximum length',
        onChange: v => { rules.maxLength = v; sync(); },
      }),
      el('span', { class: 'field-hint', text: '0 = no limit' })
    ),
    counterRow('upper', 'Uppercase letters'),
    counterRow('lower', 'Lowercase letters'),
    counterRow('digit', 'Numbers'),
    counterRow('special', 'Special characters'),
    el('div', { class: 'rule-row wide' },
      el('span', { class: 'field-label', text: 'Allowed specials' }),
      specialsField
    )
  );

  /** Push the rule values back into the controls, after an outside change. */
  function reflectRules() {
    const inputs = [...controls.querySelectorAll('input[type=number]')];
    if (inputs[0]) inputs[0].value = String(rules.minLength);
    if (inputs[1]) inputs[1].value = String(rules.maxLength);
    for (const [key, input] of Object.entries(countInputs)) {
      input.value = String(Math.max(1, rules[key] || 1));
      input.disabled = rules[key] === 0;
      const box = input.closest('.rule-row')?.querySelector('input[type=checkbox]');
      if (box) box.checked = rules[key] > 0;
    }
    specialsField.value = rules.specialSet;
  }

  /* ---- the shared sync ---- */

  function sync() {
    setSharedRules(rules);
    regexOut.update();

    summary.replaceChildren(...describeRules(rules).map(text => el('li', { text })));

    const issues = validateRules(rules);
    problems.replaceChildren(...issues.map(text => notice(text, 'error')));

    runTest();
  }

  function runTest() {
    const value = testInput.value;
    if (!value) {
      testResults.set([]);
      testScore.textContent = '';
      return;
    }
    const outcome = testPassword(value, rules);
    testResults.set(outcome.results);
    testScore.textContent = `${outcome.passed} / ${outcome.total} rules passed`;
    testScore.dataset.all = String(outcome.ok);
  }

  testInput.addEventListener('input', debounce(runTest, 60));

  /* ---- regex → rules ---- */

  const importInput = el('input', {
    class: 'input mono', spellcheck: 'false', autocomplete: 'off',
    'aria-label': 'Regex to interpret', placeholder: '^(?=.*[A-Z])(?=.*\\d).{8,}$',
  });
  const importOut = el('div', { class: 'stack' });

  const applyBtn = button('Use these rules', {
    kind: 'small', disabled: true,
    onclick: () => {
      const result = interpretRegex(importInput.value);
      if (!result.ok || !result.rules) { toast('Nothing to apply', 'warn'); return; }
      Object.assign(rules, result.rules);
      reflectRules();
      sync();
      toast('Rules updated from the pattern', 'ok');
    },
  });

  function runImport() {
    const source = importInput.value.trim();
    if (!source) {
      importOut.replaceChildren(empty('Paste a password regex and PatternLab will say which rules it can recognise — and which parts it cannot.'));
      applyBtn.disabled = true;
      return;
    }

    const result = interpretRegex(source);
    if (!result.ok) {
      importOut.replaceChildren(notice(result.error, 'error'));
      applyBtn.disabled = true;
      return;
    }

    const parts = [];
    if (result.findings.length) {
      parts.push(el('ul', { class: 'checklist' }, ...result.findings.map(finding =>
        el('li', { class: 'checkrow', dataset: { ok: 'true' } },
          el('span', { class: 'checkmark', 'aria-hidden': 'true', text: '✓' }),
          el('span', { class: 'checklabel', text: finding.label })))));
    } else {
      parts.push(empty('No password rules were recognised in this pattern.'));
    }

    if (result.gaps.length) {
      parts.push(notice('Some parts of this regex cannot be automatically interpreted. They are listed below and are NOT reflected in the rules above.', 'warn'));
      parts.push(el('div', { class: 'gaps' }, ...result.gaps.map(gap =>
        el('div', { class: 'gap-row' },
          el('code', { class: 'gap-source', text: gap.source }),
          el('span', { class: 'gap-reason', text: gap.reason })))));
    } else if (result.findings.length) {
      parts.push(notice('Every part of this pattern was recognised.', 'ok'));
    }

    importOut.replaceChildren(...parts);
    applyBtn.disabled = !result.rules;
  }

  importInput.addEventListener('input', debounce(runImport, 120));

  /* ---- assembly ---- */

  root.append(
    section('Rule builder', 'Pick the rules; the regular expression writes itself.',
      controls,
      problems,
      el('h3', { class: 'sub-title', text: 'Generated pattern' }),
      regexOut.node,
      el('div', { class: 'btn-row' },
        button('Test a password', { kind: 'ghost small', onclick: () => testInput.focus() }),
        button('Generate a password from these rules', { kind: 'small', onclick: () => goTo('generator') })
      ),
      el('h3', { class: 'sub-title', text: 'In words' }),
      summary
    ),

    section('Test a password against these rules', 'Each rule is checked separately, so you can see exactly which one fails.',
      testInput, testResults.node, testScore),

    section('Read rules out of an existing regex', 'For when someone hands you a password policy as a pattern.',
      importInput,
      el('div', { class: 'btn-row' }, applyBtn,
        button('Load example', { kind: 'ghost small', onclick: () => {
          importInput.value = '^(?=.*[A-Z])(?=.*\\d).{8,}$';
          runImport();
        } })),
      importOut
    )
  );

  sync();
  runImport();
  return () => {};
}
