/**
 * Sync Context Interfaces
 *
 * Provides context types for message processing operations.
 * Uses callback pattern to avoid circular dependencies between
 * extracted services and the base class.
 *
 * Pattern proven in Phase 5 (GmailSyncService, MicrosoftSyncService)
 */

import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';
import { AttachmentMeta } from '../drivers/interfaces/canonical.types';

/**
 * Callback type for processing attachments (avoids circular dependency)
 * Called by SyncMessageProcessorService, implemented by child classes
 */
export type ProcessAttachmentsCallback = (
  driver: IEmailDriver,
  emailId: string,
  tenantId: string,
  providerId: string,
  externalMessageId: string,
  attachments: AttachmentMeta[],
) => Promise<void>;

/**
 * Context for message processor operations
 * Uses callbacks for abstract methods to avoid circular dependencies
 * Pattern proven in Phase 5 (GmailSyncService, MicrosoftSyncService)
 */
export interface MessageProcessorContext {
  tenantId: string;
  providerId: string;
  userId?: string;

  // Callbacks for provider-specific services (from child class)
  getEmbeddingQueue: () => EmailEmbeddingQueueService;
  processAttachments: ProcessAttachmentsCallback;
}

/**
 * Result from message deletion operation
 */
export interface DeletionResult {
  needsReconciliation: boolean;
  folder?: string;
}

/**
 * Result from single message upsert
 */
export interface UpsertResult {
  wasNew: boolean;
  conflictDetected?: boolean;
}

/**
 * Result from batch processing
 */
export interface BatchResult {
  processed: number;
  newCount: number;
}
