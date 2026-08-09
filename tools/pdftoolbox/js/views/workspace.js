/* workspace.js — the page-level editor.
 *
 * Organize, split, rotate and build are the same editor with different
 * controls switched on, so page ordering behaves identically everywhere.
 */

import { el, pageHead, toast, showError, progress, formatBytes, askPassword, setStatus } from '../ui.js';
import { dropzone, download, PDF_ACCEPT, IMAGE_ACCEPT } from '../files.js';
import { Composer } from '../composer.js';
import { pageGrid } from '../components/pagegrid.js';

export function workspace(root, config) {
  const {
    title,
    sub,
    kind = 'pdf',                 // 'pdf' | 'both'
    dropMain,
    dropSub,
    multiple = false,             // may more files be added after the first?
    features = {},
    exportSuffix = 'export',
    exportLabel = 'Export PDF',
  } = config;

  const composer = new Composer({ requestPassword: askPassword });
  const grid = pageGrid(composer, {
    ops: features.cellOps ?? ['move', 'rotate', 'delete'],
    onChange: refresh,
    onSelection: refresh,
  });

  const accept = kind === 'both' ? `${PDF_ACCEPT},${IMAGE_ACCEPT}` : PDF_ACCEPT;
  const zone = dropzone({
    mainText: dropMain ?? 'Drop a PDF here or click to choose',
    subText: dropSub ?? 'Everything happens in this tab.',
    accept, kind, multiple, onFiles: addFiles,
  });

  /* ---------- controls ---------- */

  const btn = (label, title, handler, cls = 'btn') =>
    el('button', { class: cls, title, onclick: handler }, label);

  const selBtns = [
    btn('Select all', 'Select every page', () => grid.selectAll()),
    btn('Clear', 'Clear the selection', () => grid.clearSelection()),
  ];

  const rotateBtns = [
    btn('⟲ 90° left', 'Rotate selection (or all pages) left', () => rotate(-90)),
    btn('⟳ 90° right', 'Rotate selection (or all pages) right', () => rotate(90)),
    btn('180°', 'Turn selection (or all pages) upside down', () => rotate(180)),
  ];

  const pageBtns = [
    btn('Duplicate', 'Duplicate the selected pages', () => withSelection(uids => composer.duplicate(uids))),
    btn('Delete', 'Delete the selected pages', () => withSelection(uids => { composer.remove(uids); grid.clearSelection(); }), 'btn danger'),
    btn('To front', 'Move the selection to the start', () => withSelection(uids => composer.moveGroup(uids, 0))),
    btn('To back', 'Move the selection to the end', () => withSelection(uids => composer.moveGroup(uids, composer.pageCount))),
  ];

  const rangeInput = el('input', {
    type: 'text', placeholder: '1-3, 5, 8-10', 'aria-label': 'Page range',
    onkeydown: e => { if (e.key === 'Enter') applyRange(); },
  });
  const rangeGroup = el('label', { class: 'field' },
    'Pages:', rangeInput,
    btn('Select', 'Select these pages', applyRange),
    btn('odd', 'Select odd pages', () => selectBy(i => i % 2 === 0), 'btn tiny'),
    btn('even', 'Select even pages', () => selectBy(i => i % 2 === 1), 'btn tiny'),
  );

  const imageFields = el('div', { class: 'options' });
  const imageOpts = buildImageOptions(imageFields);

  const exportBtn = el('button', { class: 'btn primary', onclick: () => runExport(false) }, exportLabel);
  const exportSelBtn = el('button', { class: 'btn', onclick: () => runExport(true) }, 'Export selected');
  const zipBtn = el('button', { class: 'btn', onclick: exportEachAsFile }, 'Each page as its own PDF');
  if (features.primarySelection) {
    exportBtn.className = 'btn';
    exportSelBtn.className = 'btn primary';
  }
  const resetBtn = el('button', { class: 'btn', onclick: reset }, 'Start over');
  const counter = el('span', { class: 'dim' });

  const toolbar = el('div', { class: 'toolbar' },
    features.range ? rangeGroup : null,
    features.range ? el('span', { class: 'sep' }) : null,
    ...selBtns,
    features.rotate === false ? null : el('span', { class: 'sep' }),
    features.rotate === false ? null : rotateBtns,
    features.pageOps ? el('span', { class: 'sep' }) : null,
    features.pageOps ? pageBtns : null,
  );

  const exportBar = el('div', { class: 'toolbar' },
    exportBtn,
    features.exportSelected ? exportSelBtn : null,
    features.splitEach ? zipBtn : null,
    resetBtn,
    el('span', { class: 'grow' }),
    counter
  );

  const hint = el('p', { class: 'empty-state', text: 'Click a page to select it. Shift-click for a range. Drag pages to reorder.' });

  root.append(
    pageHead(title, sub),
    zone,
    toolbar,
    features.imageSettings ? imageFields : null,
    hint,
    grid.node,
    exportBar
  );

  toolbar.hidden = true;
  exportBar.hidden = true;
  hint.hidden = true;
  imageFields.hidden = true;

  /* ---------- behaviour ---------- */

  async function addFiles(files) {
    const bar = progress('Reading files');
    let result = { added: 0, failed: [] };
    try {
      result = await composer.addFiles(files, (ratio, name) => bar.set(ratio, name));
      bar.set(1);
    } catch (err) {
      showError(err, 'Could not read that file');
    } finally {
      bar.done();
    }
    for (const { name, error } of result.failed) showError(error, `Skipped ${name}`);
    if (result.added) toast('Added', `${result.added} page${result.added === 1 ? '' : 's'}`);
    refresh();
  }

  function withSelection(action) {
    const uids = grid.getSelected();
    if (!uids.length) {
      toast('Nothing selected', 'Click the pages you want to act on first.', 'warn');
      return;
    }
    action(uids);
    refresh();
  }

  function rotate(delta) {
    const uids = grid.getSelected();
    if (uids.length) composer.rotate(uids, delta);
    else composer.rotateAll(delta);
    refresh();
  }

  function selectBy(predicate) {
    grid.setSelection(composer.pages.filter((_, i) => predicate(i)).map(p => p.uid));
  }

  function applyRange() {
    try {
      const indices = parseRange(rangeInput.value, composer.pageCount);
      if (!indices.size) throw new Error('That range selects no pages.');
      grid.setSelection([...indices].map(i => composer.pages[i].uid));
      toast('Selected', `${indices.size} page${indices.size === 1 ? '' : 's'} selected.`);
    } catch (err) {
      showError(err, 'Range not understood');
    }
  }

  function refresh() {
    grid.render();
    const has = composer.pageCount > 0;
    toolbar.hidden = !has;
    exportBar.hidden = !has;
    hint.hidden = !has;
    imageFields.hidden = !(has && features.imageSettings);
    zone.classList.toggle('compact', has);
    if (!multiple) zone.hidden = has;

    const selected = grid.selectionSize();
    counter.textContent = has
      ? `${composer.pageCount} page${composer.pageCount === 1 ? '' : 's'}${selected ? ` · ${selected} selected` : ''}`
      : '';
    exportSelBtn.disabled = selected === 0;
    setStatus(has ? `${composer.pageCount} pages in memory` : 'idle');
  }

  async function runExport(selectedOnly) {
    const uids = new Set(grid.getSelected());
    const items = selectedOnly ? composer.pages.filter(p => uids.has(p.uid)) : composer.pages;
    if (!items.length) {
      toast('Nothing to export', selectedOnly ? 'Select at least one page.' : 'Add a file first.', 'warn');
      return;
    }
    const bar = progress('Building PDF');
    try {
      const blob = await composer.export(items, {
        image: imageOpts.value(),
        onProgress: (r, label) => bar.set(r, label),
      });
      const name = composer.suggestName(selectedOnly ? 'extracted-pages' : exportSuffix);
      download(blob, name);
      toast('Saved', `${items.length} pages · ${formatBytes(blob.size)} · ${name}`);
    } catch (err) {
      showError(err, 'Export failed');
    } finally {
      bar.done();
    }
  }

  async function exportEachAsFile() {
    const uids = new Set(grid.getSelected());
    const items = uids.size ? composer.pages.filter(p => uids.has(p.uid)) : composer.pages;
    if (!items.length) { toast('Nothing to export', 'Add a file first.', 'warn'); return; }
    if (items.length > 200) {
      toast('That is a lot of files', 'Splitting more than 200 pages into single files at once may exhaust memory.', 'warn', 8000);
    }
    const bar = progress('Splitting into single files');
    try {
      const zip = new window.JSZip();
      const base = composer.baseName() || 'pages';
      for (let i = 0; i < items.length; i++) {
        bar.set(i / items.length, `page ${i + 1} of ${items.length}`);
        const blob = await composer.export([items[i]], { image: imageOpts.value() });
        zip.file(`${base}-page-${String(i + 1).padStart(3, '0')}.pdf`, blob);
      }
      bar.title('Packing ZIP');
      const out = await zip.generateAsync({ type: 'blob' }, meta => bar.set(meta.percent / 100));
      download(out, `${base}-pages.zip`);
      toast('Saved', `${items.length} files · ${formatBytes(out.size)} · ${base}-pages.zip`);
    } catch (err) {
      showError(err, 'Split failed');
    } finally {
      bar.done();
    }
  }

  function reset() {
    composer.destroy();      // frees pdf.js documents, thumbnails and object URLs
    grid.clearSelection();   // re-renders, which drops every cell
    rangeInput.value = '';
    refresh();
  }

  refresh();

  return () => {
    grid.destroy();
    composer.destroy();
  };
}

