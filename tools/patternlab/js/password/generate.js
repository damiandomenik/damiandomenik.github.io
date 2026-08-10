/* generate.js — passwords from crypto.getRandomValues, satisfying real rules.
 *
 * Two things matter here and both are easy to get subtly wrong:
 *
 * 1. Unbiased selection. `crypto.getRandomValues(...) % poolSize` skews toward
 *    the lower end of the pool whenever 256 is not a multiple of poolSize.
 *    randomInt below uses rejection sampling instead.
 *
 * 2. Actually meeting the rules. Generating at random and retrying until the
 *    rules happen to be satisfied is slow and, worse, can loop forever on rules
 *    nothing can satisfy. Instead the required characters are drawn first and
 *    the result is shuffled, so the rules hold by construction.
 */

import { DEFAULT_SPECIALS, countClasses } from './rules.js';

export const POOLS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
};

/** Characters people mistake for one another when reading a password aloud. */
export const AMBIGUOUS = 'Il1O0o|`\'"{}[]()/\\;:,.<>~';

export class ImpossibleRules extends Error {
  constructor(message) { super(message); this.name = 'ImpossibleRules'; }
}

/** Uniform integer in [0, max) with no modulo bias. */
export function randomInt(max) {
  if (max <= 0) throw new RangeError('max must be positive');
  if (max === 1) return 0;

  const limit = Math.floor(256 / max) * max;      // largest usable multiple
  const buffer = new Uint8Array(1);
  for (let attempt = 0; attempt < 1000; attempt++) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
  // Astronomically unlikely; fall back to a wider draw rather than loop forever.
  const wide = new Uint32Array(1);
  crypto.getRandomValues(wide);
  return wide[0] % max;
}

export function pick(pool) {
  return pool[randomInt(pool.length)];
}

/** Fisher–Yates, with the same unbiased source. */
export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * @param {object} options
 *   length            desired length (raised to fit the requirements if needed)
 *   maxLength         hard upper bound; 0 means none
 *   upper/lower/digit/special  minimum count of each class; 0 disables the class
 *   specialSet        which symbols are allowed
 *   excludeAmbiguous  drop lookalike characters
 *   noRepeat          never use the same character twice
 *   allowUnrequired   when nothing is required, draw from every class anyway
 * @returns {{password: string, length: number, notes: string[]}}
 */
export function generatePassword(options = {}) {
  const {
    length = 16,
    maxLength = 0,
    upper = 1, lower = 1, digit = 1, special = 1,
    specialSet = DEFAULT_SPECIALS,
    excludeAmbiguous = false,
    noRepeat = false,
    allowUnrequired = false,
  } = options;

  const notes = [];
  const filter = text => (excludeAmbiguous ? [...text].filter(ch => !AMBIGUOUS.includes(ch)).join('') : text);

  const everyClass = [
    { key: 'upper', need: upper, pool: filter(POOLS.upper) },
    { key: 'lower', need: lower, pool: filter(POOLS.lower) },
    { key: 'digit', need: digit, pool: filter(POOLS.digit) },
    { key: 'special', need: special, pool: filter(specialSet || '') },
  ];

  let classes = everyClass.filter(entry => entry.need > 0);

  if (!classes.length) {
    // "At least 18 characters, nothing else" is a perfectly ordinary policy.
    // Requiring no particular class is not the same as forbidding every class,
    // so a rule set like that draws from everything rather than being refused.
    if (!allowUnrequired) {
      throw new ImpossibleRules('No character types are enabled, so there is nothing to build a password from.');
    }
    classes = everyClass.filter(entry => entry.pool.length);
    if (!classes.length) throw new ImpossibleRules('No characters are available to build a password from.');
    notes.push('These rules require no particular character type, so all of them are used.');
  }

  for (const entry of classes) {
    if (!entry.pool.length) {
      throw new ImpossibleRules(
        `${entry.key} characters are required, but excluding ambiguous characters leaves none available.`
      );
    }
    if (noRepeat && entry.need > entry.pool.length) {
      throw new ImpossibleRules(
        `${entry.need} different ${entry.key} characters are required, but only ${entry.pool.length} are available without repeats.`
      );
    }
  }

  const required = classes.reduce((sum, entry) => sum + entry.need, 0);

  // A maximum length is a rule like any other. Quietly exceeding it produces a
  // password that fails the very rules that asked for it.
  if (maxLength > 0 && required > maxLength) {
    throw new ImpossibleRules(
      `The required characters add up to ${required}, but the maximum length is ${maxLength}. No password can satisfy both.`
    );
  }

  let finalLength = Math.max(length, required);
  if (finalLength > length) {
    notes.push(`Length raised to ${finalLength} to fit the required characters.`);
  }
  if (maxLength > 0 && finalLength > maxLength) {
    notes.push(`Length reduced to ${maxLength} — your rules cap it there.`);
    finalLength = maxLength;
  }

  const combined = [...new Set(classes.flatMap(entry => [...entry.pool]))].join('');
  if (noRepeat && finalLength > combined.length) {
    throw new ImpossibleRules(
      `A ${finalLength}-character password with no repeated characters needs at least ${finalLength} distinct characters, but only ${combined.length} are available.`
    );
  }

  const used = new Set();
  const chars = [];

  const draw = (pool) => {
    if (!noRepeat) return pick(pool);
    const available = [...pool].filter(ch => !used.has(ch));
    if (!available.length) throw new ImpossibleRules('Ran out of unused characters while avoiding repeats.');
    const chosen = available[randomInt(available.length)];
    used.add(chosen);
    return chosen;
  };

  // Requirements first, so they are guaranteed rather than hoped for.
  for (const entry of classes) {
    for (let i = 0; i < entry.need; i++) chars.push(draw(entry.pool));
  }
  while (chars.length < finalLength) chars.push(draw(combined));

  const password = shuffle(chars).join('');

  // Belt and braces: confirm the result against the rules that produced it.
  const counts = countClasses(password, new Set(specialSet || DEFAULT_SPECIALS));
  for (const entry of classes) {
    if ((counts[entry.key] || 0) < entry.need) {
      throw new Error('Internal error: the generated password did not meet its own rules.');
    }
  }

  return { password, length: password.length, notes };
}

/** Turn a rule set from rules.js into generator options. */
export function optionsFromRules(rules, extra = {}) {
  const requiresNothing = !(rules.upper || rules.lower || rules.digit || rules.special);
  return {
    allowUnrequired: requiresNothing,
    length: Math.max(rules.minLength || 0, extra.length || 0),
    maxLength: rules.maxLength || 0,
    upper: rules.upper || 0,
    lower: rules.lower || 0,
    digit: rules.digit || 0,
    special: rules.special || 0,
    specialSet: rules.specialSet || DEFAULT_SPECIALS,
    excludeAmbiguous: extra.excludeAmbiguous ?? false,
    noRepeat: extra.noRepeat ?? false,
  };
}
