import { workspace } from './workspace.js';

export function mount(root) {
  return workspace(root, {
    title: 'rotate pages',
    sub: 'With nothing selected the rotate buttons turn every page. Select pages first to turn only those. Rotation is stored in the PDF, so it stays after export.',
    kind: 'pdf',
    multiple: false,
    dropMain: 'Drop a PDF here or click to choose',
    dropSub: 'Rotate one page, a selection, or all of them.',
    features: { range: true, exportSelected: true, cellOps: ['rotate'] },
    exportSuffix: 'rotated',
    exportLabel: 'Export PDF',
  });
}
