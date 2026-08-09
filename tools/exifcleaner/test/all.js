/* Runs every EXIF Cleaner suite. Usage: node test/all.js */
import { spawnSync } from 'node:child_process';

let failed = 0;
for (const suite of ['test/run.js', 'test/geocode.test.js']) {
  const result = spawnSync('node', [suite], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
