/**
 * EmailAnalysisService - Unified email analysis via single LLM call.
 * Handles: analyzeEmailUnified, cache, validation, prompt building.
 * Extracted from EmailInsightsService (Phase 43).
 */
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { InsightUtilsService } from './insight-utils.service';
import { sanitizeForLLM, wrapUserContent, validatePromptLength } from '../utils/prompt-sanitizer';
import { getLocale, getToolTranslations, type SupportedLocale } from '../locales';
import { PiiDetectionService } from '../guards';
import type { UnifiedEmailAnalysis } from '../types/email-insights.types';
import { buildAiResponseMeta } from '../utils/ai-response-meta';
import { DEFAULT_AI_USER_LABELS, ensureDefaultUserLabels } from '../../labels/default-user-labels';
import { TriageRuleService } from './triage-rule.service';
import { LabelResolutionService, type TenantLabel } from './label-resolution.service';
import { TriageScoreService } from './triage-score.service';
import { LaneAssignmentService } from './lane-assignment.service';

type LocaleKey = 'en' | 'it';

interface EmailRecord {
  id: string; subject: string | null; from: string; to: string[];
  bodyText: string | null; bodyHtml: string | null; snippet: string | null; receivedAt: Date;
}

@Injectable()
export class EmailAnalysisService {
  private readonly logger = new Logger(EmailAnalysisService.name);
  private readonly analysisVersion = 'unified-email-v2';
  private static readonly MAX_ANALYZE_SYSTEM_PROMPT_LENGTH = 4600;
  private static readonly LABEL_RULES_BUDGET_RATIO = 0.6;
  private static readonly TRIAGE_CONTEXT_MAX_RULES = 20;
  private static readonly PROMPT_LINE_MAX_LENGTH = 220;
  private static readonly LABEL_PROMPT_MAX_LENGTH = 180;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    private readonly utils: InsightUtilsService,
    private readonly triageRuleService: TriageRuleService,
    private readonly labelResolution: LabelResolutionService,
    private readonly triageScore: TriageScoreService,
    private readonly laneAssignment: LaneAssignmentService,
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
    const labelDefs = await this.getUserLabels(tenantId);
    const labelRulesSignature = this.computeLabelRulesSignature(labelDefs);
    const cachedLocale = (cached?.suggestedActions as Record<string, unknown>)?.locale as string | undefined;
    const cachedLabelRulesSignature =
      (cached?.suggestedActions as Record<string, unknown>)?.labelRulesSignature as string | undefined;
    if (cached?.summary && cachedLocale === lang && cachedLabelRulesSignature === labelRulesSignature) {
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
    } else if (cached?.summary && cachedLabelRulesSignature !== labelRulesSignature) {
      this.logger.debug(`Cache miss - label rules changed for ${emailId}`);
    }

    const email = await this.getEmailOrThrow(tenantId, emailId);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const allowedLabels = labelDefs.map((l) => l.name);
    const systemPrompt = await this.buildAnalyzeSystemPrompt(t, tenantId, labelDefs, allowedLabels);
    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const startTime = Date.now();
      const raw = await this.mistral.completePrompt({
        systemPrompt, userPrompt, temperature: 0.1, maxTokens: 800, validationContext: 'SYSTEM_INTERNAL',
      });
      const latencyMs = Date.now() - startTime;
      const parsed = this.parseJsonResponse(raw);

      const rawPriority = Math.min(5, Math.max(1, Number(parsed.priority) || 3)) as 1 | 2 | 3 | 4 | 5;
      const rawUrgency = this.validateUrgency(parsed.urgency);
      const intent = this.validateIntent(parsed.intent);
      const actionability = this.validateActionability(parsed.actionability);
      const escalationRisk = Boolean(parsed.escalationRisk);
      const hasDeadline = Boolean(parsed.hasDeadline);
      const rawNeedsFollowUp = Boolean(parsed.needsFollowUp);
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
      const rawFollowUpDate = parsed.followUpDate ? new Date(parsed.followUpDate as string) : null;
      const rawFollowUpReason = typeof parsed.followUpReason === 'string' ? parsed.followUpReason : null;
      const triageRules = await this.triageRuleService.getTriageRules(tenantId);
      const modelLabels = this.normalizeLabels(parsed.labels, allowedLabels);

