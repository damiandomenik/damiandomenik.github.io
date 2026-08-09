/* filelist.js — an ordered, drag-sortable list of files.
 * `entries` is mutated in place: [{ id, name, meta, thumb }]
 */

import { el } from '../ui.js';

export function fileList(entries, { onChange = () => {} } = {}) {
  const node = el('ul', { class: 'filelist' });
  let dragId = null;

  function indexOf(id) { return entries.findIndex(e => e.id === id); }

  function move(id, to) {
    const from = indexOf(id);
    if (from < 0) return;
    const [item] = entries.splice(from, 1);
    const target = Math.max(0, Math.min(entries.length, to > from ? to - 1 : to));
    entries.splice(target, 0, item);
    onChange();
  }

  function nudge(id, direction) {
    const from = indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= entries.length) return;
    const [item] = entries.splice(from, 1);
    entries.splice(to, 0, item);
    onChange();
  }

  function remove(id) {
    const i = indexOf(id);
    if (i >= 0) entries.splice(i, 1);
    onChange();
  }

  function row(entry, i) {
    const li = el('li', { draggable: 'true', dataset: { id: entry.id } },
      el('span', { class: 'fl-idx', text: String(i + 1).padStart(2, '0') }),
      entry.thumb ? el('img', { class: 'fl-thumb', src: entry.thumb, alt: '' }) : null,
      el('div', { class: 'fl-main' },
        el('span', { class: 'fl-name', text: entry.name, title: entry.name }),
        el('span', { class: 'fl-meta', text: entry.meta || '' })),
      el('div', { class: 'fl-actions' },
        el('button', { class: 'btn tiny', title: 'Move up', 'aria-label': `Move ${entry.name} up`, disabled: i === 0, onclick: () => nudge(entry.id, -1) }, '↑'),
        el('button', { class: 'btn tiny', title: 'Move down', 'aria-label': `Move ${entry.name} down`, disabled: i === entries.length - 1, onclick: () => nudge(entry.id, 1) }, '↓'),
        el('button', { class: 'btn tiny danger', title: 'Remove', 'aria-label': `Remove ${entry.name}`, onclick: () => remove(entry.id) }, '✕'))
    );

    li.addEventListener('dragstart', e => {
      dragId = entry.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', entry.id);
    });
    li.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); clearMarks(); });
    li.addEventListener('dragover', e => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = li.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      clearMarks();
      li.classList.add(after ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('drop', e => {
      if (!dragId) return;
      e.preventDefault();
      const rect = li.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      move(dragId, indexOf(entry.id) + (after ? 1 : 0));
      dragId = null;
      clearMarks();
    });

    return li;
  }

  function clearMarks() {
    for (const li of node.children) li.classList.remove('drop-before', 'drop-after');
  }

  function render() {
    node.replaceChildren(...entries.map(row));
    node.hidden = entries.length === 0;
  }

  return { node, render };
}
