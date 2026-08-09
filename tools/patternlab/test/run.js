/* PatternLab core tests. Run: node test/run.js */

globalThis.crypto ??= (await import('node:crypto')).webcrypto;

const { explain } = await import('../js/regex/explain.js');
const { parse, RegexSyntaxError } = await import('../js/regex/parser.js');
const { interpretRegex } = await import('../js/regex/interpret.js');
const { findMatches, segments, testsAgainst, friendlyRegexError } = await import('../js/regex/match.js');
const { rulesToRegex, testPassword, validateRules, DEFAULT_RULES } = await import('../js/password/rules.js');
const { analyzePassword } = await import('../js/password/strength.js');
const { generatePassword, randomInt, ImpossibleRules } = await import('../js/password/generate.js');

let passed = 0, failed = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : `\n         got  ${JSON.stringify(actual)}\n         want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
};
const t = (label, value) => { console.log(`${value ? '  ok  ' : ' FAIL '} ${label}`); value ? passed++ : failed++; };
const rows = src => explain(src).rows;
const detail = (src, i) => rows(src)[i]?.detail;

/* ------------------------------------------------------------------ */

console.log('\nparsing');
eq('literal run kept together', rows('AZ-')[0].token, 'AZ-');
eq('escape class recognised', rows('\\d')[0].label, 'digit');
eq('exact repetition', detail('\\d{5}', 1), 'repeat the previous item exactly 5 times');
eq('open-ended repetition', detail('\\d{5,}', 1), 'repeat the previous item at least 5 times, preferring as many as possible');
eq('bounded repetition', detail('a{2,4}', 1), 'repeat the previous item between 2 and 4 times, preferring as many as possible');
eq('lazy repetition', detail('a{2,4}?', 1), 'repeat the previous item between 2 and 4 times, preferring as few as possible');
eq('optional reads naturally', detail('a?', 1), 'the previous item is optional — zero or one time');
eq('named group named', rows('(?<year>\\d{4})')[0].label, 'named group "year"');
eq('lookahead labelled', rows('(?=x)')[0].label, 'look ahead');
eq('negative lookbehind labelled', rows('(?<!x)')[0].label, 'negative look behind');
eq('character class described', rows('[a-z0-9_]')[0].detail, 'any single character from a to z, 0 to 9 or "_"');
eq('negated class described', rows('[^aeiou]')[0].detail, 'any single character that is not "a", "e", "i", "o" or "u"');
eq('word boundary explained', rows('\\b')[0].label, 'position');
eq('backreference explained', rows('(a)\\1')[2].detail, 'the same text that group 1 matched');
eq('alternation counted', rows('a|b|c')[0].detail, 'one of 3 options, tried left to right');
eq('capture groups reported', explain('(a)(?<b>c)').groups.map(g => g.number), [1, 2]);

console.log('\nparser refuses to guess');
{
  const result = explain('\\p{Script=Greek}');
  eq('unicode property marked as a gap', result.gaps.length, 1);
  eq('and shown honestly', result.rows[0].label, 'not explained');
}

console.log('\nbroken patterns produce messages, not crashes');
for (const [pattern, expected] of [
  ['(unclosed', /never closed/],
  ['[a-z', /Missing closing \]/],
  ['a**', /nothing before it/],
  ['a{3,1}', /counts backwards/],
  ['\\', /lone backslash/],
]) {
  const result = explain(pattern);
  t(`/${pattern}/ → ${result.ok ? 'NO ERROR' : result.error}`, !result.ok && expected.test(result.error));
}
t('a valid pattern with a literal brace still parses', explain('\\d{4').ok);

console.log('\nmatching');
{
  const text = 'Aktenzeichen: AZ-12345/2026 und AZ-92831/2025';
  const result = findMatches('AZ-\\d{5}/\\d{4}', 'g', text);
  eq('two matches found', result.matches.length, 2);
  eq('first value', result.matches[0].value, 'AZ-12345/2026');
  eq('position reported', [result.matches[0].start, result.matches[0].end], [14, 27]);

  const named = findMatches('(?<y>\\d{4})-(?<m>\\d{2})', 'g', '2026-03').matches[0];
  eq('named groups captured', named.named, { y: '2026', m: '03' });
  eq('numbered groups captured', named.groups.map(g => g.value), ['2026', '03']);

  const parts = segments(text, result.matches);
  eq('text splits into highlight runs', parts.filter(p => p.matchIndex !== null).length, 2);
  eq('and rebuilds the original exactly', parts.map(p => p.text).join(''), text);
}

console.log('\nthe g flag actually does something');
{
  eq('without g, searching stops at the first match', findMatches('a', '', 'aAa').matches.length, 1);
  eq('with g, every match is found', findMatches('a', 'g', 'aAa').matches.length, 2);
  eq('with gi, case is ignored too', findMatches('a', 'gi', 'aAa').matches.length, 3);
  t('the view can tell which mode it is in', findMatches('a', '', 'aaa').isGlobal === false);
  eq('a zero-width pattern without g returns one match', findMatches('a*', '', 'bbb').matches.length, 1);
}

console.log('\nmatching cannot hang the page');
{
  // A zero-width global match is the classic infinite loop.
  const result = findMatches('a*', 'g', 'bbb');
  t('zero-width matches terminate', result.ok && result.matches.length <= 4);
  const many = findMatches('a', 'g', 'a'.repeat(6000));
  t('match count is capped', many.truncated === true && many.matches.length === 5000);
  const long = findMatches('x', 'g', 'x'.repeat(250_000));
  t('oversized input is capped and reported', long.tooLong === true);
}

console.log('\nregex error messages are readable');
eq('unterminated group', friendlyRegexError('Invalid regular expression: /(/: Unterminated group'),
   'A group was opened with ( and never closed with ).');
eq('nothing to repeat', friendlyRegexError('Nothing to repeat'),
   'A quantifier (* + ? {n}) has nothing before it to repeat.');

console.log('\nrules → regex');
{
  const regex = rulesToRegex({ ...DEFAULT_RULES, minLength: 12 });
  eq('classic policy pattern', regex, '^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[!@#$%\\^&*()_+\\-=[\\]{};:,.<>?/~`|\\\\\'"]).{12,}$');
  t('is a valid RegExp', (() => { try { new RegExp(regex); return true; } catch { return false; } })());
  t('accepts a conforming password', new RegExp(regex).test('Max!Haus2026'));
  t('rejects one without a symbol', !new RegExp(regex).test('MaxHaus20261'));
  t('rejects one that is too short', !new RegExp(regex).test('Max!Ha1'));

  const counted = rulesToRegex({ minLength: 20, maxLength: 0, upper: 2, lower: 2, digit: 3, special: 2, specialSet: '!@#' });
  t('counted requirements are enforced', new RegExp(counted).test('AAbb111!!xxxxxxxxxxxx'));
  t('and rejected when short of the count', !new RegExp(counted).test('Abb111!!xxxxxxxxxxxxx'));

  const bounded = rulesToRegex({ minLength: 8, maxLength: 16, upper: 1, lower: 0, digit: 1, special: 0, specialSet: '' });
  t('maximum length is enforced', !new RegExp(bounded).test('A1' + 'x'.repeat(20)));
}

