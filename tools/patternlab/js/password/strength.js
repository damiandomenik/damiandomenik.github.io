/* strength.js — how hard is this password to guess?
 *
 * Counting satisfied rules is the usual approach and it is misleading:
 * "Password1!" satisfies every rule and falls in seconds. What matters is how
 * many guesses an attacker needs, so that is what gets estimated.
 *
 * The method, in short: scan the password left to right, greedily matching the
 * predictable pieces — a common password, a dictionary word, a run like "abcd",
 * a repeat like "aaaa", a year. Each matched piece contributes the number of
 * guesses it would actually cost, not the number its length suggests. Whatever
 * is left over counts as random characters from the pools in use.
 *
 * This is a simplified relative of zxcvbn, written from scratch to avoid a
 * dependency. It is an estimate, and the UI says so: no offline tool can know
 * whether a password has appeared in a breach.
 */

const COMMON_PASSWORDS = `123456 password 123456789 12345678 12345 qwerty 1234567 111111 1234567890 123123
abc123 1234 password1 iloveyou 1q2w3e4r 000000 qwerty123 zaq12wsx dragon sunshine princess letmein 654321
monkey 27653 1qaz2wsx 123321 qwertyuiop superman asdfghjkl football welcome admin passw0rd master hello
freedom whatever qazwsx trustno1 batman zaq1zaq1 baseball shadow michael jennifer jordan hunter harley
ranger buster soccer hockey killer george sexy andrew charlie thomas robert access love ashley bailey
pepper daniel matrix mustang chelsea diamond yellow silver internet samantha golfer heather hammer summer
corvette taylor austin thunder maggie brandy compaq secret merlin cowboy matthew ferrari jasmine winter
banana chicken maverick nicole junior purple scooter phoenix tigger amanda ginger flower jessica
starwars computer michelle rainbow cookie orange asdfgh test guest changeme default temp123 letmein123
qwe123 azerty motdepasse passwort geheim schatz sommer winter2024 password123 admin123 root toor
p@ssw0rd p@ssword pa55word passw0rd1 welcome1 abcd1234 a1b2c3 monkey123 iloveyou1`
  .split(/\s+/).filter(Boolean);

const COMMON_WORDS = `love god money life summer winter spring autumn happy family friend school house home
world music dance angel star moon sun fire water earth heart blue red green black white silver gold
january february march april may june july august september october november december monday friday
berlin london paris tokyo york vienna zurich munich hamburg cologne bayern liverpool chelsea arsenal
apple google amazon microsoft samsung android windows linux gmail yahoo facebook twitter tiktok
peter thomas michael andreas stefan martin markus daniel christian alexander maximilian sebastian
anna maria julia laura sarah lisa lena sophie hannah emma mia nina katharina claudia sabine
hund katze maus vogel pferd blume baum wald berg meer strand sonne mond stern himmel
passwort kennwort geheim liebe freund schule arbeit urlaub`
  .split(/\s+/).filter(Boolean);

const KEYBOARD_ROWS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'qwertzuiop', 'yxcvbnm',                   // German layout
  '1234567890', '!"§$%&/()=',
];

const LEET = { 4: 'a', '@': 'a', 3: 'e', 1: 'i', '!': 'i', 0: 'o', 5: 's', $: 's', 7: 't', '+': 't', 8: 'b' };

/**
 * @returns {{
 *   length, counts, poolSize, bits, score, label,
 *   matches: Array, warnings: Array, suggestions: Array, crackTimes: object
 * }}
 */
export function analyzePassword(password) {
  const value = password ?? '';
  const counts = classCounts(value);
  const poolSize = poolFor(counts);

  const { bits, matches } = estimateBits(value, poolSize);
  const { score, label } = scoreFor(bits, value.length);
  const warnings = buildWarnings(value, counts, matches);
  const suggestions = buildSuggestions(value, counts, matches, bits);

  return {
    length: value.length,
    counts,
    poolSize,
    bits,
    score,
    label,
    matches,
    warnings,
    suggestions,
    crackTimes: crackTimes(bits),
  };
}

/* ------------------------------------------------------------------ *
 * Character classes                                                   *
 * ------------------------------------------------------------------ */

export function classCounts(value) {
  const counts = { lower: 0, upper: 0, digit: 0, symbol: 0, other: 0 };
  for (const ch of value) {
    if (ch >= 'a' && ch <= 'z') counts.lower++;
    else if (ch >= 'A' && ch <= 'Z') counts.upper++;
    else if (ch >= '0' && ch <= '9') counts.digit++;
    else if (ch.charCodeAt(0) < 128) counts.symbol++;
    else counts.other++;
  }
  return counts;
}

