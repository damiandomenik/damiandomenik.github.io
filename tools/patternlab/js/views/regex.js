/* views/regex.js — the playground: pattern, flags, live matches, explanation,
 * test cases and the cheat sheet. */

import { el, section, button, checkbox, toast, copyText, notice, empty, debounce } from '../ui.js';
import { findMatches, segments, testsAgainst } from '../regex/match.js';
import { inferPatterns, verify, suggestsBoundaries } from '../regex/infer.js';
import { explain } from '../regex/explain.js';
import { FLAGS } from '../regex/parser.js';
import { CHEATSHEET, EXAMPLES } from '../regex/cheatsheet.js';

const state = {
  pattern: EXAMPLES[0].pattern,
  flags: new Set(['g']),
  text: EXAMPLES[0].text,
  cases: EXAMPLES[0].cases.map(c => ({ ...c })),
  samples: [],          // strings selected out of the test text
  boundaries: false,
};

export function mount(root) {
  /* ---- inputs ---- */

  const patternInput = el('input', {
    class: 'input mono pattern-input', spellcheck: 'false', autocapitalize: 'off',
    autocomplete: 'off', 'aria-label': 'Regular expression', placeholder: 'your pattern here',
  });
  patternInput.value = state.pattern;

  const textInput = el('textarea', {
    class: 'input mono text-input', spellcheck: 'false', rows: '7',
    'aria-label': 'Test text', placeholder: 'Paste the text to search…',
  });
  textInput.value = state.text;

  const flagBoxes = FLAGS.map(flag => {
    const input = el('input', { type: 'checkbox', id: `flag-${flag.flag}` });
    input.checked = state.flags.has(flag.flag);
    input.addEventListener('change', () => {
      input.checked ? state.flags.add(flag.flag) : state.flags.delete(flag.flag);
      run();
    });
    return el('label', { class: 'flag', title: `${flag.name} — ${flag.description}` },
      input, el('code', { text: flag.flag }), el('span', { class: 'flag-name', text: flag.name }));
  });

  const errorBox = el('p', { class: 'notice', dataset: { kind: 'error' }, hidden: true });
  const summary = el('p', { class: 'match-summary' });
  const preview = el('pre', { class: 'preview mono', 'aria-live': 'polite' });
  const matchList = el('div', { class: 'match-list' });

  /* ---- explanation ---- */
  const explanationBox = el('div', { class: 'ladder' });
  const groupsBox = el('div', { class: 'groups-note' });

  /* ---- test cases ---- */
  const caseList = el('div', { class: 'cases' });
  const caseScore = el('p', { class: 'case-score' });
  const newCase = el('input', {
    class: 'input mono', placeholder: 'add a test string…', 'aria-label': 'New test case',
  });
  newCase.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !newCase.value) return;
    state.cases.push({ value: newCase.value, shouldMatch: true });
    newCase.value = '';
    renderCases();
  });

  /* ---- build from examples ---- */

  const sampleChips = el('div', { class: 'chips' });
  const candidateList = el('div', { class: 'stack' });
  const boundaryRow = el('div', { class: 'rule-row', hidden: true });

  const addSelection = () => {
    const { selectionStart, selectionEnd } = textInput;
    const picked = textInput.value.slice(selectionStart, selectionEnd).trim();
    if (!picked) {
      toast('Select something in the test text first', 'warn');
      return;
    }
    if (state.samples.includes(picked)) {
      toast('That example is already in the list', 'warn');
      return;
    }
    state.samples.push(picked);
    renderInference();
    toast(`Added "${picked.length > 24 ? picked.slice(0, 24) + '…' : picked}"`, 'ok');
  };

  function renderInference() {
    sampleChips.replaceChildren(...state.samples.map((sample, index) =>
      el('span', { class: 'chip' },
        el('code', { text: sample }),
        button('×', { kind: 'ghost small', title: 'Remove this example',
          onclick: () => { state.samples.splice(index, 1); renderInference(); } })
      )));

    if (!state.samples.length) {
      candidateList.replaceChildren(empty('Select a piece of the test text above and press "Use selection". Two or three examples give a much sharper guess than one.'));
      boundaryRow.hidden = true;
      return;
    }

    const canBound = suggestsBoundaries(state.samples, state.text);
    boundaryRow.hidden = !canBound;

    const { candidates, note } = inferPatterns(state.samples);
    const rows = [el('p', { class: 'field-hint', text: note })];

    for (const candidate of candidates) {
      const pattern = state.boundaries && canBound ? `\\b${candidate.pattern}\\b` : candidate.pattern;
      const result = findMatches(pattern, 'g', state.text);

      let verdict;
      let level;
      if (!result.ok) {
        verdict = `This candidate is not a valid pattern: ${result.error}`;
        level = 'error';
      } else {
        const check = verify(candidate, state.samples, result.matches);
        if (check.ok) {
          verdict = `Matches your ${state.samples.length} example${state.samples.length === 1 ? '' : 's'} and nothing else in the text.`;
          level = 'ok';
        } else {
          const bits = [];
          if (check.missed.length) bits.push(`misses ${check.missed.map(m => `"${m}"`).join(', ')}`);
          if (check.extra.length) {
            const shown = check.extra.slice(0, 3).map(m => `"${m}"`).join(', ');
            bits.push(`also catches ${shown}${check.extra.length > 3 ? ` and ${check.extra.length - 3} more` : ''}`);
          }
          verdict = `In your text this ${bits.join(', and ')}.`;
          level = check.missed.length ? 'error' : 'warn';
        }
      }

      rows.push(el('div', { class: 'candidate', dataset: { level } },
        el('div', { class: 'candidate-head' },
          el('span', { class: 'candidate-label', text: candidate.label }),
          button('Use this', { kind: 'small', onclick: () => {
            patternInput.value = pattern;
            run();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            toast('Loaded into the pattern field', 'ok');
          } })),
        el('code', { class: 'candidate-pattern', text: pattern }),
        el('p', { class: 'candidate-desc', text: candidate.description }),
        el('p', { class: 'candidate-verdict', dataset: { level }, text: verdict })
      ));
    }

    candidateList.replaceChildren(...rows);
  }

  boundaryRow.append(
    checkbox('Require word boundaries (\\b … \\b)', state.boundaries, checked => {
      state.boundaries = checked;
      renderInference();
    }, 'stops the pattern matching inside a longer word').node
  );

  /* ---- wiring ---- */

  const run = () => {
    state.pattern = patternInput.value;
    state.text = textInput.value;
    renderMatches();
    renderExplanation();
    renderCases();
    renderInference();
  };
  const runSoon = debounce(run, 80);

  patternInput.addEventListener('input', runSoon);
  textInput.addEventListener('input', runSoon);

  function flagString() {
    return FLAGS.map(f => f.flag).filter(f => state.flags.has(f)).join('');
  }

  function renderMatches() {
    const result = findMatches(state.pattern, flagString(), state.text);

    if (!result.ok) {
      errorBox.hidden = false;
      errorBox.textContent = result.error;
      summary.textContent = '';
      preview.replaceChildren(document.createTextNode(state.text));
      matchList.replaceChildren();
      return;
    }
    errorBox.hidden = true;

    const { matches, truncated, tooLong, isGlobal } = result;
    summary.textContent = matches.length === 0
      ? 'No matches'
      : isGlobal
        ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
        : '1 match — the g flag is off, so searching stops at the first one';

    preview.replaceChildren(...segments(state.text, matches).map(part =>
      part.matchIndex === null
        ? document.createTextNode(part.text)
        : el('mark', { class: 'hit', dataset: { index: String(part.matchIndex) }, title: `Match ${part.matchIndex + 1}` }, part.text)
    ));

    const notes = [];
    if (tooLong) notes.push(notice('The test text is longer than 200,000 characters; only the first part is searched.', 'warn'));
    if (truncated) notes.push(notice('Stopped after 5,000 matches to keep the page responsive.', 'warn'));

    matchList.replaceChildren(
      ...notes,
      ...(matches.length ? matches.slice(0, 200).map(matchRow) : [empty('Nothing matched. Try loosening the pattern, or check the flags.')]),
      matches.length > 200 ? empty(`Showing the first 200 of ${matches.length} matches.`) : null
    );
  }

  function matchRow(match, index) {
    const details = [];
    for (const group of match.groups) {
      details.push(el('div', { class: 'group-row' },
        el('span', { class: 'group-key', text: `group ${group.number}` }),
        el('code', { class: 'group-val', text: group.value === undefined ? '(no match)' : group.value })
      ));
    }
    if (match.named) {
      for (const [name, value] of Object.entries(match.named)) {
        details.push(el('div', { class: 'group-row' },
          el('span', { class: 'group-key', text: name }),
          el('code', { class: 'group-val', text: value === undefined ? '(no match)' : value })
        ));
      }
    }

    return el('div', { class: 'match-item' },
      el('div', { class: 'match-head' },
        el('span', { class: 'match-index', text: `#${index + 1}` }),
        el('code', { class: 'match-value', text: match.value || '(empty match)' }),
        el('span', { class: 'match-pos', text: `${match.start}–${match.end}` }),
        button('Copy', { kind: 'ghost small', onclick: () => copyText(match.value) })
      ),
      details.length ? el('div', { class: 'match-groups' }, ...details) : null
    );
  }

  function renderExplanation() {
    const result = explain(state.pattern);

    if (!result.ok) {
      explanationBox.replaceChildren(notice(result.error, 'error'));
      groupsBox.replaceChildren();
      return;
    }
    if (!result.rows.length) {
      explanationBox.replaceChildren(empty('Type a pattern and it will be taken apart here, piece by piece.'));
      groupsBox.replaceChildren();
      return;
    }

    explanationBox.replaceChildren(...result.rows.map(row => el('div', {
      class: 'rung', dataset: { kind: row.kind, depth: String(Math.min(row.depth, 6)) },
    },
      el('code', { class: 'rung-token', text: row.token }),
      el('div', { class: 'rung-body' },
        row.label ? el('span', { class: 'rung-label', text: row.label }) : null,
        row.detail ? el('span', { class: 'rung-detail', text: row.detail }) : null
      )
    )));

    const notes = [];
    if (result.groups.length) {
      notes.push(el('p', { class: 'field-hint', text:
        `Capture groups: ${result.groups.map(g => g.name ? `${g.number} (${g.name})` : g.number).join(', ')}` }));
    }
    if (result.gaps.length) {
      notes.push(notice(
        `${result.gaps.length} part${result.gaps.length === 1 ? '' : 's'} of this pattern could not be explained. They are marked above, and everything else still applies.`,
        'warn'));
    }
    groupsBox.replaceChildren(...notes);
  }

  function renderCases() {
    if (!state.cases.length) {
      caseList.replaceChildren(empty('Add strings that must match — or must not — and they are checked on every keystroke.'));
      caseScore.textContent = '';
      return;
    }

    let passed = 0;
    const rows = state.cases.map((testCase, index) => {
      const outcome = testsAgainst(state.pattern, flagString(), testCase.value);
      const matched = outcome.ok ? outcome.matched : null;
      const ok = outcome.ok && matched === testCase.shouldMatch;
      if (ok) passed++;

      const toggle = button(testCase.shouldMatch ? 'must match' : 'must not match', {
        kind: 'ghost small',
        title: 'Switch what this case expects',
        onclick: () => { testCase.shouldMatch = !testCase.shouldMatch; renderCases(); },
      });

      return el('div', { class: 'case-row', dataset: { state: outcome.ok ? (ok ? 'pass' : 'fail') : 'error' } },
        el('span', { class: 'case-mark', 'aria-hidden': 'true', text: outcome.ok ? (ok ? '✓' : '✗') : '!' }),
        el('code', { class: 'case-value', text: testCase.value }),
        toggle,
        el('span', { class: 'case-actual', text: outcome.ok ? (matched ? 'matches' : 'no match') : 'invalid pattern' }),
        button('×', {
          kind: 'ghost small', title: 'Remove this case',
          onclick: () => { state.cases.splice(index, 1); renderCases(); },
        })
      );
    });

    caseList.replaceChildren(...rows);
    caseScore.textContent = `${passed} / ${state.cases.length} passed`;
    caseScore.dataset.all = String(passed === state.cases.length);
  }

  /* ---- examples ---- */

  const exampleButtons = EXAMPLES.map(example => button(example.name, {
    kind: 'ghost small',
    onclick: () => {
      state.flags = new Set(example.flags.split(''));
      state.cases = example.cases.map(c => ({ ...c }));
      patternInput.value = example.pattern;
      textInput.value = example.text;
      for (const flag of FLAGS) {
        const box = document.getElementById(`flag-${flag.flag}`);
        if (box) box.checked = state.flags.has(flag.flag);
      }
      run();
      toast(`Loaded "${example.name}"`, 'ok');
    },
  }));

  /* ---- assembly ---- */

  root.append(
    section('Regex playground', 'Everything updates as you type. Nothing is sent anywhere.',
      el('div', { class: 'pattern-row' },
        el('span', { class: 'slash', text: '/' }),
        patternInput,
        el('span', { class: 'slash', text: '/' }),
        el('code', { class: 'flag-preview', text: flagString() || '–' }),
        button('Copy', { kind: 'ghost small', onclick: () => copyText(state.pattern) })
      ),
      el('div', { class: 'flags' }, ...flagBoxes),
      errorBox,
      el('div', { class: 'examples' }, el('span', { class: 'field-label', text: 'Examples' }), ...exampleButtons)
    ),

    section('Test text', null,
      textInput,
      el('div', { class: 'result-head' }, summary),
      preview,
      matchList
    ),

    section('Build a pattern from examples',
      'Select a piece of the test text, and PatternLab proposes patterns that would match it — then checks each one against the whole text so you can see what it really catches.',
      el('div', { class: 'btn-row' },
        button('Use selection', { kind: 'small', onclick: addSelection }),
        button('Clear examples', { kind: 'ghost small', onclick: () => { state.samples = []; renderInference(); } })
      ),
      sampleChips,
      boundaryRow,
      candidateList
    ),

    section('What this pattern does', 'Each piece of the pattern, in plain words.',
      explanationBox,
      groupsBox
    ),

    section('Test cases', 'Mark whether each string should match. Useful when tightening a pattern without breaking it.',
      el('div', { class: 'case-input-row' }, newCase,
        button('Add', { kind: 'small', onclick: () => {
          if (!newCase.value) { toast('Type something first', 'warn'); return; }
          state.cases.push({ value: newCase.value, shouldMatch: true });
          newCase.value = '';
          renderCases();
        } })),
      caseList,
      caseScore
    ),

    cheatSheetSection(pattern => {
      patternInput.value = pattern.pattern;
      textInput.value = pattern.text;
      state.flags = new Set(['g']);
      for (const flag of FLAGS) {
        const box = document.getElementById(`flag-${flag.flag}`);
        if (box) box.checked = flag.flag === 'g';
      }
      run();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('Loaded into the playground', 'ok');
    })
  );

  // Keep the little flag preview beside the pattern honest. The listener goes
  // on the flag row, not on the view container: the container outlives every
  // view switch, so a listener left there would accumulate one per visit.
  const flagPreview = root.querySelector('.flag-preview');
  const flagRow = root.querySelector('.flags');
  const syncFlags = () => { flagPreview.textContent = flagString() || '–'; };
  flagRow.addEventListener('change', syncFlags);

  run();
  syncFlags();

  return () => { flagRow.removeEventListener('change', syncFlags); };
}

function cheatSheetSection(onTry) {
  const body = el('div', { class: 'cheat' });

  for (const group of CHEATSHEET) {
    const items = group.items.map(item => {
      const detail = el('div', { class: 'cheat-detail', hidden: true },
        el('p', { text: item.detail }),
        button('Try it', { kind: 'ghost small', onclick: () => onTry(item.example) })
      );
      const row = el('button', {
        class: 'cheat-row', type: 'button', 'aria-expanded': 'false',
        onclick: () => {
          const open = detail.hidden;
          detail.hidden = !open;
          row.setAttribute('aria-expanded', String(open));
        },
      },
        el('code', { class: 'cheat-token', text: item.token }),
        el('span', { class: 'cheat-short', text: item.short })
      );
      return el('div', { class: 'cheat-item' }, row, detail);
    });

    body.append(el('div', { class: 'cheat-group' },
      el('h3', { class: 'cheat-group-title', text: group.group }),
      ...items
    ));
  }

  return section('Cheat sheet', 'Tap any entry for the longer version and a working example.', body);
}
