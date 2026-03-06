/**
 * Shared types for email sync-back operations.
 * Extracted to break circular dependency between email-sync-back.service.ts and provider sub-services.
 */

export interface EmailSyncOperation {
  emailId: string;
  externalId: string;
  providerId: string;
  tenantId: string;
  operation: 'delete' | 'hardDelete' | 'markRead' | 'markUnread' | 'star' | 'unstar' | 'flag' | 'unflag' | 'moveToFolder';
  /** For moveToFolder: target folder. For delete: unused (use sourceFolder) */
  folder?: string;
  /** Source folder where message currently resides on IMAP server.
   * Critical for IMAP sync-back since DB folder may already be updated. */
  sourceFolder?: string;
}
