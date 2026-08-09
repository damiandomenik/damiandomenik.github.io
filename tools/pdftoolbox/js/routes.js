/* routes.js — the tool registry. Data only, so any module can read it.
 * Adding a tool: add an entry here and wire its module in main.js. */

export const TOOLS = [
  {
    route: 'merge',
    view: 'merge',
    label: 'Merge PDFs',
    desc: 'Put several PDFs end to end, in the order you choose.',
  },
  {
    route: 'organize',
    view: 'organize',
    label: 'Organize PDF',
    desc: 'Delete, move, rotate and duplicate pages on a thumbnail board.',
  },
  {
    route: 'split',
    view: 'split',
    label: 'Split PDF',
    desc: 'Pull out single pages or ranges, or break a file into one PDF per page.',
  },
  {
    route: 'images',
    view: 'imagesToPdf',
    label: 'Images → PDF',
    desc: 'Turn JPG, PNG or WebP files into a PDF with one image per page.',
  },
  {
    route: 'to-images',
    view: 'pdfToImages',
    label: 'PDF → Images',
    desc: 'Save pages as PNG or JPEG at the resolution you need.',
  },
  {
    route: 'rotate',
    view: 'rotate',
    label: 'Rotate pages',
    desc: 'Turn one page, a selection, or the whole document.',
  },
  {
    route: 'build',
    view: 'builder',
    label: 'Build a document',
    desc: 'Mix pages from several PDFs and images into one new file.',
  },
];
