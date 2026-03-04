import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantDeletedEvent } from '../../../common/events/tenant.events';
import { DeletionExpiredEvent } from '../../../common/events/compliance.events';
import { GdprService } from './gdpr.service';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Handles domain events that trigger GDPR-related operations.
 *
 * Phase 32: Decouples TenantsModule from ComplianceModule.
 * - TenantDeletedEvent: triggers external data purge (Mistral agents, etc.)
 * - DeletionExpiredEvent: triggers account purge for expired deletion requests
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class GdprEventHandlerService {
  private readonly logger = new Logger(GdprEventHandlerService.name);

  constructor(
    private readonly gdprService: GdprService,
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  /**
   * Handle tenant deleted: purge external service data (Mistral agents, etc.)
   * Must run BEFORE the DB cascade to ensure tenant data is still accessible.
   */
  @OnEvent(TenantDeletedEvent.eventName)
  async handleTenantDeleted(event: TenantDeletedEvent): Promise<void> {
    try {
      const { tenantId } = event;
      this.logger.log(`[TenantDeleted] Purging external data for tenant ${tenantId}`);

      const purgeResult = await this.gdprService.purgeExternalTenantData(tenantId);
      if (!purgeResult.success) {
        this.logger.warn(
          `[GDPR] External data purge had errors for tenant ${tenantId}: ${purgeResult.errors.join(', ')}`,
        );
      } else {
        this.logger.log(
          `[GDPR] External data purge complete for tenant ${tenantId}: ${purgeResult.deletedCounts.mistralAgents} Mistral agents deleted`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[TenantDeleted] GDPR handler error for tenant ${event.tenantId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Handle deletion expired: purge account data for expired deletion requests.
   * Scaffolding event -- currently DeletionExpiredEvent is not emitted by any producer.
   * When account deletion cron evolves to event-driven, this handler is ready.
   */
  @OnEvent(DeletionExpiredEvent.eventName)
  async handleDeletionExpired(event: DeletionExpiredEvent): Promise<void> {
    try {
      const { tenantId, userId } = event;
      this.logger.log(`[DeletionExpired] Processing expired deletion for user ${userId} in tenant ${tenantId}`);

      // Scoped purge for the specific user from the event payload
      await this.accountDeletionService.purgeUserDeletion(userId, tenantId);
    } catch (error) {
      this.logger.error(
        `[DeletionExpired] Handler error for user ${event.userId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
