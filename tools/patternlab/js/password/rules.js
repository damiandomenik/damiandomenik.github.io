/* rules.js — the password rule model, in both directions.
 *
 * A rule set is plain data:
 *   { minLength, maxLength, upper, lower, digit, special, specialSet }
 * where the class fields hold the *required count* (0 means not required).
 *
 * From that we can generate a regex, test a password, and describe the rules
 * in words. The reverse direction — reading rules out of someone else's regex —
 * lives in interpret.js, because it is guesswork with limits and needs to say so.
 */

export const DEFAULT_SPECIALS = '!@#$%^&*()_+-=[]{};:,.<>?/~`|\\\'"';

export const DEFAULT_RULES = Object.freeze({
  minLength: 12,
  maxLength: 0,          // 0 = no upper bound
  upper: 1,
  lower: 1,
  digit: 1,
  special: 1,
  specialSet: DEFAULT_SPECIALS,
});

/** Characters that need escaping inside a regex character class. */
function escapeForClass(text) {
  return [...text].map(ch => (/[\]\\^-]/.test(ch) ? `\\${ch}` : ch)).join('');
}

/**
 * Build a regex from a rule set.
 * Counts above one become `(?=(?:[^X]*X){n})`, which is the only form that
 * reliably counts occurrences in JavaScript.
 */
export function rulesToRegex(rules) {
  const parts = [];

  const requirement = (count, charClass, negatedClass) => {
    if (count <= 0) return null;
    if (count === 1) return `(?=.*${charClass})`;
    return `(?=(?:${negatedClass}*${charClass}){${count}})`;
  };

  const specials = escapeForClass(rules.specialSet || DEFAULT_SPECIALS);

  parts.push(requirement(rules.upper, '[A-Z]', '[^A-Z]'));
  parts.push(requirement(rules.lower, '[a-z]', '[^a-z]'));
  parts.push(requirement(rules.digit, '\\d', '\\D'));
  parts.push(requirement(rules.special, `[${specials}]`, `[^${specials}]`));

  const min = Math.max(0, rules.minLength || 0);
  const max = rules.maxLength > 0 ? rules.maxLength : '';
  const length = max === '' ? `.{${min},}` : `.{${min},${max}}`;

  return `^${parts.filter(Boolean).join('')}${length}$`;
}

/** Human-readable list of the same rules, for the UI and for tests. */
export function describeRules(rules) {
  const out = [];
  if (rules.minLength > 0) out.push(`at least ${rules.minLength} characters`);
  if (rules.maxLength > 0) out.push(`at most ${rules.maxLength} characters`);
  const named = [
    [rules.upper, 'uppercase letter'],
    [rules.lower, 'lowercase letter'],
    [rules.digit, 'number'],
    [rules.special, 'special character'],
  ];
  for (const [count, label] of named) {
    if (count === 1) out.push(`at least one ${label}`);
    else if (count > 1) out.push(`at least ${count} ${label}s`);
  }
  return out;
}

/**
 * Check a password against a rule set directly, without going through a regex.
 * Doing it this way means each rule can be reported separately — a single
 * regex only ever answers yes or no.
 * @returns {{results: Array, passed: number, total: number, ok: boolean}}
 */
export function testPassword(password, rules) {
  const value = password ?? '';
  const specials = new Set(rules.specialSet || DEFAULT_SPECIALS);
  const counts = countClasses(value, specials);
  const results = [];

  if (rules.minLength > 0) {
    results.push({
      label: `Minimum length (${rules.minLength})`,
      ok: value.length >= rules.minLength,
      detail: `${value.length} character${value.length === 1 ? '' : 's'}`,
    });
  }
  if (rules.maxLength > 0) {
    results.push({
      label: `Maximum length (${rules.maxLength})`,
      ok: value.length <= rules.maxLength,
      detail: `${value.length} character${value.length === 1 ? '' : 's'}`,
    });
  }

  const checks = [
    ['upper', 'Uppercase letters', counts.upper],
    ['lower', 'Lowercase letters', counts.lower],
    ['digit', 'Numbers', counts.digit],
    ['special', 'Special characters', counts.special],
  ];
  for (const [key, label, found] of checks) {
    const need = rules[key] || 0;
    if (need <= 0) continue;
    results.push({
      label: need === 1 ? label.replace(/s$/, '') : `${label} (${need})`,
      ok: found >= need,
      detail: `${found} found, ${need} needed`,
    });
  }

  const passed = results.filter(r => r.ok).length;
  return { results, passed, total: results.length, ok: passed === results.length };
}

export function countClasses(value, specials = new Set(DEFAULT_SPECIALS)) {
  const counts = { upper: 0, lower: 0, digit: 0, special: 0, other: 0 };
  for (const ch of value) {
    if (ch >= 'A' && ch <= 'Z') counts.upper++;
    else if (ch >= 'a' && ch <= 'z') counts.lower++;
    else if (ch >= '0' && ch <= '9') counts.digit++;
    else if (specials.has(ch)) counts.special++;
    else counts.other++;
  }
  return counts;
}

/** Is this rule set satisfiable at all? Better to say so than to spin. */
export function validateRules(rules) {
  const problems = [];
  const required = (rules.upper || 0) + (rules.lower || 0) + (rules.digit || 0) + (rules.special || 0);

  if (rules.minLength < 1) problems.push('Minimum length must be at least 1.');
  if (rules.maxLength > 0 && rules.maxLength < rules.minLength) {
    problems.push('The maximum length is smaller than the minimum.');
  }
  if (rules.maxLength > 0 && required > rules.maxLength) {
    problems.push(`The required characters add up to ${required}, which is more than the maximum length of ${rules.maxLength}.`);
  }
  if (required === 0 && rules.minLength === 0) {
    problems.push('These rules do not require anything — every password would pass.');
  }
  if (!rules.specialSet && rules.special > 0) {
    problems.push('Special characters are required but the allowed set is empty.');
  }
  return problems;
}
