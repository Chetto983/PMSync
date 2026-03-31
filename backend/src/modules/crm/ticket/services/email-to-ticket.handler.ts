import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailIndexedEvent } from '../../../../common/events/email.events';
import { TicketService } from './ticket.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const SUPPORT_PREFIX = '[SUPPORT]';

@Injectable()
export class EmailToTicketHandler {
  private readonly logger = new Logger(EmailToTicketHandler.name);

  constructor(
    private readonly ticketService: TicketService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(EmailIndexedEvent.eventName)
  async handleEmailIndexed(event: EmailIndexedEvent): Promise<void> {
    if (!event.subject?.toUpperCase().includes(SUPPORT_PREFIX)) {
      return;
    }

    try {
      // Deduplicate: check if ticket already exists for this email
      const existing = await this.prisma.ticket.findFirst({
        where: {
          tenantId: event.tenantId,
          emailId: event.emailId,
          emailTenant: event.tenantId,
        },
      });
      if (existing) {
        this.logger.debug(
          `Ticket already exists for email ${event.emailId}: ${existing.id}`,
        );
        return;
      }

      // Look up contact by sender email address
      const contact = await this.findContactBySender(
        event.tenantId,
        event.from,
      );

      // Strip [SUPPORT] prefix from subject for cleaner ticket title
      const cleanSubject = event.subject
        .replace(/\[SUPPORT\]/gi, '')
        .trim() || event.subject;

      // Extract sender email for routing rule evaluation
      const emailMatch = event.from.match(/<([^>]+)>/);
      const senderEmail = emailMatch ? emailMatch[1] : event.from.trim();

      const ticket = await this.ticketService.create(event.tenantId, {
        subject: cleanSubject,
        description: event.bodyText || event.snippet || undefined,
        priority: 'medium',
        contactId: contact?.id,
        accountId: contact?.accountId,
        emailId: event.emailId,
        senderEmail,
      });

      this.logger.log(
        `Auto-created ticket ${ticket.id} from email ${event.emailId} [${cleanSubject}]`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create ticket from email ${event.emailId}: ${message}`,
      );
    }
  }

  private async findContactBySender(tenantId: string, fromAddress: string) {
    // Extract email from "Name <email>" format
    const emailMatch = fromAddress.match(/<([^>]+)>/);
    const senderEmail = emailMatch ? emailMatch[1] : fromAddress.trim();

    // Search contacts by email JSON field
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        tenantId: true,
        emails: true,
        accountContacts: {
          select: { accountId: true },
          take: 1,
        },
      },
    });

    for (const c of contacts) {
      if (!c.emails) continue;
      const emailsArr = Array.isArray(c.emails) ? c.emails : [];
      const hasMatch = emailsArr.some((e: any) => {
        const addr = typeof e === 'string' ? e : e?.value || e?.address || '';
        return addr.toLowerCase() === senderEmail.toLowerCase();
      });
      if (hasMatch) {
        return {
          id: c.id,
          accountId: c.accountContacts[0]?.accountId ?? undefined,
        };
      }
    }
    return null;
  }
}
