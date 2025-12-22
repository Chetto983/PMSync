import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CrossProviderDedupService,
  EmailIdentity,
} from './cross-provider-dedup.service';
import {
  CrossProviderConflictService,
  ConflictStrategy,
  EmailState,
} from './cross-provider-conflict.service';

export interface SyncEmailOptions {
  emailId: string;
  tenantId: string;
  providerId: string;
  messageId: string | null;
  subject: string;
  sentAt: Date;
  from: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  labels: string[];
  updatedAt: Date;
}

export interface CrossProviderSyncResult {
  emailId: string;
  crossProviderLinkId: string | null;
  isNewEmail: boolean;
  linkedProviderCount: number;
  hadConflict: boolean;
  resolvedState: {
    isRead: boolean;
    isStarred: boolean;
    folder: string;
  } | null;
}

@Injectable()
export class CrossProviderSyncService {
  private readonly logger = new Logger(CrossProviderSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dedup: CrossProviderDedupService,
    private readonly conflict: CrossProviderConflictService,
  ) {}

  /**
   * Process a synced email for cross-provider deduplication and conflict resolution
   * This should be called after an email is synced from a provider
   */
  async processSyncedEmail(
    options: SyncEmailOptions,
  ): Promise<CrossProviderSyncResult> {
    const emailIdentity: EmailIdentity = {
      id: options.emailId,
      messageId: options.messageId,
      subject: options.subject,
      sentAt: options.sentAt,
      from: options.from,
      providerId: options.providerId,
      tenantId: options.tenantId,
    };

    // Step 1: Deduplicate - check if this email exists in other providers
    const dedupResult = await this.dedup.dedupEmail(emailIdentity);

    // Step 2: Link the email if it's new or not yet linked
    if (dedupResult.isNewEmail || !dedupResult.crossProviderLinkId) {
      this.logger.debug(
        `Email ${options.emailId} is not yet linked to cross-provider group`,
      );

      return {
        emailId: options.emailId,
        crossProviderLinkId: dedupResult.crossProviderLinkId,
        isNewEmail: true,
        linkedProviderCount: 1,
        hadConflict: false,
        resolvedState: null,
      };
    }

    // Link this email to the cross-provider group
    await this.dedup.linkEmail(options.emailId, dedupResult.crossProviderLinkId);

    // Step 3: Get all linked emails and their current states
    const linkedEmails = await this.getLinkedEmailStates(
      dedupResult.crossProviderLinkId,
    );

    // LB-4 Fix: Filter out current email from linkedEmails since we add it manually below
    // This prevents double-adding the current email state after linkEmail() includes it
    const otherEmailStates = linkedEmails.filter(
      (state) => state.emailId !== options.emailId,
    );

    // Add current email state (with the most recent data from the incoming sync)
    const allStates: EmailState[] = [
      ...otherEmailStates,
      {
        emailId: options.emailId,
        providerId: options.providerId,
        isRead: options.isRead,
        isStarred: options.isStarred,
        folder: options.folder,
        labels: options.labels,
        updatedAt: options.updatedAt,
      },
    ];

    // Step 4: Resolve conflicts if there are multiple providers
    let resolution = null;
    let hadConflict = false;

    if (allStates.length > 1) {
      // Get conflict strategy from link
      const link = await this.prisma.emailCrossProviderLink.findUnique({
        where: { id: dedupResult.crossProviderLinkId },
        select: { conflictStrategy: true },
      });

      const strategy = (link?.conflictStrategy as ConflictStrategy) || 'LAST_WRITE_WINS';

      resolution = await this.conflict.resolveConflicts(
        dedupResult.crossProviderLinkId,
        allStates,
        strategy,
      );

      hadConflict = resolution.hasConflict;

      this.logger.log(
        `Processed cross-provider sync for email ${options.emailId}: ` +
          `${allStates.length} providers linked, conflict=${hadConflict}`,
      );
    }

    return {
      emailId: options.emailId,
      crossProviderLinkId: dedupResult.crossProviderLinkId,
      isNewEmail: false,
      linkedProviderCount: allStates.length,
      hadConflict,
      resolvedState: resolution
        ? {
            isRead: resolution.resolvedIsRead,
            isStarred: resolution.resolvedIsStarred,
            folder: resolution.resolvedFolder,
          }
        : null,
    };
  }