console.log('\nregex → rules, when it can be trusted');
{
  const result = interpretRegex('^(?=.*[A-Z])(?=.*\\d).{8,}$');
  eq('reads all three rules', result.findings.map(f => f.label),
     ['at least one uppercase letter', 'at least one number', 'minimum 8 characters']);
  t('and says it understood everything', result.complete && result.gaps.length === 0);

  const counted = interpretRegex('^(?=(?:[^A-Z]*[A-Z]){2})(?=(?:\\D*\\d){3}).{20,}$');
  eq('counted requirements read back', counted.findings.map(f => f.label),
     ['at least 2 uppercase letters', 'at least 3 numbers', 'minimum 20 characters']);

  const bounded = interpretRegex('^(?=.*[A-Z]).{8,64}$');
  t('length range read back', bounded.findings.some(f => f.label === 'between 8 and 64 characters'));
}

console.log('\nregex → rules, when it cannot');
for (const [pattern, expected] of [
  ['^(?!.*(.)\\1).{8,}$', /negative look-ahead/],
  ['(?=.*[A-Z]).{8,}', /anchors/],
  ['^[A-Za-z]{8,}$', /restricts which characters/],
  ['^abc(?=.*\\d).{8,}$', /literal character/],
  ['^(?=.*[A-Z])(?:foo|bar).{8,}$', /not a recognised password requirement/],
]) {
  const result = interpretRegex(pattern);
  t(`/${pattern}/ admits the gap`, !result.complete && result.gaps.some(g => expected.test(g.reason)));
}
{
  const broken = interpretRegex('^(?=.*[A-Z].{8,}$');
  t('an invalid pattern reports the syntax error', broken.ok === false);
}

