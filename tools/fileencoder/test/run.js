/* Universal File Encoder — core tests. Run: node test/run.js */

globalThis.btoa ??= s => Buffer.from(s, 'latin1').toString('base64');
globalThis.atob ??= s => Buffer.from(s, 'base64').toString('latin1');
globalThis.window ??= {};

const { sniff, iconFor } = await import('../js/sniff.js');
const {
  encodeBase64, encodeBase64Sync, decodeBase64, base64Length, base64Overhead,
  parseDataUrl, toDataUrl, looksLikeBase64, DecodeError,
} = await import('../js/encode.js');
const {
  analyzeQr, buildPayload, parsePayload, envelopeOverhead, versionFor, byteLength, ECC_LEVELS,
} = await import('../js/qr.js');
const { advise } = await import('../js/advise.js');

let passed = 0, failed = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : `\n         got  ${JSON.stringify(actual)}\n         want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
};
const t = (label, value) => { console.log(`${value ? '  ok  ' : ' FAIL '} ${label}`); value ? passed++ : failed++; };
const bytesOf = text => new Uint8Array([...text].map(c => c.charCodeAt(0)));

/* ------------------------------------------------------------------ */

console.log('\nbase64: exact sizes');
eq('3 bytes become 4 characters', base64Length(3), 4);
eq('1 byte becomes 4 with padding', base64Length(1), 4);
eq('overhead of a multiple of three is 33.3%', Math.round(base64Overhead(3000) * 10) / 10, 33.3);
eq('empty is zero', base64Length(0), 0);

console.log('\nbase64: round trip across chunk boundaries');
{
  const CHUNK = 3 * 32 * 1024;
  let mismatches = 0;
  let wrongLength = 0;
  for (const n of [1, 2, 3, 4, 5, 100, CHUNK - 1, CHUNK, CHUNK + 1, CHUNK * 2, CHUNK * 2 + 7, 500_000]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 7 + (i >> 8)) & 0xff;
    const encoded = await encodeBase64(bytes);
    if (encoded.length !== base64Length(n)) wrongLength++;
    const back = decodeBase64(encoded).bytes;
    if (back.length !== n || !back.every((v, i) => v === bytes[i])) mismatches++;
  }
  // A chunk size that is not a multiple of three pads mid-string and corrupts
  // the result — the reason CHUNK is 96 KiB rather than 100 KB.
  t('every size survives the round trip', mismatches === 0);
  t('and the predicted length is exact', wrongLength === 0);
  eq('matches a known-good encoder', encodeBase64Sync(bytesOf('hello')), Buffer.from('hello').toString('base64'));
}

console.log('\nbase64: input the decoder has to cope with');
eq('padding can be missing', decodeBase64('aGVsbG8').bytes.length, 5);
eq('whitespace is ignored', decodeBase64('aGVs\n bG8=').bytes.length, 5);
t('url-safe alphabet is converted', decodeBase64('aGVsbG8_').urlSafe === true);
eq('a data URL yields its mime', decodeBase64('data:text/plain;base64,aGVsbG8=').mime, 'text/plain');
eq('a percent-encoded data URL still decodes', decodeBase64('data:text/plain,hello%20world').bytes.length, 11);

console.log('\nbase64: refusals are specific');
for (const [input, expected] of [
  ['', /nothing to decode/],
  ['das ist kein base64!!!', /contains "!"/],
  ['aGVsbG8=a', /truncated/],
]) {
  let message = '';
  try { decodeBase64(input); } catch (err) { message = err.message; }
  t(`${JSON.stringify(input.slice(0, 22))} → ${message.slice(0, 44)}`, expected.test(message));
}
t('looksLikeBase64 accepts real base64', looksLikeBase64('aGVsbG8='));
t('and rejects prose', !looksLikeBase64('this is a sentence!'));

console.log('\ndata URLs');
eq('mime and flag are split out', parseDataUrl('data:image/png;base64,AAAA').mime, 'image/png');
t('the base64 flag is detected', parseDataUrl('data:image/png;base64,AAAA').base64 === true);
t('and its absence too', parseDataUrl('data:text/plain,hi').base64 === false);
eq('charset is picked up', parseDataUrl('data:text/plain;charset=utf-8;base64,AAAA').charset, 'utf-8');
eq('non-data URLs return null', parseDataUrl('https://example.com'), null);
eq('round trip through toDataUrl', parseDataUrl(toDataUrl('image/gif', 'QUJD')).data, 'QUJD');

console.log('\ntype detection reads bytes, not names');
{
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  eq('PNG by signature', sniff(png, 'x.png').mime, 'image/png');
  eq('and the source is recorded', sniff(png, 'x.png').source, 'bytes');

  // The whole point of sniffing: a renamed file is caught.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  eq('a JPEG named .png is still a JPEG', sniff(jpeg, 'holiday.png').mime, 'image/jpeg');
  t('and the mismatch is flagged', sniff(jpeg, 'holiday.png').mismatch === true);
  t('while .jpeg vs .jpg is not a mismatch', sniff(jpeg, 'holiday.jpeg').mismatch === false);

  eq('PDF', sniff(bytesOf('%PDF-1.7 xx'), 'a.pdf').label, 'PDF document');
  eq('ZIP', sniff(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'a.zip').label, 'ZIP archive');
  eq('DOCX is distinguished from a plain zip',
     sniff(bytesOf('PK\u0003\u0004' + ' '.repeat(26) + 'word/document.xml'), 'a.docx').label, 'Word document');
  eq('WebP inside RIFF', sniff(bytesOf('RIFF____WEBPVP8 '), 'a.webp').label, 'WebP image');
  eq('WAV inside RIFF', sniff(bytesOf('RIFF____WAVEfmt '), 'a.wav').label, 'WAV audio');
  eq('JSON by content', sniff(bytesOf('{"a":1}'), 'x.json').mime, 'application/json');
  eq('SVG by content', sniff(bytesOf('<?xml version="1.0"?><svg xmlns="x"/>'), 'x.svg').mime, 'image/svg+xml');
  eq('plain text', sniff(bytesOf('just some words'), 'x.txt').mime, 'text/plain');
  eq('a NUL byte means binary, not text', sniff(new Uint8Array([65, 0, 66, 67]), 'x.txt').source, 'extension');
  eq('unknown bytes are admitted as unknown', sniff(new Uint8Array([1, 2, 3, 4, 9, 7]), 'x.bin').source, 'unknown');
  eq('a PDF with no extension is still found', sniff(bytesOf('%PDF-1.4'), 'document').mime, 'application/pdf');
  eq('empty input does not crash', sniff(new Uint8Array(0), '').source, 'unknown');
}

console.log('\nQR capacity comes from the real table');
{
  eq('one byte fits in version 1', versionFor(1, 'L'), 1);
  eq('2953 bytes is exactly version 40 at L', versionFor(2953, 'L'), 40);
  eq('2954 fits nowhere', versionFor(2954, 'L'), null);
  eq('1273 is the ceiling at H', versionFor(1273, 'H'), 40);
  eq('1274 does not fit at H', versionFor(1274, 'H'), null);
  eq('the four levels are ordered by capacity',
     ECC_LEVELS.map(l => l.capacity), [2953, 2331, 1663, 1273]);
}

console.log('\nQR verdicts are computed, not asserted');
{
  const forSize = size => analyzeQr({ byteLength: size, filename: 'photo.png', mime: 'image/png' });

  eq('a tiny file is ready', forSize(50).verdict, 'ready');
  eq('a mid-size file is possible but dense', forSize(1500).verdict, 'possible');
  eq('2.4 MB is refused', forSize(2.4 * 1024 * 1024).verdict, 'too-large');
  t('and the refusal says how far over it is', /over/.test(forSize(2.4 * 1024 * 1024).reason));

  // The envelope is not free, and the boundary has to account for it.
  const limit = forSize(0).maxFileBytes;
  t(`the stated maximum (${limit} B) actually fits`, forSize(limit).verdict !== 'too-large');
  eq('and one byte more does not', forSize(limit + 1).verdict, 'too-large');

  const overhead = envelopeOverhead('photo.png', 'image/png');
  t('the envelope costs real bytes', overhead > 40 && overhead < 100);
  t('a longer filename costs more', envelopeOverhead('a-much-longer-name.png', 'image/png') > overhead);

  // No file of any size may ever be called QR-ready beyond the hard limit.
  let wrong = 0;
  for (let size = 2000; size < 3000; size += 7) {
    const analysis = forSize(size);
    if (analysis.payloadBytes > 2953 && analysis.verdict !== 'too-large') wrong++;
    if (analysis.payloadBytes <= 2953 && analysis.verdict === 'too-large') wrong++;
  }
  t('the verdict never contradicts the capacity table', wrong === 0);
}

console.log('\nthe stated maximum file size is exact');
{
  // (capacity - overhead) * 3/4 looks right and is not: Base64 rounds up to
  // whole groups of four, so the estimate landed up to two bytes high and the
  // tool would promise a QR code it could not actually produce.
  const { largestFileThatFits } = await import('../js/qr.js');
  let wrong = 0;

  for (const name of ['a.txt', 'photo.png', 'Müller🔐.txt', 'x'.repeat(80) + '.bin',
                      'report-2026-final.tar.gz', 'ü'.repeat(30) + '.dat']) {
    const analysis = analyzeQr({ byteLength: 0, filename: name, mime: 'application/octet-stream' });
    const max = analysis.maxFileBytes;

    // The real payload at that size must fit, and one byte more must not.
    const at = byteLength(buildPayload({ filename: name, mime: 'application/octet-stream', base64: encodeBase64Sync(new Uint8Array(max)) }));
    const over = byteLength(buildPayload({ filename: name, mime: 'application/octet-stream', base64: encodeBase64Sync(new Uint8Array(max + 1)) }));
    if (at > 2953 || over <= 2953) wrong++;

    // And the verdict has to agree with that measurement.
    if (analyzeQr({ byteLength: max, filename: name, mime: 'application/octet-stream' }).verdict === 'too-large') wrong++;
    if (analyzeQr({ byteLength: max + 1, filename: name, mime: 'application/octet-stream' }).verdict !== 'too-large') wrong++;
  }
  t('the boundary is exact for every filename tried', wrong === 0);

  // A UTF-8 filename costs more bytes than its character count suggests.
  t('a multi-byte filename leaves room for less data',
    largestFileThatFits(envelopeOverhead('Müller🔐.txt', 'text/plain'))
    < largestFileThatFits(envelopeOverhead('abc.txt', 'text/plain')));
  eq('an impossible overhead yields zero', largestFileThatFits(5000), 0);
}

console.log('\nQR payload validation');
{
  const good = buildPayload({ filename: 'hi.txt', mime: 'text/plain', base64: 'aGVsbG8=' });
  const parsed = parsePayload(good);
  t('a well-formed payload round trips', parsed.ok && parsed.filename === 'hi.txt' && parsed.base64 === 'aGVsbG8=');
  t('the envelope stays compact', byteLength(good) < 100);

  // Everything here arrived from a camera pointed at an unknown code.
  for (const [input, expected] of [
    ['', /contained nothing/],
    ['not json at all', /does not contain a file payload/],
    ['https://example.com/x', /is a link/],
    ['{"v":2,"e":"b64","d":"AA"}', /version 2/],
    ['{"v":1,"e":"hex","d":"AA"}', /Unknown encoding/],
    ['{"v":1,"e":"b64","d":""}', /carries no data/],
    ['{"v":1,"e":"b64","d":"not base64!!"}', /not valid Base64/],
    ['[1,2,3]', /not in the expected format/],
  ]) {
    const result = parsePayload(input);
    t(`${JSON.stringify(input.slice(0, 26))} → ${result.ok ? 'ACCEPTED' : result.error.slice(0, 40)}`,
      !result.ok && expected.test(result.error));
  }

  const nasty = parsePayload(JSON.stringify({ v: 1, e: 'b64', d: 'AA==', n: '../../etc/passwd', m: 'text/plain' }));
  eq('a path in the filename is stripped', nasty.filename, 'passwd');
}

console.log('\nadvice follows the numbers');
{
  const small = advise({ name: 'note.txt', size: 400, mime: 'text/plain', label: 'Plain text' });
  t('a small file is recommended for QR', /QR code/.test(small.recommendation));
  t('and every option is marked usable', small.options.every(o => o.ok));

  const medium = advise({ name: 'photo.png', size: 200 * 1024, mime: 'image/png', label: 'PNG image' });
  eq('a 200 KB file is refused for QR', medium.options.find(o => o.id === 'qr').ok, false);
  t('but Base64 is still fine', medium.options.find(o => o.id === 'base64').ok);

  const huge = advise({ name: 'video.mp4', size: 300 * 1024 * 1024, mime: 'video/mp4', label: 'MP4 video' });
  eq('300 MB is refused for Base64 too', huge.options.find(o => o.id === 'base64').ok, false);
  t('and the reason is memory, stated plainly', /memory|freeze/.test(huge.options.find(o => o.id === 'base64').text));
  t('with a warning attached', huge.warnings.length > 0);

  const empty = advise({ name: 'empty.txt', size: 0, mime: 'text/plain', label: 'Plain text' });
  t('an empty file is handled', /Nothing to do/.test(empty.recommendation));

  const renamed = advise({ name: 'holiday.png', size: 1000, mime: 'image/jpeg', label: 'JPEG image', mismatch: true });
  t('a mismatched extension is surfaced in the warnings', renamed.warnings.some(w => /extension/.test(w)));
}

console.log('\nicons cover the common types');
for (const [mime, icon] of [['image/png', '🖼️'], ['audio/mpeg', '🎵'], ['video/mp4', '🎬'],
                            ['application/pdf', '📕'], ['application/zip', '🗜️'], ['text/plain', '📄']]) {
  eq(mime, iconFor(mime), icon);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
