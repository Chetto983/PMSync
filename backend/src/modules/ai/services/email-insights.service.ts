/**
 * EmailInsightsService - Facade for email AI insights.
 *
 * Delegates to:
 * - EmailAnalysisService: analyzeEmailUnified (single LLM call for all insights)
 * - EmailComposeService: composeEmail, generateSmartReplies
 * - InsightUtilsService: error mapping, label linking, text utilities
 *
 * Phase 43: Split from 1056-line monolith into focused sub-services.
 */
import { Injectable } from '@nestjs/common';
import { EmailAnalysisService } from './email-analysis.service';
import { EmailComposeService } from './email-compose.service';

/**
 * UNIFIED EMAIL ANALYSIS RESULT
 * Single LLM call returns all insights.
 */
export interface UnifiedEmailAnalysis {
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tone: string;
  priority: 1 | 2 | 3 | 4 | 5;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  labels: string[];
  keyTopics: string[];
  intent: string;
  escalationRisk: boolean;
  hasDeadline: boolean;
  deadlineDate: Date | null;
  needsFollowUp: boolean;
  smartReplies?: string[];
  confidence: number;
  reasoning: string;
}

@Injectable()
export class EmailInsightsService {
  constructor(
    private readonly analysisService: EmailAnalysisService,
    private readonly composeService: EmailComposeService,
  ) {}

  async analyzeEmailUnified(
    tenantId: string,
    emailId: string,
    locale?: string,
    options?: { includeSmartReplies?: boolean },
  ): Promise<UnifiedEmailAnalysis> {
    return this.analysisService.analyzeEmailUnified(tenantId, emailId, locale, options);
  }

  async generateSmartReplies(
    tenantId: string,
    emailId: string,
    locale?: string,
    tone?: string,
  ) {
    return this.composeService.generateSmartReplies(tenantId, emailId, locale, tone);
  }

  async composeEmail(
    tenantId: string,
    payload: {
      prompt: string;
      to?: string[];
      subject?: string;
      tone?: string;
      locale?: string;
      threadContext?: Array<{ subject?: string; body?: string }>;
      senderName?: string;
      signature?: string;
    },
    userId?: string,
  ) {
    return this.composeService.composeEmail(tenantId, payload, userId);
  }
}
