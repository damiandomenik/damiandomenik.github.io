/* exif.js — reading metadata out of JPEG, PNG and WebP.
 *
 * Written from scratch rather than pulled from a CDN. A tool whose whole claim
 * is "nothing leaves your browser" should not ship third-party code that reads
 * your photos, and the byte-level walk is needed for stripping anyway.
 *
 * Formats:
 *   JPEG  segment walk → APP1 (Exif TIFF, XMP), APP13 (IPTC), COM
 *   PNG   chunk walk   → tEXt, zTXt, iTXt, eXIf, tIME
 *   WebP  RIFF walk    → EXIF, XMP chunks
 */

import { TAGS, GPS_TAGS, ORIENTATION_LABELS } from './tags.js';

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];        // "Exif\0\0"
const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';

export class UnsupportedFormat extends Error {
  constructor(format) {
    super(`${format} files cannot be cleaned without re-encoding them.`);
    this.name = 'UnsupportedFormat';
    this.format = format;
  }
}

/* ------------------------------------------------------------------ *
 * Format detection                                                    *
 * ------------------------------------------------------------------ */

export function detectFormat(bytes) {
  const startsWith = (...sig) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0xff, 0xd8, 0xff)) return 'jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (startsWith(0x52, 0x49, 0x46, 0x46) && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (/heic|heix|hevc|mif1|msf1/.test(brand)) return 'heic';
    if (/avif/.test(brand)) return 'avif';
    return 'iso';
  }
  if (startsWith(0x49, 0x49, 0x2a, 0x00) || startsWith(0x4d, 0x4d, 0x00, 0x2a)) return 'tiff';
  return 'unknown';
}

function ascii(bytes, offset, length) {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

/* ------------------------------------------------------------------ *
 * Entry point                                                         *
 * ------------------------------------------------------------------ */

/**
 * @returns {{format, findings: Array, orientation: number|null, raw: object}}
 * A finding: { name, group, severity, value, display }
 */
export function readMetadata(bytes) {
  const format = detectFormat(bytes);
  switch (format) {
    case 'jpeg': return { format, ...readJpeg(bytes) };
    case 'png': return { format, ...readPng(bytes) };
    case 'webp': return { format, ...readWebp(bytes) };
    default: return { format, findings: [], orientation: null, raw: {} };
  }
}

/* ------------------------------------------------------------------ *
 * JPEG                                                                *
 * ------------------------------------------------------------------ */

/** Walk the JPEG marker segments. Shared by the reader and the stripper. */
export function jpegSegments(bytes) {
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) throw new Error('Not a JPEG file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segments = [];
  let offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      // Padding of 0xFF bytes is legal between segments; anything else is broken.
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xd9) break;                                  // EOI

    if (marker === 0xda) {                                       // SOS: entropy data follows
      const length = view.getUint16(offset + 2);
      segments.push({ marker, start: offset, end: offset + 2 + length, dataStart: offset + 4, dataEnd: offset + 2 + length });
      segments.push({ marker: 0x100, start: offset + 2 + length, end: bytes.length, scan: true });
      return segments;
    }

    if (offset + 4 > bytes.length) break;
    const length = view.getUint16(offset + 2);
    if (length < 2) throw new Error('This JPEG has a malformed segment.');
    segments.push({
      marker,
      start: offset,
      end: offset + 2 + length,
      dataStart: offset + 4,
      dataEnd: offset + 2 + length,
    });
    offset += 2 + length;
  }
  return segments;
}

export function isExifSegment(bytes, segment) {
  if (segment.marker !== 0xe1) return false;
  return EXIF_HEADER.every((b, i) => bytes[segment.dataStart + i] === b);
}

export function isXmpSegment(bytes, segment) {
  if (segment.marker !== 0xe1) return false;
  return ascii(bytes, segment.dataStart, XMP_NS.length) === XMP_NS;
}

