/* load.js — reading a PDF file, with the password round-trip attached. */

import { askPassword } from './ui.js';
import { loadPdf, renderThumb, PasswordNeeded } from './pdf-engine.js';

/** Returns the loaded document, or null if the user cancelled the password prompt. */
export async function loadWithPassword(file) {
  try {
    return await loadPdf(file);
  } catch (err) {
    if (!(err instanceof PasswordNeeded)) throw err;
    const password = await askPassword(file.name);
    if (password === null) return null;
    return await loadPdf(file, password);   // a wrong password throws PasswordNeeded again
  }
}

export async function firstPageThumb(source, pool, width = 80) {
  try {
    return pool.create(await renderThumb(source.pdfjsDoc, 1, width));
  } catch {
    return null;
  }
}
