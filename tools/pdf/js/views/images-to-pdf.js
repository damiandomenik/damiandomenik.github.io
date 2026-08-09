/* images-to-pdf.js — JPG/PNG/WebP in, one PDF out. */

import { el, pageHead, toast, showError, progress, formatBytes, setStatus } from '../ui.js';
import { dropzone, download, IMAGE_ACCEPT, UrlPool } from '../files.js';
import { fileList } from '../components/filelist.js';
import { buildPdf, imageDimensions } from '../pdf-engine.js';
import { buildImageOptions } from './workspace.js';

export function mount(root) {
  const entries = [];          // { id, name, meta, thumb, file }
  const pool = new UrlPool();
  let nextId = 0;

  const list = fileList(entries, { onChange: update });
  const optionsBar = el('div', { class: 'options' });
  const options = buildImageOptions(optionsBar);

  const exportBtn = el('button', { class: 'btn primary', onclick: run, disabled: true }, 'Create PDF');
  const clearBtn = el('button', { class: 'btn', onclick: clearAll, disabled: true }, 'Clear');
  const summary = el('span', { class: 'dim', text: 'No images yet.' });

  const zone = dropzone({
    mainText: 'Drop images here or click to choose',
    subText: 'JPG, PNG and WebP. Drag the rows to set the page order.',
    accept: IMAGE_ACCEPT, kind: 'image', onFiles: add,
  });

  root.append(
    pageHead('images → PDF', 'One image per page, in the order you set. WebP is re-encoded on export because PDF itself only carries JPEG and PNG image data.'),
    zone,
    list.node,
    optionsBar,
    el('div', { class: 'toolbar' }, exportBtn, clearBtn, el('span', { class: 'grow' }), summary)
  );
  list.render();
  update();

  async function add(files) {
    const bar = progress('Reading images');
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      bar.set(i / files.length, file.name);
      try {
        const { width, height } = await imageDimensions(file);
        entries.push({
          id: `i${++nextId}`,
          name: file.name,
          meta: `${width} × ${height} px · ${formatBytes(file.size)}`,
          thumb: pool.create(file),
          file,
        });
      } catch (err) {
        showError(err, `Could not read ${file.name}`);
      }
    }
    bar.done();
    update();
  }

  function update() {
    list.render();
    exportBtn.disabled = entries.length === 0;
    clearBtn.disabled = entries.length === 0;
    optionsBar.hidden = entries.length === 0;
    zone.classList.toggle('compact', entries.length > 0);
    summary.textContent = entries.length
      ? `${entries.length} image${entries.length === 1 ? '' : 's'} · ${entries.length} page${entries.length === 1 ? '' : 's'}`
      : 'No images yet.';
    setStatus(entries.length ? `images: ${entries.length} loaded` : 'idle');
  }

  function clearAll() {
    entries.length = 0;
    pool.clear();
    update();
  }

  async function run() {
    if (!entries.length) { toast('No images', 'Add at least one image.', 'warn'); return; }
    const bar = progress('Building PDF');
    try {
      const sources = new Map();
      const items = entries.map(entry => {
        sources.set(entry.id, { id: entry.id, type: 'image', file: entry.file, name: entry.name });
        return { sourceId: entry.id, pageIndex: 0, rotation: 0 };
      });
      const blob = await buildPdf(items, sources, {
        image: options.value(),
        onProgress: (r, label) => bar.set(r, label),
      });
      download(blob, 'images.pdf');
      toast('Saved', `${items.length} pages · ${formatBytes(blob.size)} · images.pdf`);
    } catch (err) {
      showError(err, 'Could not create the PDF');
    } finally {
      bar.done();
    }
  }

  return () => {
    entries.length = 0;
    pool.clear();
  };
}
