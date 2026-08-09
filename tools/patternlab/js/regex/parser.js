/* parser.js — a recursive-descent parser for JavaScript regular expressions.
 *
 * Why parse at all, when the browser already has RegExp? Because RegExp will
 * tell you whether a pattern is valid, and nothing else. To explain a pattern
 * in words, or to work out which password rules it encodes, the structure has
 * to be visible.
 *
 * The important design rule: anything this parser does not fully understand
 * becomes an `unsupported` node carrying the raw text. It never guesses. A
 * wrong explanation of a regex is worse than an admitted gap, because the
 * person will act on it.
 */

/** @typedef {{type: string, [k: string]: any}} Node */

const ESCAPE_CLASSES = {
  d: { label: 'digit', description: 'any digit, 0 to 9' },
  D: { label: 'non-digit', description: 'any character that is not a digit' },
  w: { label: 'word character', description: 'a letter, digit or underscore' },
  W: { label: 'non-word character', description: 'anything except a letter, digit or underscore' },
  s: { label: 'whitespace', description: 'a space, tab, or line break' },
  S: { label: 'non-whitespace', description: 'any character that is not whitespace' },
};

const ESCAPE_LITERALS = {
  n: { char: '\n', description: 'a line feed (new line)' },
  r: { char: '\r', description: 'a carriage return' },
  t: { char: '\t', description: 'a tab' },
  f: { char: '\f', description: 'a form feed' },
  v: { char: '\v', description: 'a vertical tab' },
  0: { char: '\0', description: 'a NUL character' },
};

const ANCHORS = {
  '^': { kind: 'start', description: 'the start of the text (or of a line, with the m flag)' },
  $: { kind: 'end', description: 'the end of the text (or of a line, with the m flag)' },
};

export class RegexSyntaxError extends Error {
  constructor(message, index) {
    super(message);
    this.name = 'RegexSyntaxError';
    this.index = index;
  }
}

/**
 * @param {string} source the pattern, without slashes or flags
 * @returns {{ast: Node, groups: Array, unsupported: Array}}
 */
export function parse(source) {
  const state = { source, index: 0, groupIndex: 0, groups: [], unsupported: [] };
  const ast = parseAlternation(state);

  if (state.index < source.length) {
    // A stray ) is the usual cause. Report the position rather than guessing.
    throw new RegexSyntaxError(
      `Unexpected "${source[state.index]}" at position ${state.index}.`,
      state.index
    );
  }
  return { ast, groups: state.groups, unsupported: state.unsupported };
}

/* ------------------------------------------------------------------ *
 * Grammar                                                             *
 * ------------------------------------------------------------------ */

function parseAlternation(state) {
  const branches = [parseSequence(state)];
  while (peek(state) === '|') {
    state.index++;
    branches.push(parseSequence(state));
  }
  return branches.length === 1 ? branches[0] : { type: 'alt', branches };
}

function parseSequence(state) {
  const items = [];
  while (state.index < state.source.length) {
    const ch = peek(state);
    if (ch === '|' || ch === ')') break;
    const atom = parseAtom(state);
    if (!atom) break;
    items.push(applyQuantifier(state, atom));
  }
  return { type: 'seq', items };
}

function parseAtom(state) {
  const start = state.index;
  const ch = state.source[state.index];

  if (ch === '(') return parseGroup(state);
  if (ch === '[') return parseCharacterClass(state);
  if (ch === '.') { state.index++; return { type: 'any', start, end: state.index }; }
  if (ch === '^' || ch === '$') {
    state.index++;
    return { type: 'anchor', ...ANCHORS[ch], start, end: state.index };
  }
  if (ch === '\\') return parseEscape(state);

  if (ch === '*' || ch === '+' || ch === '?') {
    throw new RegexSyntaxError(`"${ch}" has nothing before it to repeat (position ${start}).`, start);
  }

  state.index++;
  return { type: 'char', value: ch, start, end: state.index };
}

