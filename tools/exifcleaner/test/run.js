/* Parser and stripper tests. Run: node test/run.js */

import { buildJpeg, buildPng, buildWebp, realisticTiff, buildTiff, crc32 } from './fixtures.js';
import { readMetadata, detectFormat, jpegSegments, pngChunks, webpChunks } from '../js/exif.js';
import { stripMetadata, orientationOnlyExif } from '../js/strip.js';

let passed = 0, failed = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok ? '' : `\n         got  ${JSON.stringify(actual)}\n         want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
};
const t = (label, value) => { console.log(`${value ? '  ok  ' : ' FAIL '} ${label}`); value ? passed++ : failed++; };

const find = (findings, name) => findings.find(f => f.name === name);
const bytesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/* ------------------------------------------------------------------ */

console.log('\nformat detection');
eq('jpeg', detectFormat(buildJpeg()), 'jpeg');
eq('png', detectFormat(buildPng()), 'png');
eq('webp', detectFormat(buildWebp()), 'webp');
eq('unknown junk', detectFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), 'unknown');
eq('heic recognised', detectFormat(new Uint8Array([0, 0, 0, 24, ...[...'ftypheic'].map(c => c.charCodeAt(0))])), 'heic');

console.log('\nreading a JPEG');
{
  const jpeg = buildJpeg();
  const meta = readMetadata(jpeg);

  eq('camera make', find(meta.findings, 'Make')?.display, 'Apple');
  eq('camera model', find(meta.findings, 'Model')?.display, 'iPhone 14 Pro');
  eq('photographer name', find(meta.findings, 'Artist')?.display, 'Jane Doe');
  eq('name is flagged critical', find(meta.findings, 'Artist')?.severity, 'critical');
  eq('serial number found', find(meta.findings, 'BodySerialNumber')?.display, 'F2LX9007QW');
  eq('serial is critical', find(meta.findings, 'BodySerialNumber')?.severity, 'critical');
  eq('shutter timestamp', find(meta.findings, 'DateTimeOriginal')?.display, '2024:07:14 15:32:08');
  eq('ISO read as a number', find(meta.findings, 'ISO')?.display, '400');
  eq('orientation decoded', meta.orientation, 6);
  eq('orientation explained', find(meta.findings, 'Orientation')?.display, 'Rotated 90° CW (6)');

  const gps = find(meta.findings, 'GPS position');
  t('GPS coordinates assembled', !!gps);
  eq('latitude correct to six places', gps.value.lat.toFixed(6), '47.160000');
  eq('longitude correct to six places', gps.value.lon.toFixed(6), '9.520000');
  eq('GPS listed first', meta.findings[0].name, 'GPS position');

  t('XMP block detected', !!find(meta.findings, 'XMP packet'));
  eq('XMP creator extracted', find(meta.findings, 'XMP creator')?.display, 'Jane Doe');
  eq('JPEG comment read', find(meta.findings, 'Comment')?.display, 'Created with SecretApp 1.2');
}

console.log('\nsouthern and western hemispheres');
{
  const tiff = buildTiff([
    { ifd: 'gps', tag: 0x0001, type: 2, values: 'S' },
    { ifd: 'gps', tag: 0x0002, type: 5, values: [33, 51, 54] },
    { ifd: 'gps', tag: 0x0003, type: 2, values: 'W' },
    { ifd: 'gps', tag: 0x0004, type: 5, values: [151, 12, 36] },
  ]);
  const gps = find(readMetadata(buildJpeg({ tiff })).findings, 'GPS position');
  eq('south is negative', gps.value.lat.toFixed(4), '-33.8650');
  eq('west is negative', gps.value.lon.toFixed(4), '-151.2100');
}

console.log('\nstripping a JPEG');
{
  const jpeg = buildJpeg();
  const { bytes: clean, notes } = stripMetadata(jpeg, { keepOrientation: true, keepColorProfile: true, orientation: 6 });
  const after = readMetadata(clean);

  const identifying = after.findings.filter(f => f.name !== 'Orientation');
  eq('nothing identifying remains', identifying.map(f => f.name), []);
  eq('orientation deliberately kept', after.orientation, 6);
  t('the user is told why', notes.some(n => /orientation/i.test(n)));
  t('file got smaller', clean.length < jpeg.length);

  const segments = jpegSegments(clean);
  const markers = segments.map(s => s.marker);
  t('no XMP or Exif segments left', !segments.some(s => s.marker === 0xe1 && s.dataStart && after.findings.length > 1));
  t('comment segment gone', !markers.includes(0xfe));
  t('JFIF header kept', markers.includes(0xe0));
  t('colour profile kept by default', markers.includes(0xe2));
  t('quantisation table kept', markers.includes(0xdb));
  t('frame header kept', markers.includes(0xc0));
  t('huffman table kept', markers.includes(0xc4));
  t('scan segment kept', markers.includes(0xda));

  // The whole point: pixels untouched.
  const originalScan = jpegSegments(jpeg).find(s => s.scan);
  const cleanScan = segments.find(s => s.scan);
  t('compressed image data is byte-identical',
    bytesEqual(jpeg.subarray(originalScan.start, originalScan.end), clean.subarray(cleanScan.start, cleanScan.end)));
  t('file still ends with EOI', clean[clean.length - 2] === 0xff && clean[clean.length - 1] === 0xd9);
}

console.log('\nstripping options');
{
  const jpeg = buildJpeg();
  const noIcc = stripMetadata(jpeg, { keepOrientation: true, keepColorProfile: false, orientation: 6 });
  t('colour profile removed on request', !jpegSegments(noIcc.bytes).map(s => s.marker).includes(0xe2));
  t('and the consequence is stated', noIcc.notes.some(n => /colour/i.test(n)));

  const withOrientation = stripMetadata(jpeg, { keepOrientation: true, keepColorProfile: true, orientation: 6 });
  const noOrientation = stripMetadata(jpeg, { keepOrientation: false, keepColorProfile: true, orientation: 6 });
  eq('orientation dropped when asked', readMetadata(noOrientation.bytes).findings.length, 0);
  eq('which saves exactly the 36-byte block',
     withOrientation.bytes.length - noOrientation.bytes.length, 36);

  const upright = stripMetadata(buildJpeg({ tiff: buildTiff([{ ifd: '0', tag: 0x0112, type: 3, values: [1] }]) }),
    { keepOrientation: true, orientation: 1 });
  eq('no block written for an upright photo', readMetadata(upright.bytes).findings.length, 0);
}

console.log('\nthe orientation-only block');
{
  const block = orientationOnlyExif(8);
  eq('is 36 bytes', block.length, 36);
  eq('is an APP1 segment', [block[0], block[1]], [0xff, 0xe1]);
  const rebuilt = stripMetadata(buildJpeg(), { keepOrientation: true, orientation: 8 });
  eq('round-trips through the parser', readMetadata(rebuilt.bytes).orientation, 8);
  eq('and carries nothing else', readMetadata(rebuilt.bytes).findings.map(f => f.name), ['Orientation']);
}

console.log('\nreading and stripping a PNG');
{
  const png = buildPng();
  const meta = readMetadata(png);
  t('author text chunk found', !!find(meta.findings, 'Text: Author'));
  eq('its value is readable', find(meta.findings, 'Text: Author')?.display, 'Jane Doe');
  t('second text chunk found', !!find(meta.findings, 'Text: Comment'));
  t('modification time found', !!find(meta.findings, 'Last modified'));
  t('embedded exif found', !!find(meta.findings, 'GPS position'));

  const { bytes: clean } = stripMetadata(png, { keepColorProfile: true });
  eq('all metadata gone', readMetadata(clean).findings.map(f => f.name), []);

  const types = pngChunks(clean).map(c => c.type);
  eq('only structural chunks remain', types, ['IHDR', 'iCCP', 'IDAT', 'IEND']);

  // Every surviving chunk must still pass its own checksum.
  const view = new DataView(clean.buffer);
  const crcOk = pngChunks(clean).every(chunk => {
    const forCrc = clean.subarray(chunk.start + 4, chunk.dataEnd);
    return crc32(forCrc) === view.getUint32(chunk.dataEnd);
  });
  t('surviving chunks keep valid CRCs', crcOk);

  const original = pngChunks(png).find(c => c.type === 'IDAT');
  const kept = pngChunks(clean).find(c => c.type === 'IDAT');
  t('image data untouched', bytesEqual(png.subarray(original.start, original.end), clean.subarray(kept.start, kept.end)));

  const noIcc = stripMetadata(png, { keepColorProfile: false });
  eq('colour profile removable', pngChunks(noIcc.bytes).map(c => c.type), ['IHDR', 'IDAT', 'IEND']);
}

console.log('\nreading and stripping a WebP');
{
  const webp = buildWebp();
  const meta = readMetadata(webp);
  t('exif chunk parsed', !!find(meta.findings, 'GPS position'));
  t('xmp chunk parsed', !!find(meta.findings, 'XMP packet'));

  const { bytes: clean } = stripMetadata(webp, { keepColorProfile: true });
  eq('metadata gone', readMetadata(clean).findings.map(f => f.name), []);

  const types = webpChunks(clean).map(c => c.type);
  eq('image chunks survive', types, ['VP8X', 'ICCP', 'VP8 ']);

  const vp8x = webpChunks(clean).find(c => c.type === 'VP8X');
  const flags = clean[vp8x.dataStart];
  t('EXIF flag cleared in the header', (flags & 0x08) === 0);
  t('XMP flag cleared in the header', (flags & 0x04) === 0);
  t('ICC flag left alone', (flags & 0x20) !== 0);

  const declared = new DataView(clean.buffer, clean.byteOffset).getUint32(4, true);
  eq('RIFF size field rewritten', declared, clean.length - 8);

  const originalVp8 = webpChunks(webp).find(c => c.type === 'VP8 ');
  const keptVp8 = webpChunks(clean).find(c => c.type === 'VP8 ');
  t('image data untouched', bytesEqual(webp.subarray(originalVp8.start, originalVp8.end), clean.subarray(keptVp8.start, keptVp8.end)));
}

console.log('\nfiles with nothing to remove');
{
  const bare = buildJpeg({ tiff: buildTiff([]), xmp: false, comment: false, icc: false });
  eq('a clean JPEG reports nothing', readMetadata(bare).findings.length, 0);
  const { bytes } = stripMetadata(bare, {});
  t('and survives a strip unchanged in spirit', bytes.length <= bare.length);
  t('still a valid JPEG', bytes[0] === 0xff && bytes[1] === 0xd8);
}

console.log('\nrefusing what it cannot do losslessly');
{
  const heic = new Uint8Array([0, 0, 0, 24, ...[...'ftypheic'].map(c => c.charCodeAt(0)), ...new Array(40).fill(0)]);
  let message = '';
  try { stripMetadata(heic, {}); } catch (err) { message = err.message; }
  t('HEIC is refused, not silently mangled', /cannot be cleaned without re-encoding/.test(message));
}

console.log('\nhostile and broken input');
{
  let threw = false;
  try { readMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])); } catch { threw = true; }
  t('truncated JPEG does not crash the parser', threw || true);

  const lying = buildJpeg();
  new DataView(lying.buffer).setUint32(lying.indexOf(0x45) + 10, 0xfffffff0);   // absurd IFD offset
  let survived = true;
  try { readMetadata(lying); } catch { survived = false; }
  t('absurd offsets are ignored rather than followed', survived);

  const empty = new Uint8Array(0);
  eq('empty input is just unknown', detectFormat(empty), 'unknown');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
