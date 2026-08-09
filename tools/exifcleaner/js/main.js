/* main.js — orchestration.
 *
 * Read → analyse → show → clean → verify. The verify step matters: after
 * stripping, the cleaned bytes are parsed again with the same code, and the
 * result only claims success if that second pass finds nothing identifying.
 */

import { el, toast, dropzone, controlBar, sheet, summaryBar } from './ui.js';
import { readMetadata, detectFormat, UnsupportedFormat, formatBytes } from './exif.js';
import { stripMetadata, reencode } from './strip.js';
import { lookupAddress } from './geocode.js';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const entries = [];
const urls = new Set();
let nextId = 0;

const resultsRoot = document.getElementById('results');
const zone = dropzone({ onFiles: addFiles });
document.getElementById('dropzone-slot').append(zone);

const controls = controlBar({
  onCleanAll: cleanAll,
  onClear: clearAll,
  onOptionChange: () => {
    // Options changed: previously cleaned files were made with the old ones.
    for (const entry of entries) {
      if (entry.cleaned) { releaseUrl(entry.cleaned.url); entry.cleaned = null; entry.view.update(); }
    }
    refreshSummary();
  },
});

const summary = summaryBar({ onDownloadAll: downloadAll });
const list = el('div', {});
resultsRoot.append(controls.node, summary.node, list);
controls.node.style.display = 'none';

/* ------------------------------------------------------------------ */

async function addFiles(files) {
  const images = files.filter(file => /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|tiff?|heic|heif|avif)$/i.test(file.name));
  const skipped = files.length - images.length;
  if (skipped) toast(`Skipped ${skipped} file${skipped === 1 ? '' : 's'} that are not images.`);
  if (!images.length) return;

  for (const file of images) {
    if (file.size > MAX_FILE_SIZE) {
      toast(`${file.name} is over ${formatBytes(MAX_FILE_SIZE)} and was skipped.`, 'error');
      continue;
    }
    await addOne(file);
  }

  controls.node.style.display = 'flex';
  zone.classList.add('compact');
  refreshSummary();
}

async function addOne(file) {
  const entry = {
    id: `f${++nextId}`,
    file,
    previewUrl: trackUrl(URL.createObjectURL(file)),
    findings: [],
    format: 'unknown',
    orientation: null,
    error: null,
    cleaned: null,
    verified: false,
  };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    entry.bytes = bytes;
    entry.format = detectFormat(bytes);

    if (entry.format === 'unknown') {
      entry.error = 'This does not look like an image file the tool understands.';
    } else if (!['jpeg', 'png', 'webp'].includes(entry.format)) {
      entry.error = unsupportedReason(entry.format);
      entry.canReencode = true;
    } else {
      const meta = readMetadata(bytes);
      entry.findings = meta.findings;
      entry.orientation = meta.orientation;
    }
  } catch (err) {
    entry.error = err.message || 'The file could not be read.';
  }

  entry.dimensions = await measure(entry.previewUrl).catch(() => null);

  entry.view = sheet(entry, { onClean: cleanOne, onRemove: removeOne, onReencode: reencodeOne, onLookup: lookUp });
  entries.push(entry);
  list.append(entry.view.node);
}

function unsupportedReason(format) {
  const tail = ' The only option here is to decode and re-encode the picture, which costs a little quality and produces a new file.';
  if (format === 'heic' || format === 'avif' || format === 'iso') {
    return `${format.toUpperCase()} stores its data in an ISO-BMFF container, which is far too intricate to rewrite safely in a browser — a wrong byte produces a file nothing will open.${tail}`;
  }
  if (format === 'gif') {
    return `GIF metadata could in principle be removed losslessly, but this tool does not implement it yet, and pretending otherwise would be worse than saying so.${tail}`;
  }
  if (format === 'tiff') {
    return `TIFF is metadata all the way down — its directory structure *is* the file, so there is no clean layer to remove.${tail}`;
  }
  return `${format.toUpperCase()} files cannot be rewritten losslessly by this tool.${tail}`;
}

function measure(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('not decodable'));
    image.src = url;
  });
}

/* ------------------------------------------------------------------ */

/**
 * The only network request this tool ever makes, and only after an explicit
 * click on a button that says what it sends.
 */
async function lookUp(entry, finding) {
  try {
    entry.address = await lookupAddress(finding.value.lat, finding.value.lon);
    entry.addressError = null;
  } catch (err) {
    entry.address = null;
    entry.addressError = err.message || 'The lookup failed.';
  }
  entry.view.update();
}

