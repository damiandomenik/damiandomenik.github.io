#!/usr/bin/env node
/**
 * WorldCam — one-time camera export
 *
 *   node tools/worldcam/export-cameras.mjs YOUR_WINDY_KEY
 *
 * Pulls the webcam list from Windy and writes js/../data/cameras.json.
 * Run it once. After that the globe is a static site again: no key at
 * runtime, no request to Windy for the listing, works for every visitor.
 *
 * The key is only ever a command-line argument. It is never written to
 * the output file and never committed.
 *
 * Free tier notes, both enforced by Windy and respected here:
 *   - the listing offset caps at 1000, so that is the ceiling
 *   - image URLs expire after ~10 minutes, so no image URLs are stored;
 *     the panel embeds the player instead, which does not expire
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'data', 'cameras.json');

const KEY = process.argv[2];
const MAX = Number(process.argv[3] || 1000);   // free-tier offset ceiling
const PAGE = 50;

if (!KEY) {
  console.error('Usage: node export-cameras.mjs <windy-api-key> [max]');
  console.error('Get a free key at https://api.windy.com/keys (Webcams API).');
  console.error('Leave the key\'s Domains field empty, or this script will be refused.');
  process.exit(1);
}

function mapCategory(cats) {
  const ids = (cats || []).map((c) => (typeof c === 'string' ? c : c.id) || '').join(' ');
  if (/beach|island|surf/.test(ids)) return 'beach';
  if (/mountain|ski|snow|glacier/.test(ids)) return 'mountain';
  if (/traffic|highway|road/.test(ids)) return 'traffic';
  if (/airport|aviation/.test(ids)) return 'airport';
  if (/harbor|harbour|port|marina/.test(ids)) return 'harbor';
  if (/landscape|nature|park|lake|river|forest|volcano/.test(ids)) return 'landscape';
  if (/city|square|building|street/.test(ids)) return 'city';
  return 'other';
}

function coord(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const cameras = [];
const seen = new Set();
let skipped = 0;

for (let offset = 0; offset < MAX; offset += PAGE) {
  const url = 'https://api.windy.com/webcams/api/v3/webcams'
    + '?limit=' + PAGE + '&offset=' + offset
    + '&include=' + encodeURIComponent('location,urls,categories,player');

  const res = await fetch(url, { headers: { 'x-windy-api-key': KEY } });
  if (res.status === 401 || res.status === 403) {
    console.error('\nWindy rejected the key (HTTP ' + res.status + ').');
    console.error('Check the key, and make sure its Domains restriction is empty for this script.');
    process.exit(1);
  }
  if (res.status === 429) {
    console.error('\nRate limited. Wait a minute and run it again — already fetched: ' + cameras.length);
    break;
  }
  if (!res.ok) {
    console.error('\nWindy returned HTTP ' + res.status + ' at offset ' + offset + '.');
    break;
  }

  const json = await res.json();
  const list = json.webcams || [];

  for (const w of list) {
    const id = String(w.webcamId ?? w.id);
    if (seen.has(id)) continue;
    const loc = w.location || {};
    const lat = coord(loc.latitude), lon = coord(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped++; continue; }

    const player = w.player || {};
    const embed = player.live || player.day || player.month || player.year || player.lifetime || null;

    seen.add(id);
    cameras.push({
      id,
      title: w.title || loc.city || 'Camera',
      city: loc.city || null,
      region: loc.region || null,
      country: loc.country || null,
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      category: mapCategory(w.categories),
      status: w.status || null,
      // Player embed URLs do not expire; image URLs do, so none are stored.
      embed,
      link: (w.urls && (w.urls.detail || w.urls.provider)) || ('https://www.windy.com/webcams/' + id)
    });
  }

  process.stdout.write('\rFetched ' + cameras.length + ' cameras…');
  if (list.length < PAGE) break;
}

if (!cameras.length) {
  console.error('\nNo cameras were returned. Nothing written.');
  process.exit(1);
}

const withEmbed = cameras.filter((c) => c.embed).length;
const payload = {
  source: 'Windy Webcams API',
  attribution: 'Webcams provided by windy.com',
  exportedAt: new Date().toISOString().slice(0, 10),
  count: cameras.length,
  cameras
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));

const kb = Math.round((await fs.stat(OUT)).size / 1024);
console.log('\n');
console.log('Wrote ' + cameras.length + ' cameras to ' + path.relative(process.cwd(), OUT) + ' (' + kb + ' KB)');
console.log(withEmbed + ' of them have an embeddable player.');
if (skipped) console.log(skipped + ' entries were dropped for missing coordinates.');
console.log('\nCommit that file. The globe now works for every visitor without a key.');
console.log('Re-run this script whenever you want to refresh the list.');