/* ---------- image placement options (builder / images) ---------- */

export function buildImageOptions(container) {
  const size = el('select', {},
    el('option', { value: 'a4' }, 'A4'),
    el('option', { value: 'letter' }, 'Letter'),
    el('option', { value: 'legal' }, 'Legal'),
    el('option', { value: 'auto' }, 'Match each image'),
  );
  const orientation = el('select', {},
    el('option', { value: 'auto' }, 'Auto'),
    el('option', { value: 'portrait' }, 'Portrait'),
    el('option', { value: 'landscape' }, 'Landscape'),
  );
  const margin = el('select', {},
    el('option', { value: '0' }, 'None'),
    el('option', { value: '28' }, 'Small (10 mm)'),
    el('option', { value: '57' }, 'Normal (20 mm)'),
  );
  margin.value = '57';
  const quality = el('select', {},
    el('option', { value: '0' }, 'Original'),
    el('option', { value: '2480' }, 'Downscale to 2480 px (A4 @ 300 dpi)'),
    el('option', { value: '1654' }, 'Downscale to 1654 px (A4 @ 200 dpi)'),
  );
  const webp = el('select', {},
    el('option', { value: 'jpeg' }, 'JPEG (smaller)'),
    el('option', { value: 'png' }, 'PNG (keeps transparency)'),
  );

  container.append(
    el('span', { class: 'dim', text: 'Image pages:' }),
    el('label', { class: 'field' }, 'Size', size),
    el('label', { class: 'field' }, 'Orientation', orientation),
    el('label', { class: 'field' }, 'Margin', margin),
    el('label', { class: 'field' }, 'Resolution', quality),
    el('label', { class: 'field', title: 'WebP is not a PDF image format, so it is re-encoded on export.' }, 'WebP as', webp),
  );

  return {
    node: container,
    value: () => ({
      size: size.value,
      orientation: orientation.value,
      margin: Number(margin.value),
      maxPx: Number(quality.value),
      webpAs: webp.value,
    }),
  };
}

