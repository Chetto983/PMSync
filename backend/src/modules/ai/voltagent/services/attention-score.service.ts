/**
 * Attention Score Service (Phase 4.1 - Cost Optimization)
 *
 * Pre-filters emails BEFORE LLM analysis using weighted scoring.
 * Reduces LLM API calls by 30-50% by auto-archiving low-priority emails.
 *
 * Scoring Factors:
 * - Sender Importance (25%): VIP/known vs unknown sender
 * - Category Signals (30%): Keywords indicating action needed
 * - Urgency Indicators (20%): Time-sensitive terms
 * - Recency (15%): How recent the email is
 * - Thread Context (10%): Part of ongoing conversation
 *
 * Reference: docs/COST_REDUCTION_AUDIT.md, docs/ESEMPIO_FOLDER_FINDINGS.md
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { SupportedLocale } from '../locales';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface AttentionScoreResult {
  /** Final score 0.0-1.0 */
  score: number;
  /** Breakdown of individual factor scores */
  factors: AttentionScoreFactors;
  /** Whether this email should skip LLM analysis */
  skipLlmAnalysis: boolean;
  /** Recommended triage action if skipping LLM */
  autoTriageDecision?: 'archive' | 'keep' | 'spam';
  /** Reason for the score (for debugging) */
  reasoning: string;
}

export interface AttentionScoreFactors {
  senderImportance: number;
  categorySignals: number;
  urgencyIndicators: number;
  recency: number;
  threadContext: number;
}

export interface AttentionScoreInput {
  /** Email subject */
  subject: string;
  /** Email body (plain text or HTML stripped) */
  body: string;
  /** Sender email address */
  senderEmail: string;
  /** Sender display name */
  senderName?: string;
  /** Email received date */
  receivedAt: Date;
  /** Thread ID for conversation context */
  threadId?: string;
  /** Number of messages in thread */
  threadMessageCount?: number;
  /** Is this a reply in an existing thread */
  isReply?: boolean;
  /** Tenant ID for sender relationship lookup */
  tenantId: string;
  /** User locale for multilingual pattern matching */
  locale?: SupportedLocale;
}

// ============================================================================
// Scoring Configuration
// ============================================================================

/** Weights for each scoring factor (must sum to 1.0) */
const WEIGHTS = {
  senderImportance: 0.25,
  categorySignals: 0.30,
  urgencyIndicators: 0.20,
  recency: 0.15,
  threadContext: 0.10,
} as const;

/** Threshold below which emails skip LLM analysis */
const LLM_SKIP_THRESHOLD = 0.3;

/** Known promotional/spam sender patterns */
const PROMOTIONAL_SENDER_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /newsletter@/i,
  /marketing@/i,
  /promo@/i,
  /notifications@/i,
  /updates@/i,
  /digest@/i,
  /unsubscribe/i,
  /donotreply/i,
];

/** Keywords indicating action-required emails (multilingual) */
const ACTION_KEYWORDS: Record<string, RegExp[]> = {
  en: [
    /\baction required\b/i,
    /\bplease respond\b/i,
    /\bneeds? your\b/i,
    /\bapproval needed\b/i,
    /\breview required\b/i,
    /\bsign.*document\b/i,
    /\bconfirm\b/i,
    /\bfollow[ -]?up\b/i,
    /\brsvp\b/i,
    /\bmeeting invite\b/i,
    /\bscheduled?\b/i,
    /\bdeadline\b/i,
    /\bdue date\b/i,
    /\bpayment\b/i,
    /\binvoice\b/i,
    /\bcontract\b/i,
  ],
  it: [
    /\bazione richiesta\b/i,
    /\brispondi per favore\b/i,
    /\bha bisogno del tuo\b/i,
    /\bapprovazione necessaria\b/i,
    /\brevisione richiesta\b/i,
    /\bfirma.*documento\b/i,
    /\bconferma\b/i,
    /\bfollow[ -]?up\b/i,
    /\briunione\b/i,
    /\bscadenza\b/i,
    /\bdata di scadenza\b/i,
    /\bpagamento\b/i,
    /\bfattura\b/i,
    /\bcontratto\b/i,
  ],
};

/** Urgency keywords (multilingual) */
const URGENCY_KEYWORDS: Record<string, RegExp[]> = {
  en: [
    /\burgent\b/i,
    /\basap\b/i,
    /\bimmediate\b/i,
    /\btime[ -]?sensitive\b/i,
    /\bcritical\b/i,
    /\bemergency\b/i,
    /\bpriority\b/i,
    /\bimportant\b/i,
    /\btoday\b/i,
    /\bby eod\b/i,
    /\bby end of day\b/i,
    /\bthis week\b/i,
    /\btomorrow\b/i,
    /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  ],
  it: [
    /\burgente\b/i,
    /\bimmediato\b/i,
    /\bcritico\b/i,
    /\bemergenza\b/i,
    /\bpriorit[àa]\b/i,
    /\bimportante\b/i,
    /\boggi\b/i,
    /\bdomani\b/i,
    /\bentro\b/i,
    /\bquesta settimana\b/i,
    /\b(luned[ìi]|marted[ìi]|mercoled[ìi]|gioved[ìi]|venerd[ìi]|sabato|domenica)\b/i,
  ],
};

