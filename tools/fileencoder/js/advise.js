/* advise.js — "what should I do with this file?"
 *
 * The analysis numbers are only half the job. Someone holding a 4 MB PDF does
 * not need to be told its Base64 length; they need to be told that a QR code is
 * out of the question and why, and what to do instead.
 *
 * Every verdict here follows from the measured numbers. None of it is
 * decoration, and nothing claims a capability the tool does not have.
 */

import { base64Length, base64Overhead } from './encode.js';
import { analyzeQr } from './qr.js';

/** Above this, holding the Base64 string in memory starts to hurt. */
export const LARGE_FILE = 20 * 1024 * 1024;
export const VERY_LARGE_FILE = 100 * 1024 * 1024;

/** Beyond this many characters the output is never put in the DOM in full. */
export const DOM_PREVIEW_LIMIT = 100_000;

/**
 * @param {{name, size, mime, label}} file
 * @returns {{options: Array, recommendation: string, warnings: Array}}
 */
export function advise(file) {
  const base64Size = base64Length(file.size);
  const overhead = base64Overhead(file.size);
  const qr = analyzeQr({ byteLength: file.size, filename: file.name, mime: file.mime });

  const options = [];
  const warnings = [];

  /* --- Base64 --- */
  if (file.size === 0) {
    options.push({
      id: 'base64', ok: false, title: 'Base64',
      text: 'The file is empty, so there is nothing to encode.',
    });
  } else if (file.size > VERY_LARGE_FILE) {
    options.push({
      id: 'base64', ok: false, title: 'Base64',
      text: `At ${formatBytes(file.size)} the Base64 output would be about ${formatBytes(base64Size)}, held in memory as a single string.`
        + ' Browsers will usually run out of memory or freeze first. Move the file directly instead.',
    });
  } else if (file.size > LARGE_FILE) {
    options.push({
      id: 'base64', ok: true, warn: true, title: 'Base64',
      text: `Possible, but the output will be about ${formatBytes(base64Size)}. Encoding takes a moment and the result is too large to display,`
        + ' so it will be offered as a download rather than shown.',
    });
  } else {
    options.push({
      id: 'base64', ok: true, title: 'Base64',
      text: `Straightforward. The output is about ${formatBytes(base64Size)}, ${overhead.toFixed(1)}% larger than the file itself —`
        + ' that overhead is inherent to Base64, not something this tool adds.',
    });
  }

  /* --- Data URL --- */
  const dataUrlSensible = file.size <= 512 * 1024;
  options.push({
    id: 'dataurl', ok: dataUrlSensible, warn: !dataUrlSensible && file.size <= 2 * 1024 * 1024,
    title: 'Data URL',
    text: dataUrlSensible
      ? 'Small enough to paste straight into CSS, HTML or a config file.'
      : `At ${formatBytes(base64Size)} the data URL would be unwieldy in a source file, and some tools cap URLs well below this.`,
  });

  /* --- QR --- */
  options.push({
    id: 'qr',
    ok: qr.verdict === 'ready',
    warn: qr.verdict === 'possible',
    title: 'QR code',
    text: qr.reason,
  });

  /* --- what to actually do --- */
  let recommendation;
  if (file.size === 0) {
    recommendation = 'Nothing to do — the file has no contents.';
  } else if (qr.verdict === 'ready') {
    recommendation = 'A QR code. The file is genuinely small enough, and scanning it is faster than moving a file around.';
  } else if (qr.verdict === 'possible') {
    recommendation = 'Base64. A QR code would technically hold it, but at that density scanning is unreliable — the text is the safer route.';
  } else if (file.size > VERY_LARGE_FILE) {
    recommendation = 'Neither. Encoding a file this size in the browser is not sensible; use a file transfer instead.';
  } else if (dataUrlSensible) {
    recommendation = 'Base64, or a data URL if you want to embed it directly in source.';
  } else {
    recommendation = 'Base64, downloaded as a text file. Too large for a data URL and far too large for QR.';
  }

  /* --- things worth saying out loud --- */
  if (file.mismatch) {
    warnings.push(`The contents say this is ${file.label.toLowerCase()}, which does not match the file extension. The contents are what matters here.`);
  }
  if (file.size > LARGE_FILE && file.size <= VERY_LARGE_FILE) {
    warnings.push(`Large file: encoding ${formatBytes(file.size)} will take a few seconds and use roughly ${formatBytes(file.size * 2.4)} of memory while it runs.`);
  }
  if (file.size > VERY_LARGE_FILE) {
    warnings.push(`${formatBytes(file.size)} is beyond what this tool can encode safely. Attempting it risks crashing the tab.`);
  }
  if (file.size === 0) {
    warnings.push('This file is empty — zero bytes.');
  }

  return { options, recommendation, warnings, qr, base64Size, overhead };
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
