import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { weightCorrection } from '../utils/triage-correction-weight';
import {
  ACCURACY_APPLIED_TOPIC,
  type LabelAccuracyEvent,
} from './label-accuracy.events';

export type FeedbackType =
  | 'label_correction'
  | 'lane_correction'
  | 'followup_dismiss'
  | 'urgency_correction';

export type FeedbackSignal = 'edit' | 'correction';

export interface TriageFeedbackEntry {
  id: string;
  tenantId: string;
  emailId: string;
  type: FeedbackType;
  signal: FeedbackSignal;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
}

export interface OverrideSuggestion {
  type: 'sender' | 'domain';
  pattern: string;
  suggestedAction: string;
  correctionCount: number;
}

export interface TriageSuggestion {
  scope: 'sender' | 'domain';
  pattern: string;
  target: string;
  count: number;
  totalAtScope: number;
}

const MAX_FEEDBACK_PER_TENANT = 10000;
const RETENTION_DAYS = 30;
const LOOKBACK_DAYS = 30;

// Phase 147 D-03 + D-04 promotion rules
const MIN_CORRECTIONS_FOR_PROMOTION = 3;
const CONCENTRATION_RATIO = 0.8;
const MIN_CORRECTIONS_FOR_DOMAIN = 8;
// Phase 150 B-1: exported for reuse by triage-affinity-promotion.helpers
export const MIN_DISTINCT_SENDERS_FOR_DOMAIN = 3;

// RFC 2142 + SaneBox anti-pattern exclusion list (D-04)
// Phase 150 B-1: exported for reuse by triage-affinity-promotion.helpers
export const ROLE_ACCOUNT_LOCAL_PARTS = new Set([
  'noreply', 'no-reply', 'notifications', 'billing', 'support', 'info', 'admin',
  'mailer-daemon', 'postmaster', 'root', 'webmaster', 'hostmaster',
  'news', 'marketing', 'sales', 'helpdesk', 'abuse', 'security',
]);

@Injectable()
export class TriageFeedbackService {
  private readonly logger = new Logger(TriageFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2, // W-3: appended as LAST argument
  ) {}

