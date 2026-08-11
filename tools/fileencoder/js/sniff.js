/* sniff.js — what a file actually is, read from its bytes.
 *
 * A file extension is a claim, not a fact: anyone can rename holiday.exe to
 * holiday.jpg. So the type is read from the leading bytes where a format has a
 * recognisable signature, and the extension is only used to break ties or to
 * name formats that have no signature at all (plain text, CSV).
 *
 * Where the bytes and the extension disagree, both are reported. That mismatch
 * is often the most interesting thing about a file.
 */

const SIGNATURES = [
  { mime: 'image/png', label: 'PNG image', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', label: 'JPEG image', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', label: 'GIF image', ext: 'gif', text: 'GIF8' },
  { mime: 'image/bmp', label: 'BMP image', ext: 'bmp', text: 'BM' },
  { mime: 'image/tiff', label: 'TIFF image', ext: 'tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/tiff', label: 'TIFF image', ext: 'tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mime: 'image/x-icon', label: 'Icon', ext: 'ico', bytes: [0x00, 0x00, 0x01, 0x00] },
  { mime: 'application/pdf', label: 'PDF document', ext: 'pdf', text: '%PDF-' },
  { mime: 'application/gzip', label: 'Gzip archive', ext: 'gz', bytes: [0x1f, 0x8b] },
  { mime: 'application/x-bzip2', label: 'Bzip2 archive', ext: 'bz2', text: 'BZh' },
  { mime: 'application/x-7z-compressed', label: '7-Zip archive', ext: '7z', bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { mime: 'application/x-rar-compressed', label: 'RAR archive', ext: 'rar', text: 'Rar!' },
  { mime: 'application/x-tar', label: 'Tar archive', ext: 'tar', text: 'ustar', offset: 257 },
  { mime: 'audio/mpeg', label: 'MP3 audio', ext: 'mp3', text: 'ID3' },
  { mime: 'audio/mpeg', label: 'MP3 audio', ext: 'mp3', bytes: [0xff, 0xfb] },
  { mime: 'audio/flac', label: 'FLAC audio', ext: 'flac', text: 'fLaC' },
  { mime: 'application/x-sqlite3', label: 'SQLite database', ext: 'sqlite', text: 'SQLite format 3' },
  { mime: 'application/x-msdownload', label: 'Windows executable', ext: 'exe', text: 'MZ' },
  { mime: 'application/x-elf', label: 'Linux executable', ext: '', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { mime: 'font/woff', label: 'WOFF font', ext: 'woff', text: 'wOFF' },
  { mime: 'font/woff2', label: 'WOFF2 font', ext: 'woff2', text: 'wOF2' },
  { mime: 'font/ttf', label: 'TrueType font', ext: 'ttf', bytes: [0x00, 0x01, 0x00, 0x00, 0x00] },
];

/** Formats that need a second look because their signature is shared. */
const CONTAINERS = {
  riff: [
    { mime: 'image/webp', label: 'WebP image', ext: 'webp', at8: 'WEBP' },
    { mime: 'audio/wav', label: 'WAV audio', ext: 'wav', at8: 'WAVE' },
    { mime: 'video/x-msvideo', label: 'AVI video', ext: 'avi', at8: 'AVI ' },
  ],
  iso: [
    { mime: 'image/heic', label: 'HEIC image', ext: 'heic', brands: ['heic', 'heix', 'hevc', 'mif1'] },
    { mime: 'image/avif', label: 'AVIF image', ext: 'avif', brands: ['avif'] },
    { mime: 'video/mp4', label: 'MP4 video', ext: 'mp4', brands: ['isom', 'mp41', 'mp42', 'M4V ', 'avc1', 'dash'] },
    { mime: 'audio/mp4', label: 'M4A audio', ext: 'm4a', brands: ['M4A '] },
    { mime: 'video/quicktime', label: 'QuickTime video', ext: 'mov', brands: ['qt  '] },
  ],
  zip: [
    { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word document', ext: 'docx', marker: 'word/' },
    { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel spreadsheet', ext: 'xlsx', marker: 'xl/' },
    { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint presentation', ext: 'pptx', marker: 'ppt/' },
    { mime: 'application/epub+zip', label: 'EPUB book', ext: 'epub', marker: 'epub' },
    { mime: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument text', ext: 'odt', marker: 'opendocument.text' },
  ],
};

/** Extensions for things that have no signature to find. */
const BY_EXTENSION = {
  txt: { mime: 'text/plain', label: 'Plain text' },
  md: { mime: 'text/markdown', label: 'Markdown' },
  csv: { mime: 'text/csv', label: 'CSV data' },
  json: { mime: 'application/json', label: 'JSON data' },
  xml: { mime: 'application/xml', label: 'XML data' },
  html: { mime: 'text/html', label: 'HTML page' },
  htm: { mime: 'text/html', label: 'HTML page' },
  css: { mime: 'text/css', label: 'Stylesheet' },
  js: { mime: 'text/javascript', label: 'JavaScript' },
  svg: { mime: 'image/svg+xml', label: 'SVG image' },
  yml: { mime: 'text/yaml', label: 'YAML data' },
  yaml: { mime: 'text/yaml', label: 'YAML data' },
};

/**
 * @param {Uint8Array} head the first few hundred bytes is plenty
 * @param {string} filename used only where the bytes cannot decide
 * @returns {{mime, label, source: 'bytes'|'content'|'extension'|'unknown', ext, mismatch: boolean}}
 */
export function sniff(head, filename = '') {
  const extension = (filename.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

  const found = fromBytes(head);
  if (found) {
    // The extension claims one thing and the bytes say another: worth flagging.
    const claimed = BY_EXTENSION[extension];
    const mismatch = Boolean(extension)
      && found.ext !== extension
      && !sameFamily(found, extension)
      && (claimed ? claimed.mime !== found.mime : true);
    return { ...found, source: 'bytes', mismatch };
  }

  const textual = fromText(head);
  if (textual) return { ...textual, source: 'content', mismatch: false, ext: extension };

  const byExtension = BY_EXTENSION[extension];
  if (byExtension) return { ...byExtension, ext: extension, source: 'extension', mismatch: false };

  return {
    mime: 'application/octet-stream',
    label: extension ? `Unrecognised .${extension} file` : 'Unrecognised binary data',
    ext: extension,
    source: 'unknown',
    mismatch: false,
  };
}

function sameFamily(found, extension) {
  const families = [['jpg', 'jpeg'], ['tif', 'tiff'], ['htm', 'html'], ['mp4', 'm4v'], ['heic', 'heif']];
  return families.some(group => group.includes(found.ext) && group.includes(extension));
}

function fromBytes(head) {
  if (!head?.length) return null;

  const ascii = (offset, length) => {
    let out = '';
    for (let i = 0; i < length; i++) out += String.fromCharCode(head[offset + i] ?? 0);
    return out;
  };

  // RIFF and ISO containers share a prefix, so the sub-type decides.
  if (ascii(0, 4) === 'RIFF') {
    const kind = ascii(8, 4);
    const match = CONTAINERS.riff.find(entry => entry.at8 === kind);
    if (match) return strip(match);
    return { mime: 'application/octet-stream', label: 'RIFF container', ext: '' };
  }
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    const match = CONTAINERS.iso.find(entry => entry.brands.some(b => brand.startsWith(b.trim())));
    if (match) return strip(match);
    return { mime: 'application/octet-stream', label: `ISO container (${brand.trim()})`, ext: '' };
  }
  if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7)) {
    // Office files and EPUBs are ZIPs; the first entry name gives them away.
    const window = ascii(0, Math.min(head.length, 512));
    const match = CONTAINERS.zip.find(entry => window.includes(entry.marker));
    if (match) return strip(match);
    return { mime: 'application/zip', label: 'ZIP archive', ext: 'zip' };
  }

  for (const signature of SIGNATURES) {
    const offset = signature.offset ?? 0;
    if (signature.bytes) {
      if (signature.bytes.every((byte, i) => head[offset + i] === byte)) return strip(signature);
    } else if (signature.text) {
      if (ascii(offset, signature.text.length) === signature.text) return strip(signature);
    }
  }
  return null;
}

function strip({ mime, label, ext }) {
  return { mime, label, ext };
}

/** Text-shaped data: decide by content rather than by name. */
function fromText(head) {
  if (!head?.length) return null;

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.min(head.length, 4096)));
  } catch {
    return null;                                   // not valid UTF-8, so not text
  }
  // A NUL byte in the first block is the classic sign of binary data. But
  // control bytes decode as valid UTF-8 too, so a run of them would otherwise
  // be announced as "Plain text". Tab, newline and carriage return are the only
  // control characters that belong in a text file.
  if (text.includes('\u0000')) return null;
  let control = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) control++;
  }
  if (control / text.length > 0.05) return null;

  const trimmed = text.trimStart();
  if (/^<\?xml/i.test(trimmed) || /^<svg[\s>]/i.test(trimmed)) {
    return /^<svg[\s>]/i.test(trimmed) || /<svg[\s>]/i.test(trimmed.slice(0, 400))
      ? { mime: 'image/svg+xml', label: 'SVG image', ext: 'svg' }
      : { mime: 'application/xml', label: 'XML data', ext: 'xml' };
  }
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return { mime: 'text/html', label: 'HTML page', ext: 'html' };
  }
  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(text);
      return { mime: 'application/json', label: 'JSON data', ext: 'json' };
    } catch {
      // Only part of the file was read, so a parse failure proves nothing.
      if (head.length > 4096) return { mime: 'application/json', label: 'JSON data (probably)', ext: 'json' };
    }
  }
  return { mime: 'text/plain', label: 'Plain text', ext: 'txt' };
}

/** A friendly icon for the type, used throughout the interface. */
export function iconFor(mime) {
  if (/^image\//.test(mime)) return '🖼️';
  if (/^audio\//.test(mime)) return '🎵';
  if (/^video\//.test(mime)) return '🎬';
  if (/^font\//.test(mime)) return '🔤';
  if (/pdf/.test(mime)) return '📕';
  if (/zip|compressed|tar|gzip/.test(mime)) return '🗜️';
  if (/^text\/|json|xml|javascript/.test(mime)) return '📄';
  if (/sqlite|database/.test(mime)) return '🗄️';
  if (/msdownload|elf/.test(mime)) return '⚙️';
  return '📦';
}

export const PREVIEWABLE = mime =>
  /^image\//.test(mime) || /^audio\//.test(mime) || /^video\//.test(mime)
  || /^text\//.test(mime) || /json|xml|javascript/.test(mime) || mime === 'application/pdf';
