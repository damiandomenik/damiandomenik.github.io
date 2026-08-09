import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!doctype html><body><div id="dropzone-slot"></div><div id="results"></div><div id="toasts"></div></body>`,
  { url:'https://x.test/tools/exifcleaner/', pretendToBeVisual:true });
for (const k of ['window','document','HTMLElement','Node','Event','Image','Blob'])
  globalThis[k] = k==='window'?dom.window:dom.window[k];
globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};

const ui = await import('../js/ui.js');
const { buildJpeg, buildTiff } = await import('./fixtures.js');
const { readMetadata } = await import('../js/exif.js');

let pass=0, fail=0;
const t=(l,v)=>{console.log(`${v?'  ok  ':' FAIL '} ${l}`); v?pass++:fail++;};

// realistisches Foto + ein unbekanntes Herstellertag
const base = readMetadata(buildJpeg()).findings;
const extra = readMetadata(buildJpeg({ tiff: buildTiff([{ifd:'0',tag:0xABCD,type:3,values:[42]}]) })).findings;
const findings = [...base, ...extra.filter(f=>f.unknown)];

let showAll = false;
const entry = {
  id:'a', file:{ name:'IMG_4021.jpg', size: 2400000, type:'image/jpeg' },
  previewUrl:'blob:x', format:'jpeg', findings, orientation: 6,
  error:null, cleaned:null, verified:false, dimensions:{width:4032,height:3024},
};
const handlers = {
  onClean(){}, onRemove(){}, onReencode(){}, async onLookup(){},
  onRefresh(e){ s.update(); },
  get showAll(){ return showAll; },
};
const s = ui.sheet(entry, handlers);
document.body.append(s.node);

console.log('\nvollständige Anzeige');
t('unbekanntes Tag wird gezeigt', s.node.textContent.includes('Tag 0xABCD'));
t('mit eigener Gruppe erklärt', s.node.textContent.includes('Unrecognised tags'));
t('Zähler nennt die Anzahl', /further tags?:/.test(s.node.querySelector('summary').textContent));
t('standardmäßig eingeklappt', !s.node.querySelector('details').hasAttribute('open'));
showAll = true; s.update();
t('"Show every tag" klappt auf', s.node.querySelector('details').hasAttribute('open'));
showAll = false; s.update();

console.log('\nKarte');
t('keine Karte vor dem Klick', s.node.querySelector('iframe') === null);
t('Knopf "Show on a map" vorhanden', [...s.node.querySelectorAll('button')].some(b=>b.textContent==='Show on a map'));
t('Warnung nennt beide Knöpfe', s.node.textContent.includes('only things here that leave your browser'));
[...s.node.querySelectorAll('button')].find(b=>b.textContent==='Show on a map').click();
const frame = s.node.querySelector('iframe');
t('Karte erscheint nach Klick', !!frame);
t('zeigt die richtigen Koordinaten', frame.getAttribute('src').includes('marker=47.160000,9.520000'));
t('kein Referrer wird mitgeschickt', frame.getAttribute('referrerpolicy')==='no-referrer');
t('Attribution vorhanden', s.node.textContent.includes('© OpenStreetMap contributors'));
t('lässt sich wieder ausblenden', !!([...s.node.querySelectorAll('button')].find(b=>b.textContent==='Hide map')));
[...s.node.querySelectorAll('button')].find(b=>b.textContent==='Hide map').click();
t('Karte ist danach weg', s.node.querySelector('iframe') === null);

console.log('\nAdresse');
entry.address = { summary:'Rathausplatz 2, Vaduz, Liechtenstein', detail:'Rathausplatz 2, 9490 Vaduz, Liechtenstein', attribution:'Address data © OpenStreetMap contributors, via Nominatim' };
s.update();
t('Adresse wird angezeigt', s.node.textContent.includes('Rathausplatz 2, Vaduz'));
t('Lookup-Knopf verschwindet danach', ![...s.node.querySelectorAll('button')].some(b=>b.textContent==='Look up the address'));
t('Karten-Knopf bleibt', [...s.node.querySelectorAll('button')].some(b=>b.textContent==='Show on a map'));

console.log('\nKameradaten weiterhin da');
t('Make sichtbar', s.node.textContent.includes('Apple'));
t('Seriennummer sichtbar', s.node.textContent.includes('F2LX9007QW'));
t('Zeitstempel sichtbar', s.node.textContent.includes('2024:07:14 15:32:08'));
showAll = true; s.update();
t('ISO im aufgeklappten Bereich', s.node.querySelector('details').textContent.includes('400'));


console.log('\nDatei ohne Metadaten');
{
  const bare = {
    id:'b', file:{ name:'6A7AF4F5-30A5-42C7.jpg', size:281000, type:'image/jpeg' },
    previewUrl:'blob:x', format:'jpeg', findings:[], containers:[{name:'JFIF header', bytes:14},{name:'ICC colour profile', bytes:456}],
    orientation:null, error:null, cleaned:null, dimensions:{width:2048,height:1536},
  };
  const v = ui.sheet(bare, handlers);
  document.body.append(v.node);
  const text = v.node.textContent;
  t('sagt ausdrücklich, dass nichts drin ist', text.includes('No metadata in this file'));
  t('nennt, wonach gesucht wurde', text.includes('Exif') && text.includes('XMP') && text.includes('IPTC'));
  t('nennt, was strukturell da ist', text.includes('ICC colour profile'));
  t('erklärt die wahrscheinliche Ursache', text.includes('WhatsApp'));
  t('Verdikt bleibt ruhig', v.node.querySelector('.verdict').dataset.level === 'clean');

  bare.cleaned = { bytes:new Uint8Array(280000), notes:[], lossless:true, url:'blob:y', name:'x-clean.jpg' };
  v.update();
  t('Erklärung bleibt auch nach dem Säubern sichtbar', v.node.textContent.includes('No metadata in this file'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
