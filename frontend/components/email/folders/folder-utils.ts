/**
 * Shared folder utilities
 *
 * Common constants and helpers used by both desktop (FolderSidebar)
 * and mobile (MobileFolderSheet) folder components.
 */

import React from 'react';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertOctagon,
  Archive,
  Mail,
  Flag,
  Folder,
  Star,
  Clock,
  MessageSquare,
  Filter,
} from 'lucide-react';
import type { Folder as FolderType } from '@/lib/api/folders';
import type { SpecialFolder } from '@/stores/email-ui-store';

// =============================================================================
// FOLDER ICONS MAPPING
// =============================================================================

/**
 * Map special folder types to icons
 * Includes IMAP RFC 6154 standard + Microsoft Graph wellKnownName folders
 */
export const FOLDER_ICONS: Record<string, (size: number) => React.ReactNode> = {
  // IMAP RFC 6154 standard folders
  INBOX: (size) => React.createElement(Inbox, { size }),
  SENT: (size) => React.createElement(Send, { size }),
  DRAFTS: (size) => React.createElement(FileText, { size }),
  TRASH: (size) => React.createElement(Trash2, { size }),
  SPAM: (size) => React.createElement(AlertOctagon, { size }),
  JUNK: (size) => React.createElement(AlertOctagon, { size }),
  ARCHIVE: (size) => React.createElement(Archive, { size }),
  ALL: (size) => React.createElement(Mail, { size }),
  STARRED: (size) => React.createElement(Star, { size }),
  FLAGGED: (size) => React.createElement(Flag, { size }),
  IMPORTANT: (size) => React.createElement(Flag, { size }),
  // Microsoft Graph wellKnownName folders
  OUTBOX: (size) => React.createElement(Clock, { size }),
  CONVERSATIONHISTORY: (size) => React.createElement(MessageSquare, { size }),
  'CONVERSATION HISTORY': (size) => React.createElement(MessageSquare, { size }),
  DELETEDITEMS: (size) => React.createElement(Trash2, { size }),
  'DELETED ITEMS': (size) => React.createElement(Trash2, { size }),
  SENTITEMS: (size) => React.createElement(Send, { size }),
  'SENT ITEMS': (size) => React.createElement(Send, { size }),
  JUNKEMAIL: (size) => React.createElement(AlertOctagon, { size }),
  'JUNK EMAIL': (size) => React.createElement(AlertOctagon, { size }),
  CLUTTER: (size) => React.createElement(Filter, { size }),
  SCHEDULED: (size) => React.createElement(Clock, { size }),
  CONFLICTS: (size) => React.createElement(AlertOctagon, { size }),
  SYNCISSUES: (size) => React.createElement(AlertOctagon, { size }),
  // Gmail categories
  CATEGORY_PERSONAL: (size) => React.createElement(Inbox, { size }),
  CATEGORY_SOCIAL: (size) => React.createElement(Mail, { size }),
  CATEGORY_PROMOTIONS: (size) => React.createElement(Mail, { size }),
  CATEGORY_UPDATES: (size) => React.createElement(Mail, { size }),
  CATEGORY_FORUMS: (size) => React.createElement(Mail, { size }),
  // Gmail labels
  YELLOW_STAR: (size) => React.createElement(Star, { size }),
  UNREAD: (size) => React.createElement(Mail, { size }),
  UPDATES: (size) => React.createElement(Mail, { size }),
};

/**
 * Default folder icon factory
 */
export const DEFAULT_FOLDER_ICON = (size: number) => React.createElement(Folder, { size });

// =============================================================================
// FOLDER ORDER
// =============================================================================

/**
 * Order of special folders in sidebar (top-level aggregated view)
 */
