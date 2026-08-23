/**
 * RiftRush Test-Runner   —   Aufruf:  node tests/run.mjs
 *
 * Legt automatisch ein lokales "three"-Modul aus vendor/ an (Node braucht für
 * den Bare-Import `three` eine Auflösung) und führt danach die Suites aus.
 * Die E2E-Suite läuft nur, wenn jsdom installiert ist:  npm i -D jsdom
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tdir = path.join(root, 'node_modules', 'three');
fs.mkdirSync(tdir, { recursive: true });
fs.copyFileSync(path.join(root, 'vendor', 'three.module.js'), path.join(tdir, 'real.js'));
fs.writeFileSync(path.join(tdir, 'package.json'),
  '{"name":"three","version":"0.160.1","type":"module","main":"index.js","exports":"./index.js"}');
fs.writeFileSync(path.join(tdir, 'index.js'), `export * from './real.js';
// WebGL steht in Node nicht zur Verfügung -> Renderer-Stub für die Tests
export class WebGLRenderer {
  constructor(o = {}) {
    this.domElement = o.canvas || {};
    this._loop = null; this.renders = 0;
    this.shadowMap = { enabled: false, type: 0 };
    this.outputColorSpace = 'srgb';
  }
  setPixelRatio() {} setSize() {} setClearColor() {} dispose() {}
  setAnimationLoop(fn) { this._loop = fn; }
  render() { this.renders++; }
}
`);

let total = 0;
console.log('\n########## WELT & MOVEMENT ##########');
total += (await import('./suite-world.mjs')).default;
console.log('\n########## SPIELERFIGUR & EFFEKTE ##########');
total += (await import('./suite-character.mjs')).default;

console.log('\n########## CHARAKTER-ASSET (GLB) ##########');
total += (await import('./suite-asset.mjs')).default;

console.log('\n########## GRAFIK & UMGEBUNG ##########');
total += (await import('./suite-art.mjs')).default;

console.log('\n########## BOSS ##########');
total += (await import('./suite-boss.mjs')).default;

console.log('\n########## NETZWERK & RACE ##########');
total += (await import('./suite-net.mjs')).default;

console.log('\n########## MULTIPLAYER (echter Signaling-Server) ##########');
try {
  await import('ws');
  total += (await import('./suite-multiplayer.mjs')).default;
} catch (e) {
  if (String(e).includes("'ws'")) console.log('(Multiplayer-Suite übersprungen — benötigt das Paket "ws": npm i -D ws)');
  else { console.log('  FAIL:', e.stack); total++; }
}

let hasJsdom = true;
try { await import('jsdom'); } catch { hasJsdom = false; }
if (!hasJsdom) {
  console.log('\n(E2E übersprungen — für den vollen Durchlauf: npm i -D jsdom)');
} else {
  console.log('\n########## END-TO-END ##########');
  total += (await import('./suite-e2e.mjs')).default;
}

console.log(total === 0 ? '\n==> ALLE TESTS BESTANDEN\n' : `\n==> ${total} FEHLER\n`);
process.exit(total ? 1 : 0);
