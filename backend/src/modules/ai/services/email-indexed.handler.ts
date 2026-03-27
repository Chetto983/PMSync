import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailIndexedEvent } from '../../../common/events/email.events';
import { EmailEmbeddingQueueService } from './email-embedding.queue';

/**
 * Handles email.indexed domain events by enqueuing AI embeddings.
 *
 * Phase 45-03: Decouples EmailSync -> AI dependency. Instead of sync
 * services importing EmailEmbeddingQueueService directly, they emit
 * EmailIndexedEvent and this handler enqueues the embedding job.
 *
 * Pattern: Same as ProviderEventHandlerService (Phase 32).
 */
@Injectable()
export class EmailIndexedHandler {
  private readonly logger = new Logger(EmailIndexedHandler.name);

  constructor(
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
  ) {}

  @OnEvent(EmailIndexedEvent.eventName)
  async handleEmailIndexed(event: EmailIndexedEvent): Promise<void> {
    try {
      await this.emailEmbeddingQueue.enqueue({
        emailId: event.emailId,
        tenantId: event.tenantId,
        providerId: event.providerId,
        subject: event.subject,
        snippet: event.snippet,
        bodyText: event.bodyText,
        bodyHtml: event.bodyHtml,
        from: event.from,
        to: event.to,
        receivedAt: event.receivedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to enqueue embedding for email ${event.emailId}: ${message}`,
      );
    }
  }
}
