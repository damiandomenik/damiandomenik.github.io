/* views/generator.js — crypto-secure generation, then straight into the analyzer. */

import { el, section, button, checkbox, numberInput, meter, checkList, notice, toast, copyText } from '../ui.js';
import { generatePassword, ImpossibleRules, optionsFromRules, AMBIGUOUS } from '../password/generate.js';
import { analyzePassword } from '../password/strength.js';
import { testPassword, describeRules } from '../password/rules.js';
import { sharedRules, onRulesChanged, goTo, setHandoffPassword } from '../state.js';

export function mount(root) {
  const settings = {
    length: 20,
    useRules: true,
    excludeAmbiguous: false,
    noRepeat: false,
    upper: 1, lower: 1, digit: 1, special: 1,
  };

  const output = el('output', { class: 'generated mono', 'aria-live': 'polite' });
  const strength = meter();
  const ruleCheck = checkList();
  const ruleNote = el('p', { class: 'field-hint' });
  const problems = el('div', { class: 'stack' });
  const notes = el('div', { class: 'stack' });
  const controls = el('div', { class: 'rule-grid' });

  let current = '';

  function activeOptions() {
    if (settings.useRules) {
      return optionsFromRules(sharedRules(), {
        length: settings.length,
        excludeAmbiguous: settings.excludeAmbiguous,
        noRepeat: settings.noRepeat,
      });
    }
    return {
      length: settings.length,
      maxLength: 0,
      upper: settings.upper, lower: settings.lower,
      digit: settings.digit, special: settings.special,
      specialSet: sharedRules().specialSet,
      excludeAmbiguous: settings.excludeAmbiguous,
      noRepeat: settings.noRepeat,
    };
  }

  function generate() {
    problems.replaceChildren();
    notes.replaceChildren();
    try {
      const result = generatePassword(activeOptions());
      current = result.password;
      output.textContent = result.password;
      output.dataset.empty = 'false';
      notes.replaceChildren(...result.notes.map(text => notice(text, 'info')));
      review();
    } catch (err) {
      current = '';
      output.textContent = '';
      output.dataset.empty = 'true';
      problems.replaceChildren(notice(
        err instanceof ImpossibleRules ? err.message : `Could not generate a password: ${err.message}`,
        'error'));
      strength.set(-1, 'Nothing generated', '');
      ruleCheck.set([]);
    }
  }

  function review() {
    if (!current) return;
    const analysis = analyzePassword(current);
    strength.set(analysis.score, analysis.label,
      `${analysis.bits} bits · ${analysis.crackTimes.fastHash.text} against fast offline hashing`);

    const rules = settings.useRules ? sharedRules() : {
      minLength: settings.length, maxLength: 0,
      upper: settings.upper, lower: settings.lower, digit: settings.digit, special: settings.special,
      specialSet: sharedRules().specialSet,
    };
    const outcome = testPassword(current, rules);
    ruleCheck.set(outcome.results);
    ruleNote.textContent = outcome.ok
      ? `Verified: all ${outcome.total} rules hold for this password.`
      : `${outcome.passed} of ${outcome.total} rules hold — this should not happen, please report it.`;
    ruleNote.dataset.ok = String(outcome.ok);
  }

  function rebuildControls() {
    const rules = sharedRules();
    const lengthInput = numberInput(settings.length, {
      min: 4, max: 256, onChange: value => { settings.length = value; }, ariaLabel: 'Password length',
    });

    const useRules = checkbox('Use my rules from the Rule Builder', settings.useRules, checked => {
      settings.useRules = checked;
      rebuildControls();
    });

    const rows = [
      el('div', { class: 'rule-row' }, el('span', { class: 'field-label', text: 'Length' }), lengthInput),
      el('div', { class: 'rule-row wide' }, useRules.node),
    ];

    if (settings.useRules) {
      rows.push(el('div', { class: 'rule-row wide' },
        el('p', { class: 'field-hint', text: `Active rules: ${describeRules(rules).join(', ') || 'none'}` }),
        button('Edit rules', { kind: 'ghost small', onclick: () => goTo('builder') })
      ));
    } else {
      const counter = (key, label) => {
        const box = checkbox(label, settings[key] > 0, checked => {
          settings[key] = checked ? Math.max(1, settings[key]) : 0;
          rebuildControls();
        });
        const count = numberInput(Math.max(1, settings[key] || 1), {
          min: 1, max: 32, width: '4.2rem', ariaLabel: `How many ${label}`,
          onChange: value => { if (settings[key] > 0) settings[key] = value; },
        });
        count.disabled = settings[key] === 0;
        return el('div', { class: 'rule-row' }, box.node, el('span', { class: 'rule-count' }, count));
      };
      rows.push(counter('upper', 'Uppercase'), counter('lower', 'Lowercase'),
                counter('digit', 'Numbers'), counter('special', 'Symbols'));
    }

    rows.push(
      el('div', { class: 'rule-row wide' },
        checkbox('Exclude ambiguous characters', settings.excludeAmbiguous,
          checked => { settings.excludeAmbiguous = checked; }, `avoids ${AMBIGUOUS.slice(0, 8)}…`).node),
      el('div', { class: 'rule-row wide' },
        checkbox('Never repeat a character', settings.noRepeat,
          checked => { settings.noRepeat = checked; }, 'limits the length to the size of the pool').node)
    );

    controls.replaceChildren(...rows);
  }

  const stop = onRulesChanged(() => { rebuildControls(); if (current) review(); });

  root.append(
    section('Password generator', 'Built from crypto.getRandomValues, never Math.random. The result is checked against your rules before it is shown.',
      controls,
      el('div', { class: 'btn-row' },
        button('Generate', { kind: 'primary', onclick: generate }),
        button('Copy', { kind: '', onclick: () => copyText(current) }),
        button('Analyze in full', { kind: 'ghost', onclick: () => {
          if (!current) { toast('Generate one first', 'warn'); return; }
          setHandoffPassword(current);
          goTo('analyzer');
        } })
      ),
      problems,
      output,
      notes,
      strength.node
    ),
    section('Rule check', 'The generated password run back through the rules that produced it.',
      ruleCheck.node, ruleNote)
  );

  rebuildControls();
  generate();

  return () => { current = ''; stop(); };
}
