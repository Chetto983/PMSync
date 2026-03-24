import { Injectable, Logger } from '@nestjs/common';
import type { EmailSearchResult, RerankableEmailResult } from './search-types';

export type { RerankableEmailResult };

/**
 * RerankingService — Lightweight heuristic post-RRF scoring for email results.
 *
 * Two-phase adjustment inspired by Gmail Priority Inbox + Milvus decay patterns:
 *   Phase 1 (multiplicative): recency decay — scales with relevance
 *   Phase 2 (additive): thread coherence + priority boost — capped metadata bonuses
 *
 * No external API calls, runs in <1ms on typical result sets.
 *
 * Graph RAG Step 2
 */
@Injectable()
export class RerankingService {
  private readonly logger = new Logger(RerankingService.name);

  /** Half-life for recency decay in days (score halves every 14 days) */
  private static readonly RECENCY_HALF_LIFE_DAYS = 14;
  /** ln(2) precomputed */
  private static readonly LN2 = Math.LN2;
  /** Minimum recency factor — old emails never fully disappear */
  private static readonly MIN_RECENCY_FACTOR = 0.5;

  /** Thread coherence bonus (additive) */
  private static readonly THREAD_BONUS = 0.10;
  /** Minimum RRF score to qualify as thread anchor */
  private static readonly THREAD_ANCHOR_THRESHOLD = 0.4;

  /** Priority additive bonuses */
  private static readonly PRIORITY_BONUSES: Record<string, number> = {
    URGENT: 0.10,
    HIGH: 0.05,
  };

  /** Maximum total additive bonus to prevent stacking */
  private static readonly MAX_ADDITIVE_BONUS = 0.15;

  /** Keyword match bonus — results containing query terms in subject/from */
  private static readonly KEYWORD_MATCH_BONUS = 0.20;

  /**
   * Rerank email results with heuristic scoring adjustments.
   *
   * @param results - Email results with RRF scores from hybrid search
   * @param query - Original search query (for keyword match boosting)
   * @returns Reranked results sorted by adjusted score
   */
  rerank(results: RerankableEmailResult[], query?: string): RerankableEmailResult[] {
    if (results.length <= 1) return results;

    // ── Phase 0: Min-max normalize RRF scores to [0, 1] ────────
    const scores = results.map((r) => r.rrfScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore || 1; // avoid division by zero

    const normalized = results.map((r) => ({
      ...r,
      normalizedScore: (r.rrfScore - minScore) / scoreRange,
    }));

    // ── Phase 1: Multiplicative — recency decay ────────────────
    const now = Date.now();
    for (const result of normalized) {
      const recencyFactor = this.computeRecencyFactor(result.receivedAt, now);
      result.normalizedScore *= recencyFactor;
    }

    // ── Phase 2: Additive — thread coherence + priority ────────
    // Collect thread anchors (high-scoring results that define thread clusters)
    const threadAnchors = new Set<string>();
    for (const result of normalized) {
      if (
        result.threadId &&
        result.normalizedScore >= RerankingService.THREAD_ANCHOR_THRESHOLD
      ) {
        threadAnchors.add(result.threadId);
      }
    }

    // Extract query keywords for keyword match boosting (3+ chars, lowered)
    const queryTerms = query
      ? query
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length >= 3)
      : [];

    for (const result of normalized) {
      let additiveBonus = 0;

      // Keyword match: boost results where query terms appear in subject/from
      if (queryTerms.length > 0) {
        const haystack = [result.subject, result.from]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const matchCount = queryTerms.filter((t) => haystack.includes(t)).length;
        if (matchCount > 0) {
          const matchRatio = matchCount / queryTerms.length;
          additiveBonus += RerankingService.KEYWORD_MATCH_BONUS * matchRatio;
        }
      }

      // Thread coherence: boost if same thread as a high-scoring result
      if (result.threadId && threadAnchors.has(result.threadId)) {
        // Don't self-boost anchors, only boost non-anchor siblings
        const isAnchor =
          result.normalizedScore >= RerankingService.THREAD_ANCHOR_THRESHOLD;
        if (!isAnchor) {
          additiveBonus += RerankingService.THREAD_BONUS;
        }
      }

      // Priority boost
      if (result.aiPriority) {
        const priorityBonus =
          RerankingService.PRIORITY_BONUSES[result.aiPriority] ?? 0;
        additiveBonus += priorityBonus;
      }

      // Cap total additive bonus
      result.normalizedScore += Math.min(
        additiveBonus,
        RerankingService.MAX_ADDITIVE_BONUS + RerankingService.KEYWORD_MATCH_BONUS,
      );
    }

    // ── Sort by adjusted score descending ──────────────────────
    normalized.sort((a, b) => b.normalizedScore - a.normalizedScore);

    // Write back adjusted scores as rrfScore for downstream consumption
    return normalized.map(({ normalizedScore, ...rest }) => ({
      ...rest,
      rrfScore: normalizedScore,
    }));
  }

  /**
   * Exponential recency decay.
   * Returns a factor in [MIN_RECENCY_FACTOR, 1.0].
   *
   * Formula: max(MIN, exp(-ln2 / halfLife * ageDays))
   * At halfLife days old → factor = 0.5
   * At 0 days old → factor = 1.0
   * At 2*halfLife days → factor = 0.25 (clamped to MIN)
   */
  private computeRecencyFactor(
    receivedAt: Date | null,
    nowMs: number,
  ): number {
    if (!receivedAt) return RerankingService.MIN_RECENCY_FACTOR;

    const ageDays =
      (nowMs - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 0) return 1.0;

    const decay = Math.exp(
      (-RerankingService.LN2 / RerankingService.RECENCY_HALF_LIFE_DAYS) *
        ageDays,
    );
    return Math.max(decay, RerankingService.MIN_RECENCY_FACTOR);
  }
}
