/**
 * Sync Context Interfaces
 *
 * Provides context types for message processing operations.
 * Uses callback pattern to avoid circular dependencies between
 * extracted services and the base class.
 *
 * Pattern proven in Phase 5 (GmailSyncService, MicrosoftSyncService)
 */

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
 *
 * Phase 45-03: Removed getEmbeddingQueue callback. Embedding enqueue
 * now happens via domain event (email.indexed) emitted by
 * SyncMessageProcessorService, handled by AiModule's EmailIndexedHandler.
 */
export interface MessageProcessorContext {
  tenantId: string;
  providerId: string;
  userId?: string;

  // Callback for provider-specific attachment processing (from child class)
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
