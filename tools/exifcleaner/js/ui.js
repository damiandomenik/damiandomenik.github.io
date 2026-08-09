/* ui.js — every DOM touch. Values read out of a photo go in via textContent
 * only; a filename or an EXIF comment is attacker-controlled text as far as
 * this page is concerned. */

import { GROUP_INFO, GROUP_ORDER, SEVERITY_RANK } from './tags.js';
import { formatBytes, SCANNED_FOR } from './exif.js';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function toast(message, kind = 'info', ms = 4000) {
  const node = el('div', { class: 'toast', dataset: { kind }, text: message });
  document.getElementById('toasts').append(node);
  setTimeout(() => node.remove(), ms);
}

/* ---------------- dropzone ---------------- */

export function dropzone({ onFiles }) {
  const input = el('input', {
    type: 'file', multiple: true, accept: 'image/*', style: 'display:none',
  });
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    if (files.length) onFiles(files);
  });

  const node = el('div', { class: 'dropzone', role: 'button', tabindex: '0' },
    el('div', { class: 'dropzone-title', text: 'Drop photos here' }),
    el('div', { class: 'dropzone-sub', text: 'or click to choose · JPEG, PNG and WebP are cleaned losslessly · several at once is fine' }),
    input
  );

  node.addEventListener('click', event => { if (event.target !== input) input.click(); });
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });

  let depth = 0;
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  node.addEventListener('dragenter', event => { if (!hasFiles(event)) return; event.preventDefault(); depth++; node.classList.add('over'); });
  node.addEventListener('dragover', event => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
  node.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; node.classList.remove('over'); } });
  node.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    node.classList.remove('over');
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  });

  return node;
}

/* ---------------- controls ---------------- */

export function controlBar({ onCleanAll, onClear, onOptionChange, onViewChange }) {
  const orientation = el('input', { type: 'checkbox', checked: true });
  const colour = el('input', { type: 'checkbox', checked: true });
  const expand = el('input', { type: 'checkbox' });
  orientation.addEventListener('change', onOptionChange);
  colour.addEventListener('change', onOptionChange);
  expand.addEventListener('change', onViewChange);

  const cleanAll = el('button', { class: 'btn btn-primary', onclick: onCleanAll }, 'Clean all');
  const clear = el('button', { class: 'btn btn-quiet', onclick: onClear }, 'Clear');

  const node = el('div', { class: 'controls' },
    el('label', { class: 'check' }, orientation, 'Keep orientation flag',
      el('span', { class: 'check-note', text: '(recommended)' })),
    el('label', { class: 'check' }, colour, 'Keep colour profile'),
    el('label', { class: 'check' }, expand, 'Show every tag'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'button-row' }, cleanAll, clear)
  );

  return {
    node,
    options: () => ({ keepOrientation: orientation.checked, keepColorProfile: colour.checked }),
    showAll: () => expand.checked,
    setBusy(busy) { cleanAll.disabled = busy; cleanAll.textContent = busy ? 'Cleaning…' : 'Clean all'; },
  };
}

/* ---------------- one photo ---------------- */

export function sheet(entry, handlers) {
  const node = el('article', { class: 'sheet' });
  render(node, entry, handlers);
  return { node, update: () => render(node, entry, handlers) };
}

function render(node, entry, handlers) {
  const children = [head(entry)];

  if (entry.error) {
    children.push(el('div', { class: 'problem' },
      el('strong', { text: 'Cannot clean this one. ' }), entry.error,
      entry.canReencode
        ? el('div', { style: 'margin-top:10px' },
            el('button', { class: 'btn btn-sm', onclick: () => handlers.onReencode(entry) },
              'Re-encode as JPEG instead'))
        : null
    ));
  } else if (entry.findings?.length) {
    children.push(findingsSection(entry, handlers));
  } else {
    // "Nothing found" has to be said out loud. Showing an empty space leaves
    // you unable to tell a clean photo from a tool that did not work.
    children.push(nothingFound(entry));
  }

  if (entry.cleaned) children.push(resultStrip(entry, handlers));
  else if (!entry.error) children.push(actions(entry, handlers));

  node.replaceChildren(...children);
}

function head(entry) {
  const verdict = verdictFor(entry);
  return el('div', { class: 'sheet-head' },
    el('div', { class: 'frame' }, el('img', { src: entry.previewUrl, alt: '', loading: 'lazy' })),
    el('div', { class: 'sheet-main' },
      el('div', { class: 'sheet-name', text: entry.file.name }),
      el('div', { class: 'sheet-meta', text: [
        entry.format.toUpperCase(),
        formatBytes(entry.file.size),
        entry.dimensions ? `${entry.dimensions.width} × ${entry.dimensions.height}` : null,
      ].filter(Boolean).join('  ·  ') }),
      el('div', { class: 'verdict', dataset: { level: verdict.level }, text: verdict.text })
    )
  );
}

