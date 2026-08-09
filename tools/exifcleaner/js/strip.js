/* strip.js — removing metadata without touching a single pixel.
 *
 * The important promise here is *lossless*. Everything below works at the
 * container level: JPEG marker segments, PNG chunks, RIFF chunks. The
 * compressed image data is copied across byte for byte, so a cleaned photo is
 * pixel-identical to the original. Re-encoding through a canvas — which is what
 * most browser-based cleaners do — would silently cost you quality every time.
 *
 * The one exception is the orientation flag; see keepOrientation below.
 */

import {
  jpegSegments, isExifSegment, isXmpSegment,
  pngChunks, PNG_METADATA_CHUNKS,
  webpChunks, WEBP_METADATA_CHUNKS,
  detectFormat, UnsupportedFormat,
} from './exif.js';

/**
 * @param {Uint8Array} bytes
 * @param {{keepOrientation?: boolean, keepColorProfile?: boolean, orientation?: number|null}} options
 * @returns {{bytes: Uint8Array, notes: string[]}}
 */
export function stripMetadata(bytes, options = {}) {
  const format = detectFormat(bytes);
  switch (format) {
    case 'jpeg': return stripJpeg(bytes, options);
    case 'png': return stripPng(bytes, options);
    case 'webp': return stripWebp(bytes, options);
    default: throw new UnsupportedFormat(format.toUpperCase());
  }
}

/* ------------------------------------------------------------------ *
 * JPEG                                                                *
 * ------------------------------------------------------------------ */

/** APPn markers that carry metadata rather than anything the decoder needs. */
function isDroppableApp(bytes, segment, keepColorProfile) {
  const { marker } = segment;
  if (marker === 0xe0) return false;                       // APP0 JFIF: keep, it is structural
  if (marker === 0xe2) {                                   // APP2: usually the ICC colour profile
    const isIcc = readAscii(bytes, segment.dataStart, 11) === 'ICC_PROFILE';
    return isIcc ? !keepColorProfile : true;
  }
  return marker >= 0xe1 && marker <= 0xef;                 // APP1…APP15: Exif, XMP, IPTC, maker junk
}

function stripJpeg(bytes, { keepOrientation = true, keepColorProfile = true, orientation = null }) {
  const segments = jpegSegments(bytes);
  const notes = [];
  const pieces = [];
  let droppedIcc = false;

  pieces.push(bytes.subarray(0, 2));                       // SOI

  // An Exif block right after SOI is where decoders look for orientation.
  const wantsOrientation = keepOrientation && orientation && orientation !== 1;
  if (wantsOrientation) pieces.push(orientationOnlyExif(orientation));

  for (const segment of segments) {
    if (segment.scan) { pieces.push(bytes.subarray(segment.start, segment.end)); continue; }

    if (isExifSegment(bytes, segment) || isXmpSegment(bytes, segment)) continue;
    if (segment.marker === 0xfe) continue;                 // COM comment
    if (isDroppableApp(bytes, segment, keepColorProfile)) {
      if (segment.marker === 0xe2 && readAscii(bytes, segment.dataStart, 11) === 'ICC_PROFILE') droppedIcc = true;
      continue;
    }
    pieces.push(bytes.subarray(segment.start, segment.end));
  }

  // jpegSegments stops at SOS and hands back the rest as one scan piece, so the
  // EOI is already included. Add one only if the file was truncated.
  const last = pieces[pieces.length - 1];
  if (!(last[last.length - 2] === 0xff && last[last.length - 1] === 0xd9)) {
    pieces.push(new Uint8Array([0xff, 0xd9]));
  }

  if (wantsOrientation) {
    notes.push('Kept the orientation flag so the photo is not displayed sideways. It says nothing about you.');
  }
  if (droppedIcc) notes.push('Removed the colour profile, so colours may shift slightly on wide-gamut screens.');

  return { bytes: concat(pieces), notes };
}

/**
 * A complete Exif block containing exactly one tag: Orientation.
 *
 * Stripping Exif also strips the flag that tells a viewer which way up the
 * photo goes, so phone photos end up rotated. Rotating the pixels instead would
 * mean re-encoding. This writes back the single tag that fixes display and
 * identifies nobody — 34 bytes, no make, no model, no timestamps.
 */
