import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderDisconnectedEvent } from '../../../common/events/provider.events';
import { StorageService } from './storage.service';

/**
 * Handles provider lifecycle events for the Email domain.
 *
 * Phase 32: Replaces direct StorageService calls from ProviderConfigService.
 * - ProviderDisconnectedEvent: cleanup orphaned S3 attachment files
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class EmailProviderEventHandlerService {
  private readonly logger = new Logger(EmailProviderEventHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Handle provider disconnected: cleanup orphaned S3 attachment files.
   * Must run BEFORE the DB transaction that deletes emails (called by ProviderConfigService).
   * Since events are emitted before DB deletion, attachment data is still available.
   */
  @OnEvent(ProviderDisconnectedEvent.eventName)
  async handleProviderDisconnected(event: ProviderDisconnectedEvent): Promise<void> {
    try {
      const { providerId } = event;
      this.logger.log(`[ProviderDisconnected] Cleaning up storage for provider ${providerId}`);

      // Get all emails for this provider
      const providerEmails = await this.prisma.email.findMany({
        where: { providerId },
        select: { id: true },
      });

      const emailIds = providerEmails.map((e) => e.id);
      if (emailIds.length === 0) {
        return;
      }

      // Get all attachment storage paths for this provider's emails
      const attachmentsToClean = await this.prisma.emailAttachment.findMany({
        where: { emailId: { in: emailIds } },
        select: { storagePath: true, contentHash: true },
      });

      // Find storage paths that are NOT used by other emails (respect deduplication)
      const uniqueHashes = [
        ...new Set(attachmentsToClean.map((a) => a.contentHash).filter(Boolean)),
      ] as string[];

      const hashesStillInUse = uniqueHashes.length > 0
        ? await this.prisma.emailAttachment.findMany({
            where: {
              contentHash: { in: uniqueHashes },
              email: {
                providerId: { not: providerId },
              },
            },
            select: { contentHash: true },
            distinct: ['contentHash'],
          })
        : [];

      const hashesInUseSet = new Set(hashesStillInUse.map((a) => a.contentHash));

      // Only delete storage paths whose contentHash is NOT used elsewhere
      const storagePathsToDelete = attachmentsToClean
        .filter((a) => a.storagePath && a.contentHash && !hashesInUseSet.has(a.contentHash))
        .map((a) => a.storagePath!);

      // Delete orphaned S3/MinIO objects
      if (storagePathsToDelete.length > 0) {
        try {
          const result = await this.storageService.deleteObjects(storagePathsToDelete);
          this.logger.log(
            `Cleaned up ${result.deleted} attachment files from storage for provider ${providerId}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to clean up attachment files for provider ${providerId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `[ProviderDisconnected] Email storage handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
