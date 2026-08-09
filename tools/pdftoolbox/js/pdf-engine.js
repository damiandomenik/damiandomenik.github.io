/* pdf-engine.js — every call into pdf.js and pdf-lib lives here.
 *
 * Split of duties:
 *   pdf.js   reads and rasterises pages (rendering, thumbnails, PDF → images)
 *   pdf-lib  writes PDFs (merge, extract, rotate, images → PDF)
 *
 * Nothing in this file touches the network.
 */

const { PDFDocument, degrees } = window.PDFLib;
const pdfjsLib = window.pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

/* ------------------------------------------------------------------ *
 * Render queue — one page at a time keeps the main thread responsive. *
 * ------------------------------------------------------------------ */

let queue = Promise.resolve();

function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

/* ------------------------------------------------------------------ *
 * Loading                                                             *
 * ------------------------------------------------------------------ */

export class PasswordNeeded extends Error {
  constructor(fileName) {
    super(`${fileName} is password protected.`);
    this.name = 'PasswordNeeded';
  }
}

export class EncryptedNotEditable extends Error {
  constructor(fileName) {
    super(`${fileName} is encrypted and cannot be rewritten.`);
    this.name = 'EncryptedNotEditable';
  }
}

/**
 * Read a PDF File into both libraries.
 * @returns {{bytes: Uint8Array, pdfjsDoc, pdflibDoc, pageCount: number}}
 */
export async function loadPdf(file, password = undefined) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length === 0) throw new Error('The file is empty (0 bytes).');
  if (!looksLikePdf(bytes)) {
    throw new Error('The file has no PDF header — it is probably not a PDF, or it is damaged.');
  }

  // pdf.js transfers the buffer it is given to its worker, which would detach
  // ours. Hand it a copy and keep the original for pdf-lib.
  let pdfjsDoc;
  try {
    pdfjsDoc = await pdfjsLib.getDocument({
      data: bytes.slice(),
      password,
      isEvalSupported: false,
      disableAutoFetch: true,
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') throw new PasswordNeeded(file.name);
    throw err;
  }

  if (pdfjsDoc.numPages === 0) {
    pdfjsDoc.destroy();
    throw new Error('The PDF contains no pages.');
  }

  // pdf-lib refuses encrypted documents. ignoreEncryption would "load" them but
  // the content streams stay encrypted, so the output would be garbage —
  // better to say so than to hand back a broken file.
  let pdflibDoc;
  try {
    pdflibDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    pdfjsDoc.destroy();
    if (/encrypt/i.test(err?.message || '')) throw new EncryptedNotEditable(file.name);
    throw err;
  }

  return { bytes, pdfjsDoc, pdflibDoc, pageCount: pdfjsDoc.numPages };
}

function looksLikePdf(bytes) {
  // "%PDF-" within the first kilobyte (some files carry junk in front of it).
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

/* ------------------------------------------------------------------ *
 * Rasterising                                                         *
 * ------------------------------------------------------------------ */

async function renderToCanvas(pdfjsDoc, pageNumber, { width, scale }) {
  const page = await pdfjsDoc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const factor = scale ?? (width / base.width);
  const viewport = page.getViewport({ scale: factor });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'))),
      type,
      quality
    );
  });
}

function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/** Small JPEG preview of one page. Queued, so a 500-page grid stays usable. */
export function renderThumb(pdfjsDoc, pageNumber, width = 200) {
  return enqueue(async () => {
    const canvas = await renderToCanvas(pdfjsDoc, pageNumber, { width });
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.72);
    releaseCanvas(canvas);
    return blob;
  });
}

/** Full-resolution export of one page at a given DPI. */
export function renderPageImage(pdfjsDoc, pageNumber, { dpi = 150, format = 'image/png', quality = 0.92 } = {}) {
  return enqueue(async () => {
    const canvas = await renderToCanvas(pdfjsDoc, pageNumber, { scale: dpi / 72 });
    const dims = { width: canvas.width, height: canvas.height };
    const blob = await canvasToBlob(canvas, format, format === 'image/jpeg' ? quality : undefined);
    releaseCanvas(canvas);
    return { blob, ...dims };
  });
}

/* ------------------------------------------------------------------ *
 * Images                                                              *
 * ------------------------------------------------------------------ */

export async function imageDimensions(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error(`${file.name} could not be decoded as an image.`);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return dims;
}

/**
 * Produce bytes pdf-lib can embed. It only understands JPEG and PNG, so WebP
 * (and anything that needs downscaling) is re-encoded through a canvas.
 * @returns {{bytes: Uint8Array, kind: 'jpg'|'png', width: number, height: number}}
 */