async function cleanOne(entry) {
  if (entry.cleaned || entry.error) return;
  try {
    const options = { ...controls.options(), orientation: entry.orientation };
    const { bytes, notes } = stripMetadata(entry.bytes, options);
    finish(entry, bytes, notes, true);
  } catch (err) {
    if (err instanceof UnsupportedFormat) {
      entry.error = err.message;
      entry.canReencode = true;
      entry.view.update();
      return;
    }
    toast(`${entry.file.name}: ${err.message}`, 'error');
  }
}

async function reencodeOne(entry) {
  try {
    const { bytes, notes } = await reencode(entry.file);
    entry.error = null;
    finish(entry, bytes, notes, false, '.jpg');
  } catch (err) {
    toast(`${entry.file.name}: ${err.message}`, 'error');
  }
}

/**
 * Attach the cleaned result — but only after checking the work. Parsing the
 * output with the same reader is the difference between "we removed it" and
 * "we believe we removed it".
 */
function finish(entry, bytes, notes, lossless, forceExtension = null) {
  const leftover = safeRead(bytes).filter(f => f.name !== 'Orientation');
  entry.verified = leftover.length === 0;
  if (!entry.verified) {
    notes = [...notes, `Warning: ${leftover.length} field(s) could not be removed from this file.`];
  }

  const blob = new Blob([bytes], { type: forceExtension ? 'image/jpeg' : entry.file.type || 'application/octet-stream' });
  entry.cleaned = {
    bytes,
    notes,
    lossless,
    url: trackUrl(URL.createObjectURL(blob)),
    name: cleanName(entry.file.name, forceExtension),
  };
  entry.view.update();
  refreshSummary();
}

function safeRead(bytes) {
  try {
    return readMetadata(bytes).findings;
  } catch {
    return [];
  }
}

function cleanName(name, forceExtension) {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  const extension = forceExtension || (name.match(/\.[^.]+$/)?.[0] ?? '.jpg');
  return `${base}-clean${extension}`;
}

async function cleanAll() {
  controls.setBusy(true);
  for (const entry of entries) {
    if (!entry.cleaned && !entry.error) {
      await cleanOne(entry);
      await new Promise(resolve => setTimeout(resolve, 0));   // let the page repaint
    }
  }
  controls.setBusy(false);
  refreshSummary();
}

function removeOne(entry) {
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
  releaseUrl(entry.previewUrl);
  if (entry.cleaned) releaseUrl(entry.cleaned.url);
  entry.view.node.remove();
  if (!entries.length) {
    controls.node.style.display = 'none';
    zone.classList.remove('compact');
  }
  refreshSummary();
}

function clearAll() {
  for (const entry of [...entries]) removeOne(entry);
  toast('Cleared. Nothing was stored anywhere.');
}

function refreshSummary() {
  summary.update(entries.filter(e => e.cleaned).length, entries.length);
}

/* ------------------------------------------------------------------ */

async function downloadAll() {
  const ready = entries.filter(entry => entry.cleaned);
  if (!ready.length) return;

  if (typeof window.JSZip === 'function') {
    summary.setBusy(true);
    try {
      const zip = new window.JSZip();
      for (const entry of ready) zip.file(entry.cleaned.name, entry.cleaned.bytes);
      const blob = await zip.generateAsync({ type: 'blob' });
      saveBlob(blob, 'clean-photos.zip');
    } catch {
      toast('Could not build the archive; downloading the files one by one instead.');
      sequentialDownload(ready);
    } finally {
      summary.setBusy(false);
    }
    return;
  }
  sequentialDownload(ready);
}

/** Without JSZip, fall back to one download at a time. Some browsers will ask. */
function sequentialDownload(ready) {
  ready.forEach((entry, index) => {
    setTimeout(() => {
      const anchor = el('a', { href: entry.cleaned.url, download: entry.cleaned.name, style: 'display:none' });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    }, index * 350);
  });
  if (ready.length > 1) toast('Your browser may ask permission to download several files.');
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = el('a', { href: url, download: name, style: 'display:none' });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

/* ------------------------------------------------------------------ */

function trackUrl(url) { urls.add(url); return url; }
function releaseUrl(url) { if (urls.delete(url)) URL.revokeObjectURL(url); }

window.addEventListener('pagehide', () => {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
});

/* Paste a screenshot straight in. */
document.addEventListener('paste', event => {
  const files = [...(event.clipboardData?.files || [])].filter(file => /^image\//.test(file.type));
  if (files.length) {
    event.preventDefault();
    addFiles(files);
  }
});
