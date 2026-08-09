/* match.js — running a pattern against text, safely.
 *
 * Two hazards worth naming:
 *
 * 1. A global regex with a zero-width match (`/a*​/g`) never advances, so the
 *    naive loop hangs the tab. lastIndex is nudged forward by hand.
 * 2. Catastrophic backtracking (`/(a+)+b/` against a long string of a's) can
 *    freeze the browser for minutes. It cannot be detected up front — that is
 *    the halting problem — so the input text is capped and the match count is
 *    limited, and the UI says why when a limit is hit.
 */

const MAX_MATCHES = 5000;
const MAX_TEXT_LENGTH = 200_000;

/**
 * @returns {{ok: true, matches: Array, truncated: boolean, tooLong: boolean}
 *          | {ok: false, error: string}}
 * match: {value, start, end, groups: Array, named: object}
 */
export function findMatches(pattern, flags, text) {
  if (!pattern) return { ok: true, matches: [], truncated: false, tooLong: false, isGlobal: flags.includes('g') };

  // The g flag has to mean something here. Silently forcing it on would show
  // every match whether or not the user asked for global matching, which is
  // exactly the misunderstanding a playground should be clearing up.
  const isGlobal = flags.includes('g');

  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch (err) {
    return { ok: false, error: friendlyRegexError(err.message) };
  }

  const tooLong = text.length > MAX_TEXT_LENGTH;
  const subject = tooLong ? text.slice(0, MAX_TEXT_LENGTH) : text;

  const matches = [];
  let truncated = false;
  let guard = 0;

  regex.lastIndex = 0;
  let found;
  while ((found = regex.exec(subject)) !== null) {
    const stopAfterThis = !isGlobal;
    matches.push({
      value: found[0],
      start: found.index,
      end: found.index + found[0].length,
      groups: found.slice(1).map((value, index) => ({ number: index + 1, value })),
      named: found.groups ? { ...found.groups } : null,
    });

    // Without g, exec has no lastIndex to advance and would return the same
    // match forever.
    if (stopAfterThis) break;

    // Zero-length match: step forward or loop forever.
    if (found.index === regex.lastIndex) regex.lastIndex++;
    if (++guard >= MAX_MATCHES) { truncated = true; break; }
  }

  return { ok: true, matches, truncated, tooLong, isGlobal };
}

/**
 * Split text into plain and highlighted runs, so the view can build nodes
 * without touching innerHTML.
 * @returns {Array<{text: string, matchIndex: number|null}>}
 */
export function segments(text, matches) {
  if (!matches.length) return [{ text, matchIndex: null }];

  const out = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) out.push({ text: text.slice(cursor, match.start), matchIndex: null });
    // A zero-width match has nothing to paint; skip it rather than emit an
    // empty span that would look like a rendering bug.
    if (match.end > match.start) out.push({ text: text.slice(match.start, match.end), matchIndex: index });
    cursor = Math.max(cursor, match.end);
  });
  if (cursor < text.length) out.push({ text: text.slice(cursor), matchIndex: null });
  return out;
}

/** Does the whole string match, anchored? Used by the test-case runner. */
export function testsAgainst(pattern, flags, value) {
  try {
    const regex = new RegExp(pattern, flags.replace(/[gy]/g, ''));
    return { ok: true, matched: regex.test(value) };
  } catch (err) {
    return { ok: false, error: friendlyRegexError(err.message) };
  }
}

/** The engine's messages are terse and positionless. Make them readable. */
export function friendlyRegexError(message) {
  const text = String(message).replace(/^Invalid regular expression:?\s*/i, '').replace(/^\/.*\/[a-z]*:\s*/, '');
  const table = [
    [/Unterminated group/i, 'A group was opened with ( and never closed with ).'],
    [/Unmatched '\)'/i, 'There is a closing ) with no matching (.'],
    [/Unterminated character class/i, 'A character class was opened with [ and never closed with ].'],
    [/Nothing to repeat/i, 'A quantifier (* + ? {n}) has nothing before it to repeat.'],
    [/Invalid group/i, 'The (? group syntax here is not valid in JavaScript.'],
    [/numbers out of order/i, 'A {min,max} range counts backwards — the first number must be the smaller one.'],
    [/Invalid escape/i, 'A backslash escape here is not valid.'],
    [/Lone quantifier brackets/i, 'A { or } is used in a way JavaScript cannot read as a quantifier.'],
    [/Invalid flags/i, 'Those flags are not a valid combination.'],
  ];
  for (const [pattern, explanation] of table) {
    if (pattern.test(text)) return explanation;
  }
  return text ? `Invalid regular expression: ${text}` : 'Invalid regular expression.';
}
