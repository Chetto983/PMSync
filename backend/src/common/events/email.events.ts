/**
 * Domain events for the Email module.
 * Phase 31: Type definitions only. Wiring happens in Phase 32.
 * Phase 45-03: Added EmailIndexedEvent for EmailSync -> AI decoupling.
 */
export class EmailSyncedEvent {
  static readonly eventName = 'email.synced' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly emailId: string,
    public readonly providerId: string,
    public readonly syncedAt: Date,
  ) {}
}

/**
 * Emitted when a new email is synced and ready for AI embedding.
 * Phase 45-03: Decouples EmailSync -> AI dependency via domain events.
 * Replaces direct EmailEmbeddingQueueService.enqueue() calls in sync services.
 */
export class EmailIndexedEvent {
  static readonly eventName = 'email.indexed' as const;
  constructor(
    public readonly emailId: string,
    public readonly tenantId: string,
    public readonly providerId: string,
    public readonly subject: string,
    public readonly snippet: string,
    public readonly bodyText: string,
    public readonly bodyHtml: string,
    public readonly from: string,
    public readonly to: string[],
    public readonly receivedAt: Date,
  ) {}
}

/**
 * Emitted when embeddings should be cleaned up for a deleted email.
 * Phase 45-03: Decouples EmailSync -> AI dependency via domain events.
 */
export class EmailEmbeddingCleanupRequestedEvent {
  static readonly eventName = 'email.embedding-cleanup-requested' as const;
  constructor(
    public readonly tenantId: string,
    public readonly emailId: string,
  ) {}
}
