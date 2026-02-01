/**
 * Email Sync Services Barrel Export
 *
 * Phase 4: Service Splits - Exports facade and sub-services
 */

// Facade (thin wrapper delegating to sub-services)
export { FolderSyncService } from './folder-sync.service';
export type { FolderInfo, FolderCountResult } from './folder-sync.service';

// Sub-services (internal implementation)
export { FolderSyncQueryService } from './folder-sync-query.service';
export { ImapFolderSyncService } from './imap-folder-sync.service';

// Provider-specific folder services
export { GmailFolderService } from './gmail/gmail-folder.service';
export { MicrosoftFolderService } from './microsoft/microsoft-folder.service';
