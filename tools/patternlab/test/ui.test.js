import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!doctype html><body><nav id="tabs"></nav><main id="view"></main><div id="toasts"></div></body>`,
  { url:'https://x.test/tools/patternlab/', pretendToBeVisual:true });
for (const k of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','Event','location'])
  globalThis[k] = k==='window'?dom.window:dom.window[k];
globalThis.crypto ??= (await import('node:crypto')).webcrypto;
dom.window.navigator.clipboard = { writeText: async () => {} };

const views = ['home','regex','analyzer','builder','generator'];
let pass=0, fail=0;
const t=(l,v)=>{console.log(`${v?'  ok  ':' FAIL '} ${l}`); v?pass++:fail++;};

for (const name of views) {
  const view = document.getElementById('view');
  view.replaceChildren();
  try {
    const mod = await import(`../js/views/${name}.js`);
    const un = mod.mount(view);
    t(`${name.padEnd(10)} mountet · ${view.querySelectorAll('button').length} Buttons, ${view.textContent.length} Zeichen`, true);
    if (name === 'regex') {
      t('  Beispielmuster geladen', view.querySelector('.pattern-input').value.includes('AZ-'));
      t('  Treffer hervorgehoben', view.querySelectorAll('mark.hit').length === 2);
      t('  Trefferzahl gemeldet', view.querySelector('.match-summary').textContent === '2 matches');
      t('  Erklärung aufgebaut', view.querySelectorAll('.rung').length >= 6);
      t('  Testfälle ausgewertet', view.querySelector('.case-score').textContent === '4 / 4 passed');
      t('  Cheat-Sheet vorhanden', view.querySelectorAll('.cheat-row').length > 15);
      // ungültiges Muster darf nicht crashen
      const input = view.querySelector('.pattern-input');
      input.value = '(unclosed';
      input.dispatchEvent(new dom.window.Event('input'));
      await new Promise(r=>setTimeout(r,150));
      t('  ungültiges Muster: klare Meldung statt Absturz',
        !view.querySelector('.notice[data-kind=error]').hidden &&
        view.querySelector('.notice[data-kind=error]').textContent.includes('never closed'));
    }
    if (name === 'builder') {
      t('  Regex erzeugt', view.querySelector('.code-text').textContent.startsWith('^(?=.*[A-Z])'));
      t('  Regex ist gültig', (()=>{ try { new RegExp(view.querySelector('.code-text').textContent); return true; } catch { return false; } })());
    }
    if (name === 'generator') {
      const out = view.querySelector('.generated').textContent;
      t(`  Passwort erzeugt (${out.length} Zeichen)`, out.length >= 12);
      t('  Regelprüfung bestanden', view.textContent.includes('all') && view.textContent.includes('rules hold'));
    }
    if (name === 'analyzer') {
      const input = view.querySelector('.password-input');
      input.value = 'Password1!';
      input.dispatchEvent(new dom.window.Event('input'));
      await new Promise(r=>setTimeout(r,120));
      t('  schwaches Passwort erkannt', view.querySelector('.meter-label').textContent === 'Very weak');
      t('  Warnung ausgegeben', /common/i.test(view.textContent));
    }
    un?.();
  } catch (e) { t(`${name} — ${e.message}`, false); console.log(e.stack.split('\n').slice(0,4).join('\n')); }
}
console.log('\nGenerator → Analyzer');
{
  const { takeHandoffPassword } = await import('../js/state.js');
  const genMod = await import('../js/views/generator.js');
  const anaMod = await import('../js/views/analyzer.js');
  const v = document.getElementById('view');

  v.replaceChildren();
  genMod.mount(v);
  const generated = v.querySelector('.generated').textContent;
  [...v.querySelectorAll('button')].find(b => b.textContent === 'Analyze in full').click();

  v.replaceChildren();
  anaMod.mount(v);
  t('das erzeugte Passwort wird übergeben', v.querySelector('.password-input').value === generated);
  t('und sofort bewertet', v.querySelector('.meter-label').textContent.length > 0);
  t('die Übergabe ist danach geleert', takeHandoffPassword() === null);

  v.replaceChildren();
  anaMod.mount(v);
  t('ein erneuter Aufruf startet leer', v.querySelector('.password-input').value === '');
}

console.log('\nWechseln zwischen Bereichen hinterlässt nichts');
{
  const v = document.getElementById('view');
  const counts = {};
  const add = v.addEventListener.bind(v);
  const remove = v.removeEventListener.bind(v);
  v.addEventListener = (type, fn, o) => { counts[type] = (counts[type] || 0) + 1; return add(type, fn, o); };
  v.removeEventListener = (type, fn, o) => { counts[type] = (counts[type] || 0) - 1; return remove(type, fn, o); };

  const mods = {};
  for (const n of views) mods[n] = await import(`../js/views/${n}.js`);

  let un = null;
  for (let round = 0; round < 10; round++) {
    for (const name of views) {
      un?.();
      v.replaceChildren();
      un = mods[name].mount(v) ?? null;
    }
  }
  un?.();

  // A listener left on the view container would build up one per visit: the
  // container survives every switch, only its children are replaced.
  t('keine Listener auf dem Container übrig', Object.values(counts).every(c => c === 0));
  v.addEventListener = add;
  v.removeEventListener = remove;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
