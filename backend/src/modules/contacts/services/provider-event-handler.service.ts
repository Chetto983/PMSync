import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ProviderConnectedEvent,
  ProviderDisconnectedEvent,
} from '../../../common/events/provider.events';
import { ContactsService } from './contacts.service';

/**
 * Handles provider lifecycle events for the Contacts domain.
 *
 * Phase 32: Replaces direct service calls from ProviderConfigService.
 * - ProviderConnectedEvent: triggers initial contacts sync (if supported)
 * - ProviderDisconnectedEvent: cleanup provider contacts
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class ContactsProviderEventHandlerService {
  private readonly logger = new Logger(ContactsProviderEventHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
  ) {}

  /**
   * Handle provider connected: trigger initial contacts sync if supported.
   */
  @OnEvent(ProviderConnectedEvent.eventName)
  async handleProviderConnected(event: ProviderConnectedEvent): Promise<void> {
    try {
      const { providerId } = event;

      // Load provider to check contacts support
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });
      if (!provider?.supportsContacts) {
        return;
      }

      this.logger.log(`[ProviderConnected] Queuing contacts sync for provider ${provider.email}`);

      // Fire and forget - don't block the event handler
      this.contactsService
        .syncContacts(providerId)
        .then((contactsCount) => {
          this.logger.log(`[Initial Sync] ${contactsCount} contacts synced for ${provider.email}`);
        })
        .catch((error) => {
          this.logger.error(
            `[Initial Sync] Failed to sync contacts for provider ${providerId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        });
    } catch (error) {
      this.logger.error(
        `[ProviderConnected] Contacts handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Handle provider disconnected: cleanup provider contacts.
   */
  @OnEvent(ProviderDisconnectedEvent.eventName)
  async handleProviderDisconnected(event: ProviderDisconnectedEvent): Promise<void> {
    try {
      const { tenantId, providerId, supportsContacts } = event;
      if (!supportsContacts) {
        return;
      }

      this.logger.log(`[ProviderDisconnected] Cleaning up contacts for provider ${providerId}`);

      await this.contactsService.deleteProviderContacts(providerId, tenantId).catch((error) => {
        this.logger.warn(
          `Failed to cleanup contacts for provider ${providerId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });
    } catch (error) {
      this.logger.error(
        `[ProviderDisconnected] Contacts handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
