/* Syntax coverage: every JavaScript regex construct, checked against the parser.
 *
 * The point is not the score. It is that nothing is silently mis-explained:
 * a construct must either be fully explained or openly marked as a gap. A
 * wrong explanation counts as a failure here, which is how \cJ was caught —
 * it was being described as the literal letters "cJ" instead of a line feed.
 */
const { explain } = await import('../js/regex/explain.js');

const CONSTRUCTS = [
  ['Zeichenklassen', ['\\d','\\D','\\w','\\W','\\s','\\S','.','[abc]','[^abc]','[a-z0-9]','[\\d\\s]','[]','[^]']],
  ['Anker',          ['^','$','\\b','\\B']],
  ['Quantoren',      ['a*','a+','a?','a{3}','a{3,}','a{3,5}','a*?','a+?','a??','a{3,5}?']],
  ['Gruppen',        ['(a)','(?:a)','(?<n>a)','(?=a)','(?!a)','(?<=a)','(?<!a)']],
  ['Rückbezüge',     ['(a)\\1','(?<n>a)\\k<n>']],
  ['Alternation',    ['a|b','(a|b)c']],
  ['Escapes',        ['\\n','\\r','\\t','\\f','\\v','\\0','\\xA9','\\u00E9','\\u{1F600}','\\.','\\\\','\\/','\\$']],
  ['Steuerzeichen',  ['\\cJ','\\cA']],
  ['Unicode',        ['\\p{L}','\\P{L}','\\p{Script=Greek}']],
  ['Modifier (neu)', ['(?i:abc)','(?-i:abc)']],
  ['v-Flag (neu)',   ['[\\p{L}--[aeiou]]','[\\q{abc}]']],
];

let full = 0, gap = 0, broken = 0;
for (const [group, items] of CONSTRUCTS) {
  console.log(`\n${group}`);
  for (const src of items) {
    let native = true;
    try { new RegExp(src, src.includes('\\p') || src.includes('\\q') || src.includes('--[') ? 'u' : ''); }
    catch { try { new RegExp(src, 'v'); } catch { native = false; } }

    const r = explain(src);
    let verdict;
    if (!r.ok) { verdict = native ? `✗ Parser meldet Fehler, obwohl gültig: ${r.error.slice(0,50)}` : '– auch für JS ungültig'; if (native) broken++; }
    else if (r.gaps.length) { verdict = '~ erkannt, aber nicht erklärt'; gap++; }
    else { verdict = '✓ vollständig erklärt'; full++; }
    console.log(`  ${src.padEnd(20)} ${verdict}`);
  }
}
console.log(`\n${full} fully explained · ${gap} openly marked as a gap · ${broken} wrongly rejected\n`);

/* Regression guards for explanations that were confidently wrong. */
const detailOf = src => explain(src).rows.map(r => r.detail).join(' | ');
let failures = 0;
const must = (label, condition) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}`);
  if (!condition) failures++;
};

must('\\cJ is a control character, not the letters "cJ"', /control character Ctrl-J/.test(detailOf('\\cJ')));
must('and never claims to match "cJ"', !/matches exactly "cJ"/.test(detailOf('\\cJ')));
must('an inline modifier group is a gap, not a fatal error', explain('(?i:abc)def').ok && explain('(?i:abc)def').gaps.length === 1);
must('and the rest of that pattern is still explained', /matches exactly "def"/.test(detailOf('(?i:abc)def')));
must('a \\q{…} string set is marked as unexplained', /not explained/.test(detailOf('[\\q{abc}]')));
must('unicode property escapes stay marked as gaps', explain('\\p{L}').gaps.length === 1);
must('nothing valid is wrongly rejected', broken === 0);

console.log(`\n${failures ? failures + ' failed' : 'all coverage guards passed'}\n`);
process.exit(failures ? 1 : 0);