function verdictFor(entry) {
  if (entry.cleaned) return { level: 'clean', text: 'Cleaned' };
  if (entry.error) return { level: 'minor', text: 'Not supported' };
  const findings = entry.findings || [];
  if (!findings.length) return { level: 'clean', text: 'Nothing hidden in this one' };

  const identifying = findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  if (identifying.length) {
    const groups = new Set(identifying.map(f => f.group));
    const names = [...groups].map(g => GROUP_INFO[g]?.label.toLowerCase()).filter(Boolean);
    return { level: 'critical', text: `Reveals ${listPhrase(names)}` };
  }
  return { level: 'minor', text: `${findings.length} technical tag${findings.length === 1 ? '' : 's'}, nothing identifying` };
}

function listPhrase(items) {
  if (items.length <= 1) return items[0] || 'something';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function nothingFound(entry) {
  const checked = SCANNED_FOR[entry.format] || ['metadata blocks'];
  const containers = entry.containers || [];

  return el('section', { class: 'nothing' },
    el('h3', { class: 'group-title', text: 'No metadata in this file' }),
    el('p', { class: 'group-why' },
      'Checked for ', checked.join(', '),
      '. None of it is present — no location, no timestamps, no device, no name.'),
    containers.length
      ? el('p', { class: 'group-why', text:
          `The file does contain: ${containers.map(c => `${c.name} (${formatBytes(c.bytes)})`).join(', ')}. `
          + 'Those describe how to display the image, not who made it.' })
      : null,
    el('details', { class: 'disclosure-inline' },
      el('summary', { text: 'Why would a photo have nothing?' }),
      el('ul', { class: 'reasons' },
        el('li', { text: 'It came through a messaging app or social network. WhatsApp, Signal, Instagram, Facebook and X all strip metadata when you upload — the copy you downloaded is already bare.' }),
        el('li', { text: 'It is a screenshot. Screenshots never carry camera data, because no camera was involved.' }),
        el('li', { text: 'It was exported or re-saved by an editor set to discard metadata.' }),
        el('li', { text: 'It has already been through a cleaner — including this one.' })
      )
    )
  );
}

function findingsSection(entry, handlers) {
  const byGroup = new Map();
  for (const finding of entry.findings) {
    if (!byGroup.has(finding.group)) byGroup.set(finding.group, []);
    byGroup.get(finding.group).push(finding);
  }

  const important = [];
  const technical = [];

  for (const group of GROUP_ORDER) {
    const findings = byGroup.get(group);
    if (!findings) continue;
    const worst = findings.reduce((acc, f) => Math.min(acc, SEVERITY_RANK[f.severity]), 9);
    (worst <= 1 ? important : technical).push(groupBlock(group, findings, worst, entry, handlers));
  }

  const section = el('div', { class: 'findings' }, ...important);

  if (technical.length) {
    const count = technical.reduce((n, block) => n + block.querySelectorAll('.row').length, 0);
    section.append(el('details', { class: 'disclosure', open: handlers?.showAll === true },
      el('summary', { text: `Everything else — ${count} further tag${count === 1 ? '' : 's'}: camera settings, dimensions, software, unrecognised entries` }),
      ...technical
    ));
  }
  return section;
}

function groupBlock(group, findings, worst, entry, handlers) {
  const info = GROUP_INFO[group] || { label: group, icon: '•', consequence: '' };
  const severity = worst === 0 ? 'critical' : worst === 1 ? 'high' : 'low';

  const coordinates = findings.find(f => f.isCoordinates);
  const rows = findings
    .filter(f => !f.isCoordinates)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .map(finding => el('div', { class: 'row', dataset: { severity: finding.severity } },
      el('span', { class: 'row-key', text: finding.name }),
      el('span', { class: 'row-val', text: String(finding.display ?? '') })
    ));

  return el('section', { class: 'group', dataset: { severity } },
    el('div', { class: 'group-head' },
      el('span', { class: 'group-icon', text: info.icon }),
      el('h3', { class: 'group-title', text: info.label })
    ),
    info.consequence ? el('p', { class: 'group-why', text: info.consequence }) : null,
    coordinates ? coordinateBlock(coordinates, entry, handlers) : null,
    rows.length ? el('div', { class: 'rows' }, ...rows) : null
  );
}

function coordinateBlock(finding, entry, handlers) {
  const { lat, lon } = finding.value;
  const href = `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=16/${lat.toFixed(4)}/${lon.toFixed(4)}`;

  const block = el('div', { class: 'coords' },
    el('div', { class: 'coords-value', text: `${lat.toFixed(6)}, ${lon.toFixed(6)}` }),
    finding.precision ? el('p', { class: 'coords-note', text: finding.precision }) : null
  );

  /* --- address --- */
  if (entry.address) {
    block.append(el('div', { class: 'address' },
      el('span', { class: 'label', text: 'This is' }),
      el('p', { class: 'address-line', text: entry.address.summary }),
      entry.address.detail !== entry.address.summary
        ? el('p', { class: 'address-detail', text: entry.address.detail }) : null,
      el('p', { class: 'address-credit', text: entry.address.attribution })
    ));
  } else if (entry.addressError) {
    block.append(el('p', { class: 'coords-note', text: entry.addressError }));
  }

  /* --- map --- */
  if (entry.showMap) {
    // Loaded only after a click. referrerpolicy keeps the page URL out of the
    // request; the coordinates themselves are unavoidably in it — that is what
    // asking for a map means.
    const delta = 0.0025;
    const src = `https://www.openstreetmap.org/export/embed.html`
      + `?bbox=${(lon - delta).toFixed(5)},${(lat - delta).toFixed(5)},${(lon + delta).toFixed(5)},${(lat + delta).toFixed(5)}`
      + `&layer=mapnik&marker=${lat.toFixed(6)},${lon.toFixed(6)}`;
    block.append(el('div', { class: 'map' },
      el('iframe', {
        src, loading: 'lazy', referrerpolicy: 'no-referrer',
        title: 'Map of where this photo was taken',
      }),
      el('div', { class: 'map-bar' },
        el('span', { class: 'address-credit', text: '© OpenStreetMap contributors' }),
        el('button', {
          class: 'btn btn-sm btn-quiet',
          onclick: () => { entry.showMap = false; handlers.onRefresh(entry); },
        }, 'Hide map'))
    ));
  }

  /* --- the opt-in controls --- */
  const buttons = [];
  if (!entry.address && !entry.addressError && handlers?.onLookup) {
    const lookup = el('button', { class: 'btn btn-sm' }, 'Look up the address');
    lookup.addEventListener('click', async () => {
      lookup.disabled = true;
      lookup.textContent = 'Asking…';
      await handlers.onLookup(entry, finding);
    });
    buttons.push(lookup);
  }
  if (!entry.showMap && handlers?.onRefresh) {
    buttons.push(el('button', {
      class: 'btn btn-sm',
      onclick: () => { entry.showMap = true; handlers.onRefresh(entry); },
    }, 'Show on a map'));
  }

  if (buttons.length) {
    block.append(el('div', { class: 'lookup' },
      el('div', { class: 'button-row' }, ...buttons),
      el('p', { class: 'lookup-warning' },
        el('strong', { text: 'These two buttons are the only things here that leave your browser. ' }),
        'Either one sends these coordinates to OpenStreetMap — nothing else, no photo, no filename. Neither fires on its own.')
    ));
  }

  block.append(el('p', { class: 'coords-note' },
    el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, 'Open on openstreetmap.org'),
    ' for the full map.'
  ));

  return block;
}

