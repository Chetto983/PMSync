import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createHash } from 'crypto';

export interface EmailIdentity {
  id: string;
  messageId: string | null;
  subject: string;
  sentAt: Date;
  from: string;
  providerId: string;
  tenantId: string;
}

export interface DedupResult {
  isNewEmail: boolean;
  crossProviderLinkId: string | null;
  matchedEmails: string[];
}

@Injectable()
export class CrossProviderDedupService {
  private readonly logger = new Logger(CrossProviderDedupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate content hash for an email (for deduplication)
   */
  calculateContentHash(email: {
    messageId?: string | null;
    subject: string;
    sentAt: Date | string;
  }): string {
    const normalizeDate = (value: Date | string): string => {
      if (value instanceof Date) return value.toISOString();
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
    };

    const sentAtStr = normalizeDate(email.sentAt);

    const normalizeMessageId = (id: string | null | undefined): string | null => {
      if (!id) return null;
      return id.replace(/^</, '').replace(/>$/, '').trim().toLowerCase();
    };

    // Use messageId if available (RFC 2822 standard), otherwise use subject + sentAt
    const contentForHash = email.messageId
      ? normalizeMessageId(email.messageId) || ''
      : `${email.subject.trim().toLowerCase()}|${sentAtStr}`;

    return createHash('sha256').update(contentForHash).digest('hex');
  }

  /**
   * Check if an email already exists across providers (deduplication)
   * Returns the cross-provider link if found, or creates a new one
   */
  async dedupEmail(emailIdentity: EmailIdentity): Promise<DedupResult> {
    const contentHash = this.calculateContentHash(emailIdentity);

    // Check if a cross-provider link already exists for this content
    let crossProviderLink =
      await this.prisma.emailCrossProviderLink.findUnique({
        where: {
          tenantId_contentHash: {
            tenantId: emailIdentity.tenantId,
            contentHash,
          },
        },
        include: {
          emails: {
            select: {
              id: true,
              providerId: true,
            },
          },
        },
      });

    // LB-3 Fix: Check if this specific email ID is already linked (not just the provider)
    // This prevents reprocessing the same email and ensures correct dedup behavior
    const emailAlreadyLinked = crossProviderLink?.emails.some(
      (email) => email.id === emailIdentity.id,
    );

    if (crossProviderLink && emailAlreadyLinked) {
      this.logger.debug(
        `Email ${emailIdentity.id} already linked (hash: ${contentHash})`,
      );

      return {
        isNewEmail: false,
        crossProviderLinkId: crossProviderLink.id,
        matchedEmails: crossProviderLink.emails.map((e) => e.id),
      };
    }

    // If link doesn't exist, create it
    if (!crossProviderLink) {
      crossProviderLink = await this.prisma.emailCrossProviderLink.create({
        data: {
          tenantId: emailIdentity.tenantId,
          contentHash,
          conflictStrategy: 'LAST_WRITE_WINS',
          providerCount: 0,
          mergedIsRead: false,
          mergedIsStarred: false,
          mergedFolder: 'INBOX',
        },
        include: {
          emails: true,
        },
      });

      this.logger.verbose(
        `Created new cross-provider link ${crossProviderLink.id} for email ${emailIdentity.id}`,
      );
    }

    return {
      isNewEmail: true,
      crossProviderLinkId: crossProviderLink.id,
      matchedEmails: crossProviderLink.emails.map((e) => e.id),
    };
  }

  /**
   * Link an email to a cross-provider group
   */
  async linkEmail(
    emailId: string,
    crossProviderLinkId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Update email with cross-provider link
      await tx.email.update({
        where: { id: emailId },
        data: { crossProviderLinkId },
      });

      // Increment provider count
      await tx.emailCrossProviderLink.update({
        where: { id: crossProviderLinkId },
        data: {
          providerCount: { increment: 1 },
          lastSyncedAt: new Date(),
        },
      });
    });

    this.logger.verbose(
      `Linked email ${emailId} to cross-provider link ${crossProviderLinkId}`,
    );

    // Telemetry: detect any diverging states across providers
    await this.detectConflicts(crossProviderLinkId);
  }

  /**
   * Find all emails linked to the same cross-provider group
   */
  async findLinkedEmails(emailId: string): Promise<
    Array<{
      id: string;
      providerId: string;
      isRead: boolean;
      isStarred: boolean;
      folder: string;
    }>
  > {
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: { crossProviderLinkId: true },
    });

    if (!email?.crossProviderLinkId) {
      return [];
    }

    const linkedEmails = await this.prisma.email.findMany({
      where: {
        crossProviderLinkId: email.crossProviderLinkId,
        id: { not: emailId }, // Exclude current email
      },
      select: {
        id: true,
        providerId: true,
        isRead: true,
        isStarred: true,
        folder: true,
      },
    });

    return linkedEmails;
  }

  /**
   * Detect divergence across linked emails (read/star/folder) and emit telemetry
   */
  private async detectConflicts(
    crossProviderLinkId: string,
  ): Promise<
    | {
        crossProviderLinkId: string;
        divergences: Array<{
          field: 'read' | 'starred' | 'folder';
          states: Array<{ providerId: string; value: boolean | string }>;
        }>;
      }
    | null
  > {
    const emails = await this.prisma.email.findMany({
      where: { crossProviderLinkId },
      select: { providerId: true, isRead: true, isStarred: true, folder: true },
    });

    if (emails.length <= 1) {
      return null;
    }

    const divergences: Array<{
      field: 'read' | 'starred' | 'folder';
      states: Array<{ providerId: string; value: boolean | string }>;
    }> = [];

    const checkField = (
      field: 'read' | 'starred' | 'folder',
      mapper: (e: typeof emails[number]) => boolean | string,
    ) => {
      const states = emails.map((email) => ({ providerId: email.providerId, value: mapper(email) }));
      const distinctValues = new Set(states.map((s) => s.value));
      if (distinctValues.size > 1) {
        divergences.push({ field, states });
      }
    };

    checkField('read', (e) => e.isRead);
    checkField('starred', (e) => e.isStarred);
    checkField('folder', (e) => e.folder);

    if (divergences.length) {
      this.logger.warn(
        `Cross-provider conflict detected for link ${crossProviderLinkId}: ${JSON.stringify(
          divergences,
        )}`,
      );
      return { crossProviderLinkId, divergences };
    }

    return null;
  }

  /**
   * Get statistics about cross-provider deduplication
   */
  async getDedupStats(tenantId: string): Promise<{
    totalLinks: number;
    totalEmailsLinked: number;
    avgEmailsPerLink: number;
    multiProviderLinks: number;
  }> {
    const links = await this.prisma.emailCrossProviderLink.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { emails: true },
        },
      },
    });

    const totalLinks = links.length;
    const totalEmailsLinked = links.reduce(
      (sum, link) => sum + link._count.emails,
      0,
    );
    const multiProviderLinks = links.filter(
      (link) => link._count.emails > 1,
    ).length;

    return {
      totalLinks,
      totalEmailsLinked,
      avgEmailsPerLink:
        totalLinks > 0 ? Math.round(totalEmailsLinked / totalLinks * 100) / 100 : 0,
      multiProviderLinks,
    };
  }
}
