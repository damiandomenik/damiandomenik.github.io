/* qr.js — what actually fits in a QR code, and the payload that goes in it.
 *
 * The temptation with a tool like this is to generate a QR code for anything
 * and let the scanner fail later. A QR code holds 2,953 bytes at its absolute
 * limit — version 40, error correction L, byte mode. That is not "a small
 * file". That is roughly one page of text. Any claim beyond that is false.
 *
 * So the capacity table below is the real one from the QR specification, and
 * every verdict is computed against it rather than guessed.
 */

/**
 * Byte-mode data capacity in bytes, per version (1-40) and error correction
 * level. Straight from ISO/IEC 18004. Index 0 is version 1.
 */
const CAPACITY = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
      929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
      2563, 2699, 2809, 2953],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
      711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911,
      1989, 2099, 2213, 2331],
  Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394, 442, 482,
      509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423,
      1499, 1579, 1663],
  H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338, 382,
      403, 439, 461, 511, 535, 593, 625, 658, 698, 742, 790, 842, 898, 958, 983, 1051, 1093, 1139,
      1219, 1273],
};

export const ECC_LEVELS = [
  { level: 'L', name: 'Low', recovers: '~7% damage', capacity: 2953 },
  { level: 'M', name: 'Medium', recovers: '~15% damage', capacity: 2331 },
  { level: 'Q', name: 'Quartile', recovers: '~25% damage', capacity: 1663 },
  { level: 'H', name: 'High', recovers: '~30% damage', capacity: 1273 },
];

/**
 * Above this version a QR code has very fine modules. It still conforms to the
 * standard, but phone cameras start to struggle, especially on a screen.
 */
const COMFORTABLE_VERSION = 20;

export const PAYLOAD_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Payload format                                                      *
 * ------------------------------------------------------------------ */

/**
 * The envelope that goes into the QR code:
 *   {"v":1,"n":"hello.txt","m":"text/plain","e":"b64","d":"aGVsbG8="}
 *
 * Short keys are not a style choice. Every byte spent on the envelope is a byte
 * unavailable to the file, and at 2,953 bytes total that matters: "filename"
 * instead of "n" costs seven bytes twice over.
 */
export function buildPayload({ filename, mime, base64 }) {
  return JSON.stringify({
    v: PAYLOAD_VERSION,
    n: sanitizeName(filename),
    m: mime || 'application/octet-stream',
    e: 'b64',
    d: base64,
  });
}

/** Bytes the envelope costs before any file data. */
export function envelopeOverhead(filename, mime) {
  return byteLength(buildPayload({ filename, mime, base64: '' }));
}

export function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function sanitizeName(name) {
  return String(name || 'file')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .split(/[/\\]/).pop()
    .replace(/^\.+/, '')
    .slice(0, 80) || 'file';
}

/**
 * Read a scanned payload back. Everything here came off a camera pointed at an
 * unknown code, so nothing is trusted.
 * @returns {{ok: true, filename, mime, base64} | {ok: false, error: string}}
 */
export function parsePayload(text) {
  const raw = (text ?? '').trim();
  if (!raw) return { ok: false, error: 'The code contained nothing.' };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Plenty of QR codes hold a URL or plain text. Say what it is rather than
    // calling it corrupt.
    if (/^https?:\/\//i.test(raw)) {
      return { ok: false, error: `This is a link, not an encoded file: ${raw.slice(0, 120)}` };
    }
    return { ok: false, error: 'This code does not contain a file payload — it holds plain text or another format.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'The payload is not in the expected format.' };
  }
  if (parsed.v !== PAYLOAD_VERSION) {
    return { ok: false, error: `This payload is version ${parsed.v ?? 'unknown'}; this tool understands version ${PAYLOAD_VERSION}.` };
  }
  if (parsed.e !== 'b64') {
    return { ok: false, error: `Unknown encoding "${parsed.e}" — only Base64 is supported.` };
  }
  if (typeof parsed.d !== 'string' || !parsed.d.length) {
    return { ok: false, error: 'The payload carries no data.' };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(parsed.d)) {
    return { ok: false, error: 'The payload data is not valid Base64.' };
  }

  return {
    ok: true,
    filename: sanitizeName(parsed.n),
    mime: typeof parsed.m === 'string' ? parsed.m.slice(0, 120) : 'application/octet-stream',
    base64: parsed.d,
  };
}

/* ------------------------------------------------------------------ *
 * Capacity analysis                                                   *
 * ------------------------------------------------------------------ */

/** Smallest version that holds `bytes` at this level, or null if none does. */
export function versionFor(bytes, level) {
  const table = CAPACITY[level];
  for (let index = 0; index < table.length; index++) {
    if (bytes <= table[index]) return index + 1;
  }
  return null;
}

/**
 * The honest answer to "can this go in a QR code?".
 *
 * @param {{byteLength: number, filename: string, mime: string}} file
 * @returns {{
 *   payloadBytes, overhead, levels: Array, verdict: 'ready'|'possible'|'too-large',
 *   headline: string, reason: string, best: object|null, maxFileBytes: number
 * }}
 */
