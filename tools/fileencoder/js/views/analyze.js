/* views/analyze.js — analysis on its own, without encoding anything.
 *
 * Reads only the first few kilobytes of each file, so dropping a 4 GB video
 * costs nothing: the type comes from the header and the sizes are arithmetic.
 */

import { el, card, dropzone, button, formatBytes, toastError } from '../ui.js';
import { sniff } from '../sniff.js';
import { advise } from '../advise.js';
import { fileFacts, qrGauge, adviceCard } from '../report.js';
import { stageFiles, goTo } from '../state.js';

export function mount(root) {
  const list = el('div', { class: 'stack' });
  const files = [];

  const zone = dropzone({
    title: 'Drop files to analyze',
    sub: 'nothing is encoded — only the first few kilobytes are read',
    onFiles: add,
  });

  async function add(dropped) {
    for (const file of dropped) {
      try {
        const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
        const detected = sniff(head, file.name);
        const info = {
          name: file.name, size: file.size, mime: detected.mime, label: detected.label,
          source: detected.source, mismatch: detected.mismatch,
        };
        const advice = advise(info);
        files.push(file);

        list.append(card(null, null,
          fileFacts(info),
          qrGauge(advice.qr),
          adviceCard(advice),
          el('div', { class: 'btn-row' },
            button('Encode this file', { kind: 'primary', onclick: () => { stageFiles([file]); goTo('encode'); } }))
        ));
      } catch (err) {
        toastError(err, `${file.name} could not be read`);
      }
    }
    zone.classList.add('compact');
  }

  root.append(
    card('File analysis', 'What a file is, how large it becomes as Base64, and whether QR transfer is realistic.', zone),
    list
  );

  return () => { files.length = 0; };
}
