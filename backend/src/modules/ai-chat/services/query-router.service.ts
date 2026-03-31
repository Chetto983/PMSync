import { Injectable, Logger } from '@nestjs/common';

/**
 * Query complexity tier for routing decisions.
 *
 * - simple: greetings, thanks, time queries — skip RAG tools entirely
 * - search: keyword/entity mentions — normal hybrid search path
 * - multi_hop: relationship queries — hint graph_context_search (Step 3)
 */
export type QueryComplexity = 'simple' | 'search' | 'multi_hop';

/**
 * Sub-type for multi_hop queries. Used to select few-shot examples.
 * Only set when complexity === 'multi_hop'.
 */
export type MultiHopSubType = 'relationship' | 'temporal_entity' | 'memory' | 'cross_domain' | 'general';

export interface QueryClassification {
  complexity: QueryComplexity;
  /** Confidence score 0-1 (heuristic-derived, not probabilistic) */
  confidence: number;
  /** Which signals fired (for debugging/logging) */
  signals: string[];
  /** Sub-classification for multi_hop queries. Only set when complexity === 'multi_hop'. */
  multiHopSubType?: MultiHopSubType;
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
  // Memory sub-type: recalling stored knowledge about entities
  /\b(what do I know|cosa so|what do you remember)\b/i,
  /\b(payment terms|contract terms|agreement)\b.*\b(with|about|for)\b/i,
  // Cross-domain: correlating across calendar, email, contacts
  /\b(who should|chi dovrei)\b/i,
  /\b(follow up|follow-up)\b.*\b(this week|today|tomorrow)\b/i,
  // Relationship sub-type: what someone said/wrote
  /\b(what did)\b.*\b(say|said|tell|write|wrote)\b/i,
  /\b(interactions? with|relazione con)\b/i,
];

/** Multi-hop sub-classification patterns for few-shot example selection */
const MULTI_HOP_SUB_PATTERNS: Record<string, RegExp[]> = {
  relationship: [
    /\b(what did|cosa ha detto)\b.*\b(say|said|tell|write|wrote)\b/i,
    /\b(interactions? with|relazione con)\b/i,
    /\b(history with|storico con)\b/i,
  ],
  temporal_entity: [
    /\b(from people|from contacts|da persone)\b.*\b(met|at|during)\b/i,
    /\b(at the|during the|al|durante)\b.*\b(conference|meeting|evento)\b/i,
  ],
  memory: [
    /\b(what do I know|remember|recall|ricordo|cosa so)\b/i,
    /\b(payment terms|contract|agreement|conditions)\b/i,
  ],
  cross_domain: [
    /\b(follow up|follow-up|should I|dovrei)\b.*\b(this week|today|tomorrow)\b/i,
    /\b(who should|chi dovrei)\b/i,
  ],
};

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
        multiHopSubType: this.subClassifyMultiHop(trimmed),
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
    signals.push('default:fallback_to_search');
    this.logger.debug(
      `[QueryRouter fallback] No patterns matched for "${trimmed.slice(0, 60)}" — defaulting to search`,
    );
    return { complexity: 'search', confidence: 0.5, signals };
  }

  /**
   * Whether the classification used the default fallback (no patterns matched).
   * Callers can use this to log fallback events for monitoring.
   */
  isFallback(classification: QueryClassification): boolean {
    return classification.signals.includes('default:fallback_to_search');
  }

  /**
   * Sub-classify multi_hop queries into specific sub-types for few-shot selection.
   * Pure regex — no external calls.
   */
  private subClassifyMultiHop(query: string): MultiHopSubType {
    for (const [subType, patterns] of Object.entries(MULTI_HOP_SUB_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          return subType as MultiHopSubType;
        }
      }
    }
    return 'general';
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
