/**
 * Shared types for email sync-back operations.
 * Extracted to break circular dependency between email-sync-back.service.ts and provider sub-services.
 */

export interface EmailSyncOperation {
  emailId: string;
  externalId: string;
  providerId: string;
  tenantId: string;
  operation: 'delete' | 'hardDelete' | 'markRead' | 'markUnread' | 'star' | 'unstar' | 'flag' | 'unflag' | 'moveToFolder' | 'addLabel' | 'removeLabel';
  /** For moveToFolder: target folder. For delete: unused (use sourceFolder) */
  folder?: string;
  /** Source folder where message currently resides on IMAP server.
   * Critical for IMAP sync-back since DB folder may already be updated. */
  sourceFolder?: string;
  /** For addLabel/removeLabel: the provider-side label ID (e.g., Gmail Label_123).
   * Resolved via Folder.externalId lookup. Must be populated before sync-back. */
  labelExternalId?: string;
}
