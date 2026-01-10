/**
 * EmailTriageService - Auto-triage emails using AI (Superhuman-like feature)
 *
 * COST CONTROLS:
 * - Only processes emails received in last 24 hours
 * - Max 20 emails per triage batch (rate limit)
 * - Skips junk/spam/trash folders
 * - Only runs on incremental syncs (not initial full sync)
 *
 * Called on-demand via API or scheduled job, NOT during sync.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailInsightsService } from './email-insights.service';

// Cost control constants
const MAX_TRIAGE_PER_BATCH = 20; // Max emails to process per API call
const TRIAGE_MAX_AGE_HOURS = 24; // Only triage emails from last 24h
const SKIP_FOLDERS = ['spam', 'junk', 'trash', '[gmail]/spam', '[gmail]/trash'];

interface TriageResult {
  emailId: string;
  success: boolean;
  aiPriority?: number;
  aiLabels?: string[];
  error?: string;
}

interface TriageOptions {
  tenantId: string;
  userId: string;
  locale?: string;
}

interface BatchTriageResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  skippedReason?: string;
}

@Injectable()
export class EmailTriageService {
  private readonly logger = new Logger(EmailTriageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInsights: EmailInsightsService,
  ) {}

  /**
   * Check if auto-triage is enabled for a user
   */
  async isAutoTriageEnabled(userId: string): Promise<boolean> {
    try {
      const prefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { aiAutoTriageEnabled: true },
      });
      return prefs?.aiAutoTriageEnabled ?? false;
    } catch (error) {
      this.logger.warn(`Failed to check auto-triage preference for user ${userId}: ${error}`);
      return false;
    }
  }

  /**
   * Get untriaged emails that are eligible for auto-triage
   * Only returns recent emails (< 24h) from non-junk folders
   */
  async getEligibleEmails(
    tenantId: string,
    limit: number = MAX_TRIAGE_PER_BATCH,
  ): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - TRIAGE_MAX_AGE_HOURS);

    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isAutoTriaged: false,
        receivedAt: { gte: cutoffDate },
        folder: { notIn: SKIP_FOLDERS },
        isDeleted: false,
        isDraft: false,
      },
      select: { id: true },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    return emails.map((e) => e.id);
  }

  /**
   * Triage a single email - calculate priority and suggest labels
   */
  async triageEmail(
    emailId: string,
    options: TriageOptions,
  ): Promise<TriageResult> {
    const { tenantId, locale } = options;

    try {
      // Run priority calculation and categorization in parallel
      const [priorityResult, labels] = await Promise.all([
        this.emailInsights.calculatePriority(tenantId, emailId, locale),
        this.emailInsights.categorizeEmail(tenantId, emailId, locale),
      ]);

      // Map 1-10 score to 1-5 priority (1 = highest)
      const aiPriority = Math.max(1, Math.min(5, Math.ceil((11 - priorityResult.score) / 2)));

      // Build reason from factors
      const aiPriorityReason = priorityResult.factors.length > 0
        ? priorityResult.factors.join('; ')
        : `${priorityResult.urgency} urgency - ${priorityResult.recommendation}`;

      // Update email with AI triage data
      await this.prisma.email.updateMany({
        where: {
          id: emailId,
          tenantId, // Tenant isolation
        },
        data: {
          aiPriority,
          aiPriorityReason,
          aiLabels: labels,
          isAutoTriaged: true,
          autoTriagedAt: new Date(),
        },
      });

      this.logger.debug(
        `Triaged email ${emailId}: priority=${aiPriority}, labels=${labels.join(',')}`,
      );

      return {
        emailId,
        success: true,
        aiPriority,
        aiLabels: labels,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to triage email ${emailId}: ${errorMessage}`);

      return {
        emailId,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Process untriaged emails for a user (on-demand)
   *
   * COST CONTROLS APPLIED:
   * - Max 20 emails per call
   * - Only emails < 24h old
   * - Skips junk/spam/trash
   */
  async processUntriagedEmails(options: TriageOptions): Promise<BatchTriageResult> {
    // Check if auto-triage is enabled
    const isEnabled = await this.isAutoTriageEnabled(options.userId);
    if (!isEnabled) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        skippedReason: 'Auto-triage disabled for user',
      };
    }

    // Get eligible emails (with cost controls)
    const emailIds = await this.getEligibleEmails(options.tenantId);

    if (emailIds.length === 0) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        skippedReason: 'No eligible emails to triage',
      };
    }

    this.logger.log(`Processing ${emailIds.length} emails for triage (tenant: ${options.tenantId})`);

    // Process sequentially with 500ms delay between calls (rate limit protection)
    const results: TriageResult[] = [];
    for (const emailId of emailIds) {
      const result = await this.triageEmail(emailId, options);
      results.push(result);

      // Small delay to avoid overwhelming the LLM API
      if (emailIds.indexOf(emailId) < emailIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`Triage complete: ${successful} successful, ${failed} failed`);

    return {
      processed: results.length,
      successful,
      failed,
      skipped: 0,
    };
  }

  /**
   * Triage a specific list of email IDs (for manual trigger)
   * Still applies cost controls
   */
  async triageSpecificEmails(
    emailIds: string[],
    options: TriageOptions,
  ): Promise<BatchTriageResult> {
    // Check if auto-triage is enabled
    const isEnabled = await this.isAutoTriageEnabled(options.userId);
    if (!isEnabled) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: emailIds.length,
        skippedReason: 'Auto-triage disabled for user',
      };
    }

    // Apply rate limit
    const limitedIds = emailIds.slice(0, MAX_TRIAGE_PER_BATCH);
    const skippedCount = emailIds.length - limitedIds.length;

    if (limitedIds.length === 0) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: skippedCount,
        skippedReason: 'No emails to process',
      };
    }

    this.logger.log(`Triaging ${limitedIds.length} specific emails (skipped ${skippedCount} due to rate limit)`);

    // Process sequentially
    const results: TriageResult[] = [];
    for (const emailId of limitedIds) {
      const result = await this.triageEmail(emailId, options);
      results.push(result);

      if (limitedIds.indexOf(emailId) < limitedIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return {
      processed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      skipped: skippedCount,
    };
  }

  /**
   * Get triage statistics for a tenant
   */
  async getTriageStats(tenantId: string): Promise<{
    totalTriaged: number;
    byPriority: Record<number, number>;
    lastTriagedAt: Date | null;
    pendingCount: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - TRIAGE_MAX_AGE_HOURS);

    const [totalTriaged, priorityCounts, lastEmail, pendingCount] = await Promise.all([
      this.prisma.email.count({
        where: { tenantId, isAutoTriaged: true },
      }),
      this.prisma.email.groupBy({
        by: ['aiPriority'],
        where: { tenantId, isAutoTriaged: true, aiPriority: { not: null } },
        _count: { id: true },
      }),
      this.prisma.email.findFirst({
        where: { tenantId, isAutoTriaged: true },
        orderBy: { autoTriagedAt: 'desc' },
        select: { autoTriagedAt: true },
      }),
      this.prisma.email.count({
        where: {
          tenantId,
          isAutoTriaged: false,
          receivedAt: { gte: cutoffDate },
          folder: { notIn: SKIP_FOLDERS },
          isDeleted: false,
          isDraft: false,
        },
      }),
    ]);

    const byPriority: Record<number, number> = {};
    for (const p of priorityCounts) {
      if (p.aiPriority !== null) {
        byPriority[p.aiPriority] = p._count.id;
      }
    }

    return {
      totalTriaged,
      byPriority,
      lastTriagedAt: lastEmail?.autoTriagedAt ?? null,
      pendingCount,
    };
  }
}
