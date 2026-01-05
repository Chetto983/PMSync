/**
 * IMAP Utility Functions
 *
 * CONSOLIDATED from:
 * - email-sync/utils/imap.utils.ts (canonical source - MOVED)
 * - email/services/email-fetch.service.ts (deleted duplicate)
 * - email/services/attachment-on-demand.service.ts (deleted duplicate)
 *
 * DO NOT TOUCH (different functionality):
 * - base-email-sync.service.ts (has special markers: __NEW__, __EXPUNGE__, __FLAGS__)
 * - imap.driver.ts (returns [string, number] tuple, driver-specific)
 *
 * @see EMAIL_CONSOLIDATION_ENTRY.md - Phase 2
 */

/**
 * Parse IMAP external message ID format
 * Format: "folderPath:UID" or just "UID"
 *
 * @param externalId - The external ID string to parse
 * @param fallbackFolder - Optional folder to use if no folder in externalId (defaults to 'INBOX')
 *
 * @example
 * parseImapExternalId("INBOX:12345") -> { folderPath: "INBOX", uid: "12345" }
 * parseImapExternalId("12345") -> { folderPath: "INBOX", uid: "12345" }
 * parseImapExternalId("12345", "SENT") -> { folderPath: "SENT", uid: "12345" }
 * parseImapExternalId("Folder/Subfolder:54321") -> { folderPath: "Folder/Subfolder", uid: "54321" }
 */
export function parseImapExternalId(
  externalId: string,
  fallbackFolder?: string | null,
): {
  folderPath: string;
  uid: string;
} {
  if (!externalId) {
    throw new Error('External ID is required');
  }

  // Use lastIndexOf to support folder paths containing colons
  const lastColonIndex = externalId.lastIndexOf(':');

  if (lastColonIndex === -1) {
    // No colon - use fallback folder or default to INBOX
    return { folderPath: fallbackFolder || 'INBOX', uid: externalId };
  }

  const folderPath = externalId.substring(0, lastColonIndex);
  const uid = externalId.substring(lastColonIndex + 1);

  if (!uid || isNaN(parseInt(uid, 10))) {
    throw new Error(`Invalid IMAP UID in external ID: ${externalId}`);
  }

  return { folderPath: folderPath || fallbackFolder || 'INBOX', uid };
}

/**
 * Create IMAP external message ID
 *
 * @example
 * createImapExternalId("INBOX", 12345) -> "INBOX:12345"
 */
export function createImapExternalId(
  folderPath: string,
  uid: string | number,
): string {
  return `${folderPath}:${uid}`;
}

/**
 * Parse UID from external ID string
 * Handles both "folder:uid" format and plain UID
 *
 * @returns numeric UID
 * @throws Error if UID is invalid
 */
export function parseImapUid(externalId: string): number {
  const { uid } = parseImapExternalId(externalId);
  const numericUid = parseInt(uid, 10);

  if (isNaN(numericUid)) {
    throw new Error(`Invalid IMAP UID: ${externalId}`);
  }

  return numericUid;
}

/**
 * IMAP special folder default names
 *
 * Maps RFC 6154 special-use types to default IMAP folder names.
 * For the authoritative SpecialUse enum, see canonical.types.ts
 *
 * @see RFC 6154 - IMAP LIST Extension for Special-Use Mailboxes
 * @see email-sync/drivers/interfaces/canonical.types.ts for SpecialUse enum
 */
export const IMAP_SPECIAL_FOLDERS = {
  // RFC 6154 standard special-use attributes
  INBOX: 'INBOX',
  SENT: 'Sent',
  DRAFTS: 'Drafts',
  TRASH: 'Trash',
  SPAM: 'Spam',
  JUNK: 'Junk',
  ARCHIVE: 'Archive',
  ALL: 'All Mail',
  FLAGGED: 'Flagged',
  IMPORTANT: 'Important',
  STARRED: 'Starred',
  // Microsoft Graph specific
  OUTBOX: 'Outbox',
  CLUTTER: 'Clutter',
  SCHEDULED: 'Scheduled',
} as const;

/**
 * Get fallback IMAP folder name for a specialUse type
 */
export function getImapFolderFallback(specialUse: string): string {
  const upperSpecialUse = specialUse.toUpperCase();
  return (
    IMAP_SPECIAL_FOLDERS[upperSpecialUse as keyof typeof IMAP_SPECIAL_FOLDERS] ||
    specialUse
  );
}