console.log('\nrules → regex → rules round trip');
for (const rules of [
  { ...DEFAULT_RULES, minLength: 12 },
  { minLength: 20, maxLength: 0, upper: 2, lower: 2, digit: 3, special: 2, specialSet: '!@#$%' },
  { minLength: 8, maxLength: 64, upper: 1, lower: 0, digit: 1, special: 0, specialSet: '!@#' },
]) {
  const back = interpretRegex(rulesToRegex(rules));
  t(`round trip is complete for min ${rules.minLength}`, back.complete);
  eq(`  and recovers the length (${rules.minLength})`, back.rules.minLength, rules.minLength);
  eq('  and the uppercase count', back.rules.upper, rules.upper);
  eq('  and the digit count', back.rules.digit, rules.digit);
}

console.log('\ntesting a password against rules');
{
  const rules = { ...DEFAULT_RULES, minLength: 12 };
  const good = testPassword('Max!Haus2026', rules);
  eq('a conforming password passes every rule', [good.passed, good.total, good.ok], [5, 5, true]);

  const bad = testPassword('maxhaus', rules);
  eq('and a weak one fails the right count', bad.passed, 1);
  eq('with per-rule detail', bad.results.find(r => r.label === 'Uppercase letter').detail, '0 found, 1 needed');

  const counted = testPassword('Aa1!', { minLength: 4, maxLength: 0, upper: 2, lower: 0, digit: 0, special: 0, specialSet: '!' });
  t('counts are checked, not just presence', counted.results.some(r => !r.ok && r.detail === '1 found, 2 needed'));
}

console.log('\nimpossible rule sets are named');
{
  eq('max below min', validateRules({ minLength: 12, maxLength: 8, upper: 1, lower: 1, digit: 1, special: 1, specialSet: '!' }).length, 1);
  t('requirements exceeding the maximum', validateRules({ minLength: 4, maxLength: 4, upper: 3, lower: 3, digit: 0, special: 0, specialSet: '' }).length > 0);
  eq('a sane set has no problems', validateRules({ ...DEFAULT_RULES, minLength: 12 }).length, 0);
}

console.log('\nstrength: guessing effort, not rule counting');
{
  const weak = analyzePassword('Password1!');
  const rulesPassed = testPassword('Password1!', { ...DEFAULT_RULES, minLength: 8 });
  eq('"Password1!" satisfies every rule', [rulesPassed.passed, rulesPassed.total], [5, 5]);
  eq('but is still rated very weak', weak.label, 'Very weak');
  t('because it is recognised as a known password', weak.matches.some(m => m.kind === 'common'));
  t('and the user is told why', weak.warnings.some(w => /common/i.test(w)));

  eq('"password" is instant', analyzePassword('password').crackTimes.fastHash.text, 'instantly');
  t('a long random password is excellent', analyzePassword('K7!vP2@xLm9#Qw82').score === 4);
  t('a passphrase scores well', analyzePassword('correct horse battery staple').score === 4);
  t('an empty password is not an error', analyzePassword('').label === 'Empty');
}

console.log('\nstrength: pattern recognition');
for (const [password, kind] of [
  ['abcdefgh', 'sequence'],
  ['qwertzuio', 'keyboard'],
  ['aaaaaaaa', 'repeat'],
  ['urlaub2024', 'word'],
  ['sommer2024', 'common'],
  ['hello1999', 'year'],
]) {
  t(`"${password}" → ${kind} detected`, analyzePassword(password).matches.some(m => m.kind === kind));
}
t('leet substitution does not hide a word', analyzePassword('p4ssw0rt99').matches.some(m => m.kind === 'word' || m.kind === 'common'));