export async function prepareImage(file, { maxPx = 0, webpAs = 'jpeg' } = {}) {
  const { width, height } = await imageDimensions(file);
  const needsResize = maxPx > 0 && Math.max(width, height) > maxPx;
  const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);

  if (!needsResize && isJpeg) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: 'jpg', width, height };
  }
  if (!needsResize && isPng) {
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: 'png', width, height };
  }

  const ratio = needsResize ? maxPx / Math.max(width, height) : 1;
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));

  const toPng = isPng || (!isJpeg && webpAs === 'png');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: toPng });
  if (!toPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await canvasToBlob(canvas, toPng ? 'image/png' : 'image/jpeg', 0.9);
  releaseCanvas(canvas);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    kind: toPng ? 'png' : 'jpg',
    width: w,
    height: h,
  };
}

/* ------------------------------------------------------------------ *
 * Writing PDFs                                                        *
 * ------------------------------------------------------------------ */

const normalizeAngle = a => ((a % 360) + 360) % 360;

/**
 * The one function every export goes through.
 *
 * @param items    [{sourceId, pageIndex, rotation}] in final order
 * @param sources  Map<id, source>  (see composer.js)
 * @param options  {image: {...}, onProgress(ratio, label)}
 * @returns Blob
 */
export async function buildPdf(items, sources, { image = {}, onProgress = () => {} } = {}) {
  if (!items.length) throw new Error('There are no pages to export.');

  const out = await PDFDocument.create();
  let done = 0;
  const step = () => onProgress(++done / items.length, `page ${done} of ${items.length}`);

  /* --- copy PDF pages source by source ------------------------------
     copyPages is called once per source with every index it needs, in the
     order it needs them. Calling it per page would re-copy shared resources
     (fonts, images) each time and bloat the output. */
  const bySource = new Map();
  items.forEach((item, slot) => {
    const src = sources.get(item.sourceId);
    if (!src || src.type !== 'pdf') return;
    if (!bySource.has(item.sourceId)) bySource.set(item.sourceId, { indices: [], slots: [] });
    const bucket = bySource.get(item.sourceId);
    bucket.indices.push(item.pageIndex);
    bucket.slots.push(slot);
  });

  const built = new Array(items.length);
  for (const [sourceId, bucket] of bySource) {
    const src = sources.get(sourceId);
    const copies = await out.copyPages(src.pdflibDoc, bucket.indices);
    copies.forEach((page, i) => { built[bucket.slots[i]] = page; });
    await yieldToUi();
  }

  /* --- embed each distinct image once ------------------------------- */
  const embedded = new Map();
  for (const item of items) {
    const src = sources.get(item.sourceId);
    if (!src || src.type !== 'image' || embedded.has(item.sourceId)) continue;
    const prepared = await prepareImage(src.file, image);
    const ref = prepared.kind === 'jpg'
      ? await out.embedJpg(prepared.bytes)
      : await out.embedPng(prepared.bytes);
    embedded.set(item.sourceId, { ref, width: prepared.width, height: prepared.height });
    await yieldToUi();
  }

  /* --- assemble in order -------------------------------------------- */
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const src = sources.get(item.sourceId);
    if (!src) continue;

    if (src.type === 'pdf') {
      const page = built[i];
      page.setRotation(degrees(normalizeAngle(page.getRotation().angle + item.rotation)));
      out.addPage(page);
    } else {
      const { ref, width, height } = embedded.get(item.sourceId);
      const [pw, ph] = imagePageSize(width, height, image);
      const page = out.addPage([pw, ph]);
      const margin = image.margin ?? 0;
      const scale = Math.min((pw - 2 * margin) / width, (ph - 2 * margin) / height);
      const w = width * scale;
      const h = height * scale;
      page.drawImage(ref, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      if (item.rotation) page.setRotation(degrees(normalizeAngle(item.rotation)));
    }

    step();
    if (i % 8 === 0) await yieldToUi();
  }

  onProgress(1, 'writing file');
  await yieldToUi();
  const bytes = await out.save({ addDefaultPage: false });
  return new Blob([bytes], { type: 'application/pdf' });
}

function imagePageSize(width, height, { size = 'a4', orientation = 'auto', margin = 0 } = {}) {
  if (size === 'auto') {
    // 96 CSS pixels per inch → 72 points per inch.
    return [Math.max(1, width * 0.75) + 2 * margin, Math.max(1, height * 0.75) + 2 * margin];
  }
  const [pw, ph] = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
  const landscape = orientation === 'landscape' || (orientation === 'auto' && width > height);
  return landscape ? [ph, pw] : [pw, ph];
}

function yieldToUi() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
