import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { ProviderDisconnectedEvent } from '../../../common/events/provider.events';
import { EmailEmbeddingQueueService } from './email-embedding.queue';
import { KnowledgeBaseService } from './knowledge-base.service';

/**
 * Handles provider lifecycle events for the AI domain.
 *
 * Phase 32: Replaces direct service calls from ProviderConfigService.
 * - ProviderDisconnectedEvent: removes embedding jobs and deletes embeddings
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class AiProviderEventHandlerService {
  private readonly logger = new Logger(AiProviderEventHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  /**
   * Handle provider disconnected: cleanup embedding jobs and data.
   */
  @OnEvent(ProviderDisconnectedEvent.eventName)
  async handleProviderDisconnected(event: ProviderDisconnectedEvent): Promise<void> {
    // @OnEvent runs outside HTTP request context — no AsyncLocalStorage tenant.
    try {
      await withoutTenantScopingAsync(async () => {
        const { tenantId, providerId } = event;
        this.logger.log(`[ProviderDisconnected] Cleaning up AI data for provider ${providerId}`);

        // Remove queued embedding jobs
        await this.emailEmbeddingQueue.removeJobsForProvider(providerId).catch((error) => {
          this.logger.warn(
            `Failed to remove embedding jobs for provider ${providerId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        });

        // Delete embeddings for provider's emails
        const providerEmails = await this.prisma.email.findMany({
          where: { providerId },
          select: { id: true },
        });

        const emailsToPurge = providerEmails.map((email) => email.id);
        if (emailsToPurge.length > 0) {
          await this.knowledgeBaseService.deleteEmbeddingsForEmails(tenantId, emailsToPurge);
          this.logger.log(
            `[ProviderDisconnected] Deleted embeddings for ${emailsToPurge.length} emails from provider ${providerId}`,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `[ProviderDisconnected] AI handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
