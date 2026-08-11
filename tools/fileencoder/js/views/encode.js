/* views/encode.js — file in, portable data out.
 *
 * Memory is the recurring concern here. A 50 MB file becomes a 67 MB string,
 * and putting that string in the DOM would freeze the tab for seconds. So the
 * output component caps what it renders, encoding runs in chunks that let the
 * browser paint, and very large files are refused with a reason rather than
 * attempted.
 */

import {
  el, card, button, notice, toast, toastError, copyText, download,
  dropzone, readHead, formatBytes, progressBar, output, safeFileName,
} from '../ui.js';
import { sniff, PREVIEWABLE } from '../sniff.js';
import { encodeBase64, toDataUrl } from '../encode.js';
import { advise, VERY_LARGE_FILE, DOM_PREVIEW_LIMIT } from '../advise.js';
import { fileFacts, qrGauge, adviceCard } from '../report.js';
import { buildPayload, renderQr, qrToPng, generatorAvailable } from '../qr.js';
import { takeStagedFiles, stageFiles } from '../state.js';

export function mount(root) {
  const list = el('div', { class: 'stack' });
  const multiBar = el('div', { class: 'toolbar', hidden: true });
  const entries = [];

  const zone = dropzone({
    title: 'Drop files here',
    sub: 'or click to browse · analysis appears straight away',
    onFiles: add,
  });

  root.append(
    card('Encode a file', 'Everything below happens in this tab. Nothing is uploaded.', zone, multiBar),
    list
  );

  async function add(files) {
    for (const file of files) {
      const entry = await describe(file);
      entries.push(entry);
      list.append(entry.node);
    }
    zone.classList.add('compact');
    renderMultiBar();
  }

  function renderMultiBar() {
    multiBar.hidden = entries.length < 2;
    if (entries.length < 2) return;
    const total = entries.reduce((sum, e) => sum + e.file.size, 0);
    multiBar.replaceChildren(
      el('span', { class: 'toolbar-text', text: `${entries.length} files selected · ${formatBytes(total)} in total` }),
      el('span', { class: 'grow' }),
      button('Create archive and encode', { kind: 'primary', onclick: archiveAll }),
      button('Clear', { kind: 'ghost', onclick: () => { entries.length = 0; list.replaceChildren(); renderMultiBar(); zone.classList.remove('compact'); } })
    );
  }

  async function archiveAll() {
    if (typeof window.JSZip !== 'function') {
      toastError('The archive library did not load, so files can only be encoded one by one.');
      return;
    }
    const bar = progressBar();
    multiBar.append(bar.node);
    bar.show('Building the archive…');
    try {
      const zip = new window.JSZip();
      const used = new Set();
      for (const entry of entries) {
        // Two files of the same name would otherwise silently overwrite.
        let name = safeFileName(entry.file.name);
        let suffix = 1;
        while (used.has(name)) name = `${suffix++}-${safeFileName(entry.file.name)}`;
        used.add(name);
        zip.file(name, entry.file);
      }
      const blob = await zip.generateAsync({ type: 'blob' }, meta => bar.set(meta.percent / 100));
      bar.hide();
      const archive = new File([blob], 'archive.zip', { type: 'application/zip' });
      const entry = await describe(archive);
      entries.length = 0;
      list.replaceChildren(entry.node);
      entries.push(entry);
      renderMultiBar();
      toast(`Archive built — ${formatBytes(blob.size)}`, 'ok');
    } catch (err) {
      toastError(err, 'The archive could not be built');
    } finally {
      bar.node.remove();
    }
  }

  const staged = takeStagedFiles();
  if (staged.length) add(staged);

  return () => { entries.length = 0; };
}

/* ------------------------------------------------------------------ */

