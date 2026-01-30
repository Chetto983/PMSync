/**
 * Follow-up Scanner Service
 *
 * RAG-based batch scanning for follow-up candidates.
 * Extracted from follow-up.service.ts for SRP compliance.
 *
 * Uses semantic search to find emails that likely need follow-up,
 * with confidence-based thresholds:
 * - High confidence (>0.8): Create follow-up directly
 * - Medium confidence (0.6-0.8): Verify with LLM
 * - Low confidence (<0.6): Skip
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { UnifiedRetriever } from '../rag/unified-retriever';
import { getLocale, getTranslations } from '../locales';
import { getErrorMessage } from '../../../../common/utils';

/**
 * Result of a follow-up scan
 */
export interface FollowUpScanResult {
  created: number;
  skipped: number;
  errors: number;
}

/**
 * Options for scanning emails
 */
export interface FollowUpScanOptions {
  locale?: string;
  maxCandidates?: number;
  highConfidenceThreshold?: number;
  mediumConfidenceThreshold?: number;
}

/**
 * Callback for creating follow-ups (injected from FollowUpService)
 */
export type CreateFollowUpCallback = (
  tenantId: string,
  userId: string,
  emailId: string,
  reason: string,
  dueDate?: Date,
) => Promise<void>;

/**
 * Callback for LLM analysis (injected from FollowUpService)
 */
export type LlmAnalyzeCallback = (
  tenantId: string,
  userId: string,
  body: string,
  subject?: string,
) => Promise<{ needsFollowUp: boolean; reason: string | null; dueDate: Date | null }>;

@Injectable()
export class FollowUpScannerService {
  private readonly logger = new Logger(FollowUpScannerService.name);
  private readonly enabled: boolean;

