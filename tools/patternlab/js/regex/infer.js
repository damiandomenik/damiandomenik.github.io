/* infer.js — building a pattern from examples you point at.
 *
 * THE HONEST LIMIT, UP FRONT
 * Infinitely many patterns match any set of examples. `AZ-12345/2026` is matched
 * by itself, by `AZ-\d{5}/\d{4}`, by `[A-Z]{2}-\d+/\d+`, and by `.+`. Which one
 * you want depends on what you meant, and nothing here can read that.
 *
 * So this does not claim to find "the" pattern. It proposes a few candidates at
 * different levels of strictness, and then — this is the part that matters —
 * runs each one against your actual text and reports exactly what it caught and
 * what it missed. A suggestion you can check beats a suggestion you must trust.
 *
 * More examples make the guess sharper. One example can only ever be a guess
 * about which parts were incidental.
 */

const CLASSES = [
  { kind: 'digit', test: ch => ch >= '0' && ch <= '9', pattern: '\\d', label: 'digits' },
  { kind: 'upper', test: ch => ch >= 'A' && ch <= 'Z', pattern: '[A-Z]', label: 'uppercase letters' },
  { kind: 'lower', test: ch => ch >= 'a' && ch <= 'z', pattern: '[a-z]', label: 'lowercase letters' },
  { kind: 'space', test: ch => /\s/.test(ch), pattern: '\\s', label: 'whitespace' },
];

const MERGED = {
  'upper+lower': { pattern: '[A-Za-z]', label: 'letters' },
  'digit+lower': { pattern: '[a-z0-9]', label: 'lowercase letters and digits' },
  'digit+upper': { pattern: '[A-Z0-9]', label: 'uppercase letters and digits' },
  'digit+lower+upper': { pattern: '[A-Za-z0-9]', label: 'letters and digits' },
};

/** Escape a character so it is literal inside a pattern. */
export function escapeLiteral(text) {
  return [...text].map(ch => (/[\\^$.|?*+()[\]{}\/]/.test(ch) ? `\\${ch}` : ch)).join('');
}

/** Split a string into runs of the same character class. */
export function tokenize(text) {
  const tokens = [];
  for (const ch of text) {
    const found = CLASSES.find(c => c.test(ch));
    const kind = found ? found.kind : 'literal';
    const last = tokens[tokens.length - 1];

    // Literals only merge with the same character, so "AZ-" stays "AZ" + "-"
    // rather than becoming one blob. The repeated character is stored on the
    // token: comparing against value[0] worked for dashes and broke for emoji,
    // where [0] is half of a surrogate pair.
    if (last && last.kind === kind && (kind !== 'literal' || last.char === ch)) {
      last.value += ch;
      last.length++;
    } else {
      tokens.push({ kind, value: ch, char: ch, length: 1 });
    }
  }
  return tokens;
}

/**
 * @param {string[]} examples the selected strings
 * @returns {{candidates: Array, aligned: boolean, note: string}}
 * candidate: {id, label, pattern, description}
 */
export function inferPatterns(examples) {
  const cleaned = [...new Set(examples.filter(e => e && e.length))];
  if (!cleaned.length) return { candidates: [], aligned: false, note: 'No examples yet.' };

  const tokenized = cleaned.map(tokenize);
  const aligned = tokenized.every(t => t.length === tokenized[0].length
    && t.every((token, i) => token.kind === tokenized[0][i].kind));

  const candidates = [];

  if (aligned) {
    candidates.push(build(tokenized, cleaned, 'exact'));
    const relaxed = build(tokenized, cleaned, 'relaxed');
    if (relaxed.pattern !== candidates[0].pattern) candidates.push(relaxed);
    const loose = build(tokenized, cleaned, 'loose');
    if (!candidates.some(c => c.pattern === loose.pattern)) candidates.push(loose);
  } else {
    candidates.push(shapeless(cleaned));
  }

  candidates.push({
    id: 'literal',
    label: cleaned.length === 1 ? 'Just this text' : 'Exactly these strings',
    pattern: cleaned.map(escapeLiteral).join('|'),
    description: cleaned.length === 1
      ? 'Matches the selected text and nothing else. A useful starting point to loosen by hand.'
      : 'Matches only the strings you selected, listed as alternatives. It will not generalise to new ones.',
  });

  return {
    candidates,
    aligned,
    note: aligned
      ? (cleaned.length === 1
        ? 'Built from a single example, so which parts are fixed and which vary is a guess. Select a second example to sharpen it.'
        : `Built from ${cleaned.length} examples that share the same shape.`)
      : 'The examples do not share a common structure, so only a loose pattern and a literal list are offered.',
  };
}