export function orientationOnlyExif(orientation) {
  const out = new Uint8Array(36);
  const view = new DataView(out.buffer);
  let o = 0;

  out[o++] = 0xff; out[o++] = 0xe1;                        // APP1
  view.setUint16(o, 34); o += 2;                           // segment length (excludes the marker)
  out.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], o); o += 6; // "Exif\0\0"

  out[o++] = 0x49; out[o++] = 0x49;                        // little endian
  view.setUint16(o, 42, true); o += 2;
  view.setUint32(o, 8, true); o += 4;                      // IFD0 starts 8 bytes into the TIFF block

  view.setUint16(o, 1, true); o += 2;                      // one entry
  view.setUint16(o, 0x0112, true); o += 2;                 // Orientation
  view.setUint16(o, 3, true); o += 2;                      // SHORT
  view.setUint32(o, 1, true); o += 4;                      // count
  view.setUint16(o, orientation, true); o += 2;
  view.setUint16(o, 0, true); o += 2;                      // padding of the 4-byte value field
  view.setUint32(o, 0, true); o += 4;                      // no next IFD

  return out.subarray(0, o);
}

/* ------------------------------------------------------------------ *
 * PNG                                                                 *
 * ------------------------------------------------------------------ */

function stripPng(bytes, { keepColorProfile = true }) {
  const pieces = [bytes.subarray(0, 8)];                   // signature
  const notes = [];
  let droppedIcc = false;

  for (const chunk of pngChunks(bytes)) {
    if (PNG_METADATA_CHUNKS.has(chunk.type)) continue;
    if (chunk.type === 'iCCP' && !keepColorProfile) { droppedIcc = true; continue; }
    pieces.push(bytes.subarray(chunk.start, chunk.end));
  }

  if (droppedIcc) notes.push('Removed the colour profile, so colours may shift slightly on wide-gamut screens.');
  return { bytes: concat(pieces), notes };
}

/* ------------------------------------------------------------------ *
 * WebP                                                                *
 * ------------------------------------------------------------------ */

const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(bytes, { keepColorProfile = true }) {
  const chunks = webpChunks(bytes);
  const pieces = [];
  const notes = [];

  // VP8X comes first in the file but advertises chunks that appear later, so
  // what gets dropped has to be known before its flag byte is written.
  const droppedIcc = !keepColorProfile && chunks.some(chunk => chunk.type === 'ICCP');

  for (const chunk of chunks) {
    if (WEBP_METADATA_CHUNKS.has(chunk.type)) continue;
    if (chunk.type === 'ICCP' && !keepColorProfile) continue;

    if (chunk.type === 'VP8X') {
      // The extended header advertises which optional chunks exist. Leaving the
      // Exif and XMP bits set after removing those chunks makes the file invalid.
      const copy = bytes.slice(chunk.start, chunk.end);
      copy[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      if (droppedIcc) copy[8] &= ~0x20;
      pieces.push(copy);
      continue;
    }
    pieces.push(bytes.subarray(chunk.start, chunk.end));
  }

  const body = concat(pieces);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12), 0);
  out.set(body, 12);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);   // RIFF size field

  if (droppedIcc) notes.push('Removed the colour profile, so colours may shift slightly on wide-gamut screens.');
  return { bytes: out, notes };
}

/* ------------------------------------------------------------------ *
 * Fallback for formats we cannot rewrite safely                       *
 * ------------------------------------------------------------------ */

/**
 * Last resort for HEIC, AVIF, TIFF and friends: decode the image and re-encode
 * it. This does remove every trace of metadata, but it is a re-compression, not
 * a clean-up — the file is a new image, slightly degraded. Only ever offered
 * explicitly, never silently.
 */
export async function reencode(file, { type = 'image/jpeg', quality = 0.92 } = {}) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This browser cannot decode that image format, so it cannot be re-encoded either.');
  });

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (type === 'image/jpeg') {                             // JPEG has no alpha channel
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The browser could not encode the image.'))), type, quality);
  });
  canvas.width = canvas.height = 0;

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    notes: ['This file was decoded and re-encoded, so it is not pixel-identical to the original.'],
  };
}

/* ------------------------------------------------------------------ */

function concat(pieces) {
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) { out.set(piece, offset); offset += piece.length; }
  return out;
}

function readAscii(bytes, offset, length) {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}