function readJpeg(bytes) {
  const findings = [];
  let orientation = null;
  const raw = {};

  let segments;
  try {
    segments = jpegSegments(bytes);
  } catch (err) {
    throw new Error('This file claims to be a JPEG but its structure is damaged.');
  }

  for (const segment of segments) {
    if (segment.scan) continue;

    if (isExifSegment(bytes, segment)) {
      const tiffStart = segment.dataStart + 6;
      const tiff = readTiff(bytes, tiffStart, segment.dataEnd);
      findings.push(...tiff.findings);
      orientation = tiff.orientation;
      Object.assign(raw, tiff.raw);
      if (tiff.thumbnailBytes) {
        findings.push({
          name: 'ThumbnailImage', group: 'thumbnail', severity: 'high',
          display: `${formatBytes(tiff.thumbnailBytes)} embedded preview image`,
        });
      }
    } else if (isXmpSegment(bytes, segment)) {
      findings.push(...readXmp(ascii(bytes, segment.dataStart + XMP_NS.length, segment.dataEnd - segment.dataStart - XMP_NS.length)));
    } else if (segment.marker === 0xed) {
      findings.push({ name: 'Photoshop/IPTC block', group: 'identity', severity: 'high',
        display: `${formatBytes(segment.dataEnd - segment.dataStart)} of Photoshop metadata` });
    } else if (segment.marker === 0xfe) {
      const comment = ascii(bytes, segment.dataStart, segment.dataEnd - segment.dataStart).replace(/\0+$/, '');
      if (comment.trim()) findings.push({ name: 'Comment', group: 'text', severity: 'medium', display: comment.slice(0, 200) });
    }
  }

  return { findings, orientation, raw };
}

/* ------------------------------------------------------------------ *
 * TIFF / EXIF IFD parsing                                             *
 * ------------------------------------------------------------------ */

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function readTiff(bytes, start, limit) {
  const findings = [];
  const raw = {};
  let orientation = null;
  let thumbnailBytes = 0;

  const order = ascii(bytes, start, 2);
  if (order !== 'II' && order !== 'MM') return { findings, orientation, raw, thumbnailBytes };
  const little = order === 'II';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const u16 = o => view.getUint16(o, little);
  const u32 = o => view.getUint32(o, little);

  if (u16(start + 2) !== 42) return { findings, orientation, raw, thumbnailBytes };

  const seen = new Set();

  const readIfd = (ifdOffset, kind) => {
    const absolute = start + ifdOffset;
    if (absolute + 2 > limit || seen.has(absolute)) return 0;
    seen.add(absolute);

    const count = u16(absolute);
    if (count > 1000) return 0;                      // corrupt or hostile
    let thumbOffset = 0, thumbLength = 0;

    for (let i = 0; i < count; i++) {
      const entry = absolute + 2 + i * 12;
      if (entry + 12 > limit) break;

      const tag = u16(entry);
      const type = u16(entry + 2);
      const valueCount = u32(entry + 4);
      const size = (TYPE_SIZES[type] || 0) * valueCount;
      if (!TYPE_SIZES[type] || size > limit - start) continue;

      const valueOffset = size <= 4 ? entry + 8 : start + u32(entry + 8);
      if (valueOffset + size > limit) continue;

      /* pointers into sub-directories */
      if (tag === 0x8769 && kind === 'ifd0') { readIfd(u32(entry + 8), 'exif'); continue; }
      if (tag === 0x8825 && kind === 'ifd0') { readIfd(u32(entry + 8), 'gps'); continue; }
      if (tag === 0xa005) continue;                  // interop IFD: nothing of interest
      if (tag === 0x0201) { thumbOffset = u32(entry + 8); continue; }
      if (tag === 0x0202) { thumbLength = u32(entry + 8); continue; }

      // GPS tag numbers collide with IFD0 tag numbers, so a GPS definition may
      // only ever be used inside the GPS directory.
      const definition = GPS_TAGS.has(tag) && kind !== 'gps' ? null : TAGS[tag];
      if (!definition) continue;

      // IFD1 describes the embedded thumbnail, not the photo. Its tags would
      // otherwise duplicate the real ones and its orientation could overwrite
      // the one that actually matters.
      if (kind === 'ifd1') continue;

      const value = readValue(view, bytes, valueOffset, type, valueCount, little, definition);
      if (value === null || value === '') continue;

      if (definition.name === 'Orientation' && kind === 'ifd0') orientation = Number(value) || 1;
      raw[definition.name] = value;

      findings.push({
        name: definition.name,
        group: definition.group,
        severity: definition.severity,
        value,
        display: formatValue(definition, value),
      });
    }

    if (thumbLength) thumbnailBytes = thumbLength;

    const nextOffset = absolute + 2 + count * 12;
    return nextOffset + 4 <= limit ? u32(nextOffset) : 0;
  };

  const ifd1 = readIfd(u32(start + 4), 'ifd0');
  if (ifd1) readIfd(ifd1, 'ifd1');                   // the thumbnail directory

  /* GPS coordinates are only meaningful assembled */
  const lat = toDecimal(raw.GPSLatitude, raw.GPSLatitudeRef);
  const lon = toDecimal(raw.GPSLongitude, raw.GPSLongitudeRef);
  if (lat !== null && lon !== null) {
    raw.coordinates = { lat, lon };
    findings.unshift({
      name: 'GPS position', group: 'location', severity: 'critical',
      value: raw.coordinates,
      display: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      precision: precisionNote(raw.GPSLatitude),
      isCoordinates: true,
    });
  }

  return { findings, orientation, raw, thumbnailBytes };
}