/** Build one analysis card, with its actions wired up. */
export async function describe(file) {
  const head = await readHead(file);
  const detected = sniff(head, file.name);
  const info = {
    name: file.name,
    size: file.size,
    mime: detected.mime,
    label: detected.label,
    source: detected.source,
    mismatch: detected.mismatch,
  };
  const advice = advise(info);

  const bar = progressBar();
  const out = output(DOM_PREVIEW_LIMIT);
  const results = el('div', { class: 'results' });
  let base64 = null;

  const encodeButton = button('Encode as Base64', {
    kind: 'primary',
    disabled: file.size === 0 || file.size > VERY_LARGE_FILE,
    onclick: () => run('base64'),
  });
  const dataUrlButton = button('As data URL', {
    disabled: file.size === 0 || file.size > VERY_LARGE_FILE,
    onclick: () => run('dataurl'),
  });
  const qrButton = button('Generate QR code', {
    disabled: advice.qr.verdict === 'too-large' || !generatorAvailable(),
    title: advice.qr.verdict === 'too-large'
      ? 'The payload does not fit in any QR code'
      : (generatorAvailable() ? '' : 'The QR library did not load'),
    onclick: () => run('qr'),
  });

  async function ensureBase64() {
    if (base64 !== null) return base64;
    bar.show('Reading the file…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    bar.set(0, 'Encoding…');
    base64 = await encodeBase64(bytes, ratio => bar.set(ratio, `Encoding… ${Math.round(ratio * 100)}%`));
    bar.hide();
    return base64;
  }

  async function run(mode) {
    try {
      for (const b of [encodeButton, dataUrlButton, qrButton]) b.disabled = true;
      const encoded = await ensureBase64();

      if (mode === 'base64') {
        out.set(encoded);
        results.replaceChildren(
          el('div', { class: 'result-head' },
            el('span', { class: 'result-title', text: 'Base64 output' }),
            el('span', { class: 'result-size', text: `${formatBytes(encoded.length)} · ${encoded.length.toLocaleString()} characters` })),
          out.node,
          el('div', { class: 'btn-row' },
            button('Copy', { onclick: () => copyText(encoded) }),
            button('Download .txt', { onclick: () =>
              download(new Blob([encoded], { type: 'text/plain' }), `${baseName(file.name)}.base64.txt`) })
          )
        );
      } else if (mode === 'dataurl') {
        const url = toDataUrl(info.mime, encoded);
        out.set(url);
        results.replaceChildren(
          el('div', { class: 'result-head' },
            el('span', { class: 'result-title', text: 'Data URL' }),
            el('span', { class: 'result-size', text: `${formatBytes(url.length)} · MIME ${info.mime}` })),
          out.node,
          el('div', { class: 'btn-row' },
            button('Copy', { onclick: () => copyText(url) }),
            button('Download .txt', { onclick: () =>
              download(new Blob([url], { type: 'text/plain' }), `${baseName(file.name)}.dataurl.txt`) })
          ),
          PREVIEWABLE(info.mime) && encoded.length < 4_000_000
            ? el('img', { class: 'preview-image', src: url, alt: `Preview of ${file.name}`, hidden: !/^image\//.test(info.mime) })
            : null
        );
      } else if (mode === 'qr') {
        renderQrResult(encoded);
      }
    } catch (err) {
      toastError(err, 'Encoding failed');
      bar.hide();
    } finally {
      encodeButton.disabled = file.size === 0 || file.size > VERY_LARGE_FILE;
      dataUrlButton.disabled = encodeButton.disabled;
      qrButton.disabled = advice.qr.verdict === 'too-large' || !generatorAvailable();
    }
  }

  function renderQrResult(encoded) {
    const payload = buildPayload({ filename: file.name, mime: info.mime, base64: encoded });
    const level = advice.qr.best?.level ?? 'L';

    let rendered;
    try {
      rendered = renderQr(payload, level, 340);
    } catch (err) {
      results.replaceChildren(notice(err.message, 'error'));
      return;
    }

    results.replaceChildren(
      el('div', { class: 'result-head' },
        el('span', { class: 'result-title', text: 'QR code' }),
        el('span', { class: 'result-size', text: `version ${rendered.version} · ${rendered.modules}×${rendered.modules} modules · error correction ${level}` })),
      el('div', { class: 'qr-frame' }, rendered.svg),
      el('p', { class: 'qr-note', text:
        'The code carries the file itself, not a link to it: filename, MIME type and the Base64 data. Scan it in the QR Tools section on another device to get the file back.' }),
      el('div', { class: 'btn-row' },
        button('Download PNG', { onclick: async () => {
          try {
            download(await qrToPng(rendered.svg), `${baseName(file.name)}.qr.png`);
          } catch (err) { toastError(err, 'The PNG could not be created'); }
        } }),
        button('Copy payload', { onclick: () => copyText(payload) })
      )
    );
  }

  const node = card(null, null,
    fileFacts(info),
    qrGauge(advice.qr),
    adviceCard(advice),
    el('div', { class: 'btn-row' }, encodeButton, dataUrlButton, qrButton),
    bar.node,
    results
  );

  return { file, info, advice, node };
}

function baseName(name) {
  return safeFileName(name).replace(/\.[^.]+$/, '') || 'file';
}