      // 1. Label resolution (new pipeline)
      const labelResult = this.labelResolution.resolve({
        modelLabels,
        tenantLabels: labelDefs,
        triageRules,
        email: { from: email.from, subject: email.subject, bodyText: email.bodyText, snippet: email.snippet },
        signals: { priority: rawPriority, urgency: rawUrgency, intent, escalationRisk, hasDeadline, needsFollowUp: rawNeedsFollowUp },
      });
      const labels = labelResult.labels;

      // 2. Score computation (label-subordinate)
      const scoreResult = this.triageScore.compute(
        labelResult,
        {
          priority: rawPriority, urgency: rawUrgency, intent, actionability,
          escalationRisk, hasDeadline,
          deadlineDate: parsed.deadlineDate ? new Date(parsed.deadlineDate as string) : null,
          needsFollowUp: rawNeedsFollowUp, followUpDate: rawFollowUpDate, followUpReason: rawFollowUpReason,
        },
        labelDefs,
        { from: email.from, subject: email.subject },
      );

      // 3. Lane assignment
      const laneResult = this.laneAssignment.assignLane({
        labelResult, tenantLabels: labelDefs, actionability,
        urgency: scoreResult.urgency, escalationRisk, hasDeadline,
        deadlineDate: scoreResult.deadlineDate,
      });

      const result: UnifiedEmailAnalysis = {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        sentiment: this.validateSentiment(parsed.sentiment),
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'neutral',
        priority: scoreResult.priority,
        urgency: scoreResult.urgency,
        labels,
        keyTopics: Array.isArray(parsed.keyTopics) ? (parsed.keyTopics as string[]).slice(0, 5) : [],
        intent,
        actionability,
        lane: laneResult.lane,
        escalationRisk,
        hasDeadline,
        deadlineDate: scoreResult.deadlineDate,
        needsFollowUp: scoreResult.needsFollowUp,
        followUpDate: scoreResult.followUpDate,
        followUpReason: scoreResult.followUpReason,
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
        lane: result.lane, intent: result.intent, actionability: result.actionability,
        suggestedActions: {
          locale: lang, smartReplies: result.smartReplies, intent: result.intent, urgency: result.urgency,
          tone: result.tone, escalationRisk: result.escalationRisk, reasoning: result.reasoning, confidence: result.confidence,
          followUpReason: result.followUpReason, labels: result.labels, labelRulesSignature,
        },
        processedAt, latencyMs,
      };

      await this.prisma.emailAnalysis.upsert({
        where: { emailId_tenantId: { emailId, tenantId } },
        update: analysisData, create: { emailId, tenantId, ...analysisData },
      });

