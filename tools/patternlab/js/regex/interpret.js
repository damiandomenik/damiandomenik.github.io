/* interpret.js — reading password rules out of somebody else's regex.
 *
 * This is the feature most likely to lie, so it is built to refuse instead.
 * It recognises a fixed catalogue of shapes that real password patterns use.
 * Anything outside that catalogue is reported as "not interpreted", with the
 * exact source text, rather than being bent into the nearest known rule.
 *
 * A wrong reading here is worse than no reading: someone would configure a
 * password policy from it.
 */

import { parse, RegexSyntaxError } from '../regex/parser.js';
import { DEFAULT_SPECIALS } from '../password/rules.js';

/**
 * @returns {{ok: false, error: string} |
 *           {ok: true, rules: object|null, findings: Array, gaps: Array, complete: boolean}}
 * finding: {label, kind}
 * gap: {source, reason}
 */
export function interpretRegex(source) {
  if (!source?.trim()) return { ok: true, rules: null, findings: [], gaps: [], complete: true };

  let ast;
  try {
    ({ ast } = parse(source));
  } catch (err) {
    if (err instanceof RegexSyntaxError) return { ok: false, error: err.message };
    return { ok: false, error: err.message };
  }

  const items = ast.type === 'seq' ? [...ast.items] : [ast];
  const findings = [];
  const gaps = [];
  const rules = { minLength: 0, maxLength: 0, upper: 0, lower: 0, digit: 0, special: 0, specialSet: DEFAULT_SPECIALS };

  let sawStart = false;
  let sawEnd = false;
  let sawLength = false;

  for (const item of items) {
    /* anchors */
    if (item.type === 'anchor' && item.kind === 'start') { sawStart = true; continue; }
    if (item.type === 'anchor' && item.kind === 'end') { sawEnd = true; continue; }

    /* lookaheads: the character-class requirements */
    if (item.type === 'group' && item.kind === 'lookahead') {
      const read = readLookahead(item, source);
      if (read) {
        const current = rules[read.key] || 0;
        rules[read.key] = Math.max(current, read.count);
        if (read.key === 'special' && read.set) rules.specialSet = read.set;
        findings.push({ label: read.label, kind: read.key });
      } else {
        gaps.push({ source: slice(source, item), reason: 'this look-ahead does not match a known password requirement' });
      }
      continue;
    }

    if (item.type === 'group' && item.kind === 'neglookahead') {
      gaps.push({ source: slice(source, item), reason: 'a negative look-ahead — it forbids something, which this reader does not translate' });
      continue;
    }

    /* the length part: .{n,} or .{n,m} or [class]{n,} */
    if (item.type === 'quant' && (item.child.type === 'any' || item.child.type === 'class' || item.child.type === 'escapeClass')) {
      rules.minLength = Math.max(rules.minLength, item.min);
      if (item.max !== Infinity) rules.maxLength = item.max;
      sawLength = true;

      if (item.child.type !== 'any') {
        gaps.push({
          source: slice(source, item.child),
          reason: 'the length rule also restricts which characters are allowed, which the rule builder cannot express',
        });
      }
      findings.push({
        label: item.max === Infinity
          ? `minimum ${item.min} characters`
          : `between ${item.min} and ${item.max} characters`,
        kind: 'length',
      });
      continue;
    }

    gaps.push({ source: slice(source, item), reason: describeUnhandled(item) });
  }

  if (!sawStart || !sawEnd) {
    gaps.push({
      source: !sawStart && !sawEnd ? 'missing ^ and $' : (!sawStart ? 'missing ^' : 'missing $'),
      reason: 'without both anchors the pattern can match part of a longer string, so it does not describe a whole password',
    });
  }
  if (!sawLength) {
    gaps.push({ source: 'no length rule', reason: 'nothing in this pattern sets a password length' });
  }

  const anythingFound = findings.length > 0;
  return {
    ok: true,
    rules: anythingFound ? rules : null,
    findings,
    gaps,
    complete: gaps.length === 0 && anythingFound,
  };
}