function parseGroup(state) {
  const start = state.index;
  state.index++;                                    // consume (

  let kind = 'capture';
  let name = null;

  if (peek(state) === '?') {
    const next = state.source[state.index + 1];
    if (next === ':') { kind = 'noncapture'; state.index += 2; }
    else if (next === '=') { kind = 'lookahead'; state.index += 2; }
    else if (next === '!') { kind = 'neglookahead'; state.index += 2; }
    else if (next === '<' && state.source[state.index + 2] === '=') { kind = 'lookbehind'; state.index += 3; }
    else if (next === '<' && state.source[state.index + 2] === '!') { kind = 'neglookbehind'; state.index += 3; }
    else if (next === '<') {
      const close = state.source.indexOf('>', state.index + 2);
      if (close < 0) throw new RegexSyntaxError(`Unterminated group name at position ${start}.`, start);
      name = state.source.slice(state.index + 2, close);
      kind = 'named';
      state.index = close + 1;
    } else {
      // Modifier groups like (?i:…) exist in other flavours, not in JavaScript.
      throw new RegexSyntaxError(`Unsupported group syntax at position ${start}.`, start);
    }
  }

  let number = null;
  if (kind === 'capture' || kind === 'named') {
    number = ++state.groupIndex;
    state.groups.push({ number, name, kind });
  }

  const body = parseAlternation(state);
  if (peek(state) !== ')') {
    throw new RegexSyntaxError(`The group opened at position ${start} is never closed with ")".`, start);
  }
  state.index++;                                    // consume )

  return { type: 'group', kind, name, number, body, start, end: state.index };
}

function parseCharacterClass(state) {
  const start = state.index;
  state.index++;                                    // consume [

  const negated = peek(state) === '^';
  if (negated) state.index++;

  const parts = [];
  let closed = false;

  while (state.index < state.source.length) {
    if (peek(state) === ']') { state.index++; closed = true; break; }

    let from;
    if (peek(state) === '\\') {
      const escape = parseEscape(state, true);
      if (escape.type === 'escapeClass') { parts.push(escape); continue; }
      from = escape.value;
    } else {
      from = state.source[state.index++];
    }

    // A dash is only a range when something follows it before the closing ].
    if (peek(state) === '-' && state.source[state.index + 1] !== ']' && state.index + 1 < state.source.length) {
      state.index++;
      let to;
      if (peek(state) === '\\') {
        const escape = parseEscape(state, true);
        to = escape.value ?? '';
      } else {
        to = state.source[state.index++];
      }
      parts.push({ type: 'range', from, to });
    } else {
      parts.push({ type: 'literal', value: from });
    }
  }

  if (!closed) throw new RegexSyntaxError(`Missing closing ] for the character class at position ${start}.`, start);

  return { type: 'class', negated, parts, start, end: state.index, raw: state.source.slice(start, state.index) };
}

