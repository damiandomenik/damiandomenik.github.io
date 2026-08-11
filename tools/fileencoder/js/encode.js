/* encode.js — bytes to Base64 and back, without falling over on large files.
 *
 * Two traps this avoids:
 *
 * 1. `btoa(String.fromCharCode(...bytes))` blows the call stack somewhere
 *    around a hundred thousand arguments. Everything here works in chunks.
 *
 * 2. Chunk boundaries have to fall on multiples of three. Base64 encodes three
 *    bytes into four characters; splitting anywhere else makes btoa pad the
 *    middle of the string, and the result decodes to something different from
 *    what went in. The chunk size below is deliberately divisible by 3.
 */

const CHUNK = 3 * 32 * 1024;          // 96 KiB, a multiple of 3
const YIELD_EVERY = 16;               // chunks between event-loop breaks

export class DecodeError extends Error {
  constructor(message) { super(message); this.name = 'DecodeError'; }
}

/* ------------------------------------------------------------------ *
 * Encoding                                                            *
 * ------------------------------------------------------------------ */

/** Exact Base64 length for a given byte count, padding included. */
export function base64Length(byteLength) {
  return Math.ceil(byteLength / 3) * 4;
}

export function base64Overhead(byteLength) {
  if (!byteLength) return 0;
  return (base64Length(byteLength) / byteLength - 1) * 100;
}

/**
 * Encode bytes to Base64 in chunks, reporting progress and letting the browser
 * paint in between.
 * @param {Uint8Array} bytes
 * @param {(ratio:number)=>void} onProgress
 */
export async function encodeBase64(bytes, onProgress = () => {}) {
  if (!bytes.length) return '';
  const pieces = [];
  let processed = 0;
  let sinceYield = 0;

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length));
    pieces.push(btoa(binaryString(slice)));
    processed += slice.length;

    if (++sinceYield >= YIELD_EVERY) {
      sinceYield = 0;
      onProgress(processed / bytes.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  onProgress(1);
  return pieces.join('');
}

/** Synchronous version for small payloads (QR envelopes, previews). */
export function encodeBase64Sync(bytes) {
  const pieces = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    pieces.push(btoa(binaryString(bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length)))));
  }
  return pieces.join('');
}

function binaryString(slice) {
  // String.fromCharCode.apply with a huge array overflows the stack, so this
  // walks a bounded window at a time.
  let out = '';
  const STEP = 8192;
  for (let i = 0; i < slice.length; i += STEP) {
    out += String.fromCharCode.apply(null, slice.subarray(i, Math.min(i + STEP, slice.length)));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Data URLs                                                           *
 * ------------------------------------------------------------------ */

/**
 * Split a data URL into its parts.
 * @returns {{mime, base64: boolean, data, charset}|null}
 */
export function parseDataUrl(text) {
  const match = /^data:([^,]*),([\s\S]*)$/.exec((text || '').trim());
  if (!match) return null;

  const meta = match[1];
  const isBase64 = /;base64$/i.test(meta);
  const withoutFlag = meta.replace(/;base64$/i, '');
  const [mime, ...params] = withoutFlag.split(';');
  const charset = params.find(p => /^charset=/i.test(p))?.split('=')[1] ?? null;

  return {
    mime: mime || 'text/plain',
    base64: isBase64,
    charset,
    data: match[2],
  };
}

export function toDataUrl(mime, base64) {
  return `data:${mime || 'application/octet-stream'};base64,${base64}`;
}

/* ------------------------------------------------------------------ *
 * Decoding                                                            *
 * ------------------------------------------------------------------ */

const BASE64_CHARS = /^[A-Za-z0-9+/=\s]*$/;
const URLSAFE_CHARS = /^[A-Za-z0-9\-_=\s]*$/;

/**
 * Turn Base64 (or a data URL, or URL-safe Base64) into bytes.
 * Throws DecodeError with a message a person can act on.
 * @returns {{bytes: Uint8Array, mime: string|null, wasDataUrl: boolean, urlSafe: boolean}}
 */
export function decodeBase64(input) {
  const raw = (input ?? '').trim();
  if (!raw) throw new DecodeError('There is nothing to decode yet.');

  let mime = null;
  let payload = raw;
  let wasDataUrl = false;

  const dataUrl = parseDataUrl(raw);
  if (dataUrl) {
    wasDataUrl = true;
    mime = dataUrl.mime;
    if (!dataUrl.base64) {
      // A percent-encoded data URL is not Base64 at all.
      const decoded = new TextEncoder().encode(decodeURIComponent(dataUrl.data));
      return { bytes: decoded, mime, wasDataUrl, urlSafe: false };
    }
    payload = dataUrl.data;
  }

  let cleaned = payload.replace(/\s+/g, '');
  let urlSafe = false;

  if (!BASE64_CHARS.test(payload)) {
    if (URLSAFE_CHARS.test(payload)) {
      urlSafe = true;
      cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    } else {
      const bad = [...payload].find(ch => !/[A-Za-z0-9+/=\s\-_]/.test(ch));
      throw new DecodeError(
        `This is not Base64 — it contains "${bad}", which never appears in Base64 data.`
      );
    }
  }

  // Missing padding is common when Base64 is copied out of JSON or a URL.
  const remainder = cleaned.length % 4;
  if (remainder === 1) {
    throw new DecodeError('This Base64 string is truncated — its length cannot be right.');
  }
  if (remainder) cleaned += '='.repeat(4 - remainder);

  let binary;
  try {
    binary = atob(cleaned);
  } catch {
    throw new DecodeError('The Base64 data is damaged and could not be decoded.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime, wasDataUrl, urlSafe };
}

/** A quick check that does not throw, for live input feedback. */
export function looksLikeBase64(text) {
  const raw = (text || '').trim();
  if (raw.length < 4) return false;
  if (parseDataUrl(raw)) return true;
  const cleaned = raw.replace(/\s+/g, '');
  return (BASE64_CHARS.test(cleaned) || URLSAFE_CHARS.test(cleaned)) && cleaned.length % 4 !== 1;
}
