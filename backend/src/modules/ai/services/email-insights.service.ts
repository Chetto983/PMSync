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
import { EmailAnalysisService, type AnalyzeEmailUnifiedOptions } from './email-analysis.service';
import { EmailComposeService } from './email-compose.service';
import type { UnifiedEmailAnalysis } from '../types/email-insights.types';

// Re-export for backward compatibility
export type { UnifiedEmailAnalysis } from '../types/email-insights.types';

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
    options?: AnalyzeEmailUnifiedOptions,
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