function actions(entry, handlers) {
  const hasSomething = (entry.findings?.length ?? 0) > 0;
  return el('div', { class: 'sheet-actions' },
    el('button', { class: 'btn btn-primary', onclick: () => handlers.onClean(entry) },
      hasSomething ? 'Remove metadata' : 'Save a copy anyway'),
    el('button', { class: 'btn btn-quiet', onclick: () => handlers.onRemove(entry) }, 'Remove from list')
  );
}

function resultStrip(entry, handlers) {
  const saved = entry.file.size - entry.cleaned.bytes.length;
  const removed = entry.findings?.length ?? 0;

  return el('div', {},
    el('div', { class: 'result' },
      el('div', { class: 'result-text' },
        el('strong', { text: removed ? `${removed} metadata field${removed === 1 ? '' : 's'} removed. ` : 'Saved. ' }),
        entry.verified
          ? 'Re-checked afterwards: nothing identifying is left in the file.'
          : 'Saved.',
        el('span', { class: 'result-note', text: [
          `${formatBytes(entry.file.size)} → ${formatBytes(entry.cleaned.bytes.length)}`,
          saved > 0 ? `${formatBytes(saved)} smaller` : null,
          entry.cleaned.lossless ? 'pixels untouched' : 're-encoded',
        ].filter(Boolean).join('  ·  ') }),
        ...(entry.cleaned.notes || []).map(note => el('span', { class: 'result-note', text: note }))
      ),
      el('a', { class: 'btn btn-primary', href: entry.cleaned.url, download: entry.cleaned.name }, 'Download')
    )
  );
}

/* ---------------- summary bar ---------------- */

export function summaryBar({ onDownloadAll }) {
  const text = el('span', { class: 'result-text' });
  const button = el('button', { class: 'btn btn-primary', onclick: onDownloadAll }, 'Download all');
  const node = el('div', { class: 'controls', style: 'display:none' }, text, el('span', { class: 'spacer' }), button);

  return {
    node,
    update(cleanedCount, total) {
      node.style.display = cleanedCount > 1 ? 'flex' : 'none';
      text.textContent = `${cleanedCount} of ${total} photo${total === 1 ? '' : 's'} cleaned.`;
    },
    setBusy(busy) { button.disabled = busy; button.textContent = busy ? 'Packing…' : 'Download all'; },
  };
}