  /**
   * Records a single feedback row. Phase 147 D-01: `signal` is required — caller
   * must explicitly tag whether this came from the auto-diff path (`edit`) or the
   * explicit correction endpoint (`correction`).
   */
  async recordFeedback(params: {
    tenantId: string;
    emailId: string;
    type: FeedbackType;
    signal: FeedbackSignal;
    oldValue?: string | null;
    newValue?: string | null;
  }): Promise<TriageFeedbackEntry> {
    const { tenantId, emailId, type, signal, oldValue = null, newValue = null } = params;

    await this.pruneOldFeedback(tenantId);

    const entry = await this.prisma.emailTriageFeedback.create({
      data: { tenantId, emailId, type, signal, oldValue, newValue },
    });

    // Phase 148 D-05: fire-and-forget upstream emit for LabelAccuracyListener.
    // NEVER wrapped in a transaction (Phase 147 D-01 discipline). emit AFTER the
    // Prisma create returns. Try/catch prevents a poisoned handler from
    // corrupting the feedback write.
    try {
      const event: LabelAccuracyEvent = {
        tenantId,
        feedbackId: entry.id,
        emailId,
        signal,
        oldLabelName: oldValue ?? null,
        newLabelName: newValue ?? null,
        at: new Date().toISOString(),
      };
      this.eventEmitter.emit(ACCURACY_APPLIED_TOPIC, event);
    } catch (err) {
      this.logger.warn(
        `Accuracy event emit failed (feedbackId=${entry.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.logger.log(
      `Feedback recorded: ${type} [${signal}] for email=${emailId} (${oldValue} → ${newValue})`,
    );
    return entry as TriageFeedbackEntry;
  }

  /**
   * D-01 auto-diff path. Compares old and new label arrays on an email PATCH
   * and records feedback ONLY for meaningful corrections.
   *
   * Classification:
   *   - removed_ai_label: old has X, new does not → recordFeedback({signal:'edit', oldValue:X})
   *   - added_back_correction: new has X, old did not, X previously AI-suggested for this sender
   *       → recordFeedback({signal:'edit', newValue:X})
   *   - added_personal_label: new has X, X never AI-suggested → NO-OP (don't poison learning)
   *   - pure_reorder: same set, different order → NO-OP
   *
   * "X previously AI-suggested" heuristic: label X appears in this email's aiLabels
   * OR in aiLabels of any other email from the same sender.
   */
  async captureLabelDiff(
    tenantId: string,
    emailId: string,
    oldLabels: string[] | null | undefined,
    newLabels: string[] | null | undefined,
  ): Promise<void> {
    const oldSet = new Set(oldLabels ?? []);
    const newSet = new Set(newLabels ?? []);

    // pure_reorder / identical
    if (oldSet.size === newSet.size && [...oldSet].every((l) => newSet.has(l))) {
      return;
    }

    // removed labels
    const removed = [...oldSet].filter((l) => !newSet.has(l));
    for (const label of removed) {
      await this.recordFeedback({
        tenantId,
        emailId,
        type: 'label_correction',
        signal: 'edit',
        oldValue: label,
        newValue: null,
      });
    }

    const added = [...newSet].filter((l) => !oldSet.has(l));
    if (added.length === 0) return;

    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: { from: true, aiLabels: true },
    });
    if (!email?.from) return;

    for (const label of added) {
      const aiLabels = email.aiLabels ?? [];
      const wasEverAiSuggested =
        aiLabels.includes(label) ||
        (await this.prisma.email.count({
          where: {
            tenantId,
            from: { equals: email.from, mode: 'insensitive' },
            aiLabels: { has: label },
          },
        })) > 0;

      if (wasEverAiSuggested) {
        await this.recordFeedback({
          tenantId,
          emailId,
          type: 'label_correction',
          signal: 'edit',
          oldValue: null,
          newValue: label,
        });
      }
      // else: added_personal_label — silent no-op
    }
  }

  /**
   * Phase 147 D-03 + D-04: concentration-ratio promotion with asymmetric
   * sender/domain thresholds and RFC 2142 role-account exclusion. Only
   * `signal='correction'` rows count toward promotion math.
   */
  async getSuggestions(tenantId: string): Promise<TriageSuggestion[]> {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const feedback = await this.prisma.emailTriageFeedback.findMany({
      where: {
        tenantId,
        signal: 'correction', // D-03: edit rows are drift-detection only
        type: { in: ['label_correction', 'lane_correction'] },
        createdAt: { gte: cutoff },
      },
      select: { emailId: true, type: true, newValue: true, createdAt: true },
    });

    if (feedback.length === 0) return [];

    const emailIds = Array.from(new Set(feedback.map((f) => f.emailId)));
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, from: true },
    });
    const fromById = new Map(
      emails.map((e) => [e.id, (e.from ?? '').toLowerCase().trim()]),
    );

    const now = Date.now();
    const senderBuckets = new Map<string, Map<string, { weighted: number; raw: number }>>();
    const domainBuckets = new Map<
      string,
      Map<string, { weighted: number; raw: number; senders: Set<string> }>
    >();

    for (const row of feedback) {
      const sender = fromById.get(row.emailId);
      if (!sender || !row.newValue) continue;

      const ageDays = Math.max(
        0,
        (now - row.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      const w = weightCorrection(ageDays); // Phase 147: 1 if <=30d else 0 (D-12)
      if (w === 0) continue;

      let sB = senderBuckets.get(sender);
      if (!sB) {
        sB = new Map();
        senderBuckets.set(sender, sB);
      }
      const sExisting = sB.get(row.newValue);
      if (sExisting) {
        sExisting.weighted += w;
        sExisting.raw += 1;
      } else {
        sB.set(row.newValue, { weighted: w, raw: 1 });
      }

      const domain = extractDomain(sender);
      if (!domain) continue;

      let dB = domainBuckets.get(domain);
      if (!dB) {
        dB = new Map();
        domainBuckets.set(domain, dB);
      }
      const dExisting = dB.get(row.newValue);
      if (dExisting) {
        dExisting.weighted += w;
        dExisting.raw += 1;
        dExisting.senders.add(sender);
      } else {
        dB.set(row.newValue, {
          weighted: w,
          raw: 1,
          senders: new Set([sender]),
        });
      }
    }

    const suggestions: TriageSuggestion[] = [];

    // Sender promotion: ≥3 corrections AND ≥80% concentration on one target
    for (const [sender, targets] of senderBuckets.entries()) {
      const total = Array.from(targets.values()).reduce((n, v) => n + v.raw, 0);
      if (total < MIN_CORRECTIONS_FOR_PROMOTION) continue;
      for (const [target, v] of targets.entries()) {
        if (
          v.raw / total >= CONCENTRATION_RATIO &&
          v.raw >= MIN_CORRECTIONS_FOR_PROMOTION
        ) {
          suggestions.push({
            scope: 'sender',
            pattern: sender,
            target,
            count: v.raw,
            totalAtScope: total,
          });
        }
      }
    }

    // Domain promotion: ≥8 corrections AND ≥3 distinct senders AND no role-account contributors
    for (const [domain, targets] of domainBuckets.entries()) {
      const total = Array.from(targets.values()).reduce((n, v) => n + v.raw, 0);
      if (total < MIN_CORRECTIONS_FOR_DOMAIN) continue;
      for (const [target, v] of targets.entries()) {
        if (v.raw < MIN_CORRECTIONS_FOR_DOMAIN) continue;
        if (v.senders.size < MIN_DISTINCT_SENDERS_FOR_DOMAIN) continue;
        if (v.raw / total < CONCENTRATION_RATIO) continue;
        const hasRoleAccount = [...v.senders].some((s) => {
          const local = s.split('@')[0]?.toLowerCase() ?? '';
          return ROLE_ACCOUNT_LOCAL_PARTS.has(local);
        });
        if (hasRoleAccount) continue;
        suggestions.push({
          scope: 'domain',
          pattern: domain,
          target,
          count: v.raw,
          totalAtScope: total,
        });
      }
    }

    return suggestions;
  }

  private async pruneOldFeedback(tenantId: string): Promise<void> {
    const count = await this.prisma.emailTriageFeedback.count({ where: { tenantId } });
    if (count <= MAX_FEEDBACK_PER_TENANT) return;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.emailTriageFeedback.deleteMany({
      where: { tenantId, createdAt: { lt: cutoff } },
    });
  }
}

function extractDomain(from: string): string | null {
  const match = from.match(/@([^>\s]+)/);
  return match ? match[1].toLowerCase().trim() : null;
}