/**
 * How precise the fix actually is.
 *
 * Not derived from the decimal places of the converted number — 9.520 and 9.52
 * are the same float, so that would be guesswork dressed up as a fact. EXIF
 * stores position as degrees, minutes and seconds, and the granularity of the
 * seconds field is the real answer: one arcsecond is about 31 metres.
 */
function precisionNote(parts) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [, minutes, seconds] = parts;
  if (seconds % 1 !== 0) return 'Precise to a metre or so — that is a doorway, not a neighbourhood.';
  if (seconds !== 0) return 'Recorded to the arcsecond, about 31 metres — the building, not just the street.';
  if (minutes % 1 !== 0) return 'Recorded to a fraction of an arcminute, within a few dozen metres.';
  if (minutes !== 0) return 'Recorded to the arcminute, roughly 1.8 kilometres — the district.';
  return 'Recorded to the whole degree, which locates only the region.';
}

function readValue(view, bytes, offset, type, count, little, definition) {
  try {
    if (type === 2) {                                          // ASCII
      let out = '';
      for (let i = 0; i < count; i++) {
        const code = bytes[offset + i];
        if (code === 0) break;
        out += String.fromCharCode(code);
      }
      return out.trim();
    }
    if (definition.text === 'ucs2') {                          // Windows XP tags
      let out = '';
      for (let i = 0; i + 1 < count; i += 2) {
        const code = view.getUint16(offset + i, true);
        if (code === 0) break;
        out += String.fromCharCode(code);
      }
      return out.trim();
    }
    if (type === 7) {                                          // UNDEFINED
      if (definition.name === 'UserComment') {
        let out = '';
        for (let i = 8; i < count; i++) {                       // skip 8-byte charset marker
          const code = bytes[offset + i];
          if (code === 0) continue;
          out += String.fromCharCode(code);
        }
        return out.trim();
      }
      return `${count} bytes`;
    }
    if (type === 1 || type === 6) return count === 1 ? bytes[offset] : `${count} bytes`;
    if (type === 3 || type === 8) return view.getUint16(offset, little);
    if (type === 4 || type === 9) return view.getUint32(offset, little);
    if (type === 5 || type === 10) {
      const values = [];
      for (let i = 0; i < count; i++) {
        const numerator = view.getUint32(offset + i * 8, little);
        const denominator = view.getUint32(offset + i * 8 + 4, little);
        values.push(denominator ? numerator / denominator : 0);
      }
      return count === 1 ? values[0] : values;
    }
  } catch {
    return null;
  }
  return null;
}

function toDecimal(parts, ref) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [degrees, minutes, seconds] = parts;
  let value = degrees + minutes / 60 + seconds / 3600;
  if (ref === 'S' || ref === 'W') value = -value;
  return Number.isFinite(value) ? value : null;
}

function formatValue(definition, value) {
  if (definition.enum === 'orientation') {
    return `${ORIENTATION_LABELS[value] || 'Unknown'} (${value})`;
  }
  if (Array.isArray(value)) return value.map(v => round(v)).join(', ');
  if (typeof value === 'number') return String(round(value));
  return String(value).slice(0, 300);
}

const round = v => (Number.isInteger(v) ? v : Number(v.toFixed(4)));

/* ------------------------------------------------------------------ *
 * XMP                                                                 *
 * ------------------------------------------------------------------ */

/**
 * XMP is RDF/XML. Rather than parse it, pull out the handful of fields that
 * carry personal information and report the block's presence for the rest.
 */