function parseEscape(state, insideClass = false) {
  const start = state.index;
  state.index++;                                    // consume backslash

  if (state.index >= state.source.length) {
    throw new RegexSyntaxError('The pattern ends with a lone backslash.', start);
  }

  const ch = state.source[state.index++];

  if (ESCAPE_CLASSES[ch]) {
    return { type: 'escapeClass', kind: ch, ...ESCAPE_CLASSES[ch], start, end: state.index };
  }
  if (ESCAPE_LITERALS[ch]) {
    return { type: 'char', value: ESCAPE_LITERALS[ch].char, escaped: true,
             description: ESCAPE_LITERALS[ch].description, start, end: state.index };
  }
  if (!insideClass && (ch === 'b' || ch === 'B')) {
    return {
      type: 'anchor',
      kind: ch === 'b' ? 'wordBoundary' : 'notWordBoundary',
      description: ch === 'b'
        ? 'a word boundary — the edge between a word character and something else'
        : 'a position that is not a word boundary',
      start, end: state.index,
    };
  }
  if (insideClass && ch === 'b') {
    return { type: 'char', value: '\b', escaped: true, description: 'a backspace character', start, end: state.index };
  }
  if (ch === 'u') {
    // \uFFFF or \u{1F600} with the u flag
    if (peek(state) === '{') {
      const close = state.source.indexOf('}', state.index);
      if (close > 0) {
        const hex = state.source.slice(state.index + 1, close);
        state.index = close + 1;
        return codePointNode(hex, start, state.index, 'unicode code point');
      }
    }
    const hex = state.source.slice(state.index, state.index + 4);
    if (/^[0-9a-f]{4}$/i.test(hex)) {
      state.index += 4;
      return codePointNode(hex, start, state.index, 'unicode character');
    }
  }
  if (ch === 'x') {
    const hex = state.source.slice(state.index, state.index + 2);
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      state.index += 2;
      return codePointNode(hex, start, state.index, 'character by hex code');
    }
  }
  if (ch === 'k' && peek(state) === '<') {
    const close = state.source.indexOf('>', state.index);
    if (close > 0) {
      const name = state.source.slice(state.index + 1, close);
      state.index = close + 1;
      return { type: 'backref', name, start, end: state.index };
    }
  }
  if (!insideClass && /[1-9]/.test(ch)) {
    let digits = ch;
    while (/[0-9]/.test(peek(state) || '')) digits += state.source[state.index++];
    return { type: 'backref', number: Number(digits), start, end: state.index };
  }
  if (ch === 'p' || ch === 'P') {
    // Unicode property escapes: valid, but explaining every property honestly
    // would mean shipping the whole Unicode database.
    if (peek(state) === '{') {
      const close = state.source.indexOf('}', state.index);
      if (close > 0) {
        const property = state.source.slice(state.index + 1, close);
        state.index = close + 1;
        const node = { type: 'unsupported', raw: `\\${ch}{${property}}`, reason:
          `a Unicode property escape (${property}) — valid, but not explained here`, start, end: state.index };
        state.unsupported.push(node);
        return node;
      }
    }
  }

  // Any other escape is a literal character: \. \/ \\ \+ and so on.
  return { type: 'char', value: ch, escaped: true, start, end: state.index };
}

function codePointNode(hex, start, end, description) {
  const code = parseInt(hex, 16);
  return {
    type: 'char',
    value: Number.isFinite(code) ? String.fromCodePoint(code) : '',
    escaped: true,
    description: `${description} U+${hex.toUpperCase()}`,
    start, end,
  };
}

function applyQuantifier(state, atom) {
  const ch = peek(state);
  let min, max;
  const start = state.index;

  if (ch === '*') { min = 0; max = Infinity; state.index++; }
  else if (ch === '+') { min = 1; max = Infinity; state.index++; }
  else if (ch === '?') { min = 0; max = 1; state.index++; }
  else if (ch === '{') {
    const match = /^\{(\d+)(,(\d*)?)?\}/.exec(state.source.slice(state.index));
    if (!match) return atom;                        // a literal brace, e.g. /a{b/
    min = Number(match[1]);
    max = match[2] === undefined ? min : (match[3] ? Number(match[3]) : Infinity);
    if (max < min) {
      throw new RegexSyntaxError(`The range {${min},${max}} counts backwards (position ${state.index}).`, state.index);
    }
    state.index += match[0].length;
  } else {
    return atom;
  }

  let lazy = false;
  let possessive = false;
  if (peek(state) === '?') { lazy = true; state.index++; }
  else if (peek(state) === '+') { possessive = true; state.index++; }   // not valid in JS, but be graceful

  if (atom.type === 'anchor') {
    throw new RegexSyntaxError(`Nothing to repeat before position ${start}.`, start);
  }

  return { type: 'quant', min, max, lazy, possessive, child: atom, start: atom.start, end: state.index };
}

function peek(state) {
  return state.source[state.index];
}

/* ------------------------------------------------------------------ *
 * Helpers used by the explainer and the rule interpreter              *
 * ------------------------------------------------------------------ */

/** Flatten a sequence node's items, unwrapping single-branch alternations. */
export function sequenceItems(node) {
  if (!node) return [];
  if (node.type === 'seq') return node.items;
  return [node];
}

export const FLAGS = [
  { flag: 'g', name: 'global', description: 'find every match, not just the first' },
  { flag: 'i', name: 'ignore case', description: 'treat upper and lower case as the same' },
  { flag: 'm', name: 'multiline', description: '^ and $ match at the start and end of each line' },
  { flag: 's', name: 'dot all', description: '. also matches line breaks' },
  { flag: 'u', name: 'unicode', description: 'treat the pattern as unicode code points' },
  { flag: 'y', name: 'sticky', description: 'match only from where the last match ended' },
];
