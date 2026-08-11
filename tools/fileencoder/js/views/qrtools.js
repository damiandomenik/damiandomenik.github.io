/* views/qrtools.js — make a QR code from text or a small file, and read one back.
 *
 * Reading uses the browser's own BarcodeDetector where it exists, falling back
 * to jsQR. Firefox has neither built in, so if the fallback did not load the
 * interface says so rather than offering a button that does nothing.
 */

import {
  el, card, button, notice, toast, toastError, copyText, download,
  dropzone, formatBytes, debounce, safeFileName,
} from '../ui.js';
import {
  analyzeQr, buildPayload, parsePayload, renderQr, qrToPng, versionFor,
  generatorAvailable, readerAvailable, readerName, decodeQrFromSource, byteLength,
} from '../qr.js';
import { encodeBase64Sync } from '../encode.js';
import { decodeBase64 } from '../encode.js';
import { sniff, iconFor } from '../sniff.js';
import { qrGauge } from '../report.js';

export function mount(root) {
  const urls = new Set();
  const track = url => { urls.add(url); return url; };

  /* ---------------- generate from text ---------------- */

  const textInput = el('textarea', {
    class: 'input mono', rows: '4', spellcheck: 'false',
    'aria-label': 'Text to encode in a QR code',
    placeholder: 'Any text — a note, a URL, a config snippet…',
  });
  const textGauge = el('div', {});
  const textResult = el('div', { class: 'stack' });

  const updateText = () => {
    const value = textInput.value;
    if (!value) { textGauge.replaceChildren(); textResult.replaceChildren(); return; }
    const bytes = byteLength(value);
    // Plain text goes in raw — no envelope, no Base64 — so it holds far more
    // than a file of the same size would.
    const analysis = analyzeQr({ byteLength: 0, filename: '', mime: '' });
    const levels = analysis.levels.map(level => {
      const version = versionFor(bytes, level.level);
      return { ...level, version, fits: version !== null, comfortable: version !== null && version <= 20 };
    });
    const best = levels.find(l => l.comfortable) ?? levels.find(l => l.fits) ?? null;
    textGauge.replaceChildren(qrGauge({
      payloadBytes: bytes,
      levels,
      verdict: best ? (best.comfortable ? 'ready' : 'possible') : 'too-large',
      reason: best
        ? `${bytes} bytes of text fits in a version ${best.version} code at ${best.name.toLowerCase()} error correction.`
        : `${bytes} bytes of text is more than the 2,953 bytes a QR code can hold.`,
    }));
  };
  textInput.addEventListener('input', debounce(updateText, 150));

  function makeTextQr() {
    const value = textInput.value;
    if (!value.trim()) { toast('Type something first', 'warn'); return; }
    if (!generatorAvailable()) { toastError('The QR library did not load.'); return; }
    try {
      const rendered = renderQr(value, 'M', 340);
      showQr(textResult, rendered, value, 'qr-code.png', 'M');
    } catch (err) {
      textResult.replaceChildren(notice(
        `${err.message} Text of this length does not fit — a QR code holds at most 2,953 bytes.`, 'error'));
    }
  }

  /* ---------------- generate from a file ---------------- */

  const fileResult = el('div', { class: 'stack' });
  const fileZone = dropzone({
    title: 'Drop a small file',
    sub: 'the analysis will say straight away whether it fits',
    multiple: false,
    compact: true,
    onFiles: files => fromFile(files[0]),
  });

  async function fromFile(file) {
    fileResult.replaceChildren(el('p', { class: 'output-note', text: 'Reading…' }));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const head = bytes.subarray(0, 4096);
      const detected = sniff(head, file.name);
      const analysis = analyzeQr({ byteLength: bytes.length, filename: file.name, mime: detected.mime });

      const pieces = [qrGauge(analysis)];
      if (analysis.verdict === 'too-large') {
        pieces.push(notice(
          `No QR code can hold this. The largest file that would fit under this filename is about ${formatBytes(analysis.maxFileBytes)}.`,
          'error'));
      } else {
        const payload = buildPayload({ filename: file.name, mime: detected.mime, base64: encodeBase64Sync(bytes) });
        const level = analysis.best.level;
        const rendered = renderQr(payload, level, 340);
        const box = el('div', { class: 'stack' });
        showQr(box, rendered, payload, `${safeFileName(file.name).replace(/\.[^.]+$/, '')}.qr.png`, level);
        pieces.push(box);
      }
      fileResult.replaceChildren(...pieces);
    } catch (err) {
      toastError(err, 'That file could not be read');
      fileResult.replaceChildren();
    }
  }

  function showQr(container, rendered, payload, filename, level) {
    container.replaceChildren(
      el('div', { class: 'result-head' },
        el('span', { class: 'result-title', text: 'QR code' }),
        el('span', { class: 'result-size', text: `version ${rendered.version} · error correction ${level} · ${byteLength(payload)} bytes` })),
      el('div', { class: 'qr-frame' }, rendered.svg),
      el('div', { class: 'btn-row' },
        button('Download PNG', { onclick: async () => {
          try { download(await qrToPng(rendered.svg), filename); }
          catch (err) { toastError(err, 'The PNG could not be created'); }
        } }),
        button('Copy payload', { onclick: () => copyText(payload) })
      )
    );
  }

  /* ---------------- read a QR code ---------------- */

  const readResult = el('div', { class: 'stack' });
  const readZone = dropzone({
    title: 'Drop a QR image',
    sub: 'a screenshot or photo of the code',
    accept: 'image/*',
    multiple: false,
    compact: true,
    onFiles: files => readImage(files[0]),
  });

  const video = el('video', { class: 'camera', playsinline: true, muted: true, hidden: true });
  let stream = null;
  let scanTimer = null;

  const cameraButton = button('Scan with the camera', { onclick: toggleCamera });

  async function toggleCamera() {
    if (stream) { stopCamera(); return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      toastError('This browser does not offer camera access to pages.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      cameraButton.textContent = 'Stop the camera';
      scanTimer = setInterval(scanFrame, 250);
    } catch (err) {
      toastError(err?.name === 'NotAllowedError'
        ? 'Camera access was refused. You can still drop a picture of the code instead.'
        : err, 'The camera could not be started');
      stopCamera();
    }
  }

  function stopCamera() {
    clearInterval(scanTimer);
    scanTimer = null;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    cameraButton.textContent = 'Scan with the camera';
  }

  async function scanFrame() {
    if (!stream || video.readyState < 2) return;
    try {
      const text = await decodeQrFromSource(video);
      if (text) { stopCamera(); handlePayload(text); }
    } catch {
      // Nothing found in this frame; that is the normal case while aiming.
    }
  }

  async function readImage(file) {
    readResult.replaceChildren(el('p', { class: 'output-note', text: 'Looking for a code…' }));
    try {
      const bitmap = await createImageBitmap(file);
      const text = await decodeQrFromSource(bitmap);
      bitmap.close?.();
      handlePayload(text);
    } catch (err) {
      readResult.replaceChildren(notice(err.message, 'error'));
    }
  }

  function handlePayload(text) {
    const parsed = parsePayload(text);
    if (!parsed.ok) {
      readResult.replaceChildren(
        notice(parsed.error, 'warn'),
        el('div', { class: 'output' },
          el('pre', { class: 'output-pre' }, el('code', { class: 'output-text', text: text.slice(0, 2000) })),
          el('div', { class: 'btn-row' }, button('Copy the raw contents', { onclick: () => copyText(text) }))
        )
      );
      return;
    }

    let bytes;
    try {
      bytes = decodeBase64(parsed.base64).bytes;
    } catch (err) {
      readResult.replaceChildren(notice(`The payload carried damaged data: ${err.message}`, 'error'));
      return;
    }

    const detected = sniff(bytes.subarray(0, 4096), parsed.filename);
    const blob = new Blob([bytes], { type: detected.source === 'bytes' ? detected.mime : parsed.mime });
    const url = track(URL.createObjectURL(blob));

    readResult.replaceChildren(
      el('div', { class: 'detected' },
        el('span', { class: 'detected-icon', 'aria-hidden': 'true', text: iconFor(blob.type) }),
        el('div', {},
          el('span', { class: 'detected-label', text: parsed.filename }),
          el('span', { class: 'detected-size', text: `${detected.label} · ${formatBytes(bytes.length)}` })
        )
      ),
      /^image\//.test(blob.type) ? el('img', { class: 'preview-image', src: url, alt: `Preview of ${parsed.filename}` }) : null,
      el('div', { class: 'btn-row' },
        button('Download', { kind: 'primary', onclick: () => download(blob, parsed.filename) }))
    );
    toast(`Recovered ${parsed.filename}`, 'ok');
  }

  /* ---------------- assembly ---------------- */

  root.append(
    card('QR from text', 'Plain text goes into the code as-is, so it holds considerably more than a file of the same size would.',
      textInput,
      el('div', { class: 'btn-row' }, button('Generate', { kind: 'primary', onclick: makeTextQr })),
      textGauge, textResult),

    card('QR from a file', 'The code carries the file itself — name, type and data — so another device can rebuild it.',
      fileZone, fileResult),

    card('Read a QR code', readerAvailable()
      ? `Reading uses ${readerName()}.`
      : 'No QR reader is available in this browser.',
      readerAvailable() ? null : notice(
        'This browser has no built-in barcode reader and the fallback library did not load, so codes cannot be read here. Chrome, Edge, Safari and Android browsers all work.',
        'warn'),
      readerAvailable() ? readZone : null,
      readerAvailable() ? el('div', { class: 'btn-row' }, cameraButton) : null,
      video,
      readResult)
  );

  updateText();

  return () => {
    stopCamera();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  };
}
