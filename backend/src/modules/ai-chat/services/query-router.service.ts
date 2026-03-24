import { Injectable, Logger } from '@nestjs/common';

/**
 * Query complexity tier for routing decisions.
 *
 * - simple: greetings, thanks, time queries — skip RAG tools entirely
 * - search: keyword/entity mentions — normal hybrid search path
 * - multi_hop: relationship queries — hint graph_context_search (Step 3)
 */
export type QueryComplexity = 'simple' | 'search' | 'multi_hop';

export interface QueryClassification {
  complexity: QueryComplexity;
  /** Confidence score 0-1 (heuristic-derived, not probabilistic) */
  confidence: number;
  /** Which signals fired (for debugging/logging) */
  signals: string[];
}

// ── Heuristic patterns ────────────────────────────────────────────────

/** Greeting / small-talk patterns — no RAG needed */
const SIMPLE_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|ciao|buongiorno|buonasera|salve|ehi)\b/i,
  /^(thanks|thank you|grazie|thx|ty|merci)\b/i,
  /^(ok|okay|va bene|perfetto|capito|got it|understood)\b/i,
  /^(bye|goodbye|arrivederci|a dopo|see you)\b/i,
  /^(yes|no|si|sì|no)\s*[.!?]?\s*$/i,
  /^(what time|che ora|che ore|current time)\b/i,
  /^(who are you|cosa sei|come ti chiami)\b/i,
  /^(help|aiuto|how do you work|come funzioni)\b/i,
];

/** Relationship / multi-hop signals — need graph traversal */
const MULTI_HOP_PATTERNS: RegExp[] = [
  /\b(from people|from contacts|from attendees)\b.*\b(who|that|met)\b/i,
  /\b(met|meeting|meetings)\b.*\b(about|regarding)\b/i,
  /\b(related to|connected to|linked to)\b/i,
  /\b(people I met)\b/i,
  /\b(chi ho incontrato|persone che ho visto)\b/i,
  /\b(thread|conversation|chain)\b.*\b(with|about)\b/i,
  /\b(everyone|tutti)\b.*\b(involved|coinvolti)\b/i,
  /\b(history with|storico con)\b/i,
];

/** Search keywords — explicit data retrieval intent */
const SEARCH_KEYWORDS: RegExp[] = [
  /\b(search|find|look for|show|list|get|read|open)\b/i,
  /\b(cerca|trova|mostra|elenca|leggi|apri)\b/i,
  /\b(email|mail|inbox|calendar|contact|event|meeting|reminder|follow.?up)\b/i,
  /\b(unread|starred|important|urgent|today|yesterday|last week)\b/i,
  /\b(send|reply|forward|draft|compose|write)\b/i,
  /\b(invia|rispondi|inoltra|bozza|scrivi)\b/i,
  /\b(schedule|reschedule|cancel|create|update|delete)\b/i,
  /\b(briefing|triage|summary|riassunto)\b/i,
  /\b(what do I know|what do you remember|memories)\b/i,
];

@Injectable()
export class QueryRouterService {
  private readonly logger = new Logger(QueryRouterService.name);

  /**
   * Classify a user query by complexity tier.
   * Pure heuristic — zero external calls, <1ms.
   */
  classify(query: string): QueryClassification {
    const trimmed = query.trim();
    const signals: string[] = [];

    // ── Tier 1: Simple detection ──────────────────────────────────
    // Short messages with greeting/ack patterns
    if (trimmed.length < 50) {
      for (const pattern of SIMPLE_PATTERNS) {
        if (pattern.test(trimmed)) {
          signals.push(`simple:${pattern.source.slice(0, 30)}`);
          return { complexity: 'simple', confidence: 0.95, signals };
        }
      }
    }

    // Very short messages with no search keywords are likely simple
    if (trimmed.length < 15 && trimmed.split(/\s+/).length <= 3) {
      const hasSearchKeyword = SEARCH_KEYWORDS.some((p) => p.test(trimmed));
      if (!hasSearchKeyword) {
        signals.push('simple:short_no_keywords');
        return { complexity: 'simple', confidence: 0.7, signals };
      }
    }

    // ── Tier 3: Multi-hop detection (check before search) ─────────
    let multiHopScore = 0;
    for (const pattern of MULTI_HOP_PATTERNS) {
      if (pattern.test(trimmed)) {
        multiHopScore++;
        signals.push(`multi_hop:${pattern.source.slice(0, 30)}`);
      }
    }
    if (multiHopScore >= 1) {
      return {
        complexity: 'multi_hop',
        confidence: Math.min(0.6 + multiHopScore * 0.15, 0.95),
        signals,
      };
    }

    // ── Tier 2: Search detection ──────────────────────────────────
    let searchScore = 0;
    for (const pattern of SEARCH_KEYWORDS) {
      if (pattern.test(trimmed)) {
        searchScore++;
        signals.push(`search:${pattern.source.slice(0, 30)}`);
      }
    }
    if (searchScore >= 1) {
      return {
        complexity: 'search',
        confidence: Math.min(0.6 + searchScore * 0.1, 0.95),
        signals,
      };
    }

    // ── Default: search (safe fallback — never skip tools by default) ─
    signals.push('default:no_match');
    return { complexity: 'search', confidence: 0.5, signals };
  }

  /**
   * Get tool domain exclusions based on query complexity.
   * Returns domain names to EXCLUDE from step 0.
   */
  getExcludedDomains(complexity: QueryComplexity): string[] {
    switch (complexity) {
      case 'simple':
        // Simple queries don't need RAG, productivity, or folders
        return ['knowledge', 'productivity', 'folders'];
      case 'search':
      case 'multi_hop':
        return [];
    }
  }
}