export function analyzeQr({ byteLength: fileBytes, filename, mime }) {
  const overhead = envelopeOverhead(filename, mime);
  const base64Chars = Math.ceil(fileBytes / 3) * 4;
  const payloadBytes = overhead + base64Chars;

  const levels = ECC_LEVELS.map(entry => {
    const version = versionFor(payloadBytes, entry.level);
    return {
      ...entry,
      version,
      fits: version !== null,
      comfortable: version !== null && version <= COMFORTABLE_VERSION,
    };
  });

  const best = levels.find(l => l.comfortable) ?? levels.find(l => l.fits) ?? null;
  const maxFileBytes = largestFileThatFits(overhead);

  if (!best) {
    const over = payloadBytes / CAPACITY.L[39];
    return {
      payloadBytes, overhead, levels, maxFileBytes,
      verdict: 'too-large',
      best: null,
      headline: 'Too large for QR',
      reason: `The payload comes to ${formatBytes(payloadBytes)}. The largest QR code that exists holds ${formatBytes(CAPACITY.L[39])}`
        + ` — this is about ${over < 10 ? over.toFixed(1) : Math.round(over)}× over. For this file the largest that would fit is roughly ${formatBytes(maxFileBytes)}.`,
    };
  }

  if (!levels.some(l => l.comfortable)) {
    return {
      payloadBytes, overhead, levels, maxFileBytes,
      verdict: 'possible',
      best,
      headline: 'Possible, but not recommended',
      reason: `It only fits at version ${best.version} with ${best.name.toLowerCase()} error correction. A code that dense has very small modules:`
        + ' scanning it off a screen usually works, off a printout often does not, and any smudge loses the file.',
    };
  }

  return {
    payloadBytes, overhead, levels, maxFileBytes,
    verdict: 'ready',
    best,
    headline: 'QR ready',
    reason: `The payload is ${formatBytes(payloadBytes)} and fits in a version ${best.version} code at ${best.name.toLowerCase()} error correction,`
      + ` which survives ${best.recovers}.`,
  };
}

/**
 * The largest file that still fits once the envelope is paid for.
 *
 * `(capacity - overhead) * 3 / 4` is wrong: Base64 rounds up to whole groups of
 * four characters, so a file one byte over a multiple of three costs four more
 * characters, not 1.33. Rounding down from the division landed up to two bytes
 * too high, and the tool would then promise a QR code it could not produce.
 * Stepping back from the estimate until the real length fits is exact.
 */
export function largestFileThatFits(overhead) {
  const available = CAPACITY.L[39] - overhead;
  if (available <= 0) return 0;
  let candidate = Math.floor(available * 3 / 4);
  while (candidate > 0 && overhead + Math.ceil(candidate / 3) * 4 > CAPACITY.L[39]) candidate--;
  return candidate;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * Generating                                                          *
 * ------------------------------------------------------------------ */

export function generatorAvailable() {
  return typeof window !== 'undefined' && typeof window.qrcode === 'function';
}

/**
 * Render a QR code as SVG, built with DOM calls rather than the library's
 * HTML-string output so no innerHTML is involved.
 * @returns {{svg: SVGElement, version: number, modules: number}}
 */
export function renderQr(text, level = 'M', size = 320) {
  if (!generatorAvailable()) throw new Error('The QR library could not be loaded, so no code can be generated.');

  const qr = window.qrcode(0, level);          // 0 = pick the smallest version that fits
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const quiet = 4;                              // the standard quiet zone
  const total = count + quiet * 2;
  const NS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code containing the encoded file');

  const background = document.createElementNS(NS, 'rect');
  background.setAttribute('width', String(total));
  background.setAttribute('height', String(total));
  background.setAttribute('fill', '#ffffff');
  svg.append(background);

  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  const dark = document.createElementNS(NS, 'path');
  dark.setAttribute('d', path);
  dark.setAttribute('fill', '#000000');
  svg.append(dark);

  return { svg, version: (count - 17) / 4, modules: count };
}

/** Rasterise an SVG QR code to a PNG blob for downloading. */
export async function qrToPng(svg, pixels = 1024) {
  const source = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([source], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = pixels;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;      // sharp module edges
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pixels, pixels);
    context.drawImage(image, 0, 0, pixels, pixels);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The browser could not encode the image.'))), 'image/png');
    });
    canvas.width = canvas.height = 0;
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The QR image could not be rendered.'));
    image.src = url;
  });
}

/* ------------------------------------------------------------------ *
 * Reading                                                             *
 * ------------------------------------------------------------------ */

export function readerAvailable() {
  return typeof window !== 'undefined'
    && (typeof window.BarcodeDetector === 'function' || typeof window.jsQR === 'function');
}

export function readerName() {
  if (typeof window === 'undefined') return null;
  if (typeof window.BarcodeDetector === 'function') return 'the browser\u2019s built-in barcode reader';
  if (typeof window.jsQR === 'function') return 'the jsQR library';
  return null;
}

/**
 * Find a QR code in an image.
 * Uses the browser's own BarcodeDetector where it exists and falls back to
 * jsQR. If neither is available it says so rather than failing silently.
 * @returns {Promise<string>} the decoded text
 */
export async function decodeQrFromSource(source) {
  if (typeof window.BarcodeDetector === 'function') {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const found = await detector.detect(source);
      if (found.length) return found[0].rawValue;
    } catch {
      // Some builds advertise the constructor but reject qr_code; fall through.
    }
  }

  if (typeof window.jsQR === 'function') {
    const { data, width, height } = await imageDataFrom(source);
    const result = window.jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    if (result?.data) return result.data;
    throw new Error('No QR code was found in that image. Try a sharper photo, or crop it closer to the code.');
  }

  if (typeof window.BarcodeDetector === 'function') {
    throw new Error('No QR code was found in that image. Try a sharper photo, or crop it closer to the code.');
  }
  throw new Error('This browser cannot read QR codes, and the fallback library did not load. Firefox has no built-in barcode reader.');
}

async function imageDataFrom(source) {
  const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  if (bitmap !== source) bitmap.close?.();
  return imageData;
}
