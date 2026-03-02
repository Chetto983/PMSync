/**
 * Relationship Score Service
 *
 * Pure algorithmic scoring for contact relationships.
 * Uses recency/frequency/reciprocity/trend weighted scoring.
 * NO LLM calls -- all computations are data-driven via Prisma queries.
 *
 * Weights: Recency 40%, Frequency 30%, Reciprocity 20%, Trend 10%
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────

export interface RelationshipScore {
  contactId: string;
  name: string;
  totalScore: number;        // 0-100
  recencyScore: number;      // 0-100
  frequencyScore: number;    // 0-100
  reciprocityScore: number;  // 0-100
  trendScore: number;        // 0-100
  trend: 'increasing' | 'stable' | 'decreasing';
  lastInteractedAt: Date | null;
  totalInteractions: number;
}

export interface StaleContact {
  contactId: string;
  name: string;
  daysSinceContact: number;
  previousFrequency: string;  // e.g., "weekly", "monthly"
  suggestedAction: string;    // e.g., "Send a check-in email"
}

interface RelationshipScoreOptions {
  limit?: number;
  minScore?: number;
}

interface StaleContactOptions {
  daysSince?: number;
  limit?: number;
}

interface ContactWithEmails {
  id: string;
  tenantId: string;
  displayName: string | null;
  lastInteractedAt: Date | null;
  totalInteractions: number;
  sentCount: number;
  receivedCount: number;
  emails: Array<{ value: string }> | null;
}

interface EmailInteraction {
  id: string;
  from: string;
  receivedAt: Date;
}

// ─── Service ────────────────────────────────────────────────────

@Injectable()
export class RelationshipScoreService {
  private readonly logger = new Logger(RelationshipScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute weighted relationship scores for contacts.
   *
   * Score breakdown:
   *  - Recency  40%: exponential decay from last interaction
   *  - Frequency 30%: normalized email count in last 90 days
   *  - Reciprocity 20%: balance ratio between sent/received
   *  - Trend 10%: comparison of last 30d vs prior 30d activity
   */
  async getRelationshipScores(
    tenantId: string,
    options?: RelationshipScoreOptions,
  ): Promise<RelationshipScore[]> {
    const limit = options?.limit ?? 20;
    const minScore = options?.minScore ?? 0;

    // Fetch contacts with email metadata
    const contacts = await this.prisma.$queryRaw<ContactWithEmails[]>`
      SELECT id, "tenantId", "displayName", "lastInteractedAt",
             "totalInteractions", "sentCount", "receivedCount", emails
      FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND "totalInteractions" > 0
      ORDER BY "totalInteractions" DESC
      LIMIT 200
    `;

    if (contacts.length === 0) {
      return [];
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Collect all contact emails for batch querying
    const contactEmailMap = new Map<string, string[]>();
    for (const contact of contacts) {
      const emailValues = this.extractEmailValues(contact.emails);
      if (emailValues.length > 0) {
        contactEmailMap.set(contact.id, emailValues);
      }
    }

    // Batch query: get recent email interactions for all contact emails
    const allEmails = [...new Set(
      Array.from(contactEmailMap.values()).flat().map(e => e.toLowerCase()),
    )];

    if (allEmails.length === 0) {
      return [];
    }

    // Get emails from last 90 days involving any contact email
    const recentInteractions = await this.prisma.email.findMany({
      where: {
        tenantId,
        receivedAt: { gte: ninetyDaysAgo },
        OR: [
          { from: { in: allEmails } },
          { to: { hasSome: allEmails } },
        ],
      },
      select: { id: true, from: true, to: true, receivedAt: true },
      orderBy: { receivedAt: 'desc' },
    });

    // Index interactions by email address
    const interactionsByEmail = new Map<string, EmailInteraction[]>();
    for (const email of recentInteractions) {
      const fromLower = email.from.toLowerCase();
      if (allEmails.includes(fromLower)) {
        const list = interactionsByEmail.get(fromLower) ?? [];
        list.push(email);
        interactionsByEmail.set(fromLower, list);
      }
      for (const toAddr of email.to) {
        const toLower = toAddr.toLowerCase();
        if (allEmails.includes(toLower)) {
          const list = interactionsByEmail.get(toLower) ?? [];
          list.push(email);
          interactionsByEmail.set(toLower, list);
        }
      }
    }

    // Compute scores for each contact
    const scores: RelationshipScore[] = [];

    for (const contact of contacts) {
      const emailValues = contactEmailMap.get(contact.id);
      if (!emailValues) continue;

      // Gather all interactions for this contact's emails
      const contactInteractions = this.deduplicateInteractions(
        emailValues.flatMap(e => interactionsByEmail.get(e.toLowerCase()) ?? []),
      );

      const recencyScore = this.computeRecencyScore(contact.lastInteractedAt, now);
      const frequencyScore = this.computeFrequencyScore(contactInteractions.length);
      const reciprocityScore = this.computeReciprocityScore(
        contact.sentCount,
        contact.receivedCount,
      );
      const { score: trendScore, trend } = this.computeTrendScore(
        contactInteractions,
        thirtyDaysAgo,
        sixtyDaysAgo,
      );

      const totalScore = Math.round(
        recencyScore * 0.4 +
        frequencyScore * 0.3 +
        reciprocityScore * 0.2 +
        trendScore * 0.1,
      );

      if (totalScore >= minScore) {
        scores.push({
          contactId: contact.id,
          name: contact.displayName ?? 'Unknown',
          totalScore,
          recencyScore: Math.round(recencyScore),
          frequencyScore: Math.round(frequencyScore),
          reciprocityScore: Math.round(reciprocityScore),
          trendScore: Math.round(trendScore),
          trend,
          lastInteractedAt: contact.lastInteractedAt,
          totalInteractions: contact.totalInteractions,
        });
      }
    }

    // Sort by totalScore descending, then limit
    scores.sort((a, b) => b.totalScore - a.totalScore);
    return scores.slice(0, limit);
  }

  /**
   * Find contacts that haven't been interacted with recently.
   */
  async getStaleContacts(
    tenantId: string,
    options?: StaleContactOptions,
  ): Promise<StaleContact[]> {
    const daysSince = options?.daysSince ?? 30;
    const limit = options?.limit ?? 10;

    const cutoffDate = new Date(
      Date.now() - daysSince * 24 * 60 * 60 * 1000,
    );

    // Query contacts not interacted with since cutoff
    const staleContacts = await this.prisma.$queryRaw<
      Array<{
        id: string;
        displayName: string | null;
        lastInteractedAt: Date | null;
        totalInteractions: number;
      }>
    >`
      SELECT id, "displayName", "lastInteractedAt", "totalInteractions"
      FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND "totalInteractions" > 0
        AND (
          "lastInteractedAt" IS NULL
          OR "lastInteractedAt" < ${cutoffDate}
        )
      ORDER BY "lastInteractedAt" ASC NULLS FIRST
      LIMIT ${limit}
    `;

    const now = new Date();

    return staleContacts.map(contact => {
      const daysSinceContact = contact.lastInteractedAt
        ? Math.floor((now.getTime() - contact.lastInteractedAt.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const previousFrequency = this.classifyFrequency(contact.totalInteractions, daysSinceContact);
      const suggestedAction = this.suggestAction(daysSinceContact, contact.totalInteractions);

      return {
        contactId: contact.id,
        name: contact.displayName ?? 'Unknown',
        daysSinceContact,
        previousFrequency,
        suggestedAction,
      };
    });
  }

  // ─── Private helpers ────────────────────────────────────────

  private extractEmailValues(emails: Array<{ value: string }> | null): string[] {
    if (!emails || !Array.isArray(emails)) return [];
    return emails
      .filter(e => typeof e?.value === 'string')
      .map(e => e.value);
  }

  private deduplicateInteractions(interactions: EmailInteraction[]): EmailInteraction[] {
    const seen = new Set<string>();
    return interactions.filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }

  /** Recency: exponential decay with 30-day half-life */
  private computeRecencyScore(lastInteractedAt: Date | null, now: Date): number {
    if (!lastInteractedAt) return 0;
    const daysSince = (now.getTime() - lastInteractedAt.getTime()) / (24 * 60 * 60 * 1000);
    return Math.max(0, 100 * Math.exp(-daysSince / 30));
  }

  /** Frequency: capped linear scale -- 20 interactions in 90d = 100 */
  private computeFrequencyScore(interactionsIn90d: number): number {
    return Math.min(100, interactionsIn90d * 5);
  }

  /** Reciprocity: penalizes one-sided communication */
  private computeReciprocityScore(sentCount: number, receivedCount: number): number {
    const total = sentCount + receivedCount;
    if (total === 0) return 0;
    return 100 * (1 - Math.abs(sentCount - receivedCount) / total);
  }

  /** Trend: compare last 30d vs prior 30d interaction counts */
  private computeTrendScore(
    interactions: EmailInteraction[],
    thirtyDaysAgo: Date,
    sixtyDaysAgo: Date,
  ): { score: number; trend: 'increasing' | 'stable' | 'decreasing' } {
    const last30 = interactions.filter(i => i.receivedAt >= thirtyDaysAgo).length;
    const prior30 = interactions.filter(
      i => i.receivedAt >= sixtyDaysAgo && i.receivedAt < thirtyDaysAgo,
    ).length;

    if (prior30 === 0 && last30 === 0) {
      return { score: 50, trend: 'stable' };
    }
    if (prior30 === 0) {
      return { score: 100, trend: 'increasing' };
    }

    const ratio = last30 / prior30;
    if (ratio > 1.2) return { score: Math.min(100, 50 + ratio * 20), trend: 'increasing' };
    if (ratio < 0.8) return { score: Math.max(0, 50 - (1 / ratio) * 20), trend: 'decreasing' };
    return { score: 50, trend: 'stable' };
  }

  /** Classify previous interaction frequency from historical data */
  private classifyFrequency(totalInteractions: number, daysSinceContact: number): string {
    if (totalInteractions === 0) return 'none';
    // Estimate frequency from total interactions and staleness
    const estimatedDaysActive = Math.max(daysSinceContact, 30);
    const avgPerWeek = (totalInteractions / estimatedDaysActive) * 7;

    if (avgPerWeek >= 5) return 'daily';
    if (avgPerWeek >= 1) return 'weekly';
    if (avgPerWeek >= 0.25) return 'monthly';
    return 'occasional';
  }

  /** Suggest re-engagement action based on relationship strength */
  private suggestAction(daysSinceContact: number, totalInteractions: number): string {
    if (totalInteractions >= 20 && daysSinceContact > 60) {
      return 'Send a catch-up email -- you used to communicate frequently';
    }
    if (totalInteractions >= 10 && daysSinceContact > 30) {
      return 'Send a check-in email to maintain the relationship';
    }
    if (daysSinceContact > 90) {
      return 'Consider reconnecting -- it has been over 3 months';
    }
    return 'Send a brief follow-up to stay in touch';
  }
}
