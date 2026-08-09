/* pagegrid.js — thumbnails of a composition: select, reorder, rotate, delete.
 *
 * Thumbnails render lazily (only what is on screen) and are cached per source
 * page, so scrolling a 500-page document does not rasterise 500 pages.
 */

import { el } from '../ui.js';

export function pageGrid(composer, {
  ops = ['move', 'rotate', 'delete'],
  reorder = true,
  onChange = () => {},
  onSelection = () => {},
} = {}) {
  const node = el('div', { class: 'pagegrid' });
  const cells = new Map();          // uid -> element
  const selected = new Set();
  let anchor = null;                // for shift-click ranges
  let dragUid = null;

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      paint(entry.target);
    }
  }, { root: null, rootMargin: '300px 0px' });

  async function paint(cell) {
    const item = composer.get(cell.dataset.uid);
    if (!item) return;
    const img = cell.querySelector('img');
    const ph = cell.querySelector('.ph');
    try {
      const url = await composer.thumbUrl(item);
      img.src = url;
      img.hidden = false;
      ph?.remove();
    } catch {
      if (ph) ph.textContent = 'preview failed';
    }
  }

  function makeCell(item) {
    const img = el('img', { alt: '', hidden: true, draggable: false });
    const frame = el('div', { class: 'pcell-frame' }, img, el('span', { class: 'ph', text: '…' }));

    const opsBar = el('div', { class: 'pcell-ops' });
    const button = (label, title, handler) => el('button', {
      class: 'btn tiny', title, 'aria-label': title,
      onclick: e => { e.stopPropagation(); handler(); onChange(); },
    }, label);

    if (ops.includes('move')) opsBar.append(button('‹', 'Move left', () => composer.nudge(item.uid, -1)));
    if (ops.includes('rotate')) {
      opsBar.append(button('⟲', 'Rotate left', () => composer.rotate(item.uid, -90)));
      opsBar.append(button('⟳', 'Rotate right', () => composer.rotate(item.uid, 90)));
    }
    if (ops.includes('delete')) opsBar.append(button('✕', 'Delete page', () => {
      selected.delete(item.uid);
      composer.remove(item.uid);
    }));
    if (ops.includes('move')) opsBar.append(button('›', 'Move right', () => composer.nudge(item.uid, 1)));

    const cell = el('div', {
      class: 'pcell',
      draggable: reorder ? 'true' : 'false',
      tabindex: '0',
      role: 'checkbox',
      'aria-checked': 'false',
      dataset: { uid: item.uid },
    },
      el('span', { class: 'pcell-check', 'aria-hidden': 'true' }),
      frame,
      el('div', { class: 'pcell-bar' },
        el('span', { class: 'pcell-no' }),
        el('span', { class: 'pcell-src' }),
        opsBar)
    );

    cell.addEventListener('click', e => toggle(item.uid, e.shiftKey));
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(item.uid, e.shiftKey); }
    });

    if (!reorder) return cell;

    cell.addEventListener('dragstart', e => {
      dragUid = item.uid;
      cell.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.uid);
    });
    cell.addEventListener('dragend', () => {
      dragUid = null;
      cell.classList.remove('dragging');
      clearDropMarks();
    });
    cell.addEventListener('dragover', e => {
      if (!dragUid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = cell.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      clearDropMarks();
      cell.classList.add(after ? 'drop-after' : 'drop-before');
    });
    cell.addEventListener('drop', e => {
      if (!dragUid) return;
      e.preventDefault();
      const rect = cell.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      const target = composer.indexOf(item.uid) + (after ? 1 : 0);
      if (selected.has(dragUid) && selected.size > 1) {
        composer.moveGroup([...selected], target);
      } else {
        composer.moveTo(dragUid, target);
      }
      dragUid = null;
      clearDropMarks();
      onChange();
    });

    return cell;
  }

  function clearDropMarks() {
    for (const cell of cells.values()) cell.classList.remove('drop-before', 'drop-after');
  }

  function toggle(uid, range) {
    if (range && anchor) {
      const from = composer.indexOf(anchor);
      const to = composer.indexOf(uid);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        for (let i = a; i <= b; i++) selected.add(composer.pages[i].uid);
      }
    } else {
      if (selected.has(uid)) selected.delete(uid); else selected.add(uid);
      anchor = uid;
    }
    render();
    onSelection([...selected]);
  }

  function render() {
    // Keep existing cells (and their rendered thumbnails); just reorder them.
    const seen = new Set();
    const ordered = [];

    composer.pages.forEach((item, i) => {
      seen.add(item.uid);
      let cell = cells.get(item.uid);
      if (!cell) {
        cell = makeCell(item);
        cells.set(item.uid, cell);
        observer.observe(cell);
      }
      const on = selected.has(item.uid);
      cell.classList.toggle('selected', on);
      cell.setAttribute('aria-checked', String(on));
      cell.querySelector('.pcell-no').textContent = String(i + 1);
      const src = composer.sourceOf(item);
      cell.querySelector('.pcell-src').textContent = src ? shortName(src.name) : '';
      cell.title = src ? `${src.name} — page ${item.pageIndex + 1}` : '';
      const frame = cell.querySelector('.pcell-frame');
      frame.className = `pcell-frame r${item.rotation}`;
      ordered.push(cell);
    });

    for (const [uid, cell] of cells) {
      if (seen.has(uid)) continue;
      observer.unobserve(cell);
      cell.remove();
      cells.delete(uid);
      selected.delete(uid);
    }

    node.replaceChildren(...ordered);
  }

  return {
    node,
    render,
    getSelected: () => composer.pages.filter(p => selected.has(p.uid)).map(p => p.uid),
    selectionSize: () => selected.size,
    selectAll() {
      for (const p of composer.pages) selected.add(p.uid);
      render();
      onSelection([...selected]);
    },
    clearSelection() {
      selected.clear();
      anchor = null;
      render();
      onSelection([]);
    },
    setSelection(uids) {
      selected.clear();
      for (const uid of uids) selected.add(uid);
      render();
      onSelection([...selected]);
    },
    destroy() {
      observer.disconnect();
      cells.clear();
      selected.clear();
    },
  };
}

function shortName(name) {
  return name.length > 14 ? name.slice(0, 6) + '…' + name.slice(-6) : name;
}
