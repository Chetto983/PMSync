/**
 * FollowUpDetectionService - Batch follow-up detection via generateText + Output.object()
 *
 * Analyzes a batch of recent emails (configurable window, default 24h)
 * and detects which ones require follow-up action. Returns structured
 * results with emailId, reason, urgency, and confidence.
 *
 * One LLM call per batch -- not per email.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';

// ============ Zod Schema (co-located, exported for frontend type derivation) ============

export const followUpDetectionSchema = z.object({
  detectedFollowUps: z.array(z.object({
    emailId: z.string().describe('ID of the email needing follow-up'),
    reason: z.string().describe('Why this email needs follow-up'),
    suggestedDueDate: z.string().nullable().describe('ISO date string for suggested due date'),
    urgency: z.enum(['high', 'medium', 'low']).describe('Follow-up urgency level'),
    confidence: z.number().describe('Confidence score 0-1'),
  })).describe('Emails detected as needing follow-up'),

  batchSummary: z.object({
    totalAnalyzed: z.number().describe('Number of emails analyzed in this batch'),
    totalDetected: z.number().describe('Number of follow-ups detected'),
    highUrgencyCount: z.number().describe('Number of high-urgency follow-ups'),
  }).describe('Summary of the batch analysis'),
});

export type FollowUpDetectionOutput = z.infer<typeof followUpDetectionSchema>;

// ============ Safe Fallback ============

const SAFE_FALLBACK: FollowUpDetectionOutput = {
  detectedFollowUps: [],
  batchSummary: { totalAnalyzed: 0, totalDetected: 0, highUrgencyCount: 0 },
};

const SYSTEM_PROMPT = `Analyze the provided batch of recent emails and detect which ones require follow-up action from the user.

For each detected follow-up:
- Explain WHY follow-up is needed (unanswered question, commitment made, deadline mentioned, etc.)
- Suggest a due date based on urgency and context
- Rate urgency: high (deadline within 48h or explicit request), medium (within a week), low (nice-to-have)
- Rate confidence: 0.0-1.0 how certain you are this needs follow-up

Rules:
- Return ONLY emails that genuinely need follow-up. Be conservative.
- Newsletters, automated notifications, and receipts do NOT need follow-up.
- Emails where the user is CC'd (not TO) typically don't need follow-up.
- If an email asks a direct question or requests action, it needs follow-up.
- If the user made a commitment in a sent email, it needs follow-up.

Return valid JSON matching the exact schema.`;

@Injectable()
export class FollowUpDetectionService {
  private readonly logger = new Logger(FollowUpDetectionService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
  ) {}

  /**
   * Detect follow-ups in recent emails within a time window.
   * @param tenantId Tenant ID
   * @param hoursWindow Hours to look back (default: 24)
   */
  async detectFollowUps(
    tenantId: string,
    hoursWindow = 24,
  ): Promise<{ data: FollowUpDetectionOutput; error?: string }> {
    const cutoffDate = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);

    // 1. Fetch recent emails
    const recentEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        receivedAt: { gte: cutoffDate },
        isDeleted: false,
      },
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        bodyText: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: 'desc' },
    });

    if (recentEmails.length === 0) {
      return {
        data: {
          detectedFollowUps: [],
          batchSummary: { totalAnalyzed: 0, totalDetected: 0, highUrgencyCount: 0 },
        },
      };
    }

    // 2. Truncate body text and build batch prompt
    const emailSummaries = recentEmails.map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      to: e.to,
      snippet: e.bodyText?.slice(0, 500) || '',
      receivedAt: e.receivedAt.toISOString(),
    }));

    const batchPrompt = JSON.stringify({
      emails: emailSummaries,
      totalEmails: emailSummaries.length,
      currentTime: new Date().toISOString(),
    }, null, 0);

    // 3. Generate with graceful fallback
    return this.generateWithFallback(batchPrompt, recentEmails.length);
  }

  private async generateWithFallback(
    batchPrompt: string,
    totalAnalyzed: number,
  ): Promise<{ data: FollowUpDetectionOutput; error?: string }> {
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(),
        output: Output.object({ schema: followUpDetectionSchema }),
        system: SYSTEM_PROMPT,
        prompt: batchPrompt,
      });

      await this.trackUsage();
      return { data: result.output };
    } catch (firstError) {
      if (NoObjectGeneratedError.isInstance(firstError)) {
        this.logger.warn(`Follow-up detection schema validation failed, retrying`);
        try {
          const retryResult = await generateText({
            model: this.mistralProvider.getChatModel(),
            output: Output.object({ schema: followUpDetectionSchema }),
            system: SYSTEM_PROMPT + '\nIMPORTANT: Return ONLY valid JSON matching the exact schema. Every field must be present.',
            prompt: batchPrompt,
          });

          await this.trackUsage();
          return { data: retryResult.output };
        } catch (retryError) {
          this.logger.error(`Follow-up detection retry failed: ${retryError}`);
          return {
            data: {
              detectedFollowUps: [],
              batchSummary: { totalAnalyzed, totalDetected: 0, highUrgencyCount: 0 },
            },
            error: 'Schema validation failed after retry',
          };
        }
      }
      this.logger.error(`Follow-up detection failed: ${firstError}`);
      return {
        data: {
          detectedFollowUps: [],
          batchSummary: { totalAnalyzed, totalDetected: 0, highUrgencyCount: 0 },
        },
        error: 'Follow-up detection failed',
      };
    }
  }

  private async trackUsage() {
    if (this.usageTrackingService) {
      try {
        await this.usageTrackingService.trackUsage(
          'system',
          'ai-calls',
          1,
        );
      } catch (err) {
        this.logger.warn(`Failed to track follow-up detection usage: ${err}`);
      }
    }
  }
}
