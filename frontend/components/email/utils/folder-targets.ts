import type { Folder } from '@/lib/api/folders';

type FolderLike = Pick<Folder, 'id' | 'path' | 'name' | 'specialUse'>;

export const FOLDER_DROP_TARGET_PREFIX = 'folder-drop:';

const normalize = (value: string) => value.trim().toUpperCase();

/**
 * Resolve the value that email APIs persist in Email.folder.
 * Prefer the provider path, then the folder name, then specialUse.
 */
export function getFolderTargetValue(folder: FolderLike): string {
  return folder.path || folder.name || folder.specialUse || folder.id;
}

export function createFolderDropTargetId(folderId: string): string {
  return `${FOLDER_DROP_TARGET_PREFIX}${folderId}`;
}

/**
 * Compare a persisted email folder value against a folder record.
 * Supports path, localized name, specialUse and id fallbacks.
 */
export function matchesFolderValue(
  folder: FolderLike,
  currentFolderValue?: string | null,
): boolean {
  if (!currentFolderValue) return false;

  const current = normalize(currentFolderValue);
  const candidates = [folder.path, folder.name, folder.specialUse, folder.id]
    .filter((value): value is string => !!value)
    .map(normalize);

  return candidates.includes(current);
}

/**
 * Folder reorder can land on either the sortable item or its droppable wrapper.
 */
export function isFolderReorderDropTarget(
  activeType: unknown,
  overType: unknown,
): boolean {
  return activeType === 'sortable-folder' && (overType === 'sortable-folder' || overType === 'folder');
}

export function resolveFolderReorderTargetId(
  overId: unknown,
  folderId?: unknown,
): string | null {
  if (typeof folderId === 'string' && folderId.trim()) {
    return folderId;
  }

  if (typeof overId !== 'string' || !overId.trim()) {
    return null;
  }

  return overId.startsWith(FOLDER_DROP_TARGET_PREFIX)
    ? overId.slice(FOLDER_DROP_TARGET_PREFIX.length)
    : overId;
}
