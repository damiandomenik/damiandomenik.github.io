/* Runs every PatternLab suite. Usage: node test/all.js */
import { spawnSync } from 'node:child_process';

let failed = 0;
if (spawnSync('node', ['test/run.js'], { stdio: 'inherit' }).status !== 0) failed++;

// The view suite needs jsdom; skip it rather than fail when it is absent.
try {
  await import('jsdom');
  if (spawnSync('node', ['test/ui.test.js'], { stdio: 'inherit' }).status !== 0) failed++;
} catch {
  console.log('\n  --  view suite skipped: run `npm install jsdom` to include it\n');
}

process.exit(failed ? 1 : 0);
