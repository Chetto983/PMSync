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

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailInsightsService } from './email-insights.service';
import { MistralBatchService, BatchResponse } from '../voltagent/services/mistral-batch.service';

// Cost control constants
const MAX_TRIAGE_PER_BATCH = 20; // Max emails to process per API call
const TRIAGE_MAX_AGE_HOURS = 24; // Only triage emails from last 24h
const SKIP_FOLDERS = ['spam', 'junk', 'trash', '[gmail]/spam', '[gmail]/trash'];

// SCALE PROTECTION: Global concurrency limit for LLM API calls
// Prevents 1000 users syncing = 20000 LLM calls storm
const MAX_CONCURRENT_TRIAGE_OPERATIONS = 5; // Max 5 tenants triaging simultaneously

// P11 Phase 3: Batch sentiment analysis threshold (50% cost savings)
const BATCH_TRIAGE_THRESHOLD = 10; // Use batch API for 10+ emails

interface TriageResult {
  emailId: string;
  success: boolean;
  aiPriority?: number;
  aiLabels?: string[];
  error?: string;
  batchJobId?: string; // P11: Track batch job
  mode?: 'realtime' | 'batch'; // P11: Indicate processing mode
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
    @Optional() private readonly mistralBatch?: MistralBatchService, // P11: Batch sentiment
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
   * - SCALE PROTECTION: Global concurrency limit (max 5 concurrent operations)
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

    // P11 Phase 3: Batch path for 10+ emails (50% cost savings)
    // Uses async Mistral Batch API with @Cron(EVERY_5_MINUTES) polling
    if (emailIds.length >= BATCH_TRIAGE_THRESHOLD && this.mistralBatch?.isEnabled()) {
      return this.processBatchTriage(options.tenantId, emailIds, options);
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
   * P11 Phase 3: Batch sentiment analysis for 10+ emails (50% cost savings)
   * Uses MistralBatchService with @Cron(EVERY_5_MINUTES) polling
   *
   * @returns BatchTriageResult with mode='batch' and batchJobId
   */
  private async processBatchTriage(
    tenantId: string,
    emailIds: string[],
    options: TriageOptions,
  ): Promise<BatchTriageResult> {
    // Fetch email content for batch processing
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, subject: true, snippet: true },
    });

    if (emails.length === 0) {
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: emailIds.length,
        skippedReason: 'No emails found for batch processing',
      };
    }

    // Prepare batch request
    const batchEmails = emails.map((e) => ({
      id: e.id,
      subject: e.subject || '',
      body: e.snippet || '',
    }));

    // Create batch job
    const jobId = await this.mistralBatch!.batchSentimentAnalysis(tenantId, batchEmails);

    if (!jobId) {
      this.logger.warn('Batch sentiment job creation failed, falling back to sequential');
      // Fall back to sequential processing
      return this.processSequentialTriage(emailIds, options);
    }

    // Track with completion handler (GDPR: tenant-isolated)
    this.mistralBatch!.trackJob(jobId, tenantId, 'sentiment', async (results) => {
      await this.processBatchSentimentResults(results, tenantId);
    });

    this.logger.log(
      `P11 Batch triage job ${jobId} created for ${emails.length} emails (tenant: ${tenantId})`,
    );

    // Return async result - actual processing happens via @Cron polling
    return {
      processed: emails.length,
      successful: 0, // Will be updated when batch completes
      failed: 0,
      skipped: 0,
      skippedReason: `Batch job ${jobId} queued - results via @Cron(EVERY_5_MINUTES)`,
    };
  }

  /**
   * P11: Process completed batch sentiment results
   * Called automatically by MistralBatchService via @Cron polling
   */
  private async processBatchSentimentResults(
    results: BatchResponse[],
    tenantId: string,
  ): Promise<void> {
    this.logger.log(
      `Processing ${results.length} batch sentiment results for tenant ${tenantId}`,
    );

    let successCount = 0;
    let failCount = 0;

    for (const result of results) {
      if (result.error) {
        this.logger.warn(`Sentiment failed for email ${result.customId}: ${result.error}`);
        failCount++;
        continue;
      }

      try {
        // Parse sentiment response from batch API
        const responseBody = result.response;
        if (!responseBody) {
          failCount++;
          continue;
        }

        // Handle different response formats
        let sentiment = 'neutral';
        let confidence = 0.5;

        // Format 1: Direct response object
        if (responseBody.sentiment && typeof responseBody.sentiment === 'string') {
          sentiment = responseBody.sentiment;
          confidence = typeof responseBody.confidence === 'number'
            ? responseBody.confidence
            : 0.5;
        }
        // Format 2: Chat completion response
        else if (responseBody.choices) {
          const choices = responseBody.choices as Array<{
            message?: { content?: string };
          }>;
          const content = choices[0]?.message?.content;
          if (content) {
            try {
              const parsed = JSON.parse(content);
              sentiment = parsed.sentiment || 'neutral';
              confidence = parsed.confidence || 0.5;
            } catch {
              // If not JSON, try to extract sentiment from text
              const lowerContent = content.toLowerCase();
              if (lowerContent.includes('negative')) sentiment = 'negative';
              else if (lowerContent.includes('positive')) sentiment = 'positive';
            }
          }
        }

        // Map sentiment to priority (1-5 scale)
        const aiPriority = this.mapSentimentToPriority(sentiment, confidence);

        // Update email with AI triage data
        await this.prisma.email.updateMany({
          where: { id: result.customId, tenantId },
          data: {
            aiPriority,
            aiPriorityReason: `Batch sentiment: ${sentiment} (${Math.round(confidence * 100)}%)`,
            isAutoTriaged: true,
            autoTriagedAt: new Date(),
          },
        });

        successCount++;
      } catch (err) {
        this.logger.error(`Failed to process sentiment for ${result.customId}: ${err}`);
        failCount++;
      }
    }

    this.logger.log(
      `Batch sentiment processing complete: ${successCount} successful, ${failCount} failed`,
    );
  }

  /**
   * P11: Map sentiment to priority (1-5 scale)
   * negative → high priority (1-2), neutral → medium (3), positive → low (4-5)
   */
  private mapSentimentToPriority(sentiment: string, confidence: number): number {
    const normalizedSentiment = sentiment.toLowerCase();
    if (normalizedSentiment === 'negative' || normalizedSentiment === 'urgent') {
      return confidence > 0.7 ? 1 : 2;
    }
    if (normalizedSentiment === 'neutral' || normalizedSentiment === 'mixed') {
      return 3;
    }
    if (normalizedSentiment === 'positive') {
      return confidence > 0.7 ? 5 : 4;
    }
    return 3; // Default to medium priority
  }

  /**
   * P11: Sequential triage fallback (for <10 emails or when batch fails)
   */
  private async processSequentialTriage(
    emailIds: string[],
    options: TriageOptions,
  ): Promise<BatchTriageResult> {
    const results: TriageResult[] = [];
    for (const emailId of emailIds) {
      const result = await this.triageEmail(emailId, options);
      results.push(result);

      // Small delay between calls
      if (emailIds.indexOf(emailId) < emailIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return {
      processed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
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
