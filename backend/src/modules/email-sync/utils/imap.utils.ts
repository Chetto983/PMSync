/**
 * IMAP Utility Functions
 *
 * Consolidates duplicate IMAP-related parsing logic from:
 * - email-sync/workers/sync-back.worker.ts
 * - email/services/email-fetch.service.ts
 * - email-sync/services/base-email-sync.service.ts
 * - email/services/attachment-on-demand.service.ts
 *
 * @see EMAIL_MODULE_ROADMAP.md - Phase 3 Cross-Module Consolidation
 */

/**
 * Parse IMAP external message ID format
 * Format: "folderPath:UID" or just "UID"
 *
 * @example
 * parseImapExternalId("INBOX:12345") -> { folderPath: "INBOX", uid: "12345" }
 * parseImapExternalId("12345") -> { folderPath: "INBOX", uid: "12345" }
 * parseImapExternalId("Folder/Subfolder:54321") -> { folderPath: "Folder/Subfolder", uid: "54321" }
 */
export function parseImapExternalId(externalId: string): {
    folderPath: string;
    uid: string;
} {
    if (!externalId) {
        throw new Error('External ID is required');
    }

    // Use lastIndexOf to support folder paths containing colons
    const lastColonIndex = externalId.lastIndexOf(':');

    if (lastColonIndex === -1) {
        // No colon - assume INBOX
        return { folderPath: 'INBOX', uid: externalId };
    }

    const folderPath = externalId.substring(0, lastColonIndex);
    const uid = externalId.substring(lastColonIndex + 1);

    if (!uid || isNaN(parseInt(uid, 10))) {
        throw new Error(`Invalid IMAP UID in external ID: ${externalId}`);
    }

    return { folderPath: folderPath || 'INBOX', uid };
}

/**
 * Create IMAP external message ID
 *
 * @example
 * createImapExternalId("INBOX", 12345) -> "INBOX:12345"
 */
export function createImapExternalId(folderPath: string, uid: string | number): string {
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
 * IMAP folder path normalization constants
 */
export const IMAP_SPECIAL_FOLDERS = {
    INBOX: 'INBOX',
    SENT: 'Sent',
    DRAFTS: 'Drafts',
    TRASH: 'Trash',
    JUNK: 'Junk',
    SPAM: 'Spam',
    ARCHIVE: 'Archive',
} as const;

/**
 * Get fallback IMAP folder name for a specialUse type
 */
export function getImapFolderFallback(specialUse: string): string {
    const upperSpecialUse = specialUse.toUpperCase();
    return IMAP_SPECIAL_FOLDERS[upperSpecialUse as keyof typeof IMAP_SPECIAL_FOLDERS] || specialUse;
}
