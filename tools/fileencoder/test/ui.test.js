/* View tests under jsdom. Needs `npm install jsdom`. */

import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><body><nav id="tabs"></nav><main id="view"></main><div id="toasts"></div></body>`,
  { url: 'https://x.test/tools/fileencoder/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
                 'Node', 'Event', 'location', 'Blob', 'File', 'FileReader'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k];
globalThis.btoa ??= s => Buffer.from(s, 'latin1').toString('base64');
globalThis.atob ??= s => Buffer.from(s, 'base64').toString('latin1');
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
dom.window.navigator.clipboard = { writeText: async () => {} };
dom.window.scrollTo = () => {};

let pass = 0, fail = 0;
const t = (label, value) => { console.log(`${value ? '  ok  ' : ' FAIL '} ${label}`); value ? pass++ : fail++; };
const settle = (ms = 80) => new Promise(r => setTimeout(r, ms));
const view = document.getElementById('view');
const VIEWS = ['home', 'encode', 'decode', 'qrtools', 'analyze'];
const mods = {};
for (const name of VIEWS) mods[name] = await import(`../js/views/${name}.js`);

console.log('\nevery view starts');
for (const name of VIEWS) {
  view.replaceChildren();
  try {
    const un = mods[name].mount(view);
    t(`${name.padEnd(10)} ${view.querySelectorAll('button').length} buttons, ${view.textContent.length} chars`, true);
    un?.();
  } catch (err) { t(`${name}: ${err.message}`, false); }
}

console.log('\nthe capacity gauge tells the truth');
{
  const { qrGauge } = await import('../js/report.js');
  const { analyzeQr } = await import('../js/qr.js');

  const small = qrGauge(analyzeQr({ byteLength: 300, filename: 'a.txt', mime: 'text/plain' }));
  t('a small file is badged ready', small.textContent.includes('QR ready'));
  t('and names the version it would use', /version \d+/.test(small.textContent));

  const huge = qrGauge(analyzeQr({ byteLength: 5 * 1024 * 1024, filename: 'a.pdf', mime: 'application/pdf' }));
  t('a 5 MB file is badged too large', huge.textContent.includes('Too large for QR'));
  t('the bar is capped rather than overflowing', huge.querySelector('.gauge-fill').style.width === '100%');
  t('and it says how large a file would fit', /largest that would fit/.test(huge.textContent));
  t('all four correction levels are shown', huge.querySelectorAll('.level').length === 4);
}

console.log('\nadvice is rendered with its verdicts');
{
  const { adviceCard } = await import('../js/report.js');
  const { advise } = await import('../js/advise.js');
  const node = adviceCard(advise({ name: 'video.mp4', size: 300 * 1024 * 1024, mime: 'video/mp4', label: 'MP4 video' }));
  t('a recommendation is present', node.textContent.includes('Recommended'));
  t('and the refused options are marked', [...node.querySelectorAll('.advice-row')].some(r => r.dataset.state === 'bad'));
}

console.log('\nfile names are text, never markup');
{
  const { fileFacts } = await import('../js/report.js');
  const node = fileFacts({
    name: '<img src=x onerror=alert(1)>.png', size: 1024, mime: 'image/png',
    label: 'PNG image', source: 'bytes', mismatch: false,
  });
  t('no element was injected', node.querySelector('img') === null);
  t('and the name is still readable', node.textContent.includes('<img src=x onerror=alert(1)>'));
}

console.log('\nthe decoder reacts to what is pasted');
{
  view.replaceChildren();
  const un = mods.decode.mount(view);
  const input = view.querySelector('textarea');

  input.value = 'data:image/png;base64,iVBORw0KGgo=';
  input.dispatchEvent(new dom.window.Event('input'));
  await settle(200);
  t('a data URL is recognised before decoding', view.textContent.includes('Data URL'));
  t('and its MIME reported', view.textContent.includes('image/png'));

  [...view.querySelectorAll('button')].find(b => b.textContent === 'Decode').click();
  await settle();
  t('decoding identifies the PNG from its bytes', view.textContent.includes('PNG image'));

  input.value = 'this is not base64 at all!!';
  input.dispatchEvent(new dom.window.Event('input'));
  await settle(200);
  t('nonsense is flagged before the attempt', /does not look like Base64/.test(view.textContent));
  [...view.querySelectorAll('button')].find(b => b.textContent === 'Decode').click();
  await settle();
  t('and the failure explains itself', /never appears in Base64/.test(view.textContent));
  un?.();
}

console.log('\nlarge output is not poured into the DOM');
{
  const { output } = await import('../js/ui.js');
  const box = output(1000);
  box.set('x'.repeat(50_000));
  t('only the cap is rendered', box.node.querySelector('.output-text').textContent.length === 1000);
  t('and the truncation is explained', /Showing the first/.test(box.node.textContent));
  t('with the real total stated', box.node.textContent.includes('50,000'));
}

console.log('\nthe decoder does not hoard object URLs');
{
  const live = new Set();
  const realCreate = globalThis.URL.createObjectURL;
  const realRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = () => { const u = 'blob:' + Math.random(); live.add(u); return u; };
  globalThis.URL.revokeObjectURL = u => { live.delete(u); };

  view.replaceChildren();
  const un = mods.decode.mount(view);
  const input = view.querySelector('textarea');
  const decodeButton = [...view.querySelectorAll('button')].find(b => b.textContent === 'Decode');

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 5; i++) {
    input.value = Buffer.from([...png, ...Array(10 + i * 3).fill(i + 1)]).toString('base64');
    decodeButton.click();
    await settle(20);
  }
  // Each decode replaces the previous result, so only one blob should be alive.
  t('only the current result holds a blob', live.size === 1);
  un?.();
  t('and leaving the view frees it', live.size === 0);

  globalThis.URL.createObjectURL = realCreate;
  globalThis.URL.revokeObjectURL = realRevoke;
}

console.log('\nswitching views leaves nothing behind');
{
  const counts = {};
  const add = view.addEventListener.bind(view), rem = view.removeEventListener.bind(view);
  view.addEventListener = (type, fn, o) => { counts[type] = (counts[type] || 0) + 1; return add(type, fn, o); };
  view.removeEventListener = (type, fn, o) => { counts[type] = (counts[type] || 0) - 1; return rem(type, fn, o); };
  let un = null;
  for (let round = 0; round < 8; round++) {
    for (const name of VIEWS) { un?.(); view.replaceChildren(); un = mods[name].mount(view) ?? null; }
  }
  un?.();
  t('no listeners left on the container', Object.values(counts).every(c => c === 0));
  view.addEventListener = add; view.removeEventListener = rem;
}

console.log('\naccessibility');
for (const name of VIEWS) {
  view.replaceChildren();
  const un = mods[name].mount(view);
  const unlabelled = [...view.querySelectorAll('input, textarea')]
    .filter(x => !x.getAttribute('aria-label') && !x.closest('label') && !x.id);
  const nameless = [...view.querySelectorAll('button')]
    .filter(b => !b.textContent.trim() && !b.getAttribute('aria-label'));
  t(`${name}: every field labelled, every button named`, unlabelled.length === 0 && nameless.length === 0);
  un?.();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
