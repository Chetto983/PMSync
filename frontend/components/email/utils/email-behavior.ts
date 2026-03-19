export interface EmailFolderScopedEvent {
  folder?: string;
  sourceFolder?: string;
}

export function getEffectiveEmailListPage(params: {
  page: number;
  filterKey: string;
  previousFilterKey: string | null;
}): number {
  const { page, filterKey, previousFilterKey } = params;
  if (previousFilterKey && previousFilterKey !== filterKey) {
    return 1;
  }

  return page;
}

export function getDraggedEmailIds(
  activeEmailId: string,
  selectedIds: Iterable<string>,
): string[] {
  const ids = Array.from(selectedIds);

  if (ids.length > 1 && ids.includes(activeEmailId)) {
    return ids;
  }

  return [activeEmailId];
}

export function emailUpdateTouchesCurrentFolder(
  currentFolder: string | undefined,
  event: EmailFolderScopedEvent,
): boolean {
  if (!currentFolder) {
    return true;
  }

  if (!event.folder && !event.sourceFolder) {
    return true;
  }

  return (
    event.folder === currentFolder ||
    event.sourceFolder === currentFolder
  );
}