  private createFollowUpCallback: CreateFollowUpCallback | null = null;
  private llmAnalyzeCallback: LlmAnalyzeCallback | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    this.enabled = this.configService.get<string>('AI_FOLLOW_UP_ENABLED', 'true') === 'true';
  }

  /**
   * Set callbacks for creating follow-ups and LLM analysis
   * Called by FollowUpService during initialization
   */
  setCallbacks(
    createFollowUp: CreateFollowUpCallback,
    llmAnalyze: LlmAnalyzeCallback,
  ): void {
    this.createFollowUpCallback = createFollowUp;
    this.llmAnalyzeCallback = llmAnalyze;
  }

  /**
   * Scan emails for follow-up candidates using RAG semantic search.
   *
   * This method uses vector similarity search to find emails semantically
   * related to follow-up patterns, then applies confidence thresholds.
   *
   * @param tenantId - Tenant ID for isolation
   * @param userId - User ID
   * @param options - Optional configuration
   */
  async scanEmailsForFollowUps(
    tenantId: string,
    userId: string,
    options: FollowUpScanOptions = {},
  ): Promise<FollowUpScanResult> {
    if (!this.enabled) {
      return { created: 0, skipped: 0, errors: 0 };
    }

    if (!this.createFollowUpCallback || !this.llmAnalyzeCallback) {
      this.logger.warn('Scanner callbacks not configured');
      return { created: 0, skipped: 0, errors: 0 };
    }

    const {
      locale = 'en',
      maxCandidates = 50,
      highConfidenceThreshold = 0.8,
      mediumConfidenceThreshold = 0.6,
    } = options;

    const stats: FollowUpScanResult = { created: 0, skipped: 0, errors: 0 };

    try {
      // Create UnifiedRetriever for RAG-based search
      const retriever = new UnifiedRetriever({
        tenantId,
        userId,
        locale: getLocale(locale),
        prisma: this.prisma,
        mistralService: this.mistralService,
        embeddingsService: this.embeddingsService,
        emailLimit: maxCandidates,
      });

      // Semantic query for follow-up patterns (locale-aware)
      const resolvedLocale = getLocale(locale);
      const t = getTranslations(resolvedLocale);
      const followUpQuery = t.followUp.ragQuery;

      // Search for candidate emails using RAG
      const results = await retriever.searchSources(followUpQuery, ['emails']);

      // Find email source results
      const emailSource = results.find((r) => r.source === 'emails');
      if (!emailSource || !emailSource.items.length) {
        this.logger.debug('No follow-up candidates found via RAG');
        return stats;
      }

      // Get user's sent email addresses to filter for sent emails
      const userProviders = await this.prisma.providerConfig.findMany({
        where: { tenantId, userId },
        select: { email: true },
      });
      const userEmails = new Set(
        userProviders.map((p) => p.email?.toLowerCase()).filter(Boolean),
      );

      // Process candidates
      for (const item of emailSource.items) {
        const emailId = item.metadata?.emailId as string;
        if (!emailId) continue;

        // Fetch full email to check if sent and has reply
        const email = await this.prisma.email.findFirst({
          where: { id: emailId, tenantId },
          select: {
            id: true,
            from: true,
            bodyText: true,
            subject: true,
            threadId: true,
          },
        });

        if (!email) {
          stats.skipped++;
          continue;
        }

        // Check if this is a sent email (from user)
        const fromLower = email.from?.toLowerCase() || '';
        const isSentByUser = Array.from(userEmails).some((userEmail) =>
          fromLower.includes(userEmail),
        );

        if (!isSentByUser) {
          stats.skipped++;
          continue;
        }

        // Check if already has follow-up
        const existingFollowUp = await this.prisma.emailFollowUp.findFirst({
          where: {
            tenantId,
            userId,
            emailId,
            status: { in: ['PENDING', 'REMINDED'] },
          },
        });

        if (existingFollowUp) {
          stats.skipped++;
          continue;
        }

        // Check if thread has received a reply
        if (email.threadId) {
          const replyCount = await this.prisma.email.count({
            where: {
              tenantId,
              threadId: email.threadId,
              id: { not: emailId },
              from: { not: { contains: fromLower.split('@')[0] } },
            },
          });

          if (replyCount > 0) {
            stats.skipped++;
            continue;
          }
        }

        // Apply confidence thresholds
        const score = item.score ?? 0;

        try {
          if (score >= highConfidenceThreshold) {
            // High confidence: create directly
            await this.createFollowUpCallback(
              tenantId,
              userId,
              emailId,
              'Detected via semantic search (high confidence)',
            );
            stats.created++;
            this.logger.debug(
              `Created follow-up for email ${emailId} (score: ${score.toFixed(2)})`,
            );
          } else if (score >= mediumConfidenceThreshold) {
            // Medium confidence: verify with LLM
            const llmResult = await this.llmAnalyzeCallback(
              tenantId,
              userId,
              email.bodyText || '',
              email.subject || undefined,
            );

            if (llmResult.needsFollowUp) {
              await this.createFollowUpCallback(
                tenantId,
                userId,
                emailId,
                llmResult.reason || 'Verified by AI analysis',
                llmResult.dueDate || undefined,
              );
              stats.created++;
              this.logger.debug(
                `Created follow-up for email ${emailId} (LLM verified, score: ${score.toFixed(2)})`,
              );
            } else {
              stats.skipped++;
            }
          } else {
            // Low confidence: skip
            stats.skipped++;
          }
        } catch (error) {
          stats.errors++;
          const msg = getErrorMessage(error);
          this.logger.warn(`Failed to process follow-up candidate ${emailId}: ${msg}`);
        }
      }

      this.logger.log(
        `Follow-up RAG scan complete: ${stats.created} created, ${stats.skipped} skipped, ${stats.errors} errors`,
      );

      return stats;
    } catch (error) {
      const msg = getErrorMessage(error);
      this.logger.error(`Follow-up RAG scan failed: ${msg}`);
      throw error;
    }
  }

  /**
   * Detect stalled threads that may need follow-up.
   * A thread is "stalled" if:
   * - User sent last message
   * - No reply received in N+ days (default: 7)
   * - No existing follow-up for that email
   *
   * @param tenantId - Tenant ID for isolation
   * @param userId - User ID
   * @param staleDays - Days without reply to consider stalled (default: 7)
   * @returns Array of stalled thread info
   */
  async detectStalledThreads(
    tenantId: string,
    userId: string,
    staleDays = 7,
  ): Promise<Array<{ emailId: string; threadId: string; daysSinceLastMessage: number; subject: string | null }>> {
    if (!this.enabled) {
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - staleDays);

    // Get user's email addresses
    const userProviders = await this.prisma.providerConfig.findMany({
      where: { tenantId, userId },
      select: { email: true },
    });
    const userEmails = userProviders
      .map((p) => p.email?.toLowerCase())
      .filter((e): e is string => Boolean(e));

    if (!userEmails.length) {
      this.logger.debug('No user email addresses found for stall detection');
      return [];
    }

    const stalledThreads: Array<{
      emailId: string;
      threadId: string;
      daysSinceLastMessage: number;
      subject: string | null;
    }> = [];

    // Find user's sent emails older than cutoff with thread context
    const userSentEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        sentAt: { lt: cutoffDate },
        threadId: { not: null },
        // Check if from contains any of user's emails
        OR: userEmails.map((email) => ({
          from: { contains: email, mode: 'insensitive' as const },
        })),
      },
      select: { id: true, threadId: true, sentAt: true, subject: true, from: true },
      orderBy: { sentAt: 'desc' },
      take: 100, // Process in batches
    });

    for (const email of userSentEmails) {
      if (!email.threadId || !email.sentAt) continue;

      // Check if there's a newer message in thread from someone else
      const newerReply = await this.prisma.email.findFirst({
        where: {
          tenantId,
          threadId: email.threadId,
          sentAt: { gt: email.sentAt },
          // Not from any of the user's emails
          NOT: {
            OR: userEmails.map((userEmail) => ({
              from: { contains: userEmail, mode: 'insensitive' as const },
            })),
          },
        },
      });

      if (!newerReply) {
        // Check if follow-up already exists
        const existingFollowUp = await this.prisma.emailFollowUp.findFirst({
          where: {
            tenantId,
            userId,
            emailId: email.id,
            status: { in: ['PENDING', 'REMINDED'] },
          },
        });

        if (!existingFollowUp) {
          const daysSince = Math.floor(
            (Date.now() - email.sentAt.getTime()) / (1000 * 60 * 60 * 24),
          );
          stalledThreads.push({
            emailId: email.id,
            threadId: email.threadId,
            daysSinceLastMessage: daysSince,
            subject: email.subject,
          });
        }
      }
    }

    this.logger.log(`Detected ${stalledThreads.length} stalled threads (${staleDays}+ days)`);
    return stalledThreads;
  }

  /**
   * Check if scanner is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
