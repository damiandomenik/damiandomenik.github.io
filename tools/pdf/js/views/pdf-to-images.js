/* pdf-to-images.js — rasterise pages to PNG or JPEG, one file or a ZIP. */

import { el, pageHead, toast, showError, progress, formatBytes, setStatus, askPassword } from '../ui.js';
import { dropzone, download, PDF_ACCEPT, baseName } from '../files.js';
import { Composer } from '../composer.js';
import { pageGrid } from '../components/pagegrid.js';
import { renderPageImage } from '../pdf-engine.js';

export function mount(root) {
  const composer = new Composer({ requestPassword: askPassword });
  const grid = pageGrid(composer, { ops: [], reorder: false, onSelection: update });
  let sourceName = 'document';

  const format = el('select', { onchange: update },
    el('option', { value: 'image/png' }, 'PNG (lossless)'),
    el('option', { value: 'image/jpeg' }, 'JPEG (smaller)'),
  );
  const dpi = el('select', {},
    el('option', { value: '72' }, '72 dpi — screen'),
    el('option', { value: '150' }, '150 dpi — default'),
    el('option', { value: '300' }, '300 dpi — print'),
    el('option', { value: '600' }, '600 dpi — very large files'),
  );
  dpi.value = '150';
  const quality = el('input', { type: 'range', min: '50', max: '100', value: '92' });
  const qualityField = el('label', { class: 'field' }, 'JPEG quality', quality);

  const allBtn = el('button', { class: 'btn primary', onclick: () => run(false) }, 'Export all pages');
  const selBtn = el('button', { class: 'btn', onclick: () => run(true), disabled: true }, 'Export selected');
  const resetBtn = el('button', { class: 'btn', onclick: reset }, 'Start over');
  const summary = el('span', { class: 'dim' });

  const optionsBar = el('div', { class: 'options' },
    el('label', { class: 'field' }, 'Format', format),
    el('label', { class: 'field' }, 'Resolution', dpi),
    qualityField,
  );

  const zone = dropzone({
    mainText: 'Drop a PDF here or click to choose',
    subText: 'You get a preview first; nothing is written until you export.',
    accept: PDF_ACCEPT, kind: 'pdf', multiple: false, onFiles: add,
  });

  const bar = el('div', { class: 'toolbar' }, allBtn, selBtn, resetBtn, el('span', { class: 'grow' }), summary);
  const hint = el('p', { class: 'empty-state', text: 'Click pages to select them. Exporting more than one page produces a ZIP.' });

  root.append(
    pageHead('PDF → images', 'Each page is drawn to a canvas at the resolution you pick and saved as an image. Text becomes pixels — that is what rasterising means.'),
    zone, optionsBar, hint, grid.node, bar
  );
  optionsBar.hidden = true;
  bar.hidden = true;
  hint.hidden = true;

  async function add(files) {
    const p = progress('Reading PDF');
    try {
      sourceName = baseName(files[0].name);
      const { failed } = await composer.addFiles(files.slice(0, 1), (r, name) => p.set(r, name));
      for (const f of failed) showError(f.error, `Could not read ${f.name}`);
    } catch (err) {
      showError(err, 'Could not read that PDF');
    } finally {
      p.done();
    }
    update();
  }

  function update() {
    grid.render();
    const has = composer.pageCount > 0;
    zone.hidden = has;
    optionsBar.hidden = !has;
    bar.hidden = !has;
    hint.hidden = !has;
    qualityField.hidden = format.value !== 'image/jpeg';
    const selected = grid.selectionSize();
    selBtn.disabled = selected === 0;
    summary.textContent = has ? `${composer.pageCount} pages${selected ? ` · ${selected} selected` : ''}` : '';
    setStatus(has ? `${composer.pageCount} pages ready to export` : 'idle');
  }

  async function run(selectedOnly) {
    const uids = new Set(grid.getSelected());
    const items = selectedOnly ? composer.pages.filter(p => uids.has(p.uid)) : composer.pages;
    if (!items.length) { toast('Nothing to export', 'Select at least one page.', 'warn'); return; }

    const settings = {
      dpi: Number(dpi.value),
      format: format.value,
      quality: Number(quality.value) / 100,
    };
    if (settings.dpi >= 300 && items.length > 30) {
      toast('This will be heavy', `${items.length} pages at ${settings.dpi} dpi needs a lot of memory. Consider fewer pages or a lower resolution.`, 'warn', 9000);
    }

    const ext = settings.format === 'image/png' ? 'png' : 'jpg';
    const p = progress('Rendering pages');
    try {
      if (items.length === 1) {
        const { blob } = await renderOne(items[0], settings, p, 0, 1);
        const name = `${sourceName}-page-${items[0].pageIndex + 1}.${ext}`;
        download(blob, name);
        toast('Saved', `${name} · ${formatBytes(blob.size)}`);
        return;
      }

      const zip = new window.JSZip();
      for (let i = 0; i < items.length; i++) {
        const { blob } = await renderOne(items[i], settings, p, i, items.length);
        zip.file(`${sourceName}-page-${String(items[i].pageIndex + 1).padStart(3, '0')}.${ext}`, blob);
      }
      p.title('Packing ZIP');
      const out = await zip.generateAsync({ type: 'blob' }, meta => p.set(meta.percent / 100));
      download(out, `${sourceName}-images.zip`);
      toast('Saved', `${items.length} images · ${formatBytes(out.size)} · ${sourceName}-images.zip`);
    } catch (err) {
      showError(err, 'Export failed');
    } finally {
      p.done();
    }
  }

  async function renderOne(item, settings, p, index, total) {
    p.set(index / total, `page ${index + 1} of ${total}`);
    const src = composer.sourceOf(item);
    return renderPageImage(src.pdfjsDoc, item.pageIndex + 1, settings);
  }

  function reset() {
    composer.destroy();
    grid.clearSelection();
    update();
  }

  update();

  return () => {
    grid.destroy();
    composer.destroy();
  };
}
