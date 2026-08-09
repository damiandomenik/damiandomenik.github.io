import { el } from '../ui.js';
import { TOOLS } from '../routes.js';

export function mount(root) {
  root.append(
    el('section', { class: 'hero' },
      el('h1', { text: 'PDF Toolbox' }),
      el('p', { class: 'lock', text: '🔒 Your files never leave your browser.' }),
      el('p', { class: 'sub', text: 'Pick a tool, drop a file in, get a file back. The page reads your files with JavaScript and writes the result on your machine — there is no upload step and no server to send it to.' })
    ),
    el('ul', { class: 'tool-grid' },
      TOOLS.map(t => el('li', {},
        el('a', { href: `#/${t.route}` },
          el('span', { class: 't-name', text: t.label }),
          el('span', { class: 't-desc', text: t.desc }))
      ))
    ),
    el('section', { class: 'facts' },
      el('h2', { text: 'What runs where' }),
      el('ul', {},
        el('li', { text: 'Reading and drawing pages: pdf.js, in a Web Worker in this tab.' }),
        el('li', { text: 'Writing new PDFs: pdf-lib, in this tab.' }),
        el('li', { text: 'The only network requests are the three library files, loaded once from a CDN. Your documents are not part of any request.' }),
        el('li', { text: 'Nothing is stored: closing the tab discards everything.' }),
        el('li', { text: 'Password-protected PDFs cannot be edited here — see each tool for what is possible instead.' })
      )
    )
  );

  return () => {};
}
