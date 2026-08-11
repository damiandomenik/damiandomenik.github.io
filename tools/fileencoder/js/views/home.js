/* views/home.js — the landing view: say what it does, then get out of the way. */

import { el, dropzone } from '../ui.js';
import { goTo, stageFiles } from '../state.js';

const FEATURES = [
  { icon: '🔐', title: 'Private', text: 'Your files are read by JavaScript in this tab. There is no upload step and no server to send them to.' },
  { icon: '⚡', title: 'Immediate', text: 'No accounts, no queue, no waiting. Drop a file and the analysis is there.' },
  { icon: '📱', title: 'Honest about QR', text: 'A QR code holds 2,953 bytes at absolute maximum. The tool works out whether your file fits, and says plainly when it does not.' },
];

export function mount(root) {
  root.append(
    el('section', { class: 'hero' },
      el('h1', { class: 'hero-title', text: 'Universal File Encoder' }),
      el('p', { class: 'hero-sub' },
        'Encode, decode, analyze and transfer data —', el('br'), 'entirely in your browser.')
    ),
    dropzone({
      title: 'Drop your file here',
      sub: 'or click to browse · several at once is fine · nothing is uploaded',
      onFiles: files => { stageFiles(files); goTo('encode'); },
    }),
    el('div', { class: 'feature-grid' },
      ...FEATURES.map(feature => el('div', { class: 'feature' },
        el('span', { class: 'feature-icon', 'aria-hidden': 'true', text: feature.icon }),
        el('span', { class: 'feature-title', text: feature.title }),
        el('span', { class: 'feature-text', text: feature.text })
      ))
    ),
    el('div', { class: 'promise' },
      el('p', { class: 'promise-lock', text: '🔒 Your files never leave your browser.' }),
      el('p', { class: 'promise-list', text: 'No uploads. No accounts. No database. 100% client-side.' })
    )
  );
  return () => {};
}