      await this.prisma.email.updateMany({
        where: { id: emailId, tenantId },
        data: { aiPriority: result.priority, aiPriorityReason: result.reasoning, aiSentiment: result.sentiment, aiLabels: result.labels, aiLane: result.lane, aiIntent: result.intent, aiActionability: result.actionability, isAutoTriaged: true, autoTriagedAt: new Date() },
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

  /**
   * Invalidate analysis cache for specific email IDs.
   * Called when labels or folder change, so next analysis request regenerates.
   * Sets processedAt to epoch (effectively expiring the 24h cache window).
   */
  async invalidateCache(tenantId: string, emailIds: string[]): Promise<number> {
    if (emailIds.length === 0) return 0;
    const { count } = await this.prisma.emailAnalysis.updateMany({
      where: { tenantId, emailId: { in: emailIds } },
      data: { processedAt: new Date(0) },
    });
    if (count > 0) {
      this.logger.debug(`Invalidated analysis cache for ${count} emails (tenant: ${tenantId})`);
    }
    return count;
  }

  // --- Private helpers ---

  private async getUserLabels(tenantId: string): Promise<TenantLabel[]> {
    try {
      await ensureDefaultUserLabels(this.prisma, tenantId);
      const labels = await this.prisma.userLabel.findMany({
        where: { tenantId, isArchived: false },
        select: {
          name: true, aiPrompt: true, defaultLane: true,
          category: true, suppressUrgency: true, mutuallyExclusiveWith: true,
        },
        orderBy: { orderIndex: 'asc' },
      });
      if (labels.length === 0) {
        return DEFAULT_AI_USER_LABELS.map(({ name, aiPrompt, defaultLane }) => ({
          name, aiPrompt, defaultLane,
          category: 'custom', suppressUrgency: false, mutuallyExclusiveWith: [],
        }));
      }
      return labels;
    } catch {
      return DEFAULT_AI_USER_LABELS.map(({ name, aiPrompt, defaultLane }) => ({
        name, aiPrompt, defaultLane,
        category: 'custom', suppressUrgency: false, mutuallyExclusiveWith: [],
      }));
    }
  }

  /**
   * Build a prompt block with per-label AI instructions.
   * Only includes labels that have an aiPrompt set by the user.
   */
  private async buildAnalyzeSystemPrompt(
    t: ReturnType<typeof getToolTranslations>,
    tenantId: string,
    labelDefs: Array<{ name: string; aiPrompt: string | null }>,
    allowedLabels: string[],
  ): Promise<string> {
    const allowedLabelsText = allowedLabels.join(', ');
    const basePrompt = t.insights.analyzeUnified.systemPrompt(allowedLabelsText, '', '');
    const optionalBudget = Math.max(
      0,
      EmailAnalysisService.MAX_ANALYZE_SYSTEM_PROMPT_LENGTH - basePrompt.length,
    );
    const hasLabelPrompts = labelDefs.some((label) => Boolean(label.aiPrompt?.trim()));
    const labelPromptBudget = hasLabelPrompts
      ? Math.floor(optionalBudget * EmailAnalysisService.LABEL_RULES_BUDGET_RATIO)
      : 0;
    const triageContextBudget = Math.max(0, optionalBudget - labelPromptBudget);
    const labelPromptBlock = this.buildLabelPromptBlock(labelDefs, labelPromptBudget);
    const triageContext = await this.triageRuleService.buildTriageContext(tenantId, {
      includeLabelPrompts: false,
      maxLength: triageContextBudget,
      maxRules: EmailAnalysisService.TRIAGE_CONTEXT_MAX_RULES,
      maxLineLength: EmailAnalysisService.PROMPT_LINE_MAX_LENGTH,
      maxLabelPromptLength: EmailAnalysisService.LABEL_PROMPT_MAX_LENGTH,
    });
    const systemPrompt = t.insights.analyzeUnified.systemPrompt(
      allowedLabelsText,
      labelPromptBlock,
      triageContext,
    );

    if (systemPrompt.length > EmailAnalysisService.MAX_ANALYZE_SYSTEM_PROMPT_LENGTH) {
      this.logger.warn(
        `Analyze system prompt exceeded compact budget: ${systemPrompt.length}/${EmailAnalysisService.MAX_ANALYZE_SYSTEM_PROMPT_LENGTH}`,
      );
    }

    return systemPrompt;
  }

  private buildLabelPromptBlock(
    labels: Array<{ name: string; aiPrompt: string | null }>,
    maxLength?: number,
  ): string {
    const withPrompts = labels.filter((l) => l.aiPrompt);
    if (withPrompts.length === 0) return '';

    const lines = withPrompts.map((label) => {
      const normalizedPrompt = sanitizeForLLM(
        String(label.aiPrompt).replace(/\s+/g, ' ').trim(),
        {
          maxLength: EmailAnalysisService.LABEL_PROMPT_MAX_LENGTH,
          stripCodeBlocks: true,
        },
      );
      return this.truncatePromptLine(
        `- "${label.name}": ${normalizedPrompt}`,
        EmailAnalysisService.PROMPT_LINE_MAX_LENGTH,
      );
    });
    return this.buildTaggedPromptSection(
      'LABEL_RULES',
      lines,
      maxLength,
      'Apply these labels when the described conditions match:',
    );
  }

  private computeLabelRulesSignature(labels: Array<{ name: string; aiPrompt: string | null }>): string {
    const payload = labels.map((label) => ({
      name: label.name.trim().toLowerCase(),
      aiPrompt: (label.aiPrompt || '').trim(),
    }));
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  }

  private buildTaggedPromptSection(
    tag: string,
    lines: string[],
    maxLength?: number,
    prefix?: string,
  ): string {
    if (lines.length === 0) return '';

    const open = `\n<${tag}>\n`;
    const prefixBlock = prefix ? `${prefix}\n` : '';
    const close = `\n</${tag}>`;
    const limit = typeof maxLength === 'number' ? maxLength : Number.MAX_SAFE_INTEGER;
    const overhead = open.length + prefixBlock.length + close.length;
    if (limit <= overhead) return '';

    const accepted: string[] = [];
    let currentLength = overhead;

    for (const line of lines) {
      const normalized = line.trim();
      if (!normalized) continue;

      const lineCost = normalized.length + (accepted.length > 0 ? 1 : 0);
      if (currentLength + lineCost > limit) {
        const available = limit - currentLength - (accepted.length > 0 ? 1 : 0);
        if (available > 6) {
          accepted.push(this.truncatePromptLine(normalized, available));
        }
        break;
      }

      accepted.push(normalized);
      currentLength += lineCost;
    }

    if (accepted.length === 0) return '';
    return `${open}${prefixBlock}${accepted.join('\n')}${close}`;
  }

  private truncatePromptLine(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (maxLength <= 0) return '';
    if (normalized.length <= maxLength) return normalized;
    if (maxLength <= 3) return normalized.slice(0, maxLength);
    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
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
      lane?: string | null;
      intent?: string | null;
      actionability?: string | null;
      suggestedActions: unknown;
    },
    persistedLabels: string[] = [],
  ): UnifiedEmailAnalysis {
    const actions = (analysis.suggestedActions as Record<string, unknown>) || {};
    const actionLabels = Array.isArray(actions.labels)
      ? (actions.labels as string[]).slice(0, 3)
      : [];
    return {
      summary: analysis.summary || '', sentiment: this.validateSentiment(analysis.sentiment),
      tone: (actions.tone as string) || 'neutral', priority: this.mapEnumToPriority(analysis.priority),
      urgency: this.validateUrgency(actions.urgency),
      labels: actionLabels.length > 0
        ? actionLabels
        : (persistedLabels || []).slice(0, 3),
      keyTopics: analysis.keyPoints || [],
      intent: analysis.intent || (actions.intent as string) || 'fyi',
      actionability: this.validateActionability(analysis.actionability),
      lane: analysis.lane ?? null,
      escalationRisk: Boolean(actions.escalationRisk),
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

  private validateIntent(value: unknown): string {
    const valid = ['request', 'update', 'alert', 'sales', 'billing', 'personal', 'fyi'];
    const str = String(value ?? 'fyi').toLowerCase().replace(/_/g, '');
    // Map legacy intent values to new schema
    if (str === 'actionrequired' || str === 'action_required') return 'request';
    if (str === 'meetingrequest' || str === 'meeting_request') return 'request';
    if (str === 'followup' || str === 'follow_up') return 'request';
    if (str === 'question') return 'request';
    if (str === 'escalation') return 'alert';
    if (str === 'feedback') return 'fyi';
    return valid.includes(str) ? str : 'fyi';
  }

  private validateActionability(value: unknown): 'none' | 'todo' | 'waiting' {
    const valid = ['none', 'todo', 'waiting'];
    const str = String(value ?? 'none').toLowerCase();
    return valid.includes(str) ? (str as 'none' | 'todo' | 'waiting') : 'none';
  }

  private normalizeLabels(labels: unknown, allowedLabels: string[]): string[] {
    if (!Array.isArray(labels)) return [];
    return labels.slice(0, 3)
      .map((l) => this.labelResolution.normaliseLabel(String(l), allowedLabels))
      .filter((l) => allowedLabels.includes(l));
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
