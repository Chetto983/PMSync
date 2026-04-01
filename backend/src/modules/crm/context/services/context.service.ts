import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Contact } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

type ContactSummary = Pick<Contact, 'id' | 'displayName' | 'company' | 'emails' | 'lastInteractedAt' | 'totalInteractions' | 'sentCount' | 'receivedCount'>;

export interface CrmContextResponse {
  contact: {
    id: string;
    displayName: string | null;
    company: string | null;
    email: string | null;
  };
  account: {
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
  } | null;
  deals: Array<{
    id: string;
    name: string;
    amount: string | null;
    currency: string;
    stage: {
      id: string;
      name: string;
      color: string | null;
      probability: number;
    } | null;
  }>;
  tickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
  }>;
  recentActivities: Array<{
    id: string;
    type: string;
    content: string | null;
    createdAt: string;
  }>;
  emailCount: number;
  lastInteraction: string | null;
}

@Injectable()
export class ContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getByContactId(tenantId: string, contactId: string): Promise<CrmContextResponse> {
    const contact = await this.prisma.contact.findUnique({
      where: { id_tenantId: { id: contactId, tenantId } },
      select: {
        id: true,
        displayName: true,
        company: true,
        emails: true,
        lastInteractedAt: true,
        totalInteractions: true,
        sentCount: true,
        receivedCount: true,
        isDeleted: true,
      },
    });

    if (!contact || contact.isDeleted) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    const accountLink = await this.prisma.accountContact.findFirst({
      where: {
        tenantId,
        contactId,
        account: { deletedAt: null },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      include: {
        account: {
          select: {
            id: true,
            name: true,
            website: true,
            industry: true,
          },
        },
      },
    });

    const dealFilters: Prisma.CrmDealWhereInput[] = [
      {
        dealContacts: {
          some: {
            contactId,
            tenantId,
          },
        },
      },
    ];

    if (accountLink?.account.id) {
      dealFilters.push({ accountId: accountLink.account.id });
    }

    const deals = await this.prisma.crmDeal.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: dealFilters,
      },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        stage: {
          select: {
            id: true,
            name: true,
            color: true,
            probability: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
    });

    const ticketFilters: Prisma.TicketWhereInput[] = [
      {
        contactId,
        contactTenant: tenantId,
      },
    ];

    if (accountLink?.account.id) {
      ticketFilters.push({ accountId: accountLink.account.id });
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        status: { notIn: ['resolved', 'closed'] },
        OR: ticketFilters,
      },
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
    });

    const dealIds = deals.map((deal) => deal.id);
    const activityFilters: Prisma.CrmActivityWhereInput[] = [];

    if (accountLink?.account.id) {
      activityFilters.push({ accountId: accountLink.account.id });
    }

    if (dealIds.length > 0) {
      activityFilters.push({ dealId: { in: dealIds } });
    }

    const recentActivities =
      activityFilters.length > 0
        ? await this.prisma.crmActivity.findMany({
            where: {
              tenantId,
              OR: activityFilters,
            },
            select: {
              id: true,
              type: true,
              content: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 8,
          })
        : [];

    return {
      contact: {
        id: contact.id,
        displayName: contact.displayName,
        company: contact.company,
        email: this.extractPrimaryEmail(contact),
      },
      account: accountLink?.account ?? null,
      deals: deals.map((deal) => ({
        id: deal.id,
        name: deal.name,
        amount: this.formatAmount(deal.amount),
        currency: deal.currency,
        stage: deal.stage
          ? {
              id: deal.stage.id,
              name: deal.stage.name,
              color: deal.stage.color,
              probability: deal.stage.probability,
            }
          : null,
      })),
      tickets: tickets.map((ticket) => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      })),
      recentActivities: recentActivities.map((activity) => ({
        ...activity,
        createdAt: activity.createdAt.toISOString(),
      })),
      emailCount: this.getEmailCount(contact),
      lastInteraction: contact.lastInteractedAt?.toISOString() ?? null,
    };
  }

  async getByEmail(tenantId: string, email: string): Promise<CrmContextResponse | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c.id
      FROM "unified_contacts" c
      WHERE c."tenantId" = ${tenantId}
        AND c."isDeleted" = false
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.emails::jsonb, '[]'::jsonb)) AS email_obj
          WHERE LOWER(
            COALESCE(
              email_obj->>'value',
              email_obj->>'email',
              CASE
                WHEN jsonb_typeof(email_obj) = 'string' THEN trim(both '"' FROM email_obj::text)
                ELSE NULL
              END
            )
          ) = ${normalizedEmail}
        )
      ORDER BY c."lastInteractedAt" DESC NULLS LAST, c."updatedAt" DESC
      LIMIT 1
    `);

    const contactId = rows[0]?.id;
    if (!contactId) {
      return null;
    }

    return this.getByContactId(tenantId, contactId);
  }

  private extractPrimaryEmail(contact: ContactSummary): string | null {
    const emails = contact.emails;
    if (!Array.isArray(emails)) {
      return null;
    }

    for (const entry of emails) {
      if (entry && typeof entry === 'object') {
        const record = entry as { value?: unknown; primary?: unknown };
        if (record.primary === true && typeof record.value === 'string' && record.value.trim()) {
          return record.value.trim().toLowerCase();
        }
      }
    }

    for (const entry of emails) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim().toLowerCase();
      }

      if (entry && typeof entry === 'object') {
        const record = entry as { value?: unknown; email?: unknown };
        if (typeof record.value === 'string' && record.value.trim()) {
          return record.value.trim().toLowerCase();
        }
        if (typeof record.email === 'string' && record.email.trim()) {
          return record.email.trim().toLowerCase();
        }
      }
    }

    return null;
  }

  private getEmailCount(contact: ContactSummary): number {
    const total = contact.totalInteractions ?? 0;
    if (total > 0) {
      return total;
    }

    return (contact.sentCount ?? 0) + (contact.receivedCount ?? 0);
  }

  async getActivityTimeline(
    tenantId: string,
    entityType: 'account' | 'deal',
    entityId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ data: Array<{ id: string; type: string; content: string | null; metadata: unknown; createdAt: string }>; nextCursor: string | null }> {
    const where: Prisma.CrmActivityWhereInput = { tenantId };

    if (entityType === 'account') {
      where.accountId = entityId;
    } else {
      where.dealId = entityId;
    }

    const take = Math.min(limit, 100);

    const activities = await this.prisma.crmActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    const hasMore = activities.length > take;
    const items = hasMore ? activities.slice(0, take) : activities;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.map((a) => ({
        id: a.id,
        type: a.type,
        content: a.content,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  private formatAmount(amount: Prisma.Decimal | null): string | null {
    return amount ? amount.toString() : null;
  }
}
