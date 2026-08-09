/* fixtures.js — builds real files, byte by byte, to test against.
 * No image library involved: these are hand-assembled containers with genuine
 * structure, which is exactly what the parser and stripper operate on.
 */

const enc = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------------- TIFF / EXIF writer ---------------- */

/**
 * Builds a little-endian TIFF block with IFD0, an Exif sub-IFD and a GPS
 * sub-IFD. entries: [{ifd:'0'|'exif'|'gps', tag, type, values}]
 */
export function buildTiff(entries) {
  const TYPE_SIZE = { 2: 1, 3: 2, 4: 4, 5: 8 };
  const groups = { '0': [], exif: [], gps: [] };
  for (const e of entries) groups[e.ifd].push(e);

  const encodeValue = (type, values) => {
    if (type === 2) {                       // ASCII, NUL terminated
      const s = enc(values + '\0');
      return { count: s.length, bytes: s };
    }
    const count = values.length;
    const bytes = new Uint8Array(TYPE_SIZE[type] * count);
    const view = new DataView(bytes.buffer);
    values.forEach((v, i) => {
      if (type === 3) view.setUint16(i * 2, v, true);
      else if (type === 4) view.setUint32(i * 4, v, true);
      else if (type === 5) {
        view.setUint32(i * 8, Math.round(v * 10000), true);
        view.setUint32(i * 8 + 4, 10000, true);
      }
    });
    return { count, bytes };
  };

  // Layout: header(8) | IFD0 | ExifIFD | GpsIFD | overflow values
  const prepared = {};
  for (const key of ['0', 'exif', 'gps']) {
    prepared[key] = groups[key].map(e => ({ ...e, ...encodeValue(e.type, e.values) }));
  }

  const ifdSize = list => 2 + list.length * 12 + 4;
  const hasExif = prepared.exif.length > 0;
  const hasGps = prepared.gps.length > 0;
  const ifd0Count = prepared['0'].length + (hasExif ? 1 : 0) + (hasGps ? 1 : 0);

  const ifd0Offset = 8;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifOffset = ifd0Offset + ifd0Size;
  const gpsOffset = exifOffset + (hasExif ? ifdSize(prepared.exif) : 0);
  let valueOffset = gpsOffset + (hasGps ? ifdSize(prepared.gps) : 0);

  const overflow = [];
  for (const key of ['0', 'exif', 'gps']) {
    for (const e of prepared[key]) {
      if (e.bytes.length > 4) {
        e.offset = valueOffset;
        overflow.push(e.bytes);
        valueOffset += e.bytes.length + (e.bytes.length % 2);
        if (e.bytes.length % 2) overflow.push(new Uint8Array(1));
      }
    }
  }

  const total = valueOffset;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  out.set(enc('II'), 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd0Offset, true);

  const writeIfd = (offset, list, extras = [], next = 0) => {
    const all = [...list.map(e => ({ tag: e.tag, type: e.type, count: e.count, bytes: e.bytes, offset: e.offset })), ...extras]
      .sort((a, b) => a.tag - b.tag);
    view.setUint16(offset, all.length, true);
    all.forEach((e, i) => {
      const p = offset + 2 + i * 12;
      view.setUint16(p, e.tag, true);
      view.setUint16(p + 2, e.type, true);
      view.setUint32(p + 4, e.count, true);
      if (e.pointer !== undefined) view.setUint32(p + 8, e.pointer, true);
      else if (e.bytes.length > 4) view.setUint32(p + 8, e.offset, true);
      else out.set(e.bytes, p + 8);
    });
    view.setUint32(offset + 2 + all.length * 12, next, true);
  };

  const extras = [];
  if (hasExif) extras.push({ tag: 0x8769, type: 4, count: 1, bytes: new Uint8Array(4), pointer: exifOffset });
  if (hasGps) extras.push({ tag: 0x8825, type: 4, count: 1, bytes: new Uint8Array(4), pointer: gpsOffset });

  writeIfd(ifd0Offset, prepared['0'], extras);
  if (hasExif) writeIfd(exifOffset, prepared.exif);
  if (hasGps) writeIfd(gpsOffset, prepared.gps);

  let o = gpsOffset + (hasGps ? ifdSize(prepared.gps) : 0);
  for (const chunk of overflow) { out.set(chunk, o); o += chunk.length; }

  return out;
}