console.log('\nrandomness');
{
  // A max-deviation threshold is the wrong tool: with 33 buckets the largest
  // bucket regularly strays past 2σ by chance, so such a test fails at random.
  // Chi-square asks the right question — is the whole distribution consistent
  // with uniform? — and the p=0.001 critical values keep it stable.
  const CHI2_CRITICAL = { 2: 13.82, 6: 22.46, 32: 62.49 };   // df → value at p=0.001
  for (const max of [3, 7, 33]) {
    const counts = new Array(max).fill(0);
    const draws = 60000;
    for (let i = 0; i < draws; i++) counts[randomInt(max)]++;
    const expected = draws / max;
    const chi2 = counts.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
    const critical = CHI2_CRITICAL[max - 1];
    t(`randomInt(${max}) passes chi-square (${chi2.toFixed(1)} < ${critical})`, chi2 < critical);
    t(`  every value in 0..${max - 1} occurs`, counts.every(c => c > 0));
  }
  const values = new Set();
  for (let i = 0; i < 200; i++) values.add(generatePassword({ length: 16 }).password);
  eq('200 generated passwords are all distinct', values.size, 200);
}

console.log('\ngeneration meets its rules by construction');
{
  const rules = { minLength: 20, maxLength: 0, upper: 2, lower: 2, digit: 3, special: 2, specialSet: '!@#$%&*' };
  let allPass = true;
  let exactLength = true;
  for (let i = 0; i < 300; i++) {
    const { password } = generatePassword({ length: 20, upper: 2, lower: 2, digit: 3, special: 2, specialSet: '!@#$%&*' });
    if (!testPassword(password, rules).ok) allPass = false;
    if (password.length !== 20) exactLength = false;
  }
  t('300 passwords all satisfy the rules', allPass);
  t('and are exactly the requested length', exactLength);

  const short = generatePassword({ length: 4, upper: 2, lower: 2, digit: 3, special: 2 });
  eq('length is raised to fit the requirements', short.password.length, 9);
  t('and the change is reported', short.notes.some(n => /raised/i.test(n)));

  const noAmbiguous = generatePassword({ length: 40, excludeAmbiguous: true }).password;
  t('ambiguous characters are excluded', !/[Il1O0o]/.test(noAmbiguous));

  const noRepeat = generatePassword({ length: 30, noRepeat: true, specialSet: '!@#$%&*' }).password;
  eq('no character is used twice', new Set(noRepeat).size, 30);
}

console.log('\na maximum length is a rule, not a suggestion');
{
  const { optionsFromRules } = await import('../js/password/generate.js');
  const rules = { minLength: 10, maxLength: 16, upper: 1, lower: 1, digit: 1, special: 1, specialSet: '!@#$' };

  // The bug this replaced: the generator ignored maxLength, produced a 20
  // character password, and then reported that its own output failed the rules.
  const options = optionsFromRules(rules, { length: 20 });
  eq('the cap is passed through to the generator', options.maxLength, 16);

  const { password, notes } = generatePassword(options);
  eq('and is respected', password.length, 16);
  t('with the reduction stated', notes.some(n => /capped|cap it|reduced/i.test(n)));
  t('and the result satisfies every rule', testPassword(password, rules).ok);

  let message = '';
  try {
    generatePassword({ length: 8, maxLength: 4, upper: 2, lower: 2, digit: 2, special: 2 });
  } catch (err) { message = err.message; }
  t('requirements that cannot fit under the cap are refused', /maximum length is 4/.test(message));
}

console.log('\ngeneration refuses the impossible instead of looping');
for (const [label, options, expected] of [
  ['every class disabled', { length: 12, upper: 0, lower: 0, digit: 0, special: 0 }, /nothing to build/],
  ['no repeats, longer than the pool', { length: 200, upper: 1, lower: 1, digit: 1, special: 0, noRepeat: true }, /distinct characters/],
  ['required class emptied by the filter', { length: 10, upper: 0, lower: 0, digit: 0, special: 2, specialSet: '|`', excludeAmbiguous: true }, /leaves none available/],
]) {
  let message = '';
  try { generatePassword(options); } catch (err) { message = err instanceof ImpossibleRules ? err.message : `wrong error: ${err.message}`; }
  t(`${label} → ${message.slice(0, 60)}`, expected.test(message));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
