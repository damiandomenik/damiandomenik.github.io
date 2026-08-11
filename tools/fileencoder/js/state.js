/* state.js — the little that has to survive a view change.
 *
 * In memory only. Nothing here is written to storage: a file staged for
 * encoding is the user's data, and the tool's whole promise is that it stays
 * in the tab and disappears when the tab does.
 */

let staged = [];

export function stageFiles(files) {
  staged = [...files];
}

export function takeStagedFiles() {
  const files = staged;
  staged = [];
  return files;
}

export function hasStagedFiles() {
  return staged.length > 0;
}

export function goTo(route) {
  location.hash = `#/${route}`;
}
