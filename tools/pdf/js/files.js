/* files.js — picking, validating and handing back files; downloads and object URL bookkeeping. */

import { el, toast } from './ui.js';

export const PDF_ACCEPT = 'application/pdf,.pdf';
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Files above this get a heads-up. Not a hard limit — the browser decides that. */
export const BIG_FILE = 150 * 1024 * 1024;

export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImage(file) {
  return IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function baseName(name = 'file') {
  return name.replace(/\.[^.]+$/, '') || 'file';
}

/**
 * Split a FileList into accepted files and rejected names.
 * kind: 'pdf' | 'image' | 'both'
 */
export function sortFiles(list, kind) {
  const ok = [];
  const rejected = [];
  for (const f of list) {
    const pdf = isPdf(f);
    const img = isImage(f);
    const accepted = kind === 'pdf' ? pdf : kind === 'image' ? img : (pdf || img);
    if (accepted) ok.push(f); else rejected.push(f.name);
  }
  return { ok, rejected };
}

export function reportRejected(rejected, kind) {
  if (!rejected.length) return;
  const want = kind === 'pdf' ? 'PDF files' : kind === 'image' ? 'JPG, PNG or WebP images' : 'PDFs or images';
  toast(
    `Skipped ${rejected.length} file${rejected.length === 1 ? '' : 's'}`,
    `This tool takes ${want}. Skipped: ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}`,
    'warn'
  );
}

export function warnIfHuge(files) {
  const big = [...files].filter(f => f.size > BIG_FILE);
  if (big.length) {
    toast('Large file', `${big[0].name} is over ${Math.round(BIG_FILE / 1024 / 1024)} MB. It will work, but expect slow rendering and high memory use.`, 'warn', 8000);
  }
}

/** Open the OS file picker. Resolves with an array of File (possibly empty). */
export function pickFiles({ accept, multiple = true }) {
  return new Promise(resolve => {
    const input = el('input', { type: 'file', accept, multiple, style: 'display:none' });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.remove();
      resolve(files);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/**
 * Build a click/drag dropzone.
 * onFiles receives an array of accepted File objects.
 */
export function dropzone({ mainText, subText, accept, kind, multiple = true, compact = false, onFiles }) {
  const node = el('div', {
    class: 'dropzone' + (compact ? ' compact' : ''),
    tabindex: '0',
    role: 'button',
    'aria-label': mainText,
  },
    el('span', { class: 'dz-main', text: mainText }),
    el('span', { class: 'dz-sub', text: subText })
  );

  const handle = (fileList) => {
    const { ok, rejected } = sortFiles(fileList, kind);
    reportRejected(rejected, kind);
    if (!ok.length) {
      if (!rejected.length) toast('No file selected', 'Pick at least one file to continue.', 'warn');
      return;
    }
    warnIfHuge(ok);
    onFiles(ok);
  };

  const open = async () => {
    const files = await pickFiles({ accept, multiple });
    if (files.length) handle(files);
  };

  node.addEventListener('click', open);
  node.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  let depth = 0;
  node.addEventListener('dragenter', e => { e.preventDefault(); depth++; node.classList.add('over'); });
  node.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  node.addEventListener('dragleave', () => { if (--depth <= 0) node.classList.remove('over'); });
  node.addEventListener('drop', e => {
    e.preventDefault();
    depth = 0;
    node.classList.remove('over');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) handle(files);
  });

  return node;
}

/** Save a Blob to disk. The object URL is revoked as soon as the browser has it. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

/** Tracks object URLs so a view can free them all when it unmounts. */
export class UrlPool {
  #urls = new Set();
  create(blob) {
    const url = URL.createObjectURL(blob);
    this.#urls.add(url);
    return url;
  }
  revoke(url) {
    if (this.#urls.delete(url)) URL.revokeObjectURL(url);
  }
  clear() {
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
  }
}
