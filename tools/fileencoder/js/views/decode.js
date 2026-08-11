/* views/decode.js — Base64 or a data URL back into a file. */

import {
  el, card, button, notice, toast, toastError, copyText, download,
  formatBytes, debounce, safeFileName,
} from '../ui.js';
import { decodeBase64, parseDataUrl, looksLikeBase64, DecodeError } from '../encode.js';
import { sniff, iconFor, PREVIEWABLE } from '../sniff.js';
import { fileFacts } from '../report.js';

const MAX_INPUT = 30 * 1024 * 1024;      // characters of pasted text

export function mount(root) {
  const input = el('textarea', {
    class: 'input mono', rows: '8', spellcheck: 'false', autocapitalize: 'off',
    'aria-label': 'Base64 or data URL to decode',
    placeholder: 'Paste Base64 here, or a full data:image/png;base64,… URL',
  });

  const status = el('div', { class: 'stack' });
  const resultBox = el('div', { class: 'stack' });
  const urls = new Set();

  const decodeButton = button('Decode', { kind: 'primary', onclick: run });
  const clearButton = button('Clear', { kind: 'ghost', onclick: () => {
    input.value = '';
    status.replaceChildren();
    clearResult();
    hint();
  } });

  input.addEventListener('input', debounce(hint, 150));

  function hint() {
    const text = input.value.trim();
    if (!text) { status.replaceChildren(); return; }
    if (text.length > MAX_INPUT) {
      status.replaceChildren(notice(
        `That is ${formatBytes(text.length)} of text. Above about ${formatBytes(MAX_INPUT)} the browser struggles to hold it — decode it in pieces, or use the original file.`,
        'error'));
      return;
    }

    const dataUrl = parseDataUrl(text);
    if (dataUrl) {
      status.replaceChildren(el('div', { class: 'stat-grid' },
        el('div', { class: 'stat' },
          el('span', { class: 'stat-label', text: 'Format' }),
          el('span', { class: 'stat-value', text: 'Data URL' })),
        el('div', { class: 'stat' },
          el('span', { class: 'stat-label', text: 'MIME' }),
          el('span', { class: 'stat-value', text: dataUrl.mime })),
        el('div', { class: 'stat' },
          el('span', { class: 'stat-label', text: 'Encoding' }),
          el('span', { class: 'stat-value', text: dataUrl.base64 ? 'Base64' : 'percent-encoded' }))
      ));
      return;
    }
    status.replaceChildren(notice(
      looksLikeBase64(text)
        ? `Looks like Base64 — ${text.replace(/\s+/g, '').length.toLocaleString()} characters, roughly ${formatBytes(text.replace(/\s+/g, '').length * 3 / 4)} of data.`
        : 'This does not look like Base64. Decoding it will probably fail, but you can try.',
      looksLikeBase64(text) ? 'info' : 'warn'));
  }

  function clearResult() {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    resultBox.replaceChildren();
  }

  function run() {
    // clearResult revokes the previous result's URL. Without this, decoding
    // five things in a row left four blobs alive for the life of the tab.
    clearResult();
    let decoded;
    try {
      decoded = decodeBase64(input.value);
    } catch (err) {
      resultBox.replaceChildren(notice(
        err instanceof DecodeError ? err.message : `Could not decode: ${err.message}`, 'error'));
      return;
    }

    if (!decoded.bytes.length) {
      resultBox.replaceChildren(notice('The data decoded to zero bytes — there is no file in it.', 'warn'));
      return;
    }

    const detected = sniff(decoded.bytes.subarray(0, 4096), '');
    // A data URL states its own type; trust it only where the bytes cannot decide.
    const mime = detected.source === 'bytes' ? detected.mime : (decoded.mime || detected.mime);
    const label = detected.source === 'bytes' ? detected.label : (decoded.mime ? `${decoded.mime} (as declared)` : detected.label);
    const name = `decoded.${detected.ext || extensionFor(mime)}`;

    const blob = new Blob([decoded.bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    urls.add(url);

    resultBox.replaceChildren(
      el('div', { class: 'detected' },
        el('span', { class: 'detected-icon', 'aria-hidden': 'true', text: iconFor(mime) }),
        el('div', {},
          el('span', { class: 'detected-label', text: label }),
          el('span', { class: 'detected-size', text: `${formatBytes(decoded.bytes.length)} · ${decoded.bytes.length.toLocaleString()} bytes` })
        )
      ),
      decoded.urlSafe ? notice('This was URL-safe Base64 (using - and _), which was converted before decoding.', 'info') : null,
      preview(mime, url, decoded.bytes),
      el('div', { class: 'btn-row' },
        button('Download', { kind: 'primary', onclick: () => download(blob, name) }),
        button('Copy as data URL', { onclick: () => copyText(`data:${mime};base64,${input.value.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')}`) })
      )
    );
  }

  root.append(
    card('Decode Base64', 'Paste Base64 or a data URL. The type is read from the decoded bytes, not from what the text claims.',
      input,
      el('div', { class: 'btn-row' }, decodeButton, clearButton),
      status),
    resultBox
  );

  return () => clearResult();
}

function preview(mime, url, bytes) {
  if (/^image\//.test(mime)) {
    return el('img', { class: 'preview-image', src: url, alt: 'Preview of the decoded image' });
  }
  if (/^audio\//.test(mime)) return el('audio', { src: url, controls: true, class: 'preview-media' });
  if (/^video\//.test(mime)) return el('video', { src: url, controls: true, class: 'preview-media' });
  if (/^text\/|json|xml|javascript/.test(mime)) {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, 4000));
    } catch {
      return null;
    }
    return el('pre', { class: 'output-pre' }, el('code', { class: 'output-text', text }));
  }
  if (mime === 'application/pdf') {
    return el('p', { class: 'output-note', text: 'PDF preview is not shown here — download it and open it in a viewer you trust.' });
  }
  return null;
}

function extensionFor(mime) {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'application/zip': 'zip',
    'text/plain': 'txt', 'application/json': 'json', 'text/html': 'html',
    'audio/mpeg': 'mp3', 'video/mp4': 'mp4',
  };
  return map[mime] || 'bin';
}
