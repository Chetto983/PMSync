import {
  canMoveToFolder,
  getFolderDisplayName,
  createFolderLabelGetter,
  type FolderTranslations,
} from './folder-utils';
import type { Folder } from '@/lib/api/folders';

const translations: FolderTranslations = {
  folders: {
    inbox: 'Inbox',
    sent: 'Sent',
    drafts: 'Drafts',
    trash: 'Trash',
    spam: 'Spam',
    archive: 'Archive',
    all: 'All Mail',
    starred: 'Starred',
    categoryPersonal: 'Inbox',
    categorySocial: 'Social',
    categoryPromotions: 'Promotions',
    categoryUpdates: 'Updates',
    categoryForums: 'Forums',
  },
};

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    tenantId: 'tenant-1',
    providerId: 'provider-1',
    name: 'Inbox',
    path: 'INBOX',
    delimiter: '/',
    level: 0,
    isSelectable: true,
    specialUse: 'INBOX',
    isSystem: true,
    attributes: [],
    totalCount: 0,
    unreadCount: 0,
    recentCount: 0,
    unseenCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('folder-utils move destination helpers', () => {
  const getFolderLabel = createFolderLabelGetter(translations);

  it('allows canonical move destinations for system folders', () => {
    expect(canMoveToFolder(makeFolder({ specialUse: 'INBOX' }))).toBe(true);
    expect(canMoveToFolder(makeFolder({ specialUse: 'ARCHIVE', name: 'Archive', path: 'ARCHIVE' }))).toBe(true);
  });

  it('filters provider-specific system pseudo-folders from move targets', () => {
    expect(canMoveToFolder(makeFolder({ specialUse: 'CATEGORY_SOCIAL', name: 'CATEGORY_SOCIAL' }))).toBe(false);
    expect(canMoveToFolder(makeFolder({ specialUse: 'UNREAD', name: 'UNREAD' }))).toBe(false);
    expect(canMoveToFolder(makeFolder({ specialUse: 'TRASH', name: 'Trash' }))).toBe(false);
  });

  it('keeps custom user folders as valid move destinations', () => {
    expect(
      canMoveToFolder(
        makeFolder({
          id: 'folder-2',
          name: 'Clients/ACME',
          path: 'Clients/ACME',
          specialUse: undefined,
          isSystem: false,
          level: 1,
        }),
      ),
    ).toBe(true);
  });

  it('uses localized display names for system folders', () => {
    const displayName = getFolderDisplayName(
      makeFolder({ specialUse: 'ARCHIVE', name: 'Archive', path: 'ARCHIVE' }),
      getFolderLabel,
    );
    expect(displayName).toBe('Archive');
  });
});
