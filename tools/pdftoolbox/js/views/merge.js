/* merge.js — several PDFs, one output, order under the user's control. */

import { el, pageHead, toast, showError, progress, formatBytes, setStatus } from '../ui.js';
import { dropzone, download, PDF_ACCEPT, UrlPool } from '../files.js';
import { fileList } from '../components/filelist.js';
import { buildPdf } from '../pdf-engine.js';
import { loadWithPassword, firstPageThumb } from '../load.js';

export function mount(root) {
  const entries = [];            // { id, name, meta, thumb, source }
  const pool = new UrlPool();
  const thumbs = new Set();
  let nextId = 0;

  const list = fileList(entries, { onChange: update });
  const mergeBtn = el('button', { class: 'btn primary', onclick: run, disabled: true }, 'Merge and download');
  const clearBtn = el('button', { class: 'btn', onclick: clearAll, disabled: true }, 'Clear');
  const summary = el('span', { class: 'dim' });

  const zone = dropzone({
    mainText: 'Drop PDFs here or click to choose',
    subText: 'Several at once is fine. Drag the rows to set the order.',
    accept: PDF_ACCEPT, kind: 'pdf', onFiles: add,
  });

  root.append(
    pageHead('merge PDFs', 'Combine any number of PDFs into one file. Pages keep their original size and rotation.'),
    zone,
    list.node,
    el('div', { class: 'toolbar' }, mergeBtn, clearBtn, el('span', { class: 'grow' }), summary)
  );
  list.render();
  update();

  async function add(files) {
    const bar = progress('Reading PDFs');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        bar.set(i / files.length, file.name);
        try {
          const source = await loadWithPassword(file);
          if (!source) continue;
          const id = `f${++nextId}`;
          const thumb = await firstPageThumb(source, pool);
          // Merging only needs pdf-lib from here on. Dropping the pdf.js
          // document frees its worker-side copy of the file straight away.
          source.pdfjsDoc?.destroy();
          source.pdfjsDoc = null;
          entries.push({
            id,
            name: file.name,
            meta: `${source.pageCount} page${source.pageCount === 1 ? '' : 's'} · ${formatBytes(file.size)}`,
            thumb,
            source,
          });
          if (thumb) thumbs.add(thumb);
        } catch (err) {
          showError(err, `Could not read ${file.name}`);
        }
      }
      bar.set(1);
    } finally {
      bar.done();
    }
    list.render();
    update();
  }

  function update() {
    releaseDroppedThumbs();
    list.render();
    const pages = entries.reduce((n, e) => n + e.source.pageCount, 0);
    mergeBtn.disabled = entries.length < 2;
    clearBtn.disabled = entries.length === 0;
    summary.textContent = entries.length
      ? `${entries.length} file${entries.length === 1 ? '' : 's'} · ${pages} pages`
      : 'No files yet.';
    setStatus(entries.length ? `merge: ${entries.length} files loaded` : 'idle');
    zone.classList.toggle('compact', entries.length > 0);
  }

  /** Rows removed from the list still held an object URL — let it go. */
  function releaseDroppedThumbs() {
    const alive = new Set(entries.map(e => e.thumb).filter(Boolean));
    for (const url of [...thumbs]) {
      if (alive.has(url)) continue;
      pool.revoke(url);
      thumbs.delete(url);
    }
  }

  function clearAll() {
    for (const e of entries) e.source.pdfjsDoc?.destroy();
    entries.length = 0;
    thumbs.clear();
    pool.clear();
    update();
  }

  async function run() {
    if (entries.length < 2) {
      toast('Need at least two files', 'Add another PDF to merge.', 'warn');
      return;
    }
    const bar = progress('Merging');
    try {
      const sources = new Map();
      const items = [];
      for (const entry of entries) {
        sources.set(entry.id, { ...entry.source, id: entry.id, type: 'pdf' });
        for (let i = 0; i < entry.source.pageCount; i++) {
          items.push({ sourceId: entry.id, pageIndex: i, rotation: 0 });
        }
      }
      const blob = await buildPdf(items, sources, { onProgress: (r, label) => bar.set(r, label) });
      download(blob, 'merged.pdf');
      toast('Merged', `${items.length} pages · ${formatBytes(blob.size)} · saved as merged.pdf`);
    } catch (err) {
      showError(err, 'Merge failed');
    } finally {
      bar.done();
    }
  }

  return () => {
    clearAll();
    pool.clear();
  };
}

