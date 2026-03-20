import {
  createFolderDropTargetId,
  getFolderTargetValue,
  isFolderReorderDropTarget,
  matchesFolderValue,
  resolveFolderReorderTargetId,
} from './folder-targets';

describe('folder-targets', () => {
  const folder = {
    id: 'folder-db-id',
    path: '[Gmail]/Posta inviata',
    name: 'Posta inviata',
    specialUse: 'SENT',
  };

  it('prefers folder path as move target value', () => {
    expect(getFolderTargetValue(folder)).toBe('[Gmail]/Posta inviata');
  });

  it('matches persisted folder values by path, name, specialUse, and id', () => {
    expect(matchesFolderValue(folder, '[Gmail]/Posta inviata')).toBe(true);
    expect(matchesFolderValue(folder, 'posta inviata')).toBe(true);
    expect(matchesFolderValue(folder, 'sent')).toBe(true);
    expect(matchesFolderValue(folder, 'folder-db-id')).toBe(true);
    expect(matchesFolderValue(folder, 'INBOX')).toBe(false);
  });

  it('accepts both sortable and droppable wrapper targets for folder reordering', () => {
    expect(isFolderReorderDropTarget('sortable-folder', 'sortable-folder')).toBe(true);
    expect(isFolderReorderDropTarget('sortable-folder', 'folder')).toBe(true);
    expect(isFolderReorderDropTarget('email', 'folder')).toBe(false);
  });

  it('creates stable ids for folder drop targets', () => {
    expect(createFolderDropTargetId('folder-1')).toBe('folder-drop:folder-1');
  });

  it('resolves reorder target ids from sortable and droppable wrappers', () => {
    expect(resolveFolderReorderTargetId('folder-1')).toBe('folder-1');
    expect(resolveFolderReorderTargetId('folder-drop:folder-2')).toBe('folder-2');
    expect(resolveFolderReorderTargetId('ignored', 'folder-3')).toBe('folder-3');
  });
});
