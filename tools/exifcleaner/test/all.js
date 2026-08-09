/* Runs every EXIF Cleaner suite. Usage: node test/all.js */
import { spawnSync } from 'node:child_process';

let failed = 0;

// The parser and geocoding suites need nothing but Node. The UI suite needs
// jsdom; if it is not installed it is skipped rather than failing the run.
for (const suite of ['test/run.js', 'test/geocode.test.js']) {
  if (spawnSync('node', [suite], { stdio: 'inherit' }).status !== 0) failed++;
}

try {
  await import('jsdom');
  if (spawnSync('node', ['test/ui.test.js'], { stdio: 'inherit' }).status !== 0) failed++;
} catch {
  console.log('\n  --  UI suite skipped: run `npm install jsdom` to include it\n');
}

process.exit(failed ? 1 : 0);
