// ============================================================================
// INLINE TYPES - defined here to avoid circular imports from services
// ============================================================================

/**
 * Job payload for email embedding queue.
 * Canonical definition: services re-export from here for backward compat.
 */
export interface EmailEmbeddingJob {
  tenantId: string;
  providerId?: string;
  emailId: string;
  subject: string;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  from?: string | null;
  receivedAt?: string | Date | null;
}

/**
 * Options for creating an email embedding.
 * Canonical definition: services re-export from here for backward compat.
 */
export interface CreateEmailEmbeddingOptions {
  tenantId: string;
  providerId?: string;
  emailId: string;
  subject: string;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  from?: string | null;
  receivedAt?: Date | string | null;
}

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
