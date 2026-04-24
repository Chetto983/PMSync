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

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailInsightsService } from './email-insights.service';
import { InsightUtilsService } from './insight-utils.service';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { TriageActionService } from './triage-action.service';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';
import { CrmSuggestionTriggerService } from '../../crm/suggestion/services/crm-suggestion-trigger.service';
import { TriageOverrideService, MUTING_ACTIONS, ACTION_TO_LANE, extractEmail } from './triage-override.service';
// Phase 150 Plan 04: Layer 2 graph-memory lookup (D-03)
import { TriageGraphLookupService } from './triage-graph-lookup.service';

// Cost control constants
const MAX_TRIAGE_PER_BATCH = 20;
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
  // Sprint 15: New pipeline fields (persisted by analyzeEmailUnified)
  lane?: string | null;
  intent?: string;
  actionability?: 'none' | 'todo' | 'waiting';
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
export class EmailTriageService implements OnModuleInit {
  private readonly logger = new Logger(EmailTriageService.name);

  // SCALE PROTECTION: Redis sorted-set distributed semaphore
  // Each slot is a unique member with a timestamp score.
  // Stale slots (from crashed workers) auto-expire individually on every acquire/release.
  private redis!: Redis;

  private readonly SEMAPHORE_KEY = 'pmsync:triage-semaphore:slots';
  private readonly SEMAPHORE_MAX = MAX_CONCURRENT_TRIAGE_OPERATIONS; // 5
  private readonly SEMAPHORE_SLOT_TTL_MS = 5 * 60 * 1000; // 5 min per-slot TTL
  private currentSlotId: string | null = null;

  /**
   * Lua: remove expired slots, then add new slot if below max.
   * ARGV[1] = max slots, ARGV[2] = expiry cutoff timestamp, ARGV[3] = slot id, ARGV[4] = now timestamp
   * Returns 1 if acquired, 0 if at capacity.
   */
  private readonly ACQUIRE_SCRIPT = `
    redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[2])
    local count = redis.call("ZCARD", KEYS[1])
    if count < tonumber(ARGV[1]) then
      redis.call("ZADD", KEYS[1], ARGV[4], ARGV[3])
      return 1
    else
      return 0
    end
  `;

  /**
   * Lua: remove specific slot by member id, then clean expired.
   * ARGV[1] = slot id, ARGV[2] = expiry cutoff timestamp
   * Returns remaining count after removal.
   */
  private readonly RELEASE_SCRIPT = `
    redis.call("ZREM", KEYS[1], ARGV[1])
    redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[2])
    return redis.call("ZCARD", KEYS[1])
  `;

