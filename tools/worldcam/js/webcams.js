/* Data layer.

   Two sources, never mixed:

   1. Windy's Webcams API, if the visitor has stored their own key. The key
      lives in this browser and is sent only to api.windy.com. It cannot be
      shipped with the page: the API takes it as a request header, and a
      static site cannot keep a header secret.

   2. A labelled demo set of placeholder markers. These are not cameras and
      never claim to be — no preview, no status, no link.

   Everything downstream reads the same normalised shape, so swapping in a
   different provider later means writing one adapter here. */

import { DEMO_POINTS, KEY_STORAGE, WINDY_ENDPOINT, CAMERAS_FILE } from './config.js';

const PAGE_SIZE = 50;   // Windy's per-request maximum

export function getStoredKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; }
  catch (e) { return ''; }
}
export function storeKey(key) {
  try { key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE); }
  catch (e) { /* private mode — the key simply won't persist */ }
}

/** Windy's own category ids, mapped onto the labels this tool shows. */
function mapCategory(cats) {
  if (!cats || !cats.length) return 'other';
  const ids = cats.map((c) => (typeof c === 'string' ? c : c.id) || '').join(' ');
  if (/beach|island|surf/.test(ids)) return 'beach';
  if (/mountain|ski|snow|glacier/.test(ids)) return 'mountain';
  if (/traffic|highway|road/.test(ids)) return 'traffic';
  if (/airport|aviation/.test(ids)) return 'airport';
  if (/harbor|harbour|port|marina/.test(ids)) return 'harbor';
  if (/city|square|building|street|webcam/.test(ids)) return 'city';
  if (/landscape|nature|park|lake|river|forest|volcano/.test(ids)) return 'landscape';
  return 'other';
}

/** Number(null) and Number('') are both 0, which would drop a camera with
 *  missing coordinates into the Atlantic at 0°/0°. Anything that is not a
 *  real number stays NaN so the caller can discard the record. */
function coord(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function normalise(w) {
  const loc = w.location || {};
  const img = w.images || {};
  const preview = (img.current && (img.current.preview || img.current.thumbnail)) ||
                  (img.daylight && (img.daylight.preview || img.daylight.thumbnail)) || null;
  return {
    id: String(w.webcamId != null ? w.webcamId : w.id),
    title: w.title || loc.city || 'Camera',
    city: loc.city || null,
    region: loc.region || null,
    country: loc.country || null,
    lat: coord(loc.latitude),
    lon: coord(loc.longitude),
    category: mapCategory(w.categories),
    status: w.status || null,
    lastUpdated: w.lastUpdatedOn || null,
    image: preview,
    link: (w.urls && ((w.urls.detail) || (w.urls.provider))) || null,
    demo: false
  };
}

/** Fetches up to `max` webcams, paging through the API.
 *  Rejects with a readable message so the UI can explain what happened. */
export async function fetchWindy(key, max = 400, onProgress) {
  const out = [];
  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const url = WINDY_ENDPOINT +
      '?limit=' + PAGE_SIZE +
      '&offset=' + offset +
      '&include=' + encodeURIComponent('location,images,urls,categories');

    let res;
    try {
      res = await fetch(url, { headers: { 'x-windy-api-key': key } });
    } catch (e) {
      throw new Error('The request to api.windy.com was blocked by the browser. ' +
        'Free keys are domain-restricted — add this site under Domains in the Windy key manager.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Windy rejected the key (HTTP ' + res.status + '). Check that it is correct and that this domain is allowed.');
    }
    if (res.status === 429) {
      throw new Error('Windy is rate-limiting this key right now (HTTP 429). Try again in a moment.');
    }
    if (!res.ok) throw new Error('Windy returned HTTP ' + res.status + '.');

    const json = await res.json();
    const list = json.webcams || [];
    for (const w of list) {
      const n = normalise(w);
      if (Number.isFinite(n.lat) && Number.isFinite(n.lon)) out.push(n);
    }
    if (onProgress) onProgress(Math.min(1, out.length / max));
    if (list.length < PAGE_SIZE) break;   // no more results
  }
  if (!out.length) throw new Error('Windy returned no webcams for this request.');
  return out;
}

export function demoData() {
  return DEMO_POINTS.slice();
}

/* ---------------------------------------------------------------
   Exported camera list.

   Produced once by export-cameras.mjs and committed as a static file,
   which is what lets every visitor see real cameras without a key.
   Player embed URLs are stored; image URLs are not, because free-tier
   image links expire after about ten minutes.
   --------------------------------------------------------------- */
export async function loadExported() {
  const res = await fetch(CAMERAS_FILE, { cache: 'no-cache' });
  if (!res.ok) throw new Error('no exported camera list (HTTP ' + res.status + ')');
  const data = await res.json();
  const list = (data.cameras || []).filter(
    (c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)
  ).map((c) => ({
    id: String(c.id),
    title: c.title,
    city: c.city || null,
    region: c.region || null,
    country: c.country || null,
    lat: c.lat,
    lon: c.lon,
    category: c.category || 'other',
    status: c.status || null,
    lastUpdated: null,
    image: null,
    embed: c.embed || null,
    link: c.link || null,
    demo: false
  }));
  if (!list.length) throw new Error('exported camera list is empty');
  return { list, meta: data };
}

/** Loads the best source available.
 *  Always resolves: { points, source, error } — the caller decides how loudly
 *  to report a failed live load, but the globe is never left empty. */
export async function loadWebcams(onProgress) {
  // A stored key always wins: it returns fresher data than the export.
  const key = getStoredKey();
  if (key) {
    try {
      const points = await fetchWindy(key, 400, onProgress);
      return { points, source: 'windy', error: null };
    } catch (e) {
      const fallback = await loadExported().catch(() => null);
      if (fallback) {
        return { points: fallback.list, source: 'exported', meta: fallback.meta, error: e.message };
      }
      return { points: demoData(), source: 'demo', error: e.message || String(e) };
    }
  }

  // No key: the committed export, if it is there.
  try {
    const { list, meta } = await loadExported();
    if (onProgress) onProgress(1);
    return { points: list, source: 'exported', meta, error: null };
  } catch (e) {
    return { points: demoData(), source: 'demo', error: null };
  }
}
