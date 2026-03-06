import type { EmailEmbeddingJob } from '../../modules/ai/services/email-embedding.queue';
import type { CreateEmailEmbeddingOptions } from '../../modules/ai/services/knowledge-base.service';

// ============================================================================
// EMAIL EMBEDDING QUEUE - Interface token for DI cycle-breaking
// ============================================================================

export const EMAIL_EMBEDDING_QUEUE = Symbol('EMAIL_EMBEDDING_QUEUE');

/**
 * Interface for EmailEmbeddingQueueService.
 * Used by KnowledgeBaseService and EmbeddingBackfillService to enqueue
 * embedding jobs without importing the concrete class directly.
 */
export interface IEmailEmbeddingQueue {
  enqueue(job: EmailEmbeddingJob): Promise<void>;
  enqueueMany(jobs: EmailEmbeddingJob[]): Promise<void>;
}

// ============================================================================
// KNOWLEDGE BASE - Interface token for DI cycle-breaking
// ============================================================================

export const KNOWLEDGE_BASE = Symbol('KNOWLEDGE_BASE');

/**
 * Interface for KnowledgeBaseService.
 * Used by EmailEmbeddingQueueService and ContactEmbeddingQueueService to
 * process embedding jobs without importing the concrete class directly.
 */
export interface IKnowledgeBase {
  createEmbeddingForEmail(options: CreateEmailEmbeddingOptions): Promise<boolean>;
  createEmbeddingForContact(options: {
    tenantId: string;
    contactId: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    notes?: string | null;
    tags?: string[];
    emails?: { value: string; type?: string }[] | null;
    phoneNumbers?: { value: string; type?: string }[] | null;
  }): Promise<boolean>;
}
