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
import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { generateObject, generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from './ai-run-ledger.service';
import { getLocale } from '../locales';
import { parseJsonOutput } from '../utils/parse-json-output';
import { promptHash } from '../utils/prompt-hash';
import { buildAiResponseMeta, type AiServiceResult } from '../utils/ai-response-meta';

// Zod schema + type imported from shared types for frontend reuse
import { followUpDetectionSchema, type FollowUpDetectionOutput } from '../types/follow-up.types';
export { followUpDetectionSchema, type FollowUpDetectionOutput } from '../types/follow-up.types';

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

// Per-tenant concurrency: max 1 concurrent detection per tenant
const TENANT_LOCK_PREFIX = 'pmsync:followup-detect:lock:';
const TENANT_LOCK_TTL_S = 120; // 2 min auto-expire (safety net)
// Batch size limit: prevent large tenants from overloading a single LLM call
const MAX_EMAILS_PER_BATCH = 50;

@Injectable()
export class FollowUpDetectionService implements OnModuleInit {
  private readonly logger = new Logger(FollowUpDetectionService.name);
  private readonly detectionVersion = 'follow-up-detection-v1';
  private redis!: Redis;

  constructor(
    private readonly mistralProvider: OpenRouterProviderService,
    private readonly prisma: PrismaService,
    @Optional() private readonly redisConnection?: RedisConnectionService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
    @Optional() private readonly ledgerService?: AiRunLedgerService,
  ) {}

  onModuleInit() {
    if (this.redisConnection) {
      this.redis = this.redisConnection.client;
    }
  }

  /**
   * Acquire per-tenant lock. Returns true if acquired, false if another detection is running.
   * Lock auto-expires after TENANT_LOCK_TTL_S to prevent deadlock from crashed workers.
   */
  private async acquireTenantLock(tenantId: string): Promise<boolean> {
    if (!this.redis) return true; // No Redis = no locking (test/dev)
    try {
      const result = await this.redis.set(
        `${TENANT_LOCK_PREFIX}${tenantId}`, '1', 'EX', TENANT_LOCK_TTL_S, 'NX',
      );
      return result === 'OK';
    } catch (err) {
      this.logger.warn(`Follow-up lock acquire failed for ${tenantId}: ${err instanceof Error ? err.message : String(err)}`);
      return true; // Fail open — don't block detection if Redis is down
    }
  }

  private releaseTenantLock(tenantId: string): void {
    if (!this.redis) return;
    this.redis.del(`${TENANT_LOCK_PREFIX}${tenantId}`).catch((err) => {
      this.logger.warn(`Follow-up lock release failed for ${tenantId}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Detect follow-ups in recent emails within a time window.
   * Per-tenant concurrency: max 1 concurrent detection per tenant.
   * Batch limit: max 50 emails per LLM call to prevent prompt overflow.
   * @param tenantId Tenant ID
   * @param hoursWindow Hours to look back (default: 24)
   */
  async detectFollowUps(
    tenantId: string,
    hoursWindow = 24,
    locale?: string,
  ): Promise<AiServiceResult<FollowUpDetectionOutput>> {
    // Per-tenant concurrency guard
    const lockAcquired = await this.acquireTenantLock(tenantId);
    if (!lockAcquired) {
      this.logger.debug(`Follow-up detection skipped for tenant ${tenantId}: already running`);
      return {
        data: {
          detectedFollowUps: [],
          batchSummary: { totalAnalyzed: 0, totalDetected: 0, highUrgencyCount: 0 },
        },
        meta: buildAiResponseMeta({
          operation: 'follow-up-detection',
          version: this.detectionVersion,
          source: 'cache',
          locale,
          model: this.mistralProvider.getChatModelName(),
          warnings: ['concurrent_detection_skipped'],
        }),
      };
    }

    try {
      return await this.detectFollowUpsInternal(tenantId, hoursWindow, locale);
    } finally {
      this.releaseTenantLock(tenantId);
    }
  }

  private async detectFollowUpsInternal(
    tenantId: string,
    hoursWindow: number,
    locale?: string,
  ): Promise<AiServiceResult<FollowUpDetectionOutput>> {
    const cutoffDate = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);

    // 1. Fetch recent emails — skip already-triaged (they get follow-ups from TriageActionService)
    //    Batch limit: cap at MAX_EMAILS_PER_BATCH to prevent prompt overflow
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
      take: MAX_EMAILS_PER_BATCH,
    });

    if (recentEmails.length === 0) {
      return {
        data: {
          detectedFollowUps: [],
          batchSummary: { totalAnalyzed: 0, totalDetected: 0, highUrgencyCount: 0 },
        },
        meta: buildAiResponseMeta({
          operation: 'follow-up-detection',
          version: this.detectionVersion,
          source: 'live',
          locale,
          model: this.mistralProvider.getChatModelName(),
        }),
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
  ): Promise<AiServiceResult<FollowUpDetectionOutput>> {
    const systemPrompt = buildSystemPrompt(locale);
    const modelName = this.mistralProvider.getChatModelName();

    // Attempt 1: generateObject (structured output)
    const attempt1 = await this.tryGenerateObject(batchPrompt, systemPrompt, modelName, tenantId);
    if (attempt1) {
      await this.trackUsage();
      await this.persistDetectedFollowUps(attempt1, tenantId);
      return {
        data: attempt1,
        meta: buildAiResponseMeta({
          operation: 'follow-up-detection',
          version: this.detectionVersion,
          source: 'live',
          locale,
          model: modelName,
        }),
      };
    }

    // Attempt 2: generateText + manual JSON extraction (fallback)
    const attempt2 = await this.tryGenerateText(batchPrompt, systemPrompt, modelName, tenantId);
    if (attempt2) {
      await this.trackUsage();
      await this.persistDetectedFollowUps(attempt2, tenantId);
      return {
        data: attempt2,
        meta: buildAiResponseMeta({
          operation: 'follow-up-detection',
          version: this.detectionVersion,
          source: 'live',
          locale,
          model: modelName,
          warnings: ['structured_output_unavailable'],
        }),
      };
    }

    this.logger.error('Follow-up detection failed on all attempts');
    return {
      data: {
        detectedFollowUps: [],
        batchSummary: { totalAnalyzed, totalDetected: 0, highUrgencyCount: 0 },
      },
      meta: buildAiResponseMeta({
        operation: 'follow-up-detection',
        version: this.detectionVersion,
        source: 'fallback',
        locale,
        model: modelName,
        degraded: true,
        warnings: ['follow_up_detection_failed'],
      }),
      error: 'Follow-up detection failed',
    };
  }

  private async tryGenerateObject(
    prompt: string, systemPrompt: string, modelName: string, tenantId: string,
  ): Promise<FollowUpDetectionOutput | null> {
    const startTime = Date.now();
    try {
      const result = await generateObject({
        model: this.mistralProvider.getChatModel(),
        schema: followUpDetectionSchema,
        schemaName: 'FollowUpDetection',
        system: systemPrompt,
        prompt,
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(45_000),
      });
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'follow-up-detection', model: modelName,
        promptTokens: result.usage?.inputTokens ?? 0, completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0, latencyMs: Date.now() - startTime,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return result.object;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`generateObject failed for follow-up detection: ${msg}`);
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'follow-up-detection', model: modelName,
        promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED, errorMessage: `generateObject: ${msg}`,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return null;
    }
  }

  private async tryGenerateText(
    prompt: string, systemPrompt: string, modelName: string, tenantId: string,
  ): Promise<FollowUpDetectionOutput | null> {
    const startTime = Date.now();
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(),
        system: systemPrompt,
        prompt: prompt + '\n\nReturn valid JSON.',
        abortSignal: AbortSignal.timeout(45_000),
      });
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'follow-up-detection', model: modelName,
        promptTokens: result.usage?.inputTokens ?? 0, completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0, latencyMs: Date.now() - startTime,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return parseJsonOutput(result.text, followUpDetectionSchema);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`generateText fallback failed for follow-up detection: ${msg}`);
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'follow-up-detection', model: modelName,
        promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED, errorMessage: `generateText: ${msg}`,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return null;
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