/** A TIFF block with a realistic phone-photo payload. */
export function realisticTiff() {
  return buildTiff([
    { ifd: '0', tag: 0x010f, type: 2, values: 'Apple' },              // Make
    { ifd: '0', tag: 0x0110, type: 2, values: 'iPhone 14 Pro' },      // Model
    { ifd: '0', tag: 0x0112, type: 3, values: [6] },                  // Orientation: rotated 90° CW
    { ifd: '0', tag: 0x0131, type: 2, values: 'Photos 3.0' },         // Software
    { ifd: '0', tag: 0x013b, type: 2, values: 'Jane Doe' },           // Artist
    { ifd: 'exif', tag: 0x9003, type: 2, values: '2024:07:14 15:32:08' },
    { ifd: 'exif', tag: 0xa431, type: 2, values: 'F2LX9007QW' },      // BodySerialNumber
    { ifd: 'exif', tag: 0x8827, type: 3, values: [400] },             // ISO
    { ifd: 'gps', tag: 0x0001, type: 2, values: 'N' },
    { ifd: 'gps', tag: 0x0002, type: 5, values: [47, 9, 36] },        // 47°09'36"N
    { ifd: 'gps', tag: 0x0003, type: 2, values: 'E' },
    { ifd: 'gps', tag: 0x0004, type: 5, values: [9, 31, 12] },        // 9°31'12"E
  ]);
}

/* ---------------- JPEG ---------------- */

function segment(marker, payload) {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff; out[1] = marker;
  new DataView(out.buffer).setUint16(2, payload.length + 2);
  out.set(payload, 4);
  return out;
}

/**
 * A structurally valid JPEG: SOI, JFIF, Exif, ICC, comment, quantisation and
 * Huffman tables, frame header, scan data, EOI. Not a decodable picture — the
 * scan bytes are filler — but every marker a stripper walks is real.
 */
export function buildJpeg({ tiff = realisticTiff(), xmp = true, comment = true, icc = true } = {}) {
  const scan = new Uint8Array(512);
  for (let i = 0; i < scan.length; i++) scan[i] = (i * 31) % 251;    // never 0xFF: no fake markers

  const parts = [
    new Uint8Array([0xff, 0xd8]),                                    // SOI
    segment(0xe0, concat([enc('JFIF\0'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])])),
    segment(0xe1, concat([enc('Exif\0\0'), tiff])),
  ];
  if (xmp) {
    parts.push(segment(0xe1, concat([
      enc('http://ns.adobe.com/xap/1.0/\0'),
      enc('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description><dc:creator><rdf:Seq><rdf:li>Jane Doe</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>'),
    ])));
  }
  if (icc) parts.push(segment(0xe2, concat([enc('ICC_PROFILE\0'), new Uint8Array([1, 1]), new Uint8Array(120)])));
  if (comment) parts.push(segment(0xfe, enc('Created with SecretApp 1.2')));

  parts.push(
    segment(0xdb, concat([new Uint8Array([0]), new Uint8Array(64).fill(16)])),   // DQT
    segment(0xc0, new Uint8Array([8, 0, 64, 0, 64, 1, 1, 0x11, 0])),             // SOF0 64×64
    segment(0xc4, concat([new Uint8Array([0]), new Uint8Array(16).fill(1), new Uint8Array(16)])), // DHT
    segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),                          // SOS
    scan,
    new Uint8Array([0xff, 0xd9]),                                               // EOI
  );
  return concat(parts);
}

/* ---------------- PNG ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(enc(type), 4);
  out.set(data, 8);
  const forCrc = new Uint8Array(4 + data.length);
  forCrc.set(enc(type), 0);
  forCrc.set(data, 4);
  view.setUint32(8 + data.length, crc32(forCrc));
  return out;
}

export function buildPng() {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 64); view.setUint32(4, 64);
  ihdr[8] = 8; ihdr[9] = 2;

  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', enc('Author\0Jane Doe')),
    pngChunk('tEXt', enc('Comment\0Taken at home')),
    pngChunk('tIME', new Uint8Array([0x07, 0xe8, 7, 14, 15, 32, 8])),
    pngChunk('eXIf', realisticTiff()),
    pngChunk('iCCP', concat([enc('sRGB\0'), new Uint8Array([0]), new Uint8Array(40)])),
    pngChunk('IDAT', new Uint8Array(256).fill(9)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

/* ---------------- WebP ---------------- */

function riffChunk(type, data) {
  const padded = data.length + (data.length % 2);
  const out = new Uint8Array(8 + padded);
  out.set(enc(type), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

export function buildWebp() {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x08 | 0x04 | 0x20;                    // flags: EXIF + XMP + ICC present
  vp8x[4] = 63; vp8x[7] = 63;                      // canvas 64×64, stored minus one

  const body = concat([
    riffChunk('VP8X', vp8x),
    riffChunk('ICCP', new Uint8Array(32).fill(3)),
    riffChunk('VP8 ', new Uint8Array(200).fill(7)),
    riffChunk('EXIF', realisticTiff()),
    riffChunk('XMP ', enc('<x:xmpmeta><dc:creator>Jane Doe</dc:creator></x:xmpmeta>')),
  ]);

  const out = new Uint8Array(12 + body.length);
  out.set(enc('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(enc('WEBP'), 8);
  out.set(body, 12);
  return out;
}
