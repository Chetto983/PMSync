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
 *
 * NOTE: Thread Summary functionality has been extracted to ThreadSummaryService
 * (thread-summary.service.ts) to maintain Single Responsibility Principle.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailInsightsService } from './email-insights.service';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { TriageActionService } from './triage-action.service';

// Cost control constants
const MAX_TRIAGE_PER_BATCH = 50;
const TRIAGE_MAX_AGE_HOURS = 24;
// Skip folders for auto-triage (based on actual DB values - all UPPERCASE)
const SKIP_FOLDERS = [
  'SPAM',       // Spam folder
  'TRASH',      // Trash folder
  'SENT',       // Sent emails - no point labeling outgoing
  'DRAFTS',     // Draft emails
  'ARCHIVE',    // Archived emails
];

// SCALE PROTECTION: Global concurrency limit for LLM API calls
// Prevents 1000 users syncing = 20000 LLM calls storm
const MAX_CONCURRENT_TRIAGE_OPERATIONS = 5; // Max 5 tenants triaging simultaneously

interface TriageResult {
  emailId: string;
  success: boolean;
  aiPriority?: number;
  aiLabels?: string[];
  error?: string;

  // Extended fields from unified analysis (2025-01 consolidation)
  summary?: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  keyTopics?: string[];
  escalationRisk?: boolean;
  hasDeadline?: boolean;
  needsFollowUp?: boolean;
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

  // SCALE PROTECTION: In-memory semaphore for global concurrency control
  // For multi-instance deployments, use Redis-based locking instead
  private static currentOperations = 0;
  private static waitQueue: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInsights: EmailInsightsService,
    private readonly subscriptionService: SubscriptionService,
    @Optional() private readonly triageActionService?: TriageActionService,
  ) {}

  /**
   * SCALE PROTECTION: Acquire semaphore slot before processing
   * Returns false if queue is full (>50 waiting), true when slot acquired
   */
  private async acquireSemaphore(): Promise<boolean> {
    // If we have capacity, acquire immediately
    if (EmailTriageService.currentOperations < MAX_CONCURRENT_TRIAGE_OPERATIONS) {
      EmailTriageService.currentOperations++;
      return true;
    }

    // Don't queue if too many already waiting (prevents memory issues)
    if (EmailTriageService.waitQueue.length >= 50) {
      this.logger.warn('Triage semaphore queue full, skipping operation');
      return false;
    }

    // Wait for a slot
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Remove from queue if still there
        const idx = EmailTriageService.waitQueue.indexOf(release);
        if (idx >= 0) EmailTriageService.waitQueue.splice(idx, 1);
        resolve(false); // Timeout
      }, 30000); // 30s max wait

      const release = () => {
        clearTimeout(timeout);
        EmailTriageService.currentOperations++;
        resolve(true);
      };

      EmailTriageService.waitQueue.push(release);
    });
  }

  /**
   * SCALE PROTECTION: Release semaphore slot after processing
   */
  private releaseSemaphore(): void {
    EmailTriageService.currentOperations--;
    // Wake next waiter if any
    const next = EmailTriageService.waitQueue.shift();
    if (next) next();
  }

  /**
   * Check if auto-triage is enabled for a user
   * SECURITY: Checks both user preference AND subscription plan (PROFESSIONAL+ required)
   */
  async isAutoTriageEnabled(userId: string, tenantId: string): Promise<boolean> {
    try {
      // 1. Check user preference first (fast check)
      const prefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { aiAutoTriageEnabled: true },
      });
      if (!prefs?.aiAutoTriageEnabled) {
        return false;
      }

      // 2. Check subscription has auto_triage feature (PROFESSIONAL+ plans only)
      const subscription = await this.subscriptionService.getOrCreateSubscription(tenantId);
      const hasFeature = this.subscriptionService.hasFeature(subscription.plan, 'auto_triage');

      if (!hasFeature) {
        this.logger.debug(
          `Auto-triage blocked for tenant ${tenantId}: plan ${subscription.plan} lacks auto_triage feature`,
        );
      }

      return hasFeature;
    } catch (error) {
      this.logger.warn(`Failed to check auto-triage for user ${userId}: ${error}`);
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
   * Triage a single email - unified analysis with summary, priority, labels, sentiment
   *
   * CONSOLIDATED (2025-01): Now uses single LLM call via analyzeEmailUnified()
   * instead of 2 separate calls (calculatePriority + categorizeEmail)
   *
   * Returns ALL insights: summary, sentiment, priority, labels, topics, escalationRisk
   */
  async triageEmail(
    emailId: string,
    options: TriageOptions,
  ): Promise<TriageResult> {
    const { tenantId, locale } = options;

    try {
      // UNIFIED ANALYSIS: Single LLM call for all insights
      // analyzeEmailUnified() also saves to EmailAnalysis + Email tables
      const analysis = await this.emailInsights.analyzeEmailUnified(
        tenantId,
        emailId,
        locale,
        { includeSmartReplies: false }, // Skip smart replies for triage
      );

      this.logger.debug(
        `Triaged email ${emailId}: priority=${analysis.priority}, labels=${analysis.labels.join(',')}, sentiment=${analysis.sentiment}`,
      );

      // Phase CONSOLIDATION: Create follow-up records from triage signals (fire-and-forget)
      if (this.triageActionService && (analysis.needsFollowUp || analysis.hasDeadline)) {
        const email = await this.prisma.email.findFirst({
          where: { id: emailId, tenantId },
          select: { from: true, subject: true },
        });
        if (email) {
          this.triageActionService
            .processTriageSignals(
              { emailId, tenantId, userId: options.userId, from: email.from, subject: email.subject },
              analysis,
            )
            .catch((err) =>
              this.logger.warn(`Follow-up creation failed for ${emailId}: ${err instanceof Error ? err.message : String(err)}`),
            );
        }
      }

      return {
        emailId,
        success: true,
        aiPriority: analysis.priority,
        aiLabels: analysis.labels,
        // Extended fields from unified analysis
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        urgency: analysis.urgency,
        keyTopics: analysis.keyTopics,
        escalationRisk: analysis.escalationRisk,
        hasDeadline: analysis.hasDeadline,
        needsFollowUp: analysis.needsFollowUp,
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
   * - SCALE PROTECTION: Global concurrency limit (max 5 concurrent operations)
   */
  async processUntriagedEmails(options: TriageOptions): Promise<BatchTriageResult> {
    // Check if auto-triage is enabled (includes subscription check)
    const isEnabled = await this.isAutoTriageEnabled(options.userId, options.tenantId);
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

    // SCALE PROTECTION: Acquire semaphore before LLM-intensive processing
    // This prevents 1000 users syncing = 20000 LLM calls storm
    const acquired = await this.acquireSemaphore();
    if (!acquired) {
      this.logger.warn(`Triage skipped for tenant ${options.tenantId}: concurrency limit reached`);
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: emailIds.length,
        skippedReason: 'Concurrency limit reached, will retry on next sync',
      };
    }

    try {
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
    } finally {
      // SCALE PROTECTION: Always release semaphore
      this.releaseSemaphore();
    }
  }

  /**
   * Triage a specific list of email IDs (for manual trigger)
   * Still applies cost controls
   */
  async triageSpecificEmails(
    emailIds: string[],
    options: TriageOptions,
  ): Promise<BatchTriageResult> {
    // Check if auto-triage is enabled (includes subscription check)
    const isEnabled = await this.isAutoTriageEnabled(options.userId, options.tenantId);
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