  /**
   * When an email's state changes (read, starred, folder), propagate to linked emails
   */
  async propagateStateChange(
    emailId: string,
    changes: {
      isRead?: boolean;
      isStarred?: boolean;
      folder?: string;
    },
  ): Promise<{ updated: number; queued: number }> {
    // Get the email and its cross-provider link
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: {
        crossProviderLinkId: true,
        tenantId: true,
        providerId: true,
        updatedAt: true,
      },
    });

    if (!email?.crossProviderLinkId) {
      this.logger.debug(
        `Email ${emailId} is not part of cross-provider group, skipping propagation`,
      );
      return { updated: 0, queued: 0 };
    }

    // Get all linked emails
    const linkedEmails = await this.prisma.email.findMany({
      where: {
        crossProviderLinkId: email.crossProviderLinkId,
        id: { not: emailId }, // Exclude the email that changed
      },
      select: {
        id: true,
        providerId: true,
        isRead: true,
        isStarred: true,
        folder: true,
        labels: true,
        updatedAt: true,
      },
    });

    if (linkedEmails.length === 0) {
      return { updated: 0, queued: 0 };
    }

    // Get current email state to include in conflict resolution
    const currentEmail = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: {
        isRead: true,
        isStarred: true,
        folder: true,
        labels: true,
        updatedAt: true,
      },
    });

    if (!currentEmail) {
      return { updated: 0, queued: 0 };
    }

    // Build states array for conflict resolution
    const allStates: EmailState[] = [
      {
        emailId,
        providerId: email.providerId,
        isRead: changes.isRead ?? currentEmail.isRead,
        isStarred: changes.isStarred ?? currentEmail.isStarred,
        folder: changes.folder ?? currentEmail.folder,
        labels: currentEmail.labels,
        updatedAt: new Date(), // Most recent change
      },
      ...linkedEmails.map((e) => ({
        emailId: e.id,
        providerId: e.providerId,
        isRead: e.isRead,
        isStarred: e.isStarred,
        folder: e.folder,
        labels: e.labels,
        updatedAt: e.updatedAt,
      })),
    ];

    // LB-5 Fix: Get conflict strategy from link instead of hardcoding LAST_WRITE_WINS
    const link = await this.prisma.emailCrossProviderLink.findUnique({
      where: { id: email.crossProviderLinkId },
      select: { conflictStrategy: true },
    });

    const strategy = (link?.conflictStrategy as ConflictStrategy) || 'LAST_WRITE_WINS';

    // Resolve conflicts using configured strategy
    const resolution = await this.conflict.resolveConflicts(
      email.crossProviderLinkId,
      allStates,
      strategy,
    );

    // Apply resolved state to all linked emails
    const updated = await this.conflict.applyResolvedState(
      email.crossProviderLinkId,
      resolution,
    );

    this.logger.log(
      `Propagated state change from ${emailId} to ${linkedEmails.length} linked emails`,
    );

    return {
      updated,
      queued: 0, // We could queue provider API calls here in the future
    };
  }

  /**
   * Get states of all emails in a cross-provider link
   */
  private async getLinkedEmailStates(
    crossProviderLinkId: string,
  ): Promise<EmailState[]> {
    const emails = await this.prisma.email.findMany({
      where: { crossProviderLinkId },
      select: {
        id: true,
        providerId: true,
        isRead: true,
        isStarred: true,
        folder: true,
        labels: true,
        updatedAt: true,
      },
    });

    return emails.map((email) => ({
      emailId: email.id,
      providerId: email.providerId,
      isRead: email.isRead,
      isStarred: email.isStarred,
      folder: email.folder,
      labels: email.labels,
      updatedAt: email.updatedAt,
    }));
  }

  /**
   * Get comprehensive statistics about cross-provider sync
   */
  async getSyncStats(tenantId: string): Promise<{
    dedup: {
      totalLinks: number;
      totalEmailsLinked: number;
      avgEmailsPerLink: number;
      multiProviderLinks: number;
    };
    conflicts: {
      totalConflicts: number;
      recentConflicts: number;
      avgResolutionTime: number;
    };
  }> {
    const [dedupStats, conflictStats] = await Promise.all([
      this.dedup.getDedupStats(tenantId),
      this.conflict.getConflictStats(tenantId),
    ]);

    return {
      dedup: dedupStats,
      conflicts: conflictStats,
    };
  }
}
