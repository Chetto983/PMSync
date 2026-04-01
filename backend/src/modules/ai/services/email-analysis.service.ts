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

type LocaleKey = 'en' | 'it';

interface EmailRecord {
  id: string; subject: string | null; from: string; to: string[];
  bodyText: string | null; bodyHtml: string | null; snippet: string | null; receivedAt: Date;
}

@Injectable()
export class EmailAnalysisService {
  private readonly logger = new Logger(EmailAnalysisService.name);
  private readonly analysisVersion = 'unified-email-v2';

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    private readonly utils: InsightUtilsService,
    private readonly triageRuleService: TriageRuleService,
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
    const labelPromptBlock = this.buildLabelPromptBlock(labelDefs);
    const triageContext = await this.triageRuleService.buildTriageContext(tenantId);
    const systemPrompt = t.insights.analyzeUnified.systemPrompt(allowedLabels.join(', '), labelPromptBlock, triageContext);
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
      const labels = this.resolveLabels(email, this.normalizeLabels(parsed.labels, allowedLabels), allowedLabels, {
        priority: rawPriority,
        urgency: rawUrgency,
        intent,
        escalationRisk,
        hasDeadline,
        needsFollowUp: rawNeedsFollowUp,
      });
      const normalizedSignals = this.normalizeTriageSignals(email, labels, {
        priority: rawPriority,
        urgency: rawUrgency,
        intent,
        escalationRisk,
        hasDeadline,
        deadlineDate: parsed.deadlineDate ? new Date(parsed.deadlineDate as string) : null,
        needsFollowUp: rawNeedsFollowUp,
        followUpDate: rawFollowUpDate,
        followUpReason: rawFollowUpReason,
      });

