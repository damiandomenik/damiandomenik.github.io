import { workspace } from './workspace.js';

export function mount(root) {
  return workspace(root, {
    title: 'split / extract pages',
    sub: 'Pick pages by clicking them or by typing a range like 1-3, 5, 8-10. Export them as one PDF, or split them into one file per page.',
    kind: 'pdf',
    multiple: false,
    dropMain: 'Drop a PDF here or click to choose',
    dropSub: 'Then choose which pages to keep.',
    features: {
      range: true, exportSelected: true, splitEach: true, primarySelection: true,
      rotate: false, cellOps: ['rotate', 'delete'],
    },
    exportSuffix: 'extracted-pages',
    exportLabel: 'Export all pages',
  });
}
