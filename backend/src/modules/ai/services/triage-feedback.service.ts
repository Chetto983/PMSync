import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type FeedbackType =
  | 'label_correction'
  | 'lane_correction'
  | 'followup_dismiss'
  | 'urgency_correction';

export interface TriageFeedbackEntry {
  id: string;
  tenantId: string;
  emailId: string;
  type: FeedbackType;
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

const SUGGESTION_THRESHOLD = 3;
const MAX_FEEDBACK_PER_TENANT = 10000;
const RETENTION_DAYS = 30;

@Injectable()
export class TriageFeedbackService {
  private readonly logger = new Logger(TriageFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordFeedback(
    tenantId: string,
    emailId: string,
    type: FeedbackType,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<TriageFeedbackEntry> {
    // Enforce retention: prune old entries
    await this.pruneOldFeedback(tenantId);

    const entry = await this.prisma.emailTriageFeedback.create({
      data: { tenantId, emailId, type, oldValue, newValue },
    });

    this.logger.log(`Feedback recorded: ${type} for email=${emailId} (${oldValue} → ${newValue})`);
    return entry as TriageFeedbackEntry;
  }

  /**
   * Check if repeated corrections suggest creating an override.
   * Groups by sender domain and returns suggestions where count >= threshold.
   */
  async getSuggestions(tenantId: string): Promise<OverrideSuggestion[]> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const feedback = await this.prisma.emailTriageFeedback.findMany({
      where: {
        tenantId,
        type: { in: ['label_correction', 'lane_correction'] },
        createdAt: { gte: cutoff },
      },
      select: { emailId: true, type: true, newValue: true },
    });

    if (feedback.length === 0) return [];

    // Get email senders for the feedback entries
    const emailIds = [...new Set(feedback.map((f) => f.emailId))];
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, from: true },
    });

    const emailMap = new Map(emails.map((e) => [e.id, e.from]));

    // Group by sender domain + correction type
    const domainCounts = new Map<string, { count: number; action: string }>();

    for (const entry of feedback) {
      const from = emailMap.get(entry.emailId);
      if (!from || !entry.newValue) continue;

      const domain = extractDomain(from);
      if (!domain) continue;

      const key = `${domain}:${entry.newValue}`;
      const existing = domainCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        domainCounts.set(key, { count: 1, action: entry.newValue });
      }
    }

    const suggestions: OverrideSuggestion[] = [];
    for (const [key, { count, action }] of domainCounts) {
      if (count >= SUGGESTION_THRESHOLD) {
        const [domain] = key.split(':');
        suggestions.push({
          type: 'domain',
          pattern: domain,
          suggestedAction: mapCorrectionToAction(action),
          correctionCount: count,
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
  const match = from.match(/@([^>]+)/);
  return match ? match[1].toLowerCase().trim() : null;
}

function mapCorrectionToAction(newValue: string): string {
  if (newValue === 'action-now') return 'always-important';
  if (newValue === 'review-later') return 'always-review-later';
  if (newValue === 'system-alerts') return 'always-system-alert';
  return 'always-review-later';
}