      const result: UnifiedEmailAnalysis = {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        sentiment: this.validateSentiment(parsed.sentiment),
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'neutral',
        priority: normalizedSignals.priority,
        urgency: normalizedSignals.urgency,
        labels,
        keyTopics: Array.isArray(parsed.keyTopics) ? (parsed.keyTopics as string[]).slice(0, 5) : [],
        intent,
        actionability,
        lane: this.deriveLane(labels, labelDefs, actionability),
        escalationRisk,
        hasDeadline,
        deadlineDate: normalizedSignals.deadlineDate,
        needsFollowUp: normalizedSignals.needsFollowUp,
        followUpDate: normalizedSignals.followUpDate,
        followUpReason: normalizedSignals.followUpReason,
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

  private async getUserLabels(tenantId: string): Promise<Array<{ name: string; aiPrompt: string | null; defaultLane: string | null }>> {
    try {
      await ensureDefaultUserLabels(this.prisma, tenantId);
      const labels = await this.prisma.userLabel.findMany({
        where: { tenantId, isArchived: false },
        select: { name: true, aiPrompt: true, defaultLane: true },
        orderBy: { orderIndex: 'asc' },
      });
      return labels.length === 0
        ? DEFAULT_AI_USER_LABELS.map(({ name, aiPrompt, defaultLane }) => ({ name, aiPrompt, defaultLane }))
        : labels;
    } catch {
      return DEFAULT_AI_USER_LABELS.map(({ name, aiPrompt, defaultLane }) => ({ name, aiPrompt, defaultLane }));
    }
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

  private computeLabelRulesSignature(labels: Array<{ name: string; aiPrompt: string | null }>): string {
    const payload = labels.map((label) => ({
      name: label.name.trim().toLowerCase(),
      aiPrompt: (label.aiPrompt || '').trim(),
    }));
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
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

  /**
   * Derive lane from resolved labels using label metadata.
   * First label with a defaultLane wins. Falls back to 'review-later'.
   */
  private deriveLane(
    labels: string[],
    labelDefs: Array<{ name: string; defaultLane: string | null }>,
    actionability: string,
  ): string {
    for (const labelName of labels) {
      const def = labelDefs.find((l) => l.name === labelName);
      if (def?.defaultLane) return def.defaultLane;
    }
    // Fallback: if actionability is todo, default to action-now
    if (actionability === 'todo') return 'action-now';
    if (actionability === 'waiting') return 'waiting-on-reply';
    return 'review-later';
  }

  private normalizeLabels(labels: unknown, allowedLabels: string[]): string[] {
    if (!Array.isArray(labels)) return [];
    return labels.slice(0, 3).map((l) => this.normaliseLabel(String(l), allowedLabels)).filter((l) => allowedLabels.includes(l));
  }

  private resolveLabels(
    email: EmailRecord,
    modelLabels: string[],
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
    if (modelLabels.length > 0) {
      return modelLabels;
    }

    return this.inferLabels(email, allowedLabels, signals);
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
    if (
      signals.escalationRisk ||
      signals.priority === 1 ||
      signals.urgency === 'critical' ||
      (
        signals.priority <= 2 &&
        (signals.intent === 'action_required' || signals.intent === 'question' || signals.hasDeadline)
      )
    ) {
      pushAllowed('Important');
    }
    if (signals.intent === 'follow_up' || (signals.needsFollowUp && signals.intent !== 'fyi')) {
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

  private normalizeTriageSignals(
    email: EmailRecord,
    labels: string[],
    signals: {
      priority: 1 | 2 | 3 | 4 | 5;
      urgency: 'critical' | 'high' | 'medium' | 'low';
      intent: string;
      escalationRisk: boolean;
      hasDeadline: boolean;
      deadlineDate: Date | null;
      needsFollowUp: boolean;
      followUpDate: Date | null;
      followUpReason: string | null;
    },
  ): {
    priority: 1 | 2 | 3 | 4 | 5;
    urgency: 'critical' | 'high' | 'medium' | 'low';
    deadlineDate: Date | null;
    needsFollowUp: boolean;
    followUpDate: Date | null;
    followUpReason: string | null;
  } {
    const labelSet = new Set(labels.map((label) => label.trim().toLowerCase()));
    const sample = `${email.from}\n${email.subject || ''}\n${email.snippet || ''}\n${email.bodyText || ''}`.toLowerCase();

    const hasActionLabel = labelSet.has('action items') || labelSet.has('follow-up');
    const hasPassiveLabel = labelSet.has('updates') || labelSet.has('promotions') || labelSet.has('info');
    const explicitActionIntent = ['action_required', 'question', 'meeting_request', 'follow_up'].includes(signals.intent);
    const promotionalCue = /\b(newsletter|unsubscribe|promotion|promo|sale|discount|offer|coupon|marketing campaign)\b/.test(sample);
    const routineNotificationCue = /\b(release notes?|changelog|announcement|digest|weekly update|monthly update|product update|new feature|notification)\b/.test(sample);
    const deliverySenderCue = /\b(no-?reply|noreply|do-not-reply|donotreply|notification|notifications|alerts?)\b/.test(sample);
    const systemSourceCue = /\b(github|vercel|railway|gitlab|bitbucket|jira|linear|buildkite)\b/.test(sample);
    const criticalIncidentCue = /\b(failed|failure|outage|incident|breach|security alert|data loss|broken|degraded|down|sev[0-9]|urgent|asap|immediately|action required|approval required|reply required|response needed)\b/.test(sample);
    const actionableSystemAlert = systemSourceCue
      && criticalIncidentCue
      && (explicitActionIntent || hasActionLabel || /\b(build-and-test failed|run failed|workflow run|view results|view workflow run)\b/.test(sample));
    const passiveNotification = !signals.hasDeadline
      && !signals.escalationRisk
      && !explicitActionIntent
      && !hasActionLabel
      && !criticalIncidentCue
      && (promotionalCue || (hasPassiveLabel && (routineNotificationCue || deliverySenderCue || systemSourceCue)));

    if (!passiveNotification) {
      if (!actionableSystemAlert) {
        return signals;
      }

      return {
        priority: Math.min(signals.priority, 2) as 1 | 2 | 3 | 4 | 5,
        urgency: signals.urgency === 'critical' ? 'critical' : 'high',
        deadlineDate: signals.deadlineDate,
        needsFollowUp: signals.needsFollowUp,
        followUpDate: signals.followUpDate,
        followUpReason: signals.followUpReason,
      };
    }

    if (promotionalCue) {
      return {
        priority: Math.max(signals.priority, 4) as 1 | 2 | 3 | 4 | 5,
        urgency: 'low',
        deadlineDate: signals.deadlineDate,
        needsFollowUp: false,
        followUpDate: null,
        followUpReason: null,
      };
    }

    return {
      priority: Math.max(signals.priority, 3) as 1 | 2 | 3 | 4 | 5,
      urgency: signals.urgency === 'critical' || signals.urgency === 'high' ? 'medium' : signals.urgency,
      deadlineDate: signals.deadlineDate,
      needsFollowUp: false,
      followUpDate: null,
      followUpReason: null,
    };
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