function readXmp(text) {
  const findings = [{
    name: 'XMP packet', group: 'xmp', severity: 'high',
    display: `${formatBytes(text.length)} of XMP metadata`,
  }];

  const grab = (pattern) => {
    const match = text.match(pattern);
    return match?.[1]?.trim().slice(0, 200) || null;
  };

  const creator = grab(/<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]+)</) || grab(/xmp:CreatorTool="([^"]+)"/);
  if (creator) findings.push({ name: 'XMP creator', group: 'identity', severity: 'high', display: creator });

  const rights = grab(/<dc:rights>[\s\S]*?<rdf:li[^>]*>([^<]+)</);
  if (rights) findings.push({ name: 'XMP rights', group: 'identity', severity: 'high', display: rights });

  const title = grab(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)</);
  if (title) findings.push({ name: 'XMP title', group: 'identity', severity: 'medium', display: title });

  if (/GPS|exif:GPS/i.test(text)) {
    findings.push({ name: 'XMP location data', group: 'location', severity: 'critical', display: 'GPS fields present inside the XMP block' });
  }
  if (/<xmpMM:History>/.test(text)) {
    findings.push({ name: 'XMP edit history', group: 'identity', severity: 'medium', display: 'A record of how the file was edited' });
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * PNG                                                                 *
 * ------------------------------------------------------------------ */

/** Walk PNG chunks. Shared by the reader and the stripper. */
export function pngChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (length > bytes.length || end > bytes.length) break;
    chunks.push({ type, start: offset, end, dataStart: offset + 8, dataEnd: offset + 8 + length, length });
    if (type === 'IEND') break;
    offset = end;
  }
  return chunks;
}

export const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'dSIG']);

function readPng(bytes) {
  const findings = [];
  let orientation = null;

  for (const chunk of pngChunks(bytes)) {
    if (chunk.type === 'tEXt') {
      const raw = ascii(bytes, chunk.dataStart, chunk.length);
      const [keyword, ...rest] = raw.split('\0');
      const value = rest.join('\0');
      const severity = /author|artist|copyright|comment|description/i.test(keyword) ? 'high' : 'medium';
      findings.push({ name: `Text: ${keyword}`, group: 'text', severity, display: value.slice(0, 200) });
    } else if (chunk.type === 'zTXt' || chunk.type === 'iTXt') {
      const raw = ascii(bytes, chunk.dataStart, Math.min(chunk.length, 80));
      const keyword = raw.split('\0')[0];
      const isXmp = keyword === 'XML:com.adobe.xmp';
      findings.push({
        name: isXmp ? 'XMP packet' : `Text: ${keyword}`,
        group: isXmp ? 'xmp' : 'text',
        severity: isXmp ? 'high' : 'medium',
        display: `${formatBytes(chunk.length)}${chunk.type === 'zTXt' ? ', compressed' : ''}`,
      });
    } else if (chunk.type === 'eXIf') {
      const tiff = readTiff(bytes, chunk.dataStart, chunk.dataEnd);
      findings.push(...tiff.findings);
      orientation = tiff.orientation;
    } else if (chunk.type === 'tIME') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const year = view.getUint16(chunk.dataStart);
      const parts = [1, 2, 3, 4, 5].map(i => bytes[chunk.dataStart + 1 + i]);
      findings.push({
        name: 'Last modified', group: 'time', severity: 'high',
        display: `${year}-${pad(parts[0])}-${pad(parts[1])} ${pad(parts[2])}:${pad(parts[3])}:${pad(parts[4])} UTC`,
      });
    }
  }
  return { findings, orientation, raw: {} };
}

const pad = n => String(n ?? 0).padStart(2, '0');

/* ------------------------------------------------------------------ *
 * WebP                                                                *
 * ------------------------------------------------------------------ */

/** Walk RIFF chunks. Shared by the reader and the stripper. */
export function webpChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 12;                                     // RIFF____WEBP
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const padded = length + (length % 2);
    const end = offset + 8 + padded;
    if (end > bytes.length + 1) break;
    chunks.push({ type, start: offset, end: Math.min(end, bytes.length), dataStart: offset + 8, dataEnd: offset + 8 + length, length });
    offset = end;
  }
  return chunks;
}

export const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ']);

function readWebp(bytes) {
  const findings = [];
  let orientation = null;

  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === 'EXIF') {
      // Some writers prefix the TIFF block with "Exif\0\0", some do not.
      const hasHeader = EXIF_HEADER.every((b, i) => bytes[chunk.dataStart + i] === b);
      const tiff = readTiff(bytes, chunk.dataStart + (hasHeader ? 6 : 0), chunk.dataEnd);
      findings.push(...tiff.findings);
      orientation = tiff.orientation;
    } else if (chunk.type === 'XMP ') {
      findings.push(...readXmp(ascii(bytes, chunk.dataStart, chunk.length)));
    }
  }
  return { findings, orientation, raw: {} };
}

/* ------------------------------------------------------------------ */

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
