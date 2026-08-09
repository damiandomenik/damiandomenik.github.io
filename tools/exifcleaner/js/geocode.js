/* geocode.js — turning coordinates into an address, on request only.
 *
 * THE TRADE-OFF, STATED PLAINLY
 * Everything else in this tool happens inside the tab. This does not. Asking
 * what is at a coordinate means telling someone the coordinate. There is no
 * clever way around that: a lookup service that does not learn your location
 * cannot answer the question.
 *
 * So this is never automatic, never batched, and never runs on load. It fires
 * when someone presses a button that says what it will send, and the answer is
 * cached so pressing it twice does not ask twice.
 *
 * OpenStreetMap's Nominatim is used because it is free, needs no key, and its
 * data is community-owned. Their usage policy allows at most one request per
 * second and no bulk querying, which the queue below enforces.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 10000;

const cache = new Map();
let chain = Promise.resolve();
let lastRequest = 0;

export class LookupError extends Error {
  constructor(message) { super(message); this.name = 'LookupError'; }
}

/**
 * @returns {Promise<{summary: string, detail: string, attribution: string}>}
 */
export function lookupAddress(lat, lon) {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);

  // Serialise every lookup through one chain so two photos taken side by side
  // cannot fire two requests in the same second.
  const result = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequest));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return request(lat, lon);
  });

  chain = result.catch(() => {});      // one failure must not block the next lookup
  cache.set(key, result);
  result.catch(() => cache.delete(key));   // let a failed lookup be retried
  return result;
}

async function request(lat, lon) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', lat.toFixed(6));
  url.searchParams.set('lon', lon.toFixed(6));
  url.searchParams.set('zoom', '18');           // building level
  url.searchParams.set('addressdetails', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new LookupError(err?.name === 'AbortError'
      ? 'The lookup timed out. The service may be busy — the coordinates above are unaffected.'
      : 'Could not reach the lookup service. You are offline, or something is blocking the request.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new LookupError('The free lookup service is rate limiting. Wait a moment and try again.');
  }
  if (!response.ok) {
    throw new LookupError(`The lookup service answered with an error (${response.status}).`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new LookupError('The lookup service sent something unreadable.');
  }

  if (!data || data.error || !data.display_name) {
    throw new LookupError('No address on record for these coordinates — open water, or somewhere with no mapped features nearby.');
  }

  return {
    summary: summarise(data.address) || String(data.display_name).split(',').slice(0, 2).join(',').trim(),
    detail: String(data.display_name).slice(0, 300),
    attribution: 'Address data © OpenStreetMap contributors, via Nominatim',
  };
}

/** The short line: street and number if known, otherwise the smallest place. */
function summarise(address) {
  if (!address || typeof address !== 'object') return '';
  const street = [address.road, address.house_number].filter(Boolean).join(' ');
  const place = address.city || address.town || address.village || address.hamlet
    || address.suburb || address.municipality || address.county || '';
  const country = address.country || '';
  const parts = [street, place, country].filter(Boolean);
  return parts.join(', ').slice(0, 200);
}