/** Merge aligned tokens position by position. */
function build(tokenized, examples, mode) {
  const columns = tokenized[0].length;
  const parts = [];
  const words = [];

  for (let i = 0; i < columns; i++) {
    const column = tokenized.map(tokens => tokens[i]);
    const kind = column[0].kind;
    const lengths = column.map(token => token.length);
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);

    if (kind === 'literal') {
      // A literal token is a run of one repeated character, so the character
      // goes in once and the quantifier carries the count. Writing out the run
      // *and* adding a count produced "---{3}", which is six dashes.
      const chars = [...new Set(column.map(token => token.char ?? [...token.value][0]))];
      if (chars.length === 1) {
        // Without the u flag a quantifier binds to the last UTF-16 unit only,
        // so "🔐{2}" would repeat half a surrogate pair. Grouping fixes that
        // and costs nothing for ordinary characters.
        const quant = quantifier(min, max, mode, true);
        const body = escapeLiteral(chars[0]);
        parts.push(quant && chars[0].length > 1 ? `(?:${body})${quant}` : body + quant);
        words.push(min === 1 && max === 1
          ? `the character "${chars[0]}"`
          : `${countWords(min, max, mode)} "${chars[0]}"`);
      } else {
        // Different characters in the same slot. A character class is the
        // natural form, but "[🎉🎊]" without the u flag is a class of four
        // surrogate halves; alternation keeps each character whole.
        const quant = quantifier(min, max, mode, true);
        const astral = chars.some(ch => ch.length > 1);
        parts.push(astral
          ? `(?:${chars.map(escapeLiteral).join('|')})${quant}`
          : `[${chars.map(escapeInClass).join('')}]${quant}`);
        words.push(`one of ${chars.map(c => `"${c}"`).join(', ')}`);
      }
      continue;
    }

    const definition = CLASSES.find(c => c.kind === kind);
    parts.push(definition.pattern + quantifier(min, max, mode, false));
    words.push(`${countWords(min, max, mode)} ${definition.label}`);
  }

  const labels = {
    exact: 'Exact shape',
    relaxed: 'Allow different lengths',
    loose: 'Loosest useful form',
  };
  const descriptions = {
    exact: 'Keeps the exact number of digits and letters seen in the examples.',
    relaxed: 'Same structure, but the runs may be longer or shorter.',
    loose: 'Only the structure is kept: one or more of each kind, any length.',
  };

  return {
    id: mode,
    label: labels[mode],
    pattern: parts.join(''),
    description: `${descriptions[mode]} Reads as: ${words.join(', then ')}.`,
  };
}

function quantifier(min, max, mode, isLiteral) {
  if (mode === 'loose') {
    // Loosening a class means "one or more". Loosening a separator does not:
    // a single dot between numbers should stay a single dot.
    if (isLiteral) return max > 1 ? '+' : '';
    return '+';
  }
  if (mode === 'relaxed') return min === max && min === 1 ? '' : `{${min},}`;
  if (min === max) return min === 1 ? '' : `{${min}}`;
  return `{${min},${max}}`;
}

function countWords(min, max, mode) {
  if (mode === 'loose') return 'one or more';
  if (mode === 'relaxed') return `at least ${min}`;
  if (min === max) return `exactly ${min}`;
  return `${min} to ${max}`;
}

/** No shared structure: describe the whole character range instead. */
function shapeless(examples) {
  const kinds = new Set();
  const literals = new Set();
  for (const example of examples) {
    for (const ch of example) {
      const found = CLASSES.find(c => c.test(ch));
      if (found) kinds.add(found.kind); else literals.add(ch);
    }
  }

  const key = [...kinds].filter(k => k !== 'space').sort().join('+');
  const base = MERGED[key]?.pattern
    ?? CLASSES.find(c => c.kind === key)?.pattern
    ?? '.';

  const extra = [...literals].map(escapeInClass).join('');
  const charClass = extra
    ? `[${base.replace(/^\[|\]$/g, '').replace('\\d', '0-9')}${extra}]`
    : base;

  const lengths = examples.map(e => e.length);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);

  return {
    id: 'shapeless',
    label: 'Any of these characters',
    pattern: `${charClass}{${min},${max}}`,
    description: `Matches ${min} to ${max} characters drawn from everything seen in the examples. Broad, because the examples have no structure in common.`,
  };
}

function escapeInClass(ch) {
  return /[\]\\^-]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Would word boundaries help? Only when every example sits at one in the text.
 * Adding \b to a pattern that starts with punctuation would break it.
 */
export function suggestsBoundaries(examples, text) {
  if (!examples.length || !text) return false;
  const isWord = ch => /[A-Za-z0-9_]/.test(ch);
  return examples.every(example => {
    if (!isWord(example[0]) || !isWord(example[example.length - 1])) return false;
    let index = text.indexOf(example);
    while (index >= 0) {
      const before = index > 0 ? text[index - 1] : '';
      const after = text[index + example.length] ?? '';
      if ((before && isWord(before)) || (after && isWord(after))) return false;
      index = text.indexOf(example, index + 1);
    }
    return true;
  });
}

/**
 * Check a candidate against reality: every example found, nothing unexpected.
 * @param matches the result of running the candidate over the whole text
 * @returns {{missed: string[], extra: string[], ok: boolean}}
 */
export function verify(candidate, examples, matches) {
  const found = matches.map(m => m.value);
  const missed = examples.filter(example => !found.includes(example));
  const extra = [...new Set(found.filter(value => !examples.includes(value)))];
  return { missed, extra, ok: missed.length === 0 && extra.length === 0 };
}
