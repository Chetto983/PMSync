import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import {
  ProviderConnectedEvent,
  ProviderDisconnectedEvent,
} from '../../../common/events/provider.events';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from './microsoft-calendar-sync.service';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';
import { MicrosoftCalendarWebhookService } from './microsoft-calendar-webhook.service';

/**
 * Handles provider lifecycle events for the Calendar domain.
 *
 * Phase 32: Replaces direct service calls from ProviderConfigService.
 * - ProviderConnectedEvent: triggers initial calendar sync + webhook setup
 * - ProviderDisconnectedEvent: removes calendar webhooks/subscriptions
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class CalendarProviderEventHandlerService {
  private readonly logger = new Logger(CalendarProviderEventHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
    private readonly googleCalendarWebhook: GoogleCalendarWebhookService,
    private readonly microsoftCalendarWebhook: MicrosoftCalendarWebhookService,
  ) {}

  /**
   * Handle provider connected: trigger initial calendar sync and webhook setup.
   */
  @OnEvent(ProviderConnectedEvent.eventName)
  async handleProviderConnected(event: ProviderConnectedEvent): Promise<void> {
    // @OnEvent runs outside HTTP request context — no AsyncLocalStorage tenant.
    try {
      await withoutTenantScopingAsync(async () => {
        const { providerId, providerType } = event;

        const provider = await this.prisma.providerConfig.findUnique({
          where: { id: providerId },
        });
        if (!provider?.supportsCalendar) {
          return;
        }

        this.logger.log(`[ProviderConnected] Starting calendar sync for provider ${provider.email}`);

        if (providerType === 'google') {
          this.googleCalendarSync
            .syncCalendar(providerId)
            .then(() => this.logger.log(`Completed initial Google Calendar sync for ${provider.email}`))
            .catch((error) =>
              this.logger.error(
                `Failed initial Google Calendar sync for ${providerId}: ${
                  error instanceof Error ? error.message : error
                }`,
              ),
            );

          try {
            await this.googleCalendarWebhook.setupWatch(providerId);
          } catch (error) {
            this.logger.error(
              `Failed to setup Google Calendar webhook for ${providerId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          }
        } else if (providerType === 'microsoft') {
          this.microsoftCalendarSync
            .syncCalendar(providerId)
            .then(() => this.logger.log(`Completed initial Microsoft Calendar sync for ${provider.email}`))
            .catch((error) =>
              this.logger.error(
                `Failed initial Microsoft Calendar sync for ${providerId}: ${
                  error instanceof Error ? error.message : error
                }`,
              ),
            );

          try {
            await this.microsoftCalendarWebhook.setupSubscription(providerId);
          } catch (error) {
            this.logger.error(
              `Failed to setup Microsoft Calendar webhook for ${providerId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          }
        }
      });
    } catch (error) {
      this.logger.error(
        `[ProviderConnected] Calendar handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Handle provider disconnected: cleanup calendar webhooks/subscriptions.
   */
  @OnEvent(ProviderDisconnectedEvent.eventName)
  async handleProviderDisconnected(event: ProviderDisconnectedEvent): Promise<void> {
    try {
      await withoutTenantScopingAsync(async () => {
        const { providerId, providerType, supportsCalendar } = event;
        if (!supportsCalendar) {
          return;
        }

        this.logger.log(`[ProviderDisconnected] Cleaning up calendar for provider ${providerId}`);

        if (providerType === 'google') {
          await this.googleCalendarWebhook.stopWatch(providerId).catch((error) => {
            this.logger.warn(
              `Failed to stop Google Calendar watch for provider ${providerId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          });
        } else if (providerType === 'microsoft') {
          await this.microsoftCalendarWebhook.deleteSubscription(providerId).catch((error) => {
            this.logger.warn(
              `Failed to delete Microsoft Calendar subscription for provider ${providerId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          });
        }
      });
    } catch (error) {
      this.logger.error(
        `[ProviderDisconnected] Calendar handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
