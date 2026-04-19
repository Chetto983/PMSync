import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface FewShotExample {
  pattern: string;
  oldValue: string;
  newValue: string;
  count: number;
}

const LOOKBACK_DAYS = 30;
const MAX_EXAMPLES = 3;
const DECAY_HALF_LIFE_DAYS = 14;

/**
 * Returns few-shot examples of how a tenant has corrected AI label
 * suggestions for a given sender. Used by EmailAnalysisService.
 *
 * Decay: count * exp(-ageDays / 14). Phase 149 will unify with
 * the `weightCorrection` helper; Phase 147 intentionally uses
 * exponential decay here while `weightCorrection` is still flat
 * (D-12 divergence note in 147-CONTEXT.md).
 */
@Injectable()
export class TriageCorrectionService {
  private readonly logger = new Logger(TriageCorrectionService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getFewShotExamples(
    tenantId: string,
    senderFrom: string,
  ): Promise<FewShotExample[]> {
    const domain = this.extractDomain(senderFrom);
    const sender = senderFrom?.toLowerCase().trim() ?? '';
    if (!sender) return [];

    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.emailTriageFeedback.findMany({
      where: {
        tenantId,
        type: 'label_correction',
        signal: 'correction',
        createdAt: { gte: cutoff },
      },
      select: {
        emailId: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) return [];

    const emailIds = Array.from(new Set(rows.map((r) => r.emailId)));
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, from: true },
    });
    const fromById = new Map(
      emails.map((e) => [e.id, (e.from ?? '').toLowerCase().trim()]),
    );

    const now = Date.now();
    const senderBucket = new Map<string, FewShotExample>();
    const domainBucket = new Map<string, FewShotExample>();

    const accumulate = (
      bucket: Map<string, FewShotExample>,
      pattern: string,
      row: (typeof rows)[number],
    ) => {
      const target = row.newValue ?? '';
      if (!target) return;
      const ageDays = Math.max(
        0,
        (now - row.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      const weight = Math.exp(-ageDays / DECAY_HALF_LIFE_DAYS);
      const existing = bucket.get(target);
      if (existing) {
        existing.count += weight;
      } else {
        bucket.set(target, {
          pattern,
          oldValue: row.oldValue ?? '',
          newValue: target,
          count: weight,
        });
      }
    };

    for (const row of rows) {
      const rowFrom = fromById.get(row.emailId) ?? '';
      if (rowFrom === sender) accumulate(senderBucket, sender, row);
      const rowDomain = this.extractDomain(rowFrom);
      if (rowDomain && domain && rowDomain === domain) {
        accumulate(domainBucket, domain, row);
      }
    }

    const sorted = (b: Map<string, FewShotExample>) =>
      Array.from(b.values()).sort((a, b2) => b2.count - a.count);

    const senderExamples = sorted(senderBucket);
    if (senderExamples.length >= 2) {
      return senderExamples.slice(0, MAX_EXAMPLES);
    }

    const seen = new Set(senderExamples.map((e) => e.newValue));
    const topUp = sorted(domainBucket).filter((e) => !seen.has(e.newValue));
    return [...senderExamples, ...topUp].slice(0, MAX_EXAMPLES);
  }

  private extractDomain(from: string | null | undefined): string | null {
    if (!from) return null;
    const match = from.match(/@([^>\s]+)/);
    return match ? match[1].toLowerCase().trim() : null;
  }
}