/** Spam/promotional content patterns */
const SPAM_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bclick here to\b/i,
  /\bview in browser\b/i,
  /\bemail preferences\b/i,
  /\bmanage subscriptions?\b/i,
  /\blimited time offer\b/i,
  /\bdiscount\b/i,
  /\bsale ends?\b/i,
  /\b% off\b/i,
  /\bfree shipping\b/i,
  /\bexclusive deal\b/i,
  /\bact now\b/i,
];

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class AttentionScoreService {
  private readonly logger = new Logger(AttentionScoreService.name);

  /** Cache for VIP senders per tenant */
  private vipCache = new Map<string, Set<string>>();
  private vipCacheExpiry = new Map<string, number>();
  private readonly VIP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate attention score for an email.
   * Returns score and recommendation on whether to skip LLM analysis.
   */
  async calculateScore(input: AttentionScoreInput): Promise<AttentionScoreResult> {
    const locale = input.locale || 'en';
    const text = `${input.subject} ${input.body}`.toLowerCase();

    // Calculate individual factors
    const factors: AttentionScoreFactors = {
      senderImportance: await this.scoreSenderImportance(input),
      categorySignals: this.scoreCategorySignals(text, locale),
      urgencyIndicators: this.scoreUrgencyIndicators(text, locale),
      recency: this.scoreRecency(input.receivedAt),
      threadContext: this.scoreThreadContext(input),
    };

    // Calculate weighted total
    const score =
      factors.senderImportance * WEIGHTS.senderImportance +
      factors.categorySignals * WEIGHTS.categorySignals +
      factors.urgencyIndicators * WEIGHTS.urgencyIndicators +
      factors.recency * WEIGHTS.recency +
      factors.threadContext * WEIGHTS.threadContext;

    // Determine if we should skip LLM
    const skipLlmAnalysis = score < LLM_SKIP_THRESHOLD;
    const autoTriageDecision = this.determineAutoTriage(score, factors, text);

    // Build reasoning string
    const reasoning = this.buildReasoning(factors, score, skipLlmAnalysis);

    return {
      score: Math.round(score * 100) / 100,
      factors,
      skipLlmAnalysis,
      autoTriageDecision: skipLlmAnalysis ? autoTriageDecision : undefined,
      reasoning,
    };
  }

  /**
   * Score sender importance (0.0-1.0).
   * VIP/known senders get higher scores.
   */
  private async scoreSenderImportance(input: AttentionScoreInput): Promise<number> {
    const email = input.senderEmail.toLowerCase();

    // Check for promotional/spam senders (lowest score)
    for (const pattern of PROMOTIONAL_SENDER_PATTERNS) {
      if (pattern.test(email)) {
        return 0.1;
      }
    }

    // Check if sender is a known contact with relationship score
    try {
      const vipSenders = await this.getVipSenders(input.tenantId);

      // VIP sender (top contacts by relationship score)
      if (vipSenders.has(email)) {
        return 1.0;
      }

      // Check if sender is any known contact
      const contact = await this.prisma.contact.findFirst({
        where: {
          tenantId: input.tenantId,
          isDeleted: false,
          emails: {
            path: ['$[*].value'],
            array_contains: [email],
          },
        },
        select: {
          relationshipScore: true,
          totalInteractions: true,
        },
      });

      if (contact) {
        // Known contact - score based on relationship
        const relScore = contact.relationshipScore || 0;
        const interactions = contact.totalInteractions || 0;

        // High relationship (>60) or frequent interaction (>10) = high importance
        if (relScore > 60 || interactions > 10) return 0.9;
        if (relScore > 30 || interactions > 5) return 0.7;
        return 0.5;
      }
    } catch (error) {
      this.logger.debug(`Sender lookup failed: ${error}`);
    }

    // Unknown sender - medium-low score
    return 0.3;
  }

  /**
   * Score category signals (action-required keywords).
   */
  private scoreCategorySignals(text: string, locale: SupportedLocale): number {
    // Check for spam patterns first
    let spamHits = 0;
    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(text)) spamHits++;
    }
    if (spamHits >= 2) return 0.1; // Likely promotional

    // Check for action keywords
    const patterns = [...(ACTION_KEYWORDS[locale] || []), ...ACTION_KEYWORDS.en];
    let actionHits = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) actionHits++;
    }

    // More action keywords = higher score
    if (actionHits >= 3) return 1.0;
    if (actionHits >= 2) return 0.8;
    if (actionHits >= 1) return 0.6;

    return 0.3; // No clear action signals
  }

  /**
   * Score urgency indicators.
   */
  private scoreUrgencyIndicators(text: string, locale: SupportedLocale): number {
    const patterns = [...(URGENCY_KEYWORDS[locale] || []), ...URGENCY_KEYWORDS.en];
    let urgencyHits = 0;

    for (const pattern of patterns) {
      if (pattern.test(text)) urgencyHits++;
    }

    // More urgency signals = higher score
    if (urgencyHits >= 3) return 1.0;
    if (urgencyHits >= 2) return 0.8;
    if (urgencyHits >= 1) return 0.5;

    return 0.2; // No urgency
  }

  /**
   * Score recency (how recently the email was received).
   */
  private scoreRecency(receivedAt: Date): number {
    const now = Date.now();
    const ageMs = now - receivedAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    // Very recent = high score
    if (ageHours < 1) return 1.0;
    if (ageHours < 4) return 0.9;
    if (ageHours < 12) return 0.7;
    if (ageHours < 24) return 0.5;
    if (ageHours < 48) return 0.3;

    return 0.1; // Old email
  }

  /**
   * Score thread context (ongoing conversation).
   */
  private scoreThreadContext(input: AttentionScoreInput): number {
    // Reply in existing thread = important
    if (input.isReply) return 0.8;

    // Part of active thread
    if (input.threadMessageCount && input.threadMessageCount > 1) {
      if (input.threadMessageCount > 5) return 1.0;
      if (input.threadMessageCount > 2) return 0.7;
      return 0.5;
    }

    // New standalone email
    return 0.3;
  }

  /**
   * Determine auto-triage decision for low-score emails.
   */
  private determineAutoTriage(
    score: number,
    factors: AttentionScoreFactors,
    text: string,
  ): 'archive' | 'keep' | 'spam' {
    // Very low scores with spam signals = spam
    if (score < 0.15 && factors.categorySignals < 0.2) {
      // Check spam patterns
      let spamHits = 0;
      for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(text)) spamHits++;
      }
      if (spamHits >= 3) return 'spam';
    }

    // Low score from unknown sender = archive
    if (score < 0.25 && factors.senderImportance < 0.3) {
      return 'archive';
    }

    // Default: keep but skip expensive analysis
    return 'keep';
  }

  /**
   * Build human-readable reasoning string.
   */
  private buildReasoning(factors: AttentionScoreFactors, score: number, skip: boolean): string {
    const parts: string[] = [];

    if (factors.senderImportance >= 0.9) parts.push('VIP sender');
    else if (factors.senderImportance >= 0.5) parts.push('known contact');
    else if (factors.senderImportance <= 0.2) parts.push('promotional sender');

    if (factors.urgencyIndicators >= 0.8) parts.push('urgent');
    if (factors.categorySignals >= 0.8) parts.push('action required');
    if (factors.threadContext >= 0.7) parts.push('active thread');
    if (factors.recency >= 0.9) parts.push('very recent');

    const summary = parts.length > 0 ? parts.join(', ') : 'no significant signals';
    return `Score ${score.toFixed(2)}: ${summary}. ${skip ? 'Skipping LLM analysis.' : 'Proceeding with LLM analysis.'}`;
  }

  /**
   * Get VIP senders for a tenant (cached).
   * VIP = top 20 contacts by relationship score.
   */
  private async getVipSenders(tenantId: string): Promise<Set<string>> {
    const now = Date.now();
    const expiry = this.vipCacheExpiry.get(tenantId) || 0;

    if (this.vipCache.has(tenantId) && now < expiry) {
      return this.vipCache.get(tenantId)!;
    }

    // Fetch top contacts
    const topContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
        relationshipScore: { gte: 50 },
      },
      select: {
        emails: true,
      },
      orderBy: { relationshipScore: 'desc' },
      take: 20,
    });

    // Extract emails
    const vipEmails = new Set<string>();
    for (const contact of topContacts) {
      if (contact.emails && Array.isArray(contact.emails)) {
        for (const emailObj of contact.emails as Array<{ value?: string }>) {
          if (emailObj.value) {
            vipEmails.add(emailObj.value.toLowerCase());
          }
        }
      }
    }

    // Cache
    this.vipCache.set(tenantId, vipEmails);
    this.vipCacheExpiry.set(tenantId, now + this.VIP_CACHE_TTL);

    return vipEmails;
  }

  /**
   * Clear VIP cache for a tenant (call after contact changes).
   */
  clearVipCache(tenantId: string): void {
    this.vipCache.delete(tenantId);
    this.vipCacheExpiry.delete(tenantId);
  }
}
