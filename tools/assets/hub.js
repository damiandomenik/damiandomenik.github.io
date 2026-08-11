/* tools/ hub — tool registry + command bar.
   Add a new tool by appending one entry to TOOLS. Nothing else to touch. */

const TOOLS = [
  {
    id: 'pdf',
    name: 'pdf-toolbox',
    href: './pdftoolbox/',
    desc: 'Merge, split, reorder, rotate PDFs. Convert images to PDF and pages to images. All in the tab.',
    tags: ['pdf', 'images', 'offline'],
    keywords: ['merge', 'split', 'organize', 'rotate', 'jpg', 'png', 'convert'],
    ready: true,
  },
  {
    id: 'exif',
    name: 'exif-cleaner',
    href: './exifcleaner/',
    desc: 'See what your photos reveal — GPS, timestamps, serial numbers — and strip it out without re-compressing.',
    tags: ['photos', 'privacy', 'offline'],
    keywords: ['metadata', 'gps', 'location', 'jpeg', 'png', 'webp', 'strip', 'exif'],
    ready: true,
  },
  {
    id: 'patternlab',
    name: 'patternlab',
    href: './patternlab/',
    desc: 'Regex playground with plain-English explanations, plus password analysis, rule building and generation.',
    tags: ['regex', 'passwords', 'offline'],
    keywords: ['pattern', 'match', 'test', 'strength', 'generator', 'entropy', 'rules'],
    ready: true,
  },
  {
    id: 'fileencoder',
    name: 'file-encoder',
    href: './fileencoder/',
    desc: 'Encode files as Base64, data URLs or QR codes — with an honest answer on whether QR transfer is even possible.',
    tags: ['base64', 'qr', 'offline'],
    keywords: ['encode', 'decode', 'data url', 'convert', 'file', 'transfer', 'mime'],
    ready: true,
  },
  // Example of how a future tool is declared — remove or replace.
  // {
  //   id: 'docx',
  //   name: 'word-to-pdf',
  //   href: './docx/',
  //   desc: 'Convert .docx files to PDF without leaving the browser.',
  //   tags: ['docx', 'pdf'],
  //   keywords: ['word', 'office'],
  //   ready: false,
  // },
];

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const cmd = document.getElementById('cmd');
const out = document.getElementById('cmd-out');

function render(list) {
  grid.replaceChildren(...list.map(toCard));
  empty.hidden = list.length > 0;
  count.textContent = `— ${list.length}/${TOOLS.length}`;
}

function toCard(t) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'card' + (t.ready ? '' : ' soon');
  a.href = t.ready ? t.href : '#';
  if (!t.ready) a.setAttribute('aria-disabled', 'true');

  const top = document.createElement('div');
  top.className = 'card-top';
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = t.name;
  const right = document.createElement('span');
  if (t.ready) { right.className = 'card-arrow'; right.textContent = '→'; }
  else { right.className = 'status-soon'; right.textContent = 'PLANNED'; }
  top.append(name, right);

  const desc = document.createElement('p');
  desc.className = 'card-desc';
  desc.textContent = t.desc;

  const tags = document.createElement('div');
  tags.className = 'tags';
  for (const tag of t.tags) {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = tag;
    tags.append(s);
  }

  a.append(top, desc, tags);
  li.append(a);
  return li;
}

function search(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return TOOLS;
  return TOOLS.filter(t =>
    [t.name, t.id, t.desc, ...t.tags, ...t.keywords].join(' ').toLowerCase().includes(needle)
  );
}

/* ---- command bar ---------------------------------------------------- */

const HELP = [
  ['ls', 'list every tool'],
  ['open <name>', 'open a tool (or just type its name)'],
  ['whoami', 'what this site knows about you'],
  ['clear', 'reset the filter'],
];

function say(text) { out.textContent = text; }

function sayHelp() {
  out.replaceChildren(...HELP.map(([c, d]) => {
    const line = document.createElement('span');
    line.className = 'help-line';
    const b = document.createElement('b');
    b.textContent = c.padEnd(14, ' ');
    line.append(b, document.createTextNode(d));
    return line;
  }));
}

function run(raw) {
  const input = raw.trim();
  if (!input) return;
  const [verb, ...rest] = input.split(/\s+/);
  const arg = rest.join(' ').toLowerCase();

  switch (verb.toLowerCase()) {
    case 'help': case '?': case 'man': return sayHelp();
    case 'ls': case 'clear': case 'reset':
      cmd.value = ''; render(TOOLS); return say('');
    case 'whoami':
      return say('guest — no account, no cookie, no server-side record of this visit.');
    case 'open': case 'cd': case 'run': {
      const hit = TOOLS.find(t => t.id === arg || t.name === arg);
      if (!hit) return say(`open: ${arg || '<name>'}: not found`);
      if (!hit.ready) return say(`open: ${hit.name}: not built yet`);
      location.href = hit.href;
      return;
    }
    default: {
      const hit = TOOLS.find(t => t.id === input.toLowerCase() || t.name === input.toLowerCase());
      if (hit && hit.ready) { location.href = hit.href; return; }
      say(`${verb}: command not found — try \`help\``);
    }
  }
}

cmd.addEventListener('input', () => {
  say('');
  render(search(cmd.value));
});

cmd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const list = search(cmd.value);
    // Enter on a single filtered result opens it directly.
    if (list.length === 1 && list[0].ready && !cmd.value.includes(' ')) {
      location.href = list[0].href;
      return;
    }
    run(cmd.value);
  }
  if (e.key === 'Escape') { cmd.value = ''; say(''); render(TOOLS); }
});

/* ---- boot line ------------------------------------------------------ */

const bootText = document.getElementById('boot-text');
const MSG = `init: ${TOOLS.length} tool${TOOLS.length === 1 ? '' : 's'} loaded · runtime: your browser · network: idle`;

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  bootText.textContent = MSG;
} else {
  let i = 0;
  const timer = setInterval(() => {
    bootText.textContent = MSG.slice(0, ++i);
    if (i >= MSG.length) clearInterval(timer);
  }, 18);
}

render(TOOLS);
