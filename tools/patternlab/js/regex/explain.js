/* explain.js — turns a parsed pattern into rows a person can read.
 *
 * Each row is one token: the literal source text, a short label, and a sentence
 * saying what it does. Rows nest, so a group and its contents stay visibly
 * related.
 */

import { parse, RegexSyntaxError } from './parser.js';

/**
 * @returns {{ok: true, rows: Row[], groups: Array, gaps: Array}
 *          | {ok: false, error: string, index: number}}
 * Row: {depth, token, label, detail, kind}
 */
export function explain(source) {
  if (!source) return { ok: true, rows: [], groups: [], gaps: [] };

  let parsed;
  try {
    parsed = parse(source);
  } catch (err) {
    if (err instanceof RegexSyntaxError) return { ok: false, error: err.message, index: err.index };
    return { ok: false, error: err.message, index: 0 };
  }

  const rows = [];
  walk(parsed.ast, 0, rows, source);
  return { ok: true, rows, groups: parsed.groups, gaps: parsed.unsupported };
}

function walk(node, depth, rows, source) {
  if (!node) return;

  switch (node.type) {
    case 'seq': {
      // Runs of plain characters read better as one row than as one row each.
      const items = node.items;
      let run = [];
      const flushRun = () => {
        if (!run.length) return;
        const text = run.map(n => n.value).join('');
        rows.push({
          depth,
          token: source.slice(run[0].start, run[run.length - 1].end),
          label: run.length === 1 ? 'literal character' : 'literal text',
          detail: run.length === 1 && run[0].description
            ? run[0].description
            : `matches exactly "${text}"`,
          kind: 'literal',
        });
        run = [];
      };

      for (const item of items) {
        if (item.type === 'char' && !item.description) run.push(item);
        else { flushRun(); walk(item, depth, rows, source); }
      }
      flushRun();
      return;
    }

    case 'alt': {
      rows.push({
        depth, token: '|', label: 'alternatives',
        detail: `one of ${node.branches.length} options, tried left to right`,
        kind: 'structure',
      });
      node.branches.forEach((branch, i) => {
        rows.push({ depth: depth + 1, token: `option ${i + 1}`, label: '', detail: '', kind: 'branch' });
        walk(branch, depth + 2, rows, source);
      });
      return;
    }

    case 'char':
      rows.push({
        depth, token: source.slice(node.start, node.end), label: 'literal character',
        detail: node.description || `matches exactly "${node.value}"`,
        kind: 'literal',
      });
      return;

    case 'escapeClass':
      rows.push({
        depth, token: source.slice(node.start, node.end), label: node.label,
        detail: node.description, kind: 'class',
      });
      return;

    case 'any':
      rows.push({
        depth, token: '.', label: 'any character',
        detail: 'any single character except a line break (unless the s flag is on)',
        kind: 'class',
      });
      return;

    case 'anchor':
      rows.push({
        depth, token: source.slice(node.start, node.end), label: 'position',
        detail: node.description, kind: 'anchor',
      });
      return;

    case 'class':
      rows.push({
        depth, token: node.raw, label: node.negated ? 'any character except' : 'character class',
        detail: describeClass(node), kind: 'class',
      });
      return;

    case 'group': {
      rows.push({ depth, token: groupToken(node), label: groupLabel(node), detail: groupDetail(node), kind: 'group' });
      walk(node.body, depth + 1, rows, source);
      return;
    }

    case 'backref':
      rows.push({
        depth, token: source.slice(node.start, node.end), label: 'back-reference',
        detail: node.name
          ? `the same text that the group named "${node.name}" matched`
          : `the same text that group ${node.number} matched`,
        kind: 'structure',
      });
      return;

    case 'quant': {
      walk(node.child, depth, rows, source);
      rows.push({
        depth: depth + 1,
        token: source.slice(node.child.end, node.end),
        label: 'repetition',
        detail: describeQuantifier(node),
        kind: 'quantifier',
      });
      return;
    }

    case 'unsupported':
      rows.push({
        depth, token: node.raw, label: 'not explained',
        detail: node.reason, kind: 'gap',
      });
      return;
  }
}

function describeClass(node) {
  const pieces = node.parts.map(part => {
    if (part.type === 'range') return `${part.from} to ${part.to}`;
    if (part.type === 'escapeClass') return part.description;
    if (part.type === 'unsupported') return `${part.raw} (not explained)`;
    return `"${part.value}"`;
  });
  const list = joinList(pieces);
  return node.negated
    ? `any single character that is not ${list}`
    : `any single character from ${list}`;
}

function describeQuantifier(node) {
  const { min, max, lazy } = node;

  if (min === 0 && max === 1) {
    return lazy
      ? 'the previous item is optional, and is skipped if the match works without it'
      : 'the previous item is optional — zero or one time';
  }

  let text;
  if (min === 0 && max === Infinity) text = 'zero or more times';
  else if (min === 1 && max === Infinity) text = 'one or more times';
  else if (max === Infinity) text = `at least ${min} time${min === 1 ? '' : 's'}`;
  else if (min === max) text = `exactly ${min} time${min === 1 ? '' : 's'}`;
  else text = `between ${min} and ${max} times`;

  // The greedy/lazy note only means something when there is a choice to make.
  if (min !== max) text += lazy ? ', preferring as few as possible' : ', preferring as many as possible';
  return `repeat the previous item ${text}`;
}

function groupToken(node) {
  switch (node.kind) {
    case 'named': return `(?<${node.name}>…)`;
    case 'noncapture': return '(?:…)';
    case 'lookahead': return '(?=…)';
    case 'neglookahead': return '(?!…)';
    case 'lookbehind': return '(?<=…)';
    case 'neglookbehind': return '(?<!…)';
    default: return '(…)';
  }
}

function groupLabel(node) {
  switch (node.kind) {
    case 'named': return `named group "${node.name}"`;
    case 'noncapture': return 'group (not captured)';
    case 'lookahead': return 'look ahead';
    case 'neglookahead': return 'negative look ahead';
    case 'lookbehind': return 'look behind';
    case 'neglookbehind': return 'negative look behind';
    default: return `capture group ${node.number}`;
  }
}

function groupDetail(node) {
  switch (node.kind) {
    case 'named':
      return `groups these items and remembers what they matched under the name "${node.name}"`;
    case 'noncapture':
      return 'groups these items together without remembering the result';
    case 'lookahead':
      return 'the text after this point must match what follows, but that text is not consumed';
    case 'neglookahead':
      return 'the text after this point must NOT match what follows';
    case 'lookbehind':
      return 'the text before this point must match what follows, reading backwards';
    case 'neglookbehind':
      return 'the text before this point must NOT match what follows';
    default:
      return `groups these items and remembers what they matched as group ${node.number}`;
  }
}

function joinList(items) {
  if (items.length === 0) return 'nothing';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
