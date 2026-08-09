/* cheatsheet.js — the reference table, as data.
 * Each entry carries a working example so the "try it" button has something
 * real to load rather than a decorative snippet.
 */

export const CHEATSHEET = [
  {
    group: 'Character types',
    items: [
      { token: '\\d', short: 'digit', detail: 'Any digit from 0 to 9. The opposite, \\D, matches anything that is not a digit.', example: { pattern: '\\d+', text: 'Order 4711 shipped on day 3' } },
      { token: '\\w', short: 'word character', detail: 'A letter, digit or underscore. Note that it is ASCII-only: "ä" does not count unless you add the u flag and a unicode class.', example: { pattern: '\\w+', text: 'user_name42 and other-words' } },
      { token: '\\s', short: 'whitespace', detail: 'A space, tab, or line break. \\S is anything that is not whitespace.', example: { pattern: '\\S+', text: 'one   two\tthree' } },
      { token: '.', short: 'any character', detail: 'Any single character except a line break. With the s flag it matches line breaks too.', example: { pattern: 'c.t', text: 'cat cot cut c t' } },
      { token: '[abc]', short: 'character class', detail: 'Any one of the characters listed. Ranges work too: [a-z], [0-9], [A-Za-z0-9].', example: { pattern: '[aeiou]', text: 'the quick brown fox' } },
      { token: '[^abc]', short: 'negated class', detail: 'Any single character that is NOT listed. The ^ only means "not" as the first character inside the brackets.', example: { pattern: '[^0-9 ]+', text: 'abc 123 def 456' } },
    ],
  },
  {
    group: 'How many',
    items: [
      { token: '+', short: 'one or more', detail: 'Repeat the previous item at least once, as many times as possible.', example: { pattern: 'go+gle', text: 'gogle google gooogle ggle' } },
      { token: '*', short: 'zero or more', detail: 'Repeat the previous item any number of times, including none at all.', example: { pattern: 'ab*c', text: 'ac abc abbbc adc' } },
      { token: '?', short: 'optional', detail: 'The previous item may appear once or not at all.', example: { pattern: 'colou?r', text: 'color and colour' } },
      { token: '{3}', short: 'exactly 3', detail: 'Repeat the previous item exactly three times.', example: { pattern: '\\d{3}', text: '12 345 6789' } },
      { token: '{3,}', short: '3 or more', detail: 'Repeat at least three times, with no upper limit.', example: { pattern: '\\d{3,}', text: '12 345 6789' } },
      { token: '{3,5}', short: 'between 3 and 5', detail: 'Repeat at least three and at most five times.', example: { pattern: '\\d{3,5}', text: '12 345 6789 1234567' } },
      { token: '+?', short: 'lazy', detail: 'Adding ? after a quantifier makes it take as little as possible instead of as much.', example: { pattern: '<.+?>', text: '<a><b><c>' } },
    ],
  },
  {
    group: 'Where',
    items: [
      { token: '^', short: 'start', detail: 'The start of the text — or the start of each line when the m flag is on.', example: { pattern: '^\\w+', text: 'first line\nsecond line' } },
      { token: '$', short: 'end', detail: 'The end of the text — or the end of each line with the m flag.', example: { pattern: '\\w+$', text: 'first line\nsecond line' } },
      { token: '\\b', short: 'word boundary', detail: 'The edge between a word character and anything else. Useful for whole-word matches.', example: { pattern: '\\bcat\\b', text: 'cat concatenate the cat' } },
    ],
  },
  {
    group: 'Grouping',
    items: [
      { token: '( )', short: 'group and capture', detail: 'Groups items together and remembers what was matched, so you can read it back out.', example: { pattern: '(\\d{4})-(\\d{2})', text: 'due 2026-03 and 2025-11' } },
      { token: '(?: )', short: 'group only', detail: 'Groups without capturing. Slightly faster, and keeps your capture numbers tidy.', example: { pattern: '(?:ab)+', text: 'ababab abc' } },
      { token: '(?<name> )', short: 'named group', detail: 'A capture group with a name, which is far easier to read than group 3.', example: { pattern: '(?<year>\\d{4})-(?<month>\\d{2})', text: 'due 2026-03' } },
      { token: '|', short: 'or', detail: 'Either the left side or the right side. Wrap it in a group to limit how far it reaches.', example: { pattern: 'cat|dog', text: 'a cat and a dog' } },
      { token: '\\1', short: 'back-reference', detail: 'Matches the same text that an earlier group captured — good for finding doubled words.', example: { pattern: '\\b(\\w+) \\1\\b', text: 'this this is a a test' } },
    ],
  },
  {
    group: 'Look around',
    items: [
      { token: '(?= )', short: 'look ahead', detail: 'What follows must match, but it is not consumed and does not appear in the result.', example: { pattern: '\\d+(?= EUR)', text: '20 EUR and 30 USD' } },
      { token: '(?! )', short: 'negative look ahead', detail: 'What follows must NOT match. This is how password rules say "must contain".', example: { pattern: '\\d+(?! EUR)', text: '20 EUR and 30 USD' } },
      { token: '(?<= )', short: 'look behind', detail: 'What comes before must match. Supported in all current browsers.', example: { pattern: '(?<=€)\\d+', text: '€42 and $99' } },
    ],
  },
];

export const EXAMPLES = [
  {
    name: 'File reference',
    pattern: 'AZ-\\d{5}/\\d{4}',
    flags: 'g',
    text: 'Kunde Max Muster\nAktenzeichen: AZ-12345/2026\nWeitere Nummer: AZ-92831/2025\nUngültig: AZ-123/2026',
    cases: [
      { value: 'AZ-12345/2026', shouldMatch: true },
      { value: 'AZ-92831/2025', shouldMatch: true },
      { value: 'AZ-123/2026', shouldMatch: false },
      { value: 'TEST-12345', shouldMatch: false },
    ],
  },
  {
    name: 'Email addresses',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}',
    flags: 'gi',
    text: 'Write to anna.mueller@example.com or support+billing@shop.co.uk.\nThis one is broken: not@an@address',
    cases: [
      { value: 'anna.mueller@example.com', shouldMatch: true },
      { value: 'support+billing@shop.co.uk', shouldMatch: true },
      { value: 'plain-text', shouldMatch: false },
    ],
  },
  {
    name: 'Dates with named groups',
    pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})',
    flags: 'g',
    text: 'Start 2026-03-01, end 2026-09-30.\nWrong format: 01.03.2026',
    cases: [
      { value: '2026-03-01', shouldMatch: true },
      { value: '01.03.2026', shouldMatch: false },
    ],
  },
  {
    name: 'IBAN (rough shape)',
    pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b',
    flags: 'g',
    text: 'LI21088100002324013AA and DE89370400440532013000\nNot an IBAN: ABC123',
    cases: [
      { value: 'DE89370400440532013000', shouldMatch: true },
      { value: 'ABC123', shouldMatch: false },
    ],
  },
  {
    name: 'Duplicated words',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    flags: 'gi',
    text: 'This this sentence has has a couple of of repeats.',
    cases: [
      { value: 'the the', shouldMatch: true },
      { value: 'the cat', shouldMatch: false },
    ],
  },
];
