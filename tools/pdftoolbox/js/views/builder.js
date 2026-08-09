import { workspace } from './workspace.js';

export function mount(root) {
  return workspace(root, {
    title: 'build a document',
    sub: 'Drop in PDFs and images together, throw out the pages you do not want, put the rest in order, export one PDF.',
    kind: 'both',
    multiple: true,
    dropMain: 'Drop PDFs and images here or click to choose',
    dropSub: 'Add more at any time — new pages are appended at the end.',
    features: { pageOps: true, exportSelected: true, imageSettings: true },
    exportSuffix: 'document',
    exportLabel: 'Export PDF',
  });
}