  // Phase 150 Plan 04 — graph-memory short-circuit cutoff. Constructed once at
  // DI time from TRIAGE_GRAPH_CONFIDENCE_CUTOFF env (default '9999' = disabled).
  private readonly graphCutoff: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailInsights: EmailInsightsService,
    private readonly subscriptionService: SubscriptionService,
    private readonly redisConnection: RedisConnectionService,
    // Phase 150 Plan 04 B-5: ConfigService is MANDATORY — no @Optional and no
    // default value. Placed before the @Optional() block to satisfy TS's
    // "required parameter cannot follow optional parameter" rule. Nest will
    // fail loudly if ConfigService isn't registered (no silent DI miss).
    private readonly configService: ConfigService,
    // Phase 150.1 WR-01 fix: direct injection of InsightUtilsService so the
    // graph short-circuit branch can write the EmailLabel junction rows that
    // power "emails-in-label" views. The LLM path already calls
    // linkEmailToUserLabels via email-analysis.service.ts:268; this restores
    // parity. Mandatory — InsightUtilsService is a provider on AiModule.
    private readonly insightUtils: InsightUtilsService,
    @Optional() private readonly triageActionService?: TriageActionService,
    @Optional() private readonly crmSuggestionTrigger?: CrmSuggestionTriggerService,
    @Optional() private readonly triageOverrideService?: TriageOverrideService,
    // Phase 150 Plan 04: graph lookup is @Optional (kill-switched via cutoff env).
    @Optional() private readonly triageGraphLookupService?: TriageGraphLookupService,
  ) {
    const rawCutoff = parseFloat(
      this.configService.get<string>('TRIAGE_GRAPH_CONFIDENCE_CUTOFF', '9999'),
    );
    this.graphCutoff = Number.isFinite(rawCutoff) ? rawCutoff : 9999;
  }

  onModuleInit() {
    this.redis = this.redisConnection.client;
  }

  /**
   * SCALE PROTECTION: Acquire distributed semaphore slot via Redis sorted set.
   * Each slot gets a unique ID and timestamp. Stale slots (older than SLOT_TTL_MS)
   * are cleaned up atomically during acquire, so crashed workers don't block the semaphore.
   * Fails closed: if Redis is down, triage is blocked (no LLM call storm).
   */
  private async acquireSemaphore(): Promise<boolean> {
    try {
      const now = Date.now();
      const expiryCutoff = now - this.SEMAPHORE_SLOT_TTL_MS;
      const slotId = `${process.pid}:${now}:${randomBytes(4).toString('hex')}`;

      const result = await this.redis.eval(
        this.ACQUIRE_SCRIPT, 1,
        this.SEMAPHORE_KEY,
        this.SEMAPHORE_MAX, expiryCutoff, slotId, now,
      );

      if (result === 1) {
        this.currentSlotId = slotId;
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Semaphore acquire failed: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Fail closed - don't allow triage if Redis is down
    }
  }

  /**
   * SCALE PROTECTION: Release distributed semaphore slot by removing its specific member.
   * Also cleans up any expired slots from other crashed workers.
   * Fire-and-forget: errors are logged but swallowed.
   */
  private releaseSemaphore(): void {
    const slotId = this.currentSlotId;
    if (!slotId) return;
    this.currentSlotId = null;

    const expiryCutoff = Date.now() - this.SEMAPHORE_SLOT_TTL_MS;
    this.redis.eval(
      this.RELEASE_SCRIPT, 1,
      this.SEMAPHORE_KEY,
      slotId, expiryCutoff,
    ).catch((err: unknown) => {
      this.logger.error(`Semaphore release failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Get current semaphore utilization (for monitoring/health endpoint).
   * Returns active slot count after cleaning expired entries.
   */
  async getSemaphoreUtilization(): Promise<{ active: number; max: number }> {
    try {
      const expiryCutoff = Date.now() - this.SEMAPHORE_SLOT_TTL_MS;
      await this.redis.zremrangebyscore(this.SEMAPHORE_KEY, '-inf', expiryCutoff);
      const active = await this.redis.zcard(this.SEMAPHORE_KEY);
      return { active, max: this.SEMAPHORE_MAX };
    } catch {
      return { active: -1, max: this.SEMAPHORE_MAX };
    }
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
      // Phase 147 D-07: override application BEFORE the LLM call.
      let overrideHint: string | null = null;
      let matchedOverrideAction: string | null = null;
      let suppressFollowUp = false;

      if (this.triageOverrideService) {
        const emailShape = await this.prisma.email.findFirst({
          where: { id: emailId, tenantId },
          select: { from: true, threadId: true, subject: true },
        });

        if (emailShape?.from) {
          const or = await this.triageOverrideService.applyOverrides(tenantId, {
            from: emailShape.from,
            threadId: emailShape.threadId,
          });

          if (or.matched && or.override) {
            matchedOverrideAction = or.override.action;
            suppressFollowUp = Boolean(or.suppressFollowUp);

            if (MUTING_ACTIONS.has(or.override.action)) {
              // D-07 muting short-circuit: write straight to DB, skip LLM entirely.
              //
              // Phase 147 CR-01 fix: a muting rule decides LANE, NOT labels or content.
              //   - Preserve aiLabels: the user may have corrected them via D-01 or
              //     the LLM pre-override; wiping them re-creates the very noise the
              //     feedback loop is trying to eliminate.
              //   - Null stale triage signals (aiPriority / aiPriorityReason /
              //     aiSentiment / aiCategory) so the row isn't internally inconsistent
              //     (e.g., aiLane='system-alerts' + aiPriority=1).
              //   - Preserve existing EmailAnalysis summary/keyPoints/suggestedActions
              //     on the upsert-update branch; the rule does not know anything
              //     about content, so it has no business clobbering prior analysis.
              const now = new Date();
              const mutingLane = ACTION_TO_LANE[or.override.action] ?? 'system-alerts';
              await this.prisma.email.updateMany({
                where: { id: emailId, tenantId },
                data: {
                  aiLane: mutingLane,
                  aiPriority: null,
                  aiPriorityReason: null,
                  aiSentiment: null,
                  aiCategory: null,
                  isAutoTriaged: true,
                  autoTriagedAt: now,
                },
              });
              // D-08: record triageSource='rule' on EmailAnalysis.
              // Required-no-default fields (emailId, tenantId) + Phase 147 provenance;
              // every other required column falls back to schema defaults on create.
              // On update we only touch lane/source/processedAt/modelUsed —
              // summary/keyPoints/suggestedActions stay as the LLM left them.
              await this.prisma.emailAnalysis.upsert({
                where: { emailId_tenantId: { emailId, tenantId } },
                update: {
                  triageSource: 'rule',
                  lane: mutingLane,
                  processedAt: now,
                  modelUsed: 'rule',
                },
                create: {
                  emailId,
                  tenantId,
                  triageSource: 'rule',
                  lane: mutingLane,
                  processedAt: now,
                  modelUsed: 'rule',
                },
              });
              this.logger.log(
                `Muting override short-circuit: ${or.override.pattern} -> ${or.override.action} (email=${emailId})`,
              );
              return {
                emailId,
                success: true,
                aiPriority: undefined,
                aiLabels: [],
                lane: mutingLane,
              };
            }
            // D-07 visible override: run LLM with hint, lane-forcing happens after parse
            // inside EmailAnalysisService (via matchedOverrideAction passthrough).
            overrideHint = `From ${or.override.pattern}: user has marked as ${or.override.action} — honor this`;
          }
        }
      }

      // Phase 150 Plan 04 D-03 Layer 2 graph lookup.
      // Open Q2 Option A: skip Layer 2 entirely if ANY override matched
      // (muting OR visible) — user's explicit rule beats inferred patterns.
      // Note: muting overrides have already returned above; here matchedOverrideAction
      // is only set for visible overrides that fall through to the LLM path.
      // B-4: non-short-circuit branch builds a structured graphHint that threads
      // into the LLM system prompt via AnalyzeEmailUnifiedOptions.graphHint.
      let graphHint:
        | { predictedLabel: string; confidence: number; source: 'sender' | 'domain' }
        | null = null;
      if (!matchedOverrideAction && this.triageGraphLookupService) {
        const emailForGraph = await this.prisma.email.findFirst({
          where: { id: emailId, tenantId },
          select: { from: true },
        });
        if (emailForGraph?.from) {
          const senderEmail = extractEmail(emailForGraph.from);
          if (senderEmail) {
            const g = await this.triageGraphLookupService.lookup(tenantId, senderEmail);
            if (g && g.confidence >= this.graphCutoff) {
              // SHORT-CIRCUIT — skip LLM, write triageSource=graph_sender|graph_domain.
              const now = new Date();
              // B-8: snake_case lock — Plan 05 Task 2 mirrors these in i18n.
              const triageSource: 'graph_sender' | 'graph_domain' =
                g.source === 'sender' ? 'graph_sender' : 'graph_domain';
              // Phase 150.1 WR-02 fix: null the cross-signals the graph path
              // does NOT know about. Graph short-circuit only predicts a LABEL;
              // aiPriority / aiLane / aiPriorityReason / aiSentiment / aiCategory
              // would otherwise survive from a prior LLM run (re-triage case)
              // or stay null (freshly-arrived case). Mirrors the muting-override
              // pattern at :327-338 (Phase 147 CR-01) — without this the row is
              // internally inconsistent (e.g., aiLabels=['Work'] + stale
              // aiLane='system-alerts' from a previous run). Lane-sort UIs and
              // "Urgent" filters downstream rely on the invariant that these
              // fields only hold values produced by the same triage pass that
              // wrote aiLabels.
              await this.prisma.email.updateMany({
                where: { id: emailId, tenantId },
                data: {
                  aiLabels: [g.predictedLabelName],
                  aiPriority: null,
                  aiPriorityReason: null,
                  aiSentiment: null,
                  aiCategory: null,
                  aiLane: null,
                  isAutoTriaged: true,
                  autoTriagedAt: now,
                },
              });
              await this.prisma.emailAnalysis.upsert({
                where: { emailId_tenantId: { emailId, tenantId } },
                update: { triageSource, processedAt: now, modelUsed: 'graph' },
                create: {
                  emailId,
                  tenantId,
                  triageSource,
                  processedAt: now,
                  modelUsed: 'graph',
                },
              });
              // Phase 150.1 WR-01 fix: wire the EmailLabel junction table so the
              // graph-short-circuited email shows up in label views.
              // LabelsService.getEmailsForLabel (labels.service.ts:749) filters on
              // emailLabels.some and would otherwise return empty. Parity with the
              // LLM path at email-analysis.service.ts:268. Callee resolves label
              // NAMES -> UserLabel.id internally (insight-utils.service.ts:89).
              await this.insightUtils.linkEmailToUserLabels(
                tenantId,
                emailId,
                [g.predictedLabelName],
              );
              this.logger.log(
                `Graph short-circuit: ${g.source} -> ${g.predictedLabelName} (conf=${g.confidence.toFixed(2)}, email=${emailId})`,
              );
              return {
                emailId,
                success: true,
                aiLabels: [g.predictedLabelName],
              };
            } else if (g) {
              // B-4: structured hint — analysis service converts to prompt text.
              graphHint = {
                predictedLabel: g.predictedLabelName,
                confidence: g.confidence,
                source: g.source,
              };
            }
          }
        }
      }

      // UNIFIED ANALYSIS: Single LLM call for all insights
      // analyzeEmailUnified() also saves to EmailAnalysis + Email tables
      const analysis = await this.emailInsights.analyzeEmailUnified(
        tenantId,
        emailId,
        locale,
        {
          includeSmartReplies: false,
          overrideHint,
          matchedOverrideAction,
          graphHint,
        },
      );

      this.logger.debug(
        `Triaged email ${emailId}: priority=${analysis.priority}, labels=${analysis.labels.join(',')}, sentiment=${analysis.sentiment}`,
      );

      // Post-triage hooks: fetch email metadata once for all hooks
      // Phase 147 D-07: suppress follow-up when never-follow-up override matched.
      const needsFollowUp = !suppressFollowUp && this.triageActionService && (
        analysis.actionability === 'todo' || analysis.actionability === 'waiting' ||
        analysis.needsFollowUp || analysis.hasDeadline
      );
      const needsCrmSuggestion = !!this.crmSuggestionTrigger;

      if (needsFollowUp || needsCrmSuggestion) {
        const email = await this.prisma.email.findFirst({
          where: { id: emailId, tenantId },
          select: { from: true, subject: true },
        });
        if (email) {
          // Phase CONSOLIDATION: Create follow-up records from triage signals (fire-and-forget)
          if (needsFollowUp) {
            this.triageActionService
              .processTriageSignals(
                { emailId, tenantId, userId: options.userId, from: email.from, subject: email.subject },
                analysis,
              )
              .catch((err) =>
                this.logger.warn(`Follow-up creation failed for ${emailId}: ${err instanceof Error ? err.message : String(err)}`),
              );
          }
          // Phase 4 CRM: Auto-populate CRM suggestions from triaged email (fire-and-forget)
          if (needsCrmSuggestion) {
            this.crmSuggestionTrigger
              .processTriagedEmail(tenantId, emailId, email.from, email.subject)
              .catch((err) =>
                this.logger.warn(`CRM suggestion trigger failed for ${emailId}: ${err instanceof Error ? err.message : String(err)}`),
              );
          }
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
        lane: analysis.lane,
        intent: analysis.intent,
        actionability: analysis.actionability,
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

    const triageOptions = {
      ...options,
      locale: await this.resolveTriageLocale(options),
    };

    try {
      this.logger.log(`Processing ${emailIds.length} emails for triage (tenant: ${options.tenantId})`);

      // Process sequentially with 500ms delay between calls (rate limit protection)
      const results: TriageResult[] = [];
      for (const emailId of emailIds) {
        const result = await this.triageEmail(emailId, triageOptions);
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

    const triageOptions = {
      ...options,
      locale: await this.resolveTriageLocale(options),
    };

    // Process sequentially
    const results: TriageResult[] = [];
    for (const emailId of limitedIds) {
      const result = await this.triageEmail(emailId, triageOptions);
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

  private async resolveTriageLocale(options: TriageOptions): Promise<string | undefined> {
    if (options.locale) {
      return options.locale;
    }

    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId: options.userId },
      select: { language: true },
    });

    return prefs?.language || undefined;
  }
}