/* ------------------------------------------------------------------ *
 * The catalogue of shapes we are willing to claim we understand       *
 * ------------------------------------------------------------------ */

const CLASS_MATCHERS = [
  { key: 'upper', label: 'uppercase letter', test: n => isRange(n, 'A', 'Z') },
  { key: 'lower', label: 'lowercase letter', test: n => isRange(n, 'a', 'z') },
  { key: 'digit', label: 'number', test: n => n.type === 'escapeClass' && n.kind === 'd' },
  { key: 'digit', label: 'number', test: n => isRange(n, '0', '9') },
];

function readLookahead(group, source) {
  const body = group.body.type === 'seq' ? group.body.items : [group.body];

  /* Shape A: (?=.*X) — one occurrence of X somewhere */
  if (body.length === 2 && isDotStar(body[0])) {
    const found = classify(body[1]);
    if (found) return { ...found, count: 1, label: `at least one ${found.label}` };
    return null;
  }

  /* Shape B: (?=(?:[^X]*X){n}) — n occurrences of X */
  if (body.length === 1 && body[0].type === 'quant' && body[0].child.type === 'group') {
    const quant = body[0];
    const inner = quant.child.body.type === 'seq' ? quant.child.body.items : [quant.child.body];
    if (inner.length === 2 && inner[0].type === 'quant' && inner[0].max === Infinity) {
      const found = classify(inner[1]);
      if (found && quant.min >= 1) {
        return { ...found, count: quant.min, label: `at least ${quant.min} ${found.label}${quant.min === 1 ? '' : 's'}` };
      }
    }
    return null;
  }

  /* Shape C: (?=.{n,}) — a length rule expressed as a look-ahead */
  if (body.length === 1 && body[0].type === 'quant' && body[0].child.type === 'any') {
    return { key: 'minLength', count: body[0].min, label: `minimum ${body[0].min} characters` };
  }

  return null;
}

function classify(node) {
  for (const matcher of CLASS_MATCHERS) {
    if (matcher.test(node)) return { key: matcher.key, label: matcher.label };
  }
  // A special-character class: anything that is a class of punctuation, or the
  // common "not a letter or digit" negation.
  if (node.type === 'class') {
    if (isNegatedAlnum(node)) return { key: 'special', label: 'special character', set: DEFAULT_SPECIALS };
    const literals = node.parts.filter(p => p.type === 'literal').map(p => p.value);
    if (!node.negated && literals.length === node.parts.length && literals.length > 0
        && literals.every(ch => /[^A-Za-z0-9]/.test(ch))) {
      return { key: 'special', label: 'special character', set: literals.join('') };
    }
  }
  return null;
}

function isDotStar(node) {
  return node.type === 'quant' && node.min === 0 && node.max === Infinity && node.child.type === 'any';
}

function isRange(node, from, to) {
  return node.type === 'class'
    && !node.negated
    && node.parts.length === 1
    && node.parts[0].type === 'range'
    && node.parts[0].from === from
    && node.parts[0].to === to;
}

/** [^A-Za-z0-9] and its common spellings. */
function isNegatedAlnum(node) {
  if (!node.negated) return false;
  const ranges = node.parts.filter(p => p.type === 'range').map(p => `${p.from}-${p.to}`).sort().join(',');
  const escapes = node.parts.filter(p => p.type === 'escapeClass').map(p => p.kind).sort().join(',');
  return ranges === '0-9,A-Z,a-z' || (ranges === 'A-Z,a-z' && escapes === 'd') || escapes === 'w';
}

function describeUnhandled(item) {
  switch (item.type) {
    case 'char': return 'a literal character in the password pattern, which the rule builder has no field for';
    case 'alt': return 'alternatives (|) — the rule builder describes one set of rules, not several';
    case 'group': return 'a group whose contents are not a recognised password requirement';
    case 'backref': return 'a back-reference';
    case 'class': return 'a bare character class outside a length rule';
    default: return 'this part is not one of the shapes the rule builder can express';
  }
}

function slice(source, node) {
  if (node.start === undefined || node.end === undefined) return '(part of the pattern)';
  return source.slice(node.start, node.end);
}
