/* composer.js — the document model shared by organize, split, rotate and build.
 *
 * A composition is an ordered list of page items:
 *   { uid, sourceId, pageIndex, rotation }
 * pointing into a registry of sources (a loaded PDF, or an image file).
 * Every tool is a different set of controls on top of this one model.
 */

import { loadPdf, buildPdf, renderThumb, imageDimensions, PasswordNeeded } from './pdf-engine.js';
import { UrlPool, isPdf } from './files.js';

let counter = 0;
const nextId = prefix => `${prefix}${++counter}`;

export class Composer {
  /** @param {{requestPassword?: (name:string)=>Promise<string|null>}} options */
  constructor(options = {}) {
    this.sources = new Map();
    this.pages = [];
    this.requestPassword = options.requestPassword ?? (async () => null);
    this._thumbs = new Map();   // "sourceId:pageIndex" -> Promise<objectURL>
    this._pool = new UrlPool();
  }

  get pageCount() { return this.pages.length; }
  get isEmpty() { return this.pages.length === 0; }

  /* ---------- adding ---------- */

  /** Adds files of either kind, in the order given. Returns the number of pages added. */
  async addFiles(files, onStep = () => {}) {
    let added = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onStep(i / files.length, file.name);
      added += isPdf(file) ? await this.addPdf(file) : await this.addImage(file);
    }
    return added;
  }

  async addPdf(file) {
    let loaded;
    try {
      loaded = await loadPdf(file);
    } catch (err) {
      if (err instanceof PasswordNeeded) {
        const password = await this.requestPassword(file.name);
        if (password === null) return 0;
        loaded = await loadPdf(file, password);   // a wrong password throws again
      } else {
        throw err;
      }
    }

    const id = nextId('pdf-');
    this.sources.set(id, {
      id, type: 'pdf', file, name: file.name, size: file.size,
      bytes: loaded.bytes,
      pdfjsDoc: loaded.pdfjsDoc,
      pdflibDoc: loaded.pdflibDoc,
      pageCount: loaded.pageCount,
    });

    for (let i = 0; i < loaded.pageCount; i++) {
      this.pages.push({ uid: nextId('p-'), sourceId: id, pageIndex: i, rotation: 0 });
    }
    return loaded.pageCount;
  }

  async addImage(file) {
    const { width, height } = await imageDimensions(file);
    const id = nextId('img-');
    this.sources.set(id, {
      id, type: 'image', file, name: file.name, size: file.size,
      width, height, pageCount: 1,
    });
    this.pages.push({ uid: nextId('p-'), sourceId: id, pageIndex: 0, rotation: 0 });
    return 1;
  }

  /* ---------- reading ---------- */

  indexOf(uid) { return this.pages.findIndex(p => p.uid === uid); }
  get(uid) { return this.pages.find(p => p.uid === uid); }
  sourceOf(item) { return this.sources.get(item.sourceId); }

  /** Object URL of a preview image for this page. Cached per source page. */
  thumbUrl(item) {
    const key = `${item.sourceId}:${item.pageIndex}`;
    if (this._thumbs.has(key)) return this._thumbs.get(key);

    const src = this.sources.get(item.sourceId);
    const promise = (async () => {
      const blob = src.type === 'pdf'
        ? await renderThumb(src.pdfjsDoc, item.pageIndex + 1, 200)
        : src.file;
      return this._pool.create(blob);
    })();

    this._thumbs.set(key, promise);
    return promise;
  }

  /* ---------- editing ---------- */

  remove(uids) {
    const set = new Set([].concat(uids));
    this.pages = this.pages.filter(p => !set.has(p.uid));
    this.pruneSources();
  }

  duplicate(uids) {
    const set = new Set([].concat(uids));
    const out = [];
    for (const page of this.pages) {
      out.push(page);
      if (set.has(page.uid)) out.push({ ...page, uid: nextId('p-') });
    }
    this.pages = out;
  }

  rotate(uids, delta) {
    const set = new Set([].concat(uids));
    for (const page of this.pages) {
      if (set.has(page.uid)) page.rotation = (((page.rotation + delta) % 360) + 360) % 360;
    }
  }

  rotateAll(delta) { this.rotate(this.pages.map(p => p.uid), delta); }

  /** Move one page to a new index. */
  moveTo(uid, targetIndex) {
    const from = this.indexOf(uid);
    if (from < 0) return;
    const [item] = this.pages.splice(from, 1);
    const to = Math.max(0, Math.min(this.pages.length, targetIndex > from ? targetIndex - 1 : targetIndex));
    this.pages.splice(to, 0, item);
  }

  /** Move a page one slot left or right. */
  nudge(uid, direction) {
    const from = this.indexOf(uid);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= this.pages.length) return;
    const [item] = this.pages.splice(from, 1);
    this.pages.splice(to, 0, item);
  }

  /** Move a whole selection so it lands before `targetIndex`, keeping its order. */
  moveGroup(uids, targetIndex) {
    const set = new Set(uids);
    const moving = this.pages.filter(p => set.has(p.uid));
    if (!moving.length) return;
    const before = this.pages.slice(0, targetIndex).filter(p => !set.has(p.uid)).length;
    const rest = this.pages.filter(p => !set.has(p.uid));
    rest.splice(before, 0, ...moving);
    this.pages = rest;
  }

  reset() {
    this.pages = [];
    this.pruneSources();
  }

  /** Drop sources that no longer have a page in the composition. */
  pruneSources() {
    const used = new Set(this.pages.map(p => p.sourceId));
    for (const [id, src] of this.sources) {
      if (used.has(id)) continue;
      src.pdfjsDoc?.destroy();
      this.sources.delete(id);
      for (const key of [...this._thumbs.keys()]) {
        if (key.startsWith(`${id}:`)) {
          this._thumbs.get(key).then(url => this._pool.revoke(url)).catch(() => {});
          this._thumbs.delete(key);
        }
      }
    }
  }

  /* ---------- output ---------- */

  /** @param items optional subset (defaults to the whole composition) */
  export(items = this.pages, options = {}) {
    return buildPdf(items, this.sources, options);
  }

  /** Base for download names: the original file name when there is only one. */
  baseName() {
    const names = [...new Set([...this.sources.values()].map(s => s.name))];
    return names.length === 1 ? (names[0].replace(/\.[^.]+$/, '') || 'document') : '';
  }

  /** A sensible download name derived from the files that went in. */
  suggestName(suffix) {
    const base = this.baseName();
    return base ? `${base}-${suffix}.pdf` : `${suffix}.pdf`;
  }

  destroy() {
    for (const src of this.sources.values()) src.pdfjsDoc?.destroy();
    this.sources.clear();
    this.pages = [];
    this._thumbs.clear();
    this._pool.clear();
  }
}
