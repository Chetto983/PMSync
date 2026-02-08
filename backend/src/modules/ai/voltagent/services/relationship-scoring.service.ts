/**
 * Relationship Scoring Service
 *
 * Extracted from RelationshipIntelligenceService (Phase 11-03).
 * Handles CRM relationship score calculation and recalculation.
 *
 * Score components:
 * - Recency (40%): How recently we interacted
 * - Frequency (30%): How often we interact
 * - Reciprocity (20%): Balance of sent vs received
 * - Trend (10%): Is interaction increasing or decreasing
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Score breakdown for a contact's relationship health.
 */
export interface RelationshipScoreComponents {
  recencyScore: number; // 0-40 points
  frequencyScore: number; // 0-30 points
  reciprocityScore: number; // 0-20 points
  trendScore: number; // 0-10 points
  totalScore: number; // 0-100
}

@Injectable()
export class RelationshipScoringService {
  private readonly logger = new Logger(RelationshipScoringService.name);

  // Score weights (from design doc)
  private readonly RECENCY_WEIGHT = 0.4;
  private readonly FREQUENCY_WEIGHT = 0.3;
  private readonly RECIPROCITY_WEIGHT = 0.2;
  private readonly TREND_WEIGHT = 0.1;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate relationship score for a contact.
   * Updates the contact's relationshipScore field.
   */
  async calculateRelationshipScore(
    tenantId: string,
    contactId: string,
  ): Promise<RelationshipScoreComponents> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: {
        lastInteractedAt: true,
        totalInteractions: true,
        sentCount: true,
        receivedCount: true,
        createdAt: true,
      },
    });

    if (!contact) {
      return {
        recencyScore: 0,
        frequencyScore: 0,
        reciprocityScore: 0,
        trendScore: 0,
        totalScore: 0,
      };
    }

    // 1. Recency Score (0-40 points)
    const recencyScore = this.calculateRecencyScore(contact.lastInteractedAt);

    // 2. Frequency Score (0-30 points)
    const frequencyScore = this.calculateFrequencyScore(
      contact.totalInteractions,
      contact.createdAt,
    );

    // 3. Reciprocity Score (0-20 points)
    const reciprocityScore = this.calculateReciprocityScore(
      contact.sentCount,
      contact.receivedCount,
    );

    // 4. Trend Score (0-10 points) - requires recent interaction data
    const trendScore = await this.calculateTrendScore(tenantId, contactId);

    const totalScore = Math.round(
      recencyScore + frequencyScore + reciprocityScore + trendScore,
    );

    // Update contact with new score
    await this.prisma.contact.updateMany({
      where: { id: contactId, tenantId },
      data: { relationshipScore: totalScore },
    });

    return {
      recencyScore: Math.round(recencyScore * 10) / 10,
      frequencyScore: Math.round(frequencyScore * 10) / 10,
      reciprocityScore: Math.round(reciprocityScore * 10) / 10,
      trendScore: Math.round(trendScore * 10) / 10,
      totalScore,
    };
  }

  /**
   * Batch recalculate scores for all contacts (for backfill job).
   */
  async recalculateAllScores(
    tenantId: string,
  ): Promise<{ updated: number; errors: number }> {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId, isDeleted: false, totalInteractions: { gt: 0 } },
      select: { id: true },
    });

    let updated = 0;
    let errors = 0;

    for (const contact of contacts) {
      try {
        await this.calculateRelationshipScore(tenantId, contact.id);
        updated++;
      } catch (err) {
        this.logger.error(
          `Error calculating score for contact ${contact.id}:`,
          err,
        );
        errors++;
      }
    }

    this.logger.log(
      `Recalculated scores for ${updated} contacts (${errors} errors)`,
    );
    return { updated, errors };
  }

  // ==========================================================================
  // Private Score Calculation Methods
  // ==========================================================================

  private calculateRecencyScore(lastInteraction: Date | null): number {
    if (!lastInteraction) return 0;

    const daysSince = Math.floor(
      (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Full points for < 7 days, decreasing score for older
    if (daysSince < 7) return 40;
    if (daysSince < 14) return 35;
    if (daysSince < 30) return 28;
    if (daysSince < 60) return 20;
    if (daysSince < 90) return 12;
    if (daysSince < 180) return 6;
    return 2;
  }

  private calculateFrequencyScore(
    totalInteractions: number,
    createdAt: Date,
  ): number {
    // Calculate interactions per month
    const monthsActive = Math.max(
      1,
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30),
    );
    const interactionsPerMonth = totalInteractions / monthsActive;

    // Score based on interaction frequency
    if (interactionsPerMonth >= 10) return 30;
    if (interactionsPerMonth >= 5) return 25;
    if (interactionsPerMonth >= 2) return 20;
    if (interactionsPerMonth >= 1) return 15;
    if (interactionsPerMonth >= 0.5) return 10;
    if (totalInteractions > 0) return 5;
    return 0;
  }

  private calculateReciprocityScore(
    sentCount: number,
    receivedCount: number,
  ): number {
    const total = sentCount + receivedCount;
    if (total === 0) return 0;

    // Calculate ratio of sent to received (ideal is 1.0)
    const ratio = sentCount / Math.max(1, receivedCount);

    // Score is highest when ratio is close to 1 (balanced conversation)
    // Penalize both one-sided sending and one-sided receiving
    if (ratio >= 0.8 && ratio <= 1.25) return 20; // Well balanced
    if (ratio >= 0.5 && ratio <= 2) return 15; // Somewhat balanced
    if (ratio >= 0.25 && ratio <= 4) return 10; // Imbalanced
    return 5; // Very one-sided
  }

  private async calculateTrendScore(
    tenantId: string,
    contactId: string,
  ): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Get interaction counts for recent vs previous period
    const [recentCount, previousCount] = await Promise.all([
      this.prisma.contactInteraction.count({
        where: { tenantId, contactId, date: { gte: thirtyDaysAgo } },
      }),
      this.prisma.contactInteraction.count({
        where: {
          tenantId,
          contactId,
          date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
    ]);

    // Score based on trend
    if (recentCount > previousCount * 1.5) return 10; // Strong upward trend
    if (recentCount > previousCount) return 7; // Slight upward trend
    if (recentCount === previousCount || (recentCount === 0 && previousCount === 0))
      return 5; // Stable
    if (recentCount >= previousCount * 0.5) return 3; // Slight downward trend
    return 0; // Strong downward trend
  }
}
