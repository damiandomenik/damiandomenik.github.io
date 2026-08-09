import { workspace } from './workspace.js';

export function mount(root) {
  return workspace(root, {
    title: 'organize pages',
    sub: 'Delete, reorder, rotate and duplicate pages, then export the result. Click to select, shift-click for a range, drag to move.',
    kind: 'pdf',
    multiple: false,
    dropMain: 'Drop a PDF here or click to choose',
    dropSub: 'Pages appear as thumbnails you can rearrange.',
    features: { pageOps: true, exportSelected: true },
    exportSuffix: 'organized',
    exportLabel: 'Export PDF',
  });
}
