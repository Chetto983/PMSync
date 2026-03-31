/**
 * EmailAnalysisService - Unified email analysis via single LLM call.
 * Handles: analyzeEmailUnified, cache, validation, prompt building.
 * Extracted from EmailInsightsService (Phase 43).
 */
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { InsightUtilsService } from './insight-utils.service';
import { sanitizeForLLM, wrapUserContent, validatePromptLength } from '../utils/prompt-sanitizer';
import { getLocale, getToolTranslations, type SupportedLocale } from '../locales';
import { PiiDetectionService } from '../guards';
import type { UnifiedEmailAnalysis } from '../types/email-insights.types';
import { buildAiResponseMeta } from '../utils/ai-response-meta';
import { DEFAULT_AI_USER_LABELS, ensureDefaultUserLabels } from '../../labels/default-user-labels';

type LocaleKey = 'en' | 'it';

interface EmailRecord {
  id: string; subject: string | null; from: string; to: string[];
  bodyText: string | null; bodyHtml: string | null; snippet: string | null; receivedAt: Date;
}

@Injectable()
export class EmailAnalysisService {
  private readonly logger = new Logger(EmailAnalysisService.name);
  private readonly analysisVersion = 'unified-email-v1';

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    private readonly utils: InsightUtilsService,
    @Optional() @Inject(PiiDetectionService) private readonly piiDetection?: PiiDetectionService,
  ) {}

  async analyzeEmailUnified(
    tenantId: string, emailId: string, locale?: string, options?: { includeSmartReplies?: boolean },
  ): Promise<UnifiedEmailAnalysis> {
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const lang = this.resolveLocale(locale);

    const cached = await this.prisma.emailAnalysis.findFirst({
      where: { emailId, tenantId, processedAt: { gt: new Date(Date.now() - CACHE_TTL_MS) } },
      include: {
        email: {
          select: {
            aiLabels: true,
          },
        },
      },
    });
    const cachedLocale = (cached?.suggestedActions as Record<string, unknown>)?.locale as string | undefined;
    if (cached?.summary && cachedLocale === lang) {
      this.logger.debug(`Cache hit for analyzeEmailUnified: ${emailId} (locale: ${lang})`);
      return {
        ...this.mapEmailAnalysisToUnified(cached, cached.email?.aiLabels ?? []),
        meta: buildAiResponseMeta({
          operation: 'email-unified-analysis',
          version: this.analysisVersion,
          source: 'cache',
          generatedAt: cached.processedAt,
          locale: lang,
        }),
      };
    }
    if (cached?.summary && cachedLocale !== lang) {
      this.logger.debug(`Cache miss - locale mismatch: cached=${cachedLocale}, requested=${lang}`);
    }

    const email = await this.getEmailOrThrow(tenantId, emailId);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const labelDefs = await this.getUserLabels(tenantId);
    const allowedLabels = labelDefs.map((l) => l.name);
    const labelPromptBlock = this.buildLabelPromptBlock(labelDefs);
    const systemPrompt = t.insights.analyzeUnified.systemPrompt(allowedLabels.join(', '), labelPromptBlock);
    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const startTime = Date.now();
      const raw = await this.mistral.completePrompt({
        systemPrompt, userPrompt, temperature: 0.1, maxTokens: 800, validationContext: 'SYSTEM_INTERNAL',
      });
      const latencyMs = Date.now() - startTime;
      const parsed = this.parseJsonResponse(raw);

      const priority = Math.min(5, Math.max(1, Number(parsed.priority) || 3)) as 1 | 2 | 3 | 4 | 5;
      const urgency = this.validateUrgency(parsed.urgency);
      const intent = typeof parsed.intent === 'string' ? parsed.intent : 'fyi';
      const escalationRisk = Boolean(parsed.escalationRisk);
      const hasDeadline = Boolean(parsed.hasDeadline);
      const needsFollowUp = Boolean(parsed.needsFollowUp);
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
      const labels = this.resolveLabels(email, parsed, allowedLabels, {
        priority,
        urgency,
        intent,
        escalationRisk,
        hasDeadline,
        needsFollowUp,
      });

      const result: UnifiedEmailAnalysis = {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        sentiment: this.validateSentiment(parsed.sentiment),
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'neutral',
        priority,
        urgency,
        labels,
        keyTopics: Array.isArray(parsed.keyTopics) ? (parsed.keyTopics as string[]).slice(0, 5) : [],
        intent,
        escalationRisk,
        hasDeadline,
        deadlineDate: parsed.deadlineDate ? new Date(parsed.deadlineDate as string) : null,
        needsFollowUp,
        followUpDate: parsed.followUpDate ? new Date(parsed.followUpDate as string) : null,
        followUpReason: typeof parsed.followUpReason === 'string' ? parsed.followUpReason : null,
        smartReplies: options?.includeSmartReplies && Array.isArray(parsed.smartReplies) ? (parsed.smartReplies as string[]).slice(0, 3) : undefined,
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
        reasoning,
      };
      const processedAt = new Date();
      result.meta = buildAiResponseMeta({
        operation: 'email-unified-analysis',
        version: this.analysisVersion,
        source: 'live',
        generatedAt: processedAt,
        locale: lang,
      });

      const analysisData = {
        priority: this.mapPriorityToEnum(result.priority),
        category: this.mapIntentToCategory(result.intent),
        sentiment: this.mapSentimentToEnum(result.sentiment),
        summary: result.summary, keyPoints: result.keyTopics,
        hasDeadline: result.hasDeadline, deadlineDate: result.deadlineDate, needsFollowUp: result.needsFollowUp,
        followUpDate: result.followUpDate,
        suggestedActions: {
          locale: lang, smartReplies: result.smartReplies, intent: result.intent, urgency: result.urgency,
          tone: result.tone, escalationRisk: result.escalationRisk, reasoning: result.reasoning, confidence: result.confidence,
          followUpReason: result.followUpReason, labels: result.labels,
        },
        processedAt, latencyMs,
      };

      await this.prisma.emailAnalysis.upsert({
        where: { emailId_tenantId: { emailId, tenantId } },
        update: analysisData, create: { emailId, tenantId, ...analysisData },
      });

      await this.prisma.email.updateMany({
        where: { id: emailId, tenantId },
        data: { aiPriority: result.priority, aiPriorityReason: result.reasoning, aiSentiment: result.sentiment, aiLabels: result.labels, isAutoTriaged: true, autoTriagedAt: new Date() },
      });

      if (result.labels.length > 0) {
        await this.utils.linkEmailToUserLabels(tenantId, emailId, result.labels);
      }

      this.logger.debug(`Unified analysis for ${emailId}: priority=${result.priority}, labels=${result.labels.join(',')}, latency=${latencyMs}ms`);
      return result;
    } catch (error) {
      this.logger.error(`Failed unified analysis for ${emailId}: ${this.utils.getErrorMessage(error)}`);
      throw this.utils.mapAiErrorToHttpException(error, 'analyze email');
    }
  }

  // --- Private helpers ---

  private async getUserLabels(tenantId: string): Promise<Array<{ name: string; aiPrompt: string | null }>> {
    try {
      await ensureDefaultUserLabels(this.prisma, tenantId);
      const labels = await this.prisma.userLabel.findMany({
        where: { tenantId, isArchived: false },
        select: { name: true, aiPrompt: true },
        orderBy: { orderIndex: 'asc' },
      });
      return labels.length === 0 ? DEFAULT_AI_USER_LABELS.map(({ name, aiPrompt }) => ({ name, aiPrompt })) : labels;
    } catch { return DEFAULT_AI_USER_LABELS.map(({ name, aiPrompt }) => ({ name, aiPrompt })); }
  }

  /**
   * Build a prompt block with per-label AI instructions.
   * Only includes labels that have an aiPrompt set by the user.
   */
  private buildLabelPromptBlock(labels: Array<{ name: string; aiPrompt: string | null }>): string {
    const withPrompts = labels.filter((l) => l.aiPrompt);
    if (withPrompts.length === 0) return '';
    const lines = withPrompts.map((l) => `- "${l.name}": ${l.aiPrompt}`).join('\n');
    return `\n<LABEL_RULES>\nApply these labels when the described conditions match:\n${lines}\n</LABEL_RULES>`;
  }

  private async getEmailOrThrow(tenantId: string, emailId: string): Promise<EmailRecord> {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: { id: true, subject: true, from: true, to: true, bodyText: true, bodyHtml: true, snippet: true, receivedAt: true },
    });
    if (!email) throw new NotFoundException('Email not found');
    return email;
  }

  buildEmailPrompt(email: EmailRecord, locale: LocaleKey): string {
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const toList = email.to.join(', ');
    const piiRedactedSubject = this.redactPii(email.subject || t.insights.noSubject);
    const piiRedactedFrom = this.redactPii(email.from);
    const piiRedactedToList = this.redactPii(toList);
    const sanitizedSubject = sanitizeForLLM(piiRedactedSubject, { maxLength: 500 });
    const sanitizedFrom = sanitizeForLLM(piiRedactedFrom, { maxLength: 500 });
    const sanitizedToList = sanitizeForLLM(piiRedactedToList, { maxLength: 2000 });
    const header = `${t.insights.subject}: ${sanitizedSubject}\n${t.insights.from}: ${sanitizedFrom}\n${t.insights.to}: ${sanitizedToList}`;
    const content = this.extractEmailContent(email, supportedLocale);
    const piiRedactedContent = this.redactPii(content);
    const sanitizedContent = sanitizeForLLM(piiRedactedContent, { maxLength: 8000 });
    const userContent = wrapUserContent(`${header}\n\n${t.insights.emailBody}\n${sanitizedContent}`);
    validatePromptLength(userContent, 15000);
    return userContent;
  }

  private extractEmailContent(email: EmailRecord, locale?: SupportedLocale): string {
    if (email.bodyText?.trim().length) return this.utils.truncate(email.bodyText.trim());
    if (email.bodyHtml) {
      const text = email.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 0) return this.utils.truncate(text);
    }
    if (email.snippet) return this.utils.truncate(email.snippet.trim());
    const t = getToolTranslations(locale || 'en');
    return t.insights.contentUnavailable;
  }

  private redactPii(text: string): string {
    if (!this.piiDetection || !text) return text;
    try {
      const result = this.piiDetection.detect(text);
      if (result.details.length > 0) this.logger.debug(`Redacted ${result.details.length} PII items`);
      return result.redactedText;
    } catch { return text; }
  }

  resolveLocale(locale?: string): LocaleKey {
    return locale && locale.toLowerCase().startsWith('it') ? 'it' : 'en';
  }

  private parseJsonResponse(raw: string): Record<string, unknown> {
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      return JSON.parse(cleaned);
    } catch { return {}; }
  }

  private mapEmailAnalysisToUnified(
    analysis: {
      priority: string;
      category: string;
      sentiment: string;
      summary: string | null;
      keyPoints: string[];
      hasDeadline: boolean;
      deadlineDate: Date | null;
      needsFollowUp: boolean;
      followUpDate?: Date | null;
      suggestedActions: unknown;
    },
    persistedLabels: string[] = [],
  ): UnifiedEmailAnalysis {
    const actions = (analysis.suggestedActions as Record<string, unknown>) || {};
    return {
      summary: analysis.summary || '', sentiment: this.validateSentiment(analysis.sentiment),
      tone: (actions.tone as string) || 'neutral', priority: this.mapEnumToPriority(analysis.priority),
      urgency: this.validateUrgency(actions.urgency),
      labels: Array.isArray(actions.labels)
        ? (actions.labels as string[]).slice(0, 3)
        : (persistedLabels || []).slice(0, 3),
      keyTopics: analysis.keyPoints || [],
      intent: (actions.intent as string) || 'fyi', escalationRisk: Boolean(actions.escalationRisk),
      hasDeadline: analysis.hasDeadline, deadlineDate: analysis.deadlineDate, needsFollowUp: analysis.needsFollowUp,
      followUpDate: analysis.followUpDate ?? null, followUpReason: (actions.followUpReason as string) ?? null,
      smartReplies: actions.smartReplies as string[] | undefined, confidence: Number(actions.confidence) || 0.7,
      reasoning: (actions.reasoning as string) || '',
    };
  }

  private validateSentiment(value: unknown): 'positive' | 'negative' | 'neutral' | 'mixed' {
    const valid = ['positive', 'negative', 'neutral', 'mixed'];
    return valid.includes(String(value)) ? (value as 'positive' | 'negative' | 'neutral' | 'mixed') : 'neutral';
  }

  private validateUrgency(value: unknown): 'critical' | 'high' | 'medium' | 'low' {
    const valid = ['critical', 'high', 'medium', 'low'];
    return valid.includes(String(value)) ? (value as 'critical' | 'high' | 'medium' | 'low') : 'medium';
  }

  private normalizeLabels(labels: unknown, allowedLabels: string[]): string[] {
    if (!Array.isArray(labels)) return [];
    return labels.slice(0, 3).map((l) => this.normaliseLabel(String(l), allowedLabels)).filter((l) => allowedLabels.includes(l));
  }

  private resolveLabels(
    email: EmailRecord,
    parsed: Record<string, unknown>,
    allowedLabels: string[],
    signals: {
      priority: 1 | 2 | 3 | 4 | 5;
      urgency: 'critical' | 'high' | 'medium' | 'low';
      intent: string;
      escalationRisk: boolean;
      hasDeadline: boolean;
      needsFollowUp: boolean;
    },
  ): string[] {
    const modelLabels = this.normalizeLabels(parsed.labels, allowedLabels);
    const heuristicLabels = this.inferLabels(email, allowedLabels, signals);
    return [...new Set([...modelLabels, ...heuristicLabels])].slice(0, 3);
  }

  private inferLabels(
    email: EmailRecord,
    allowedLabels: string[],
    signals: {
      priority: 1 | 2 | 3 | 4 | 5;
      urgency: 'critical' | 'high' | 'medium' | 'low';
      intent: string;
      escalationRisk: boolean;
      hasDeadline: boolean;
      needsFollowUp: boolean;
    },
  ): string[] {
    const sample = `${email.subject || ''}\n${email.snippet || ''}\n${email.bodyText || ''}`.toLowerCase();
    const inferred: string[] = [];

    const pushAllowed = (label: string) => {
      const normalized = this.normaliseLabel(label, allowedLabels);
      if (allowedLabels.includes(normalized) && !inferred.includes(normalized)) {
        inferred.push(normalized);
      }
    };

    if (/\b(invoice|payment|billing|receipt|subscription|refund|charge)\b/.test(sample)) {
      pushAllowed('Finance');
    }
    if (/\b(newsletter|unsubscribe|promotion|promo|sale|discount|offer)\b/.test(sample)) {
      pushAllowed('Promotions');
    }
    if (/\b(update|release|feature|announcement|introducing|launch|changelog|workflow|deploy|build failed|github|vercel|railway|notification)\b/.test(sample)) {
      pushAllowed('Updates');
    }
    if (signals.priority <= 2 || ['critical', 'high'].includes(signals.urgency) || signals.escalationRisk) {
      pushAllowed('Important');
    }
    if (signals.intent === 'follow_up' || signals.needsFollowUp) {
      pushAllowed('Follow-up');
    }
    if (signals.intent === 'action_required' || signals.intent === 'question' || signals.intent === 'meeting_request' || signals.hasDeadline) {
      pushAllowed('Action Items');
    }

    if (inferred.length === 0) {
      pushAllowed('Info');
    }

    return inferred.slice(0, 3);
  }

  private normaliseLabel(label: string, allowedLabels: string[]): string {
    const trimmed = label.trim().toLowerCase();
    const found = allowedLabels.find((item) => item.toLowerCase() === trimmed || item.toLowerCase().includes(trimmed));
    return found ?? label.trim();
  }

  private mapPriorityToEnum(priority: number): 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW' {
    if (priority <= 1) return 'URGENT'; if (priority <= 2) return 'HIGH'; if (priority <= 4) return 'NORMAL'; return 'LOW';
  }

  private mapEnumToPriority(enumValue: string): 1 | 2 | 3 | 4 | 5 {
    switch (enumValue) { case 'URGENT': return 1; case 'HIGH': return 2; case 'NORMAL': return 3; case 'LOW': return 5; default: return 3; }
  }

  private mapIntentToCategory(intent: string): 'SALES_INQUIRY' | 'SUPPORT_REQUEST' | 'MEETING_REQUEST' | 'FOLLOW_UP' | 'PERSONAL' | 'OTHER' {
    switch (intent) { case 'action_required': return 'SUPPORT_REQUEST'; case 'meeting_request': return 'MEETING_REQUEST'; case 'follow_up': return 'FOLLOW_UP'; case 'question': return 'SUPPORT_REQUEST'; case 'feedback': return 'PERSONAL'; case 'escalation': return 'SUPPORT_REQUEST'; default: return 'OTHER'; }
  }

  private mapSentimentToEnum(sentiment: string): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
    switch (sentiment) { case 'positive': return 'POSITIVE'; case 'negative': return 'NEGATIVE'; case 'mixed': return 'NEGATIVE'; default: return 'NEUTRAL'; }
  }
}