function poolFor(counts) {
  let pool = 0;
  if (counts.lower) pool += 26;
  if (counts.upper) pool += 26;
  if (counts.digit) pool += 10;
  if (counts.symbol) pool += 33;
  if (counts.other) pool += 100;          // conservative for anything beyond ASCII
  return pool || 1;
}

/* ------------------------------------------------------------------ *
 * Pattern scan                                                        *
 * ------------------------------------------------------------------ */

function estimateBits(value, poolSize) {
  if (!value) return { bits: 0, matches: [] };

  const perChar = Math.log2(poolSize);
  const matches = [];
  let bits = 0;
  let i = 0;

  while (i < value.length) {
    const match = longestMatchAt(value, i);
    if (match && match.length >= 3) {
      // A recognised chunk costs what it costs to guess, not what its length
      // suggests. That is the whole point of the exercise.
      bits += Math.log2(Math.max(2, match.guesses));
      matches.push({ ...match, start: i });
      i += match.length;
    } else {
      bits += perChar;
      i++;
    }
  }
  return { bits: Math.round(bits * 10) / 10, matches };
}

function longestMatchAt(value, start) {
  const candidates = [
    matchCommonPassword(value, start),
    matchWord(value, start),
    matchSequence(value, start),
    matchRepeat(value, start),
    matchKeyboard(value, start),
    matchYear(value, start),
  ].filter(Boolean);

  if (!candidates.length) return null;
  // Prefer the longest explanation; on a tie, the cheapest one to guess.
  candidates.sort((a, b) => b.length - a.length || a.guesses - b.guesses);
  return candidates[0];
}

function matchCommonPassword(value, start) {
  const rest = value.slice(start).toLowerCase();
  let best = null;
  for (let index = 0; index < COMMON_PASSWORDS.length; index++) {
    const candidate = COMMON_PASSWORDS[index];
    if (candidate.length >= 4 && rest.startsWith(candidate)) {
      if (!best || candidate.length > best.length) {
        best = { kind: 'common', token: value.slice(start, start + candidate.length), length: candidate.length, guesses: index + 1 };
      }
    }
  }
  return best;
}

function matchWord(value, start) {
  const rest = deLeet(value.slice(start).toLowerCase());
  let best = null;
  for (let index = 0; index < COMMON_WORDS.length; index++) {
    const word = COMMON_WORDS[index];
    if (word.length >= 4 && rest.startsWith(word)) {
      if (!best || word.length > best.length) {
        const token = value.slice(start, start + word.length);
        // Capitalisation and leet substitution multiply the guesses a little,
        // but nothing like as much as people assume.
        const variants = variantMultiplier(token);
        best = { kind: 'word', token, length: word.length, guesses: (index + 1) * 100 * variants };
      }
    }
  }
  return best;
}

function variantMultiplier(token) {
  let multiplier = 1;
  if (/[A-Z]/.test(token)) multiplier *= /^[A-Z][a-z]*$/.test(token) ? 2 : 8;
  if (/[0-9@$!+]/.test(token)) multiplier *= 4;
  return multiplier;
}

function matchSequence(value, start) {
  const step = (a, b) => b.charCodeAt(0) - a.charCodeAt(0);
  let direction = 0;
  let length = 1;

  for (let i = start + 1; i < value.length; i++) {
    const delta = step(value[i - 1], value[i]);
    if (i === start + 1) {
      if (delta !== 1 && delta !== -1) break;
      direction = delta;
    } else if (delta !== direction) break;
    length++;
  }
  if (length < 3) return null;
  const token = value.slice(start, start + length);
  if (!/^[a-zA-Z]+$|^[0-9]+$/.test(token)) return null;
  return { kind: 'sequence', token, length, guesses: length * 20 };
}

function matchRepeat(value, start) {
  let length = 1;
  while (start + length < value.length && value[start + length] === value[start]) length++;
  if (length < 3) return null;
  return { kind: 'repeat', token: value.slice(start, start + length), length, guesses: 30 * length };
}

function matchKeyboard(value, start) {
  const lower = value.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (const source of [row, [...row].reverse().join('')]) {
      let length = 0;
      while (start + length < lower.length
             && source.indexOf(lower.slice(start, start + length + 1)) >= 0) length++;
      if (length >= 4) {
        return { kind: 'keyboard', token: value.slice(start, start + length), length, guesses: 100 * length };
      }
    }
  }
  return null;
}

