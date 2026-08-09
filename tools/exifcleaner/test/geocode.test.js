/* Geocoding tests: rate limiting, caching, failure messages. */
/* Geocoding: Rate-Limit, Cache, Fehlerfälle, Zusammenfassung */
/* Geocoding tests: rate limiting, caching, failure messages. */
let calls = [];
globalThis.AbortController = class { constructor(){ this.signal={}; } abort(){} };
globalThis.fetch = async (url) => {
  calls.push({ url: url.toString(), at: Date.now() });
  const mode = globalThis.__mode;
  if (mode === '429') return { ok:false, status:429 };
  if (mode === 'boom') throw new Error('network down');
  if (mode === 'empty') return { ok:true, status:200, json: async () => ({ error:'Unable to geocode' }) };
  return { ok:true, status:200, json: async () => ({
    display_name: 'Rathausplatz 2, 9490 Vaduz, Oberland, Liechtenstein',
    address: { road:'Rathausplatz', house_number:'2', town:'Vaduz', country:'Liechtenstein' },
  })};
};

const { lookupAddress } = await import('../js/geocode.js');
let pass=0, fail=0;
const t=(l,v)=>{console.log(`${v?'  ok  ':' FAIL '} ${l}`); v?pass++:fail++;};
const eq=(l,a,b)=>t(`${l}${a===b?'':`  got ${JSON.stringify(a)} want ${JSON.stringify(b)}`}`, a===b);

globalThis.__mode = 'ok';
const r = await lookupAddress(47.1410, 9.5209);
eq('street and place summarised', r.summary, 'Rathausplatz 2, Vaduz, Liechtenstein');
t('full address kept as detail', r.detail.includes('Oberland'));
t('attribution present as required', /OpenStreetMap/.test(r.attribution));
t('coordinates go in the query', calls[0].url.includes('lat=47.141000') && calls[0].url.includes('lon=9.520900'));
t('nothing but coordinates is sent', !/name|file|photo/i.test(calls[0].url));

calls = [];
await lookupAddress(47.1410, 9.5209);
eq('a repeat lookup is served from cache', calls.length, 0);

calls = [];
const t0 = Date.now();
await Promise.all([lookupAddress(1.5, 1.5), lookupAddress(2.5, 2.5)]);
const gap = calls[1].at - calls[0].at;
t(`two lookups are spaced ~1.1 s apart (was ${gap} ms)`, gap >= 1000);
t('elapsed shows they were serialised', Date.now() - t0 >= 1000);

globalThis.__mode = '429';
let msg = '';
try { await lookupAddress(3.5, 3.5); } catch (e) { msg = e.message; }
t('rate limiting explained in plain words', /rate limiting/i.test(msg));

globalThis.__mode = 'boom';
try { await lookupAddress(4.5, 4.5); } catch (e) { msg = e.message; }
t('network failure explained', /offline|blocking/i.test(msg));

globalThis.__mode = 'empty';
try { await lookupAddress(5.5, 5.5); } catch (e) { msg = e.message; }
t('no-result explained', /open water|no mapped/i.test(msg));

globalThis.__mode = 'ok';
calls = [];
const retried = await lookupAddress(5.5, 5.5);
t('a failed lookup can be retried, not stuck in cache', calls.length === 1 && !!retried.summary);


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