/* ---------- range parsing ---------- */

/** "1-3, 5, 8-10" → Set of zero-based indices, in ascending order. */
export function parseRange(text, pageCount) {
  const raw = (text || '').trim().toLowerCase();
  if (!raw) throw new Error('Type page numbers, for example 1-3, 5, 8-10.');
  if (raw === 'all' || raw === '*') return new Set(Array.from({ length: pageCount }, (_, i) => i));

  const indices = new Set();
  for (const part of raw.split(/[,;]+/)) {
    const chunk = part.trim();
    if (!chunk) continue;
    const range = chunk.match(/^(\d+)\s*-\s*(\d+)?$/);
    const single = chunk.match(/^(\d+)$/);
    if (single) {
      const n = Number(single[1]);
      if (n < 1 || n > pageCount) throw new Error(`Page ${n} does not exist — the document has ${pageCount}.`);
      indices.add(n - 1);
    } else if (range) {
      const from = Number(range[1]);
      const to = range[2] ? Number(range[2]) : pageCount;
      if (from < 1 || to > pageCount || from > to) {
        throw new Error(`${chunk} is outside 1-${pageCount}.`);
      }
      for (let i = from; i <= to; i++) indices.add(i - 1);
    } else {
      throw new Error(`"${chunk}" is not a page number or range.`);
    }
  }
  return new Set([...indices].sort((a, b) => a - b));
}