function matchYear(value, start) {
  const chunk = value.slice(start, start + 4);
  if (/^(19|20)\d\d$/.test(chunk)) return { kind: 'year', token: chunk, length: 4, guesses: 130 };
  return null;
}

function deLeet(text) {
  return [...text].map(ch => LEET[ch] ?? ch).join('');
}

/* ------------------------------------------------------------------ *
 * Verdict                                                             *
 * ------------------------------------------------------------------ */

function scoreFor(bits, length) {
  if (length === 0) return { score: 0, label: 'Empty' };
  if (bits < 28) return { score: 0, label: 'Very weak' };
  if (bits < 40) return { score: 1, label: 'Weak' };
  if (bits < 56) return { score: 2, label: 'Fair' };
  if (bits < 76) return { score: 3, label: 'Strong' };
  return { score: 4, label: 'Excellent' };
}

const SCENARIOS = [
  { key: 'online', label: 'Online, rate limited', rate: 100 / 3600 },
  { key: 'slowHash', label: 'Stolen database, slow hashing (bcrypt)', rate: 1e4 },
  { key: 'fastHash', label: 'Stolen database, fast hashing (unsalted)', rate: 1e11 },
];

function crackTimes(bits) {
  // Expected work is half the keyspace.
  const guesses = Math.pow(2, Math.min(bits, 200)) / 2;
  const out = {};
  for (const scenario of SCENARIOS) {
    out[scenario.key] = { label: scenario.label, seconds: guesses / scenario.rate, text: humanTime(guesses / scenario.rate) };
  }
  return out;
}

export function humanTime(seconds) {
  if (!Number.isFinite(seconds)) return 'longer than the universe has existed';
  if (seconds < 1) return 'instantly';
  const units = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [365, 'day'],
    [100, 'year'], [10, 'century'],
  ];
  let value = seconds;
  let unit = 'second';
  for (const [factor, name] of units) {
    unit = name;
    if (value < factor) break;
    value /= factor;
  }
  if (unit === 'century' && value > 1000) return 'longer than the universe has existed';
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded.toLocaleString()} ${unit}${rounded === 1 ? '' : (unit === 'century' ? 'ies' : 's')}`.replace('centuryies', 'centuries');
}

function buildWarnings(value, counts, matches) {
  const warnings = [];
  if (!value) return warnings;

  const common = matches.find(m => m.kind === 'common' && m.length === value.length);
  if (common) warnings.push('This is one of the most commonly used passwords in the world. It would be guessed immediately.');
  else if (matches.some(m => m.kind === 'common')) warnings.push('This starts with a very common password, which barely slows an attacker down.');

  if (matches.some(m => m.kind === 'word')) warnings.push('It contains a dictionary word. Swapping letters for numbers (a→4, e→3) is a substitution attackers try first.');
  if (matches.some(m => m.kind === 'sequence')) warnings.push('It contains a run of consecutive characters, like "abcd" or "1234".');
  if (matches.some(m => m.kind === 'keyboard')) warnings.push('It contains a keyboard pattern, like "qwerty" or "asdf".');
  if (matches.some(m => m.kind === 'repeat')) warnings.push('It repeats the same character several times in a row.');
  if (matches.some(m => m.kind === 'year')) warnings.push('It contains something that looks like a year. Attackers try every year first.');

  const used = ['lower', 'upper', 'digit', 'symbol'].filter(key => counts[key] > 0);
  if (used.length === 1 && value.length < 20) {
    warnings.push('Every character comes from the same group, which shrinks the search space considerably.');
  }
  if (value.length < 8) warnings.push('Under eight characters is short enough to fall to brute force alone.');
  return warnings;
}

function buildSuggestions(value, counts, matches, bits) {
  const suggestions = [];
  if (!value) return suggestions;

  if (value.length < 16) suggestions.push('Length helps more than variety. Adding four characters beats adding a symbol.');
  if (matches.some(m => m.kind === 'word' || m.kind === 'common')) {
    suggestions.push('Avoid words as the backbone. Several unrelated words together work far better than one word decorated with symbols.');
  }
  if (!counts.upper && !counts.symbol && value.length < 20) suggestions.push('Mixing in another character group widens the search space.');
  if (bits >= 76) suggestions.push('This is already well beyond what brute force can reach. Use a password manager so you never have to remember it.');
  return suggestions;
}
