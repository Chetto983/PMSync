/**
 * FollowUpDetectionService - Batch follow-up detection via generateText + parseJsonOutput
 *
 * Analyzes a batch of recent emails (configurable window, default 24h)
 * and detects which ones require follow-up action. Returns structured
 * results with emailId, reason, urgency, and confidence.
 *
 * One LLM call per batch -- not per email.
 * JSON extracted from raw text via parseJsonOutput (Qwen 3.5 via OpenRouter).
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from './ai-run-ledger.service';
import { getLocale } from '../locales';
import { parseJsonOutput } from '../utils/parse-json-output';
import { promptHash } from '../utils/prompt-hash';

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

const SYSTEM_PROMPT = `Analyze the provided batch of recent emails and detect which ones require follow-up action from the user.

Return a JSON object with EXACTLY these fields:

{
  "detectedFollowUps": [{"emailId": string, "reason": string, "suggestedDueDate": string|null, "urgency": "high"|"medium"|"low", "confidence": number}],
  "batchSummary": {"totalAnalyzed": number, "totalDetected": number, "highUrgencyCount": number}
}

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

<EXAMPLES_NO_FOLLOWUP>
These do NOT need follow-up:
- Newsletter: "Your weekly digest from TechCrunch" → No action needed
- Receipt: "Order confirmation #12345 from Amazon" → Informational only
- Automated: "Your password was changed successfully" → No response expected
- CC'd: User is CC'd on a thread between two other people → Not directly addressed
- Marketing: "50% off sale ends today!" → Promotional, no action
</EXAMPLES_NO_FOLLOWUP>

<EXAMPLES_NEEDS_FOLLOWUP>
These DO need follow-up:
- Direct question: "Can you send me the Q3 report by Friday?" → Action required with deadline
- Commitment: User wrote "I'll send the proposal by EOD" → User needs to fulfill commitment
- Escalation: "We still haven't received payment, this is the third reminder" → Urgent, relationship risk
</EXAMPLES_NEEDS_FOLLOWUP>

Confidence calibration:
- 0.9-1.0: Explicit request with clear deadline or direct question
- 0.6-0.8: Implied action needed, context supports follow-up
- 0.3-0.5: Possible follow-up but ambiguous intent
- Below 0.3: Do not include -- too uncertain

Return valid JSON matching the exact schema.`;

const LOCALE_SUFFIXES: Record<string, string> = {
  it: '\n\nIMPORTANTE: Tutti i campi testuali (reason, suggestedDueDate description) DEVONO essere scritti in ITALIANO.',
};

function buildSystemPrompt(locale?: string): string {
  const lang = getLocale(locale);
  return SYSTEM_PROMPT + (LOCALE_SUFFIXES[lang] || '');
}

@Injectable()
export class FollowUpDetectionService {
  private readonly logger = new Logger(FollowUpDetectionService.name);

  constructor(
    private readonly mistralProvider: OpenRouterProviderService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
    @Optional() private readonly ledgerService?: AiRunLedgerService,
  ) {}

  /**
   * Detect follow-ups in recent emails within a time window.
   * @param tenantId Tenant ID
   * @param hoursWindow Hours to look back (default: 24)
   */
  async detectFollowUps(
    tenantId: string,
    hoursWindow = 24,
    locale?: string,
  ): Promise<{ data: FollowUpDetectionOutput; error?: string }> {
    const cutoffDate = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);

    // 1. Fetch recent emails — skip already-triaged (they get follow-ups from TriageActionService)
    const recentEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        receivedAt: { gte: cutoffDate },
        isDeleted: false,
        isAutoTriaged: false, // Only backfill un-triaged emails
        followUp: { is: null }, // No existing follow-up record
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
    return this.generateWithFallback(batchPrompt, recentEmails.length, tenantId, locale);
  }

  private async generateWithFallback(
    batchPrompt: string,
    totalAnalyzed: number,
    tenantId = 'system',
    locale?: string,
  ): Promise<{ data: FollowUpDetectionOutput; error?: string }> {
    const startTime = Date.now();
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(),
        system: buildSystemPrompt(locale),
        prompt: batchPrompt + '\n\nReturn valid JSON.',
      });

      this.ledgerService?.recordRun({
        tenantId,
        userId: 'system',
        runType: 'follow-up-detection',
        model: this.mistralProvider.getChatModelName(),
        promptTokens: result.usage?.inputTokens ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
        latencyMs: Date.now() - startTime,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      const parsed = parseJsonOutput(result.text, followUpDetectionSchema);
      await this.trackUsage();
      await this.persistDetectedFollowUps(parsed, tenantId);
      return { data: parsed };
    } catch (error) {
      this.ledgerService?.recordRun({
        tenantId,
        userId: 'system',
        runType: 'follow-up-detection',
        model: this.mistralProvider.getChatModelName(),
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      this.logger.error(`Follow-up detection failed: ${error}`);
      return {
        data: {
          detectedFollowUps: [],
          batchSummary: { totalAnalyzed, totalDetected: 0, highUrgencyCount: 0 },
        },
        error: 'Follow-up detection failed',
      };
    }
  }

  /**
   * Persist LLM-detected follow-ups as EmailFollowUp records (backfill path).
   * Skips emails that already have a follow-up record (upsert on emailId).
   */
  private async persistDetectedFollowUps(
    output: FollowUpDetectionOutput,
    tenantId: string,
  ): Promise<void> {
    if (!output.detectedFollowUps || output.detectedFollowUps.length === 0) return;

    for (const det of output.detectedFollowUps) {
      try {
        // Resolve userId from the email's provider config
        const email = await this.prisma.email.findFirst({
          where: { id: det.emailId, tenantId },
          select: { provider: { select: { userId: true } } },
        });
        const userId = email?.provider?.userId;
        if (!userId) {
          this.logger.debug(`Skipped follow-up for ${det.emailId}: no userId on provider`);
          continue;
        }

        await this.prisma.emailFollowUp.upsert({
          where: { emailId_tenantId: { emailId: det.emailId, tenantId } },
          update: {}, // Don't overwrite if already exists
          create: {
            emailId: det.emailId,
            tenantId,
            userId,
            reason: det.reason,
            dueDate: det.suggestedDueDate ? new Date(det.suggestedDueDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            status: 'PENDING',
            followUpType: 'TODO',
            confidence: det.confidence,
          },
        });
      } catch (err) {
        // P2003 = FK violation (email deleted between detection and persist), P2002 = unique constraint
        this.logger.debug(`Skipped follow-up persist for ${det.emailId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.log(`Persisted ${output.detectedFollowUps.length} detected follow-ups for tenant ${tenantId}`);
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
