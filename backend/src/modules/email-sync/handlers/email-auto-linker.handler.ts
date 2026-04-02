import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EmailIndexedEvent,
  EmailAutoLinkedEvent,
} from '../../../common/events/email.events';
import { PrismaService } from '../../../prisma/prisma.service';
import { CrmSuggestionService } from '../../crm/suggestion/services/crm-suggestion.service';

@Injectable()
export class EmailAutoLinkerHandler {
  private readonly logger = new Logger(EmailAutoLinkerHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crmSuggestionService: CrmSuggestionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(EmailIndexedEvent.eventName)
  async handleEmailIndexed(event: EmailIndexedEvent): Promise<void> {
    try {
      const senderEmail = this.extractSenderEmail(event.from);
      let contactId: string | null = null;
      let contactTenantId: string | null = null;
      let dealId: string | null = null;

      // --- Contact linking ---
      const exactMatches = await this.findContactsByEmail(
        event.tenantId,
        senderEmail,
      );

      if (exactMatches.length === 1) {
        contactId = exactMatches[0].id;
        contactTenantId = exactMatches[0].tenantId;
      } else if (exactMatches.length === 0) {
        // Domain fallback
        const domain = senderEmail.split('@')[1];
        if (domain) {
          const domainMatches = await this.findContactsByDomain(
            event.tenantId,
            domain,
          );
          if (domainMatches.length === 1) {
            contactId = domainMatches[0].id;
            contactTenantId = domainMatches[0].tenantId;
          } else if (domainMatches.length > 1) {
            await this.createAmbiguousSuggestion(
              event.tenantId,
              event.emailId,
              domainMatches.map((m) => m.id),
              'Multiple contacts match sender domain',
            );
          }
        }
      } else {
        // Multiple exact email matches
        await this.createAmbiguousSuggestion(
          event.tenantId,
          event.emailId,
          exactMatches.map((m) => m.id),
          'Multiple contacts match sender email',
        );
      }

      // Update email with contact link
      if (contactId) {
        await this.prisma.email.updateMany({
          where: { id: event.emailId, tenantId: event.tenantId },
          data: { contactId, contactTenantId },
        });
      }

      // --- Deal linking (only if contact resolved) ---
      if (contactId) {
        const openDeals = await this.findOpenDealsForContact(
          event.tenantId,
          contactId,
        );

        if (openDeals.length === 1) {
          dealId = openDeals[0].id;
          await this.prisma.email.updateMany({
            where: { id: event.emailId, tenantId: event.tenantId },
            data: { dealId },
          });
        } else if (openDeals.length > 1) {
          await this.crmSuggestionService.create(event.tenantId, {
            type: 'link',
            sourceType: 'email_auto_linker',
            confidence: 0.6,
            entityData: {
              emailId: event.emailId,
              contactId,
              candidateDealIds: openDeals.map((d) => d.id),
              reason: 'Multiple open deals for contact',
            },
            sourceEmailId: event.emailId,
          });
        }
      }

      // --- Emit event ---
      if (contactId || dealId) {
        this.eventEmitter.emit(
          EmailAutoLinkedEvent.eventName,
          new EmailAutoLinkedEvent(
            event.emailId,
            event.tenantId,
            contactId,
            dealId,
          ),
        );
        this.logger.debug(
          `Auto-linked email ${event.emailId}: contact=${contactId}, deal=${dealId}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to auto-link email ${event.emailId}: ${message}`,
      );
      // Fire-and-forget: never throw from event handler
    }
  }

  private extractSenderEmail(from: string): string {
    const match = from.match(/<([^>]+)>/);
    return (match ? match[1] : from.trim()).toLowerCase();
  }

  private async findContactsByEmail(
    tenantId: string,
    senderEmail: string,
  ): Promise<Array<{ id: string; tenantId: string }>> {
    return this.prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT id, "tenantId"
      FROM unified_contacts
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND emails IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(emails) elem
          WHERE lower(elem->>'value') = lower(${senderEmail})
        )
    `;
  }

  private async findContactsByDomain(
    tenantId: string,
    domain: string,
  ): Promise<Array<{ id: string; tenantId: string }>> {
    const pattern = '%@' + domain.toLowerCase();
    return this.prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT id, "tenantId"
      FROM unified_contacts
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND emails IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(emails) elem
          WHERE lower(elem->>'value') LIKE ${pattern}
        )
    `;
  }

  private async findOpenDealsForContact(
    tenantId: string,
    contactId: string,
  ): Promise<Array<{ id: string }>> {
    return this.prisma.crmDeal.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dealContacts: { some: { contactId, tenantId } },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async createAmbiguousSuggestion(
    tenantId: string,
    emailId: string,
    candidateContactIds: string[],
    reason: string,
  ): Promise<void> {
    await this.crmSuggestionService.create(tenantId, {
      type: 'link',
      sourceType: 'email_auto_linker',
      confidence: 0.7,
      entityData: { emailId, candidateContactIds, reason },
      sourceEmailId: emailId,
    });
  }
}