export const FOLDER_ORDER: SpecialFolder[] = [
  'INBOX',
  'SENT',
  'DRAFTS',
  'ARCHIVE',
  'SPAM',
  'TRASH',
  'ALL',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get icon for a folder based on specialUse or type
 *
 * @param folder - Folder object from API
 * @param size - Icon size in pixels (default: 18)
 * @returns React node for the icon
 */
export function getFolderIcon(folder: FolderType, size = 18): React.ReactNode {
  if (folder.specialUse) {
    const specialUse = folder.specialUse.toUpperCase();
    const iconFactory = FOLDER_ICONS[specialUse];
    return iconFactory ? iconFactory(size) : DEFAULT_FOLDER_ICON(size);
  }
  return DEFAULT_FOLDER_ICON(size);
}

/**
 * Get icon for a special folder type
 *
 * @param folderType - Special folder type (INBOX, SENT, etc.)
 * @param size - Icon size in pixels (default: 18)
 * @returns React node for the icon
 */
export function getSpecialFolderIcon(folderType: string, size = 18): React.ReactNode {
  const upperType = folderType.toUpperCase();
  const iconFactory = FOLDER_ICONS[upperType];
  return iconFactory ? iconFactory(size) : DEFAULT_FOLDER_ICON(size);
}

/**
 * Check if a folder can be modified (renamed/deleted)
 * System folders (with specialUse) cannot be modified
 *
 * @param folder - Folder to check
 * @returns true if folder can be modified
 */
export function canModifyFolder(folder: FolderType | null): boolean {
  return folder !== null && !folder.isSystem;
}

/**
 * Default folder sorting: special folders first by order, then alphabetical
 */
export function defaultFolderSort(a: FolderType, b: FolderType): number {
  const orderA = a.specialUse
    ? FOLDER_ORDER.indexOf(a.specialUse.toUpperCase() as SpecialFolder)
    : 99;
  const orderB = b.specialUse
    ? FOLDER_ORDER.indexOf(b.specialUse.toUpperCase() as SpecialFolder)
    : 99;
  if (orderA !== orderB) {
    return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
  }
  return a.name.localeCompare(b.name);
}

/**
 * Sort folders by user preference order, then by default order
 */
export function sortFoldersByOrder(
  folders: FolderType[],
  orderIds: string[] | undefined
): FolderType[] {
  if (orderIds && orderIds.length > 0) {
    return [...folders].sort((a, b) => {
      const indexA = orderIds.indexOf(a.id);
      const indexB = orderIds.indexOf(b.id);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return defaultFolderSort(a, b);
    });
  }
  return [...folders].sort(defaultFolderSort);
}

// =============================================================================
// FOLDER TRANSLATIONS HELPER
// =============================================================================

/**
 * Translation keys for folder labels
 */
export type FolderTranslations = {
  folders: {
    inbox: string;
    sent: string;
    drafts: string;
    trash: string;
    spam: string;
    archive: string;
    all: string;
    starred: string;
    flagged?: string;
    important?: string;
    outbox?: string;
    conversationhistory?: string;
    clutter?: string;
    scheduled?: string;
    conflicts?: string;
    syncissues?: string;
    categoryPersonal?: string;
    categorySocial?: string;
    categoryPromotions?: string;
    categoryUpdates?: string;
    categoryForums?: string;
    // Gmail labels
    unread?: string;
    updates?: string;
  };
  email?: {
    quickFilters?: {
      important?: string;
    };
  };
};

/**
 * Create a folder label getter function from translations
 *
 * @param t - Translation object
 * @returns Function that gets localized folder label
 */
export function createFolderLabelGetter(t: FolderTranslations) {
  return function getFolderLabel(folder: string): string {
    const upperFolder = folder.toUpperCase();
    const labels: Record<string, string | undefined> = {
      INBOX: t.folders.inbox,
      SENT: t.folders.sent,
      DRAFTS: t.folders.drafts,
      TRASH: t.folders.trash,
      SPAM: t.folders.spam,
      JUNK: t.folders.spam,
      ARCHIVE: t.folders.archive,
      ALL: t.folders.all,
      STARRED: t.folders.starred,
      FLAGGED: t.folders.flagged || t.folders.starred,
      IMPORTANT: t.folders.important || t.email?.quickFilters?.important,
      OUTBOX: t.folders.outbox,
      CONVERSATIONHISTORY: t.folders.conversationhistory,
      'CONVERSATION HISTORY': t.folders.conversationhistory,
      CLUTTER: t.folders.clutter,
      SCHEDULED: t.folders.scheduled,
      CONFLICTS: t.folders.conflicts,
      SYNCISSUES: t.folders.syncissues,
      CATEGORY_PERSONAL: t.folders.categoryPersonal,
      CATEGORY_SOCIAL: t.folders.categorySocial,
      CATEGORY_PROMOTIONS: t.folders.categoryPromotions,
      CATEGORY_UPDATES: t.folders.categoryUpdates,
      CATEGORY_FORUMS: t.folders.categoryForums,
      // Gmail labels
      YELLOW_STAR: t.folders.starred,
      UNREAD: t.folders.unread,
      UPDATES: t.folders.updates,
    };
    return labels[upperFolder] || folder;
  };
}

/**
 * Get display name for a folder
 * For system folders, translates specialUse. For custom folders, uses name directly.
 * This ensures custom folders (like Gmail labels) display their actual name, not invalid specialUse values.
 *
 * @param folder - Folder object from API
 * @param getFolderLabel - Label getter function from createFolderLabelGetter
 * @returns Display name for the folder
 */
export function getFolderDisplayName(
  folder: FolderType,
  getFolderLabel: (label: string) => string
): string {
  return folder.isSystem && folder.specialUse
    ? getFolderLabel(folder.specialUse)
    : folder.name;
}
