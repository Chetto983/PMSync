import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { WritingStyleService } from '../voltagent/services/writing-style.service';
// PersonalizationService removed - AI refactor v2.0
import { parseArrayFromAiPayload } from '../utils/ai-output.utils';
import { sanitizeForLLM, wrapUserContent, validatePromptLength } from '../utils/prompt-sanitizer';
import {
  getLocale,
  getToolTranslations,
  type SupportedLocale,
} from '../voltagent/locales';
import { PiiDetectionService } from '../guards';

type LocaleKey = 'en' | 'it';
type ToneKey = 'formal' | 'casual' | 'technical';

/**
 * UNIFIED EMAIL ANALYSIS RESULT
 *
 * Single LLM call returns all insights needed by:
 * - Email triage (priority, labels)
 * - Agent context (summary, sentiment, topics)
 * - UI display (smartReplies, escalationRisk)
 */
export interface UnifiedEmailAnalysis {
  // Core analysis
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  tone: string;
  priority: 1 | 2 | 3 | 4 | 5; // 1=highest/critical, 5=lowest
  urgency: 'critical' | 'high' | 'medium' | 'low';
  labels: string[]; // Max 3, from user's allowed labels
  keyTopics: string[];
  intent: string;

  // Risk & action flags
  escalationRisk: boolean;
  hasDeadline: boolean;
  deadlineDate: Date | null;
  needsFollowUp: boolean;

  // Optional features
  smartReplies?: string[];

  // Metadata
  confidence: number;
  reasoning: string;
}

interface EmailRecord {
  id: string;
  subject: string | null;
  from: string;
  to: string[];
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  receivedAt: Date;
}

@Injectable()
export class EmailInsightsService {
  private readonly logger = new Logger(EmailInsightsService.name);
  // Default labels as fallback when no custom labels exist
  private readonly defaultLabels = [
    'Important',
    'Follow-up',
    'Action Items',
    'Info',
    'Personal',
    'Finance',
    'Promotions',
    'Updates',
  ];

  /**
   * Fetch user's custom labels from database, fallback to defaults
   */
  private async getUserLabels(tenantId: string): Promise<string[]> {
    try {
      const labels = await this.prisma.userLabel.findMany({
        where: {
          tenantId,
          isArchived: false,
        },
        select: { name: true },
        orderBy: { orderIndex: 'asc' },
      });

      if (labels.length === 0) {
        this.logger.debug(`No custom labels for tenant ${tenantId}, using defaults`);
        return this.defaultLabels;
      }

      return labels.map((l) => l.name);
    } catch (error) {
      this.logger.warn(`Failed to fetch labels for ${tenantId}, using defaults: ${error}`);
      return this.defaultLabels;
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    private readonly writingStyle: WritingStyleService,
    // PersonalizationService removed - AI refactor v2.0
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(PiiDetectionService) private readonly piiDetection?: PiiDetectionService,
  ) {}

  /**
   * Redact PII from text before sending to LLM.
   * GDPR/CCPA compliance - ensures no personal data is sent to external AI.
   */
  private redactPii(text: string): string {
    if (!this.piiDetection || !text) {
      return text;
    }
    try {
      const result = this.piiDetection.detect(text);
      if (result.details.length > 0) {
        this.logger.debug(`Redacted ${result.details.length} PII items from email content`);
      }
      return result.redactedText;
    } catch (error) {
      this.logger.warn(`PII detection failed, using original content: ${error}`);
      return text;
    }
  }

  /**
   * UNIFIED EMAIL ANALYSIS - Single LLM call for ALL insights
   *
   * Returns: summary, sentiment, tone, priority, urgency, labels, keyTopics,
   * escalationRisk, hasDeadline, needsFollowUp, smartReplies
   *
   * This replaces: summarizeEmail, categorizeEmail, analyzeSentiment, calculatePriority, analyzeEmail
   *
   * CACHING: Results cached in EmailAnalysis table for 24 hours
   */
  async analyzeEmailUnified(
    tenantId: string,
    emailId: string,
    locale?: string,
    options?: { includeSmartReplies?: boolean },
  ): Promise<UnifiedEmailAnalysis> {
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

    // Resolve locale early for cache check
    const lang = this.resolveLocale(locale);

    // Check cache first - BUT verify locale matches (fixes wrong-language responses)
    const cached = await this.prisma.emailAnalysis.findFirst({
      where: {
        emailId,
        tenantId,
        processedAt: { gt: new Date(Date.now() - CACHE_TTL_MS) },
      },
    });

    // Cache hit only if locale matches (stored in suggestedActions.locale)
    const cachedLocale = (cached?.suggestedActions as Record<string, unknown>)?.locale as string | undefined;
    if (cached?.summary && cachedLocale === lang) {
      this.logger.debug(`Cache hit for analyzeEmailUnified: ${emailId} (locale: ${lang})`);
      return this.mapEmailAnalysisToUnified(cached);
    }

    if (cached?.summary && cachedLocale !== lang) {
      this.logger.debug(`Cache miss - locale mismatch: cached=${cachedLocale}, requested=${lang}`);
    }

    // No cache (or locale mismatch) - run LLM analysis
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    // lang already resolved above for cache check

    // Get user's allowed labels
    const allowedLabels = await this.getUserLabels(tenantId);
    const labelsString = allowedLabels.join(', ');

    // Build unified prompt
    const systemPrompt = t.insights.analyzeUnified.systemPrompt(labelsString);
    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const startTime = Date.now();
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 800,
        validationContext: 'SYSTEM_INTERNAL',
      });
      const latencyMs = Date.now() - startTime;

      const parsed = this.parseJsonResponse(raw);

      // Build result with validation
      const result: UnifiedEmailAnalysis = {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        sentiment: this.validateSentiment(parsed.sentiment),
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'neutral',
        priority: Math.min(5, Math.max(1, Number(parsed.priority) || 3)) as 1 | 2 | 3 | 4 | 5,
        urgency: this.validateUrgency(parsed.urgency),
        labels: this.normalizeLabels(parsed.labels, allowedLabels),
        keyTopics: Array.isArray(parsed.keyTopics) ? (parsed.keyTopics as string[]).slice(0, 5) : [],
        intent: typeof parsed.intent === 'string' ? parsed.intent : 'fyi',
        escalationRisk: Boolean(parsed.escalationRisk),
        hasDeadline: Boolean(parsed.hasDeadline),
        deadlineDate: parsed.deadlineDate ? new Date(parsed.deadlineDate as string) : null,
        needsFollowUp: Boolean(parsed.needsFollowUp),
        smartReplies: options?.includeSmartReplies && Array.isArray(parsed.smartReplies)
          ? (parsed.smartReplies as string[]).slice(0, 3)
          : undefined,
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      };

      // Save to EmailAnalysis with proper fields
      await this.prisma.emailAnalysis.upsert({
        where: { emailId_tenantId: { emailId, tenantId } },
        update: {
          priority: this.mapPriorityToEnum(result.priority),
          category: this.mapIntentToCategory(result.intent),
          sentiment: this.mapSentimentToEnum(result.sentiment),
          summary: result.summary,
          keyPoints: result.keyTopics,
          hasDeadline: result.hasDeadline,
          deadlineDate: result.deadlineDate,
          needsFollowUp: result.needsFollowUp,
          suggestedActions: {
            locale: lang, // Store locale for cache validation
            smartReplies: result.smartReplies,
            intent: result.intent,
            urgency: result.urgency,
            tone: result.tone,
            escalationRisk: result.escalationRisk,
            reasoning: result.reasoning,
            confidence: result.confidence,
          },
          processedAt: new Date(),
          latencyMs,
        },
        create: {
          emailId,
          tenantId,
          priority: this.mapPriorityToEnum(result.priority),
          category: this.mapIntentToCategory(result.intent),
          sentiment: this.mapSentimentToEnum(result.sentiment),
          summary: result.summary,
          keyPoints: result.keyTopics,
          hasDeadline: result.hasDeadline,
          deadlineDate: result.deadlineDate,
          needsFollowUp: result.needsFollowUp,
          suggestedActions: {
            locale: lang, // Store locale for cache validation
            smartReplies: result.smartReplies,
            intent: result.intent,
            urgency: result.urgency,
            tone: result.tone,
            escalationRisk: result.escalationRisk,
            reasoning: result.reasoning,
            confidence: result.confidence,
          },
          processedAt: new Date(),
          latencyMs,
        },
      });

      // Update Email table with AI triage data
      await this.prisma.email.updateMany({
        where: { id: emailId, tenantId },
        data: {
          aiPriority: result.priority,
          aiPriorityReason: result.reasoning,
          aiSentiment: result.sentiment,
          aiLabels: result.labels,
          isAutoTriaged: true,
          autoTriagedAt: new Date(),
        },
      });

      // FIX: Create EmailLabel junction records for AI-assigned labels
      // This links the Email to UserLabel records so labels appear in UI
      if (result.labels.length > 0) {
        await this.linkEmailToUserLabels(tenantId, emailId, result.labels);
      }

      this.logger.debug(
        `Unified analysis for ${emailId}: priority=${result.priority}, labels=${result.labels.join(',')}, latency=${latencyMs}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed unified analysis for ${emailId}: ${this.getErrorMessage(error)}`);
      throw new BadRequestException('Unable to analyze email');
    }
  }

  /**
   * Map EmailAnalysis record to UnifiedEmailAnalysis interface
   */
  private mapEmailAnalysisToUnified(analysis: {
    priority: string;
    category: string;
    sentiment: string;
    summary: string | null;
    keyPoints: string[];
    hasDeadline: boolean;
    deadlineDate: Date | null;
    needsFollowUp: boolean;
    suggestedActions: unknown;
  }): UnifiedEmailAnalysis {
    const actions = (analysis.suggestedActions as Record<string, unknown>) || {};
    return {
      summary: analysis.summary || '',
      sentiment: this.validateSentiment(analysis.sentiment),
      tone: (actions.tone as string) || 'neutral',
      priority: this.mapEnumToPriority(analysis.priority),
      urgency: this.validateUrgency(actions.urgency),
      labels: [], // Labels stored in Email.aiLabels, not here
      keyTopics: analysis.keyPoints || [],
      intent: (actions.intent as string) || 'fyi',
      escalationRisk: Boolean(actions.escalationRisk),
      hasDeadline: analysis.hasDeadline,
      deadlineDate: analysis.deadlineDate,
      needsFollowUp: analysis.needsFollowUp,
      smartReplies: actions.smartReplies as string[] | undefined,
      confidence: Number(actions.confidence) || 0.7,
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
    return labels
      .slice(0, 3)
      .map((l) => this.normaliseLabel(String(l), allowedLabels))
      .filter((l) => allowedLabels.includes(l));
  }

  private mapPriorityToEnum(priority: number): 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW' {
    if (priority <= 1) return 'URGENT';
    if (priority <= 2) return 'HIGH';
    if (priority <= 4) return 'NORMAL';
    return 'LOW';
  }

  private mapEnumToPriority(enumValue: string): 1 | 2 | 3 | 4 | 5 {
    switch (enumValue) {
      case 'URGENT': return 1;
      case 'HIGH': return 2;
      case 'NORMAL': return 3;
      case 'LOW': return 5;
      default: return 3;
    }
  }

  private mapIntentToCategory(intent: string): 'SALES_INQUIRY' | 'SUPPORT_REQUEST' | 'MEETING_REQUEST' | 'FOLLOW_UP' | 'PERSONAL' | 'OTHER' {
    switch (intent) {
      case 'action_required': return 'SUPPORT_REQUEST';
      case 'meeting_request': return 'MEETING_REQUEST';
      case 'follow_up': return 'FOLLOW_UP';
      case 'question': return 'SUPPORT_REQUEST';
      case 'feedback': return 'PERSONAL';
      case 'escalation': return 'SUPPORT_REQUEST';
      default: return 'OTHER';
    }
  }

  private mapSentimentToEnum(sentiment: string): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
    switch (sentiment) {
      case 'positive': return 'POSITIVE';
      case 'negative': return 'NEGATIVE';
      case 'mixed': return 'NEGATIVE'; // Treat mixed as negative for prioritization
      default: return 'NEUTRAL';
    }
  }

  // ============================================================================
  // STANDALONE METHODS - Not part of unified analysis
  // These are standalone features that make separate LLM calls when specifically requested
  // ============================================================================

  async generateSmartReplies(
    tenantId: string,
    emailId: string,
    locale?: string,
    tone?: string,
  ) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const replyTone = this.resolveTone(tone);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);

    const toneInstructions = t.insights.tones[replyTone];
    const systemPrompt = t.insights.smartReplies.systemPrompt(toneInstructions);

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 500,
        modelTier: 'creative', // Smart replies need creative writing capability
        validationContext: 'SYSTEM_INTERNAL', // Email content analysis - skip jailbreak patterns
      });

      const parsedReplies = parseArrayFromAiPayload(raw, 'replies');
      const candidates = parsedReplies.length ? parsedReplies : this.extractLines(raw);
      const suggestions = this.formatSmartReplyCandidates(candidates);

      if (!suggestions.length) {
        throw new Error('Empty smart replies');
      }

      return suggestions.slice(0, 3);
    } catch (error) {
      this.logger.error(
        `Failed to generate smart replies for email ${emailId}: ${this.getErrorMessage(error)}`,
      );
      throw new BadRequestException('Unable to generate smart replies');
    }
  }

  /**
   * Compose an email body (and optional subject) from a user prompt.
   * Integrates user writing style and semantic memory for personalization.
   */
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
    const lang = this.resolveLocale(payload.locale);
    const toneKey = this.resolveTone(payload.tone);
    const supportedLocale = getLocale(payload.locale);
    const t = getToolTranslations(supportedLocale);

    // Fetch user's writing style if available
    let styleSection = '';
    if (userId) {
      try {
        const style = await this.writingStyle.getStylePromptSection(tenantId, userId, lang);
        styleSection = style ?? '';
      } catch (error) {
        this.logger.debug(`No writing style found for user ${userId}: ${this.getErrorMessage(error)}`);
      }
    }

    // Memory context removed - PersonalizationService removed in AI refactor v2.0
    const memoryContext = '';

    const toneInstruction = t.insights.tones[toneKey];
    // Get language name for the system prompt (e.g., "English", "Italian")
    const languageName = t.insights.compose.languageNames?.[lang] || (lang === 'it' ? 'Italian' : 'English');
    const systemPrompt = t.insights.compose.systemPrompt(toneInstruction, languageName);

    const userPrompt = this.buildComposePrompt(
      payload,
      lang,
      toneKey,
      styleSection,
      supportedLocale,
      memoryContext,
    );

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.35,
        maxTokens: 900,
        modelTier: 'creative', // Email composition needs creative writing capability
        jsonMode: true, // Enable JSON mode for guaranteed valid JSON output
        validationContext: 'SYSTEM_INTERNAL', // Email compose - skip jailbreak patterns
      });

      this.logger.debug(`[composeEmail] Raw Mistral response (first 500 chars): ${raw?.substring(0, 500)}`);

      const parsed = this.parseComposeResult(raw, payload.subject);

      this.logger.log(`[composeEmail] Parsed result: body="${parsed.body?.substring(0, 100)}..." subject="${parsed.subject}"`);

      return {
        body: parsed.body,
        subject: parsed.subject,
      };
    } catch (error) {
      this.logger.error(
        `Failed to compose email for tenant=${tenantId}: ${this.getErrorMessage(error)}`,
      );
      throw new BadRequestException('Unable to compose email');
    }
  }

  /**
   * Parse JSON response from AI, handling markdown code blocks
   */
  private parseJsonResponse(raw: string): Record<string, unknown> {
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }

  private async getEmailOrThrow(tenantId: string, emailId: string): Promise<EmailRecord> {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        bodyText: true,
        bodyHtml: true,
        snippet: true,
        receivedAt: true,
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    return email;
  }

  private buildEmailPrompt(email: EmailRecord, locale: LocaleKey): string {
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const toList = email.to.join(', ');

    // Step 1: Redact PII (GDPR/CCPA compliance)
    const piiRedactedSubject = this.redactPii(email.subject || t.insights.noSubject);
    const piiRedactedFrom = this.redactPii(email.from);
    const piiRedactedToList = this.redactPii(toList);

    // Step 2: Sanitize for prompt injection (after PII redaction)
    const sanitizedSubject = sanitizeForLLM(piiRedactedSubject, { maxLength: 500 });
    const sanitizedFrom = sanitizeForLLM(piiRedactedFrom, { maxLength: 500 });
    const sanitizedToList = sanitizeForLLM(piiRedactedToList, { maxLength: 2000 });

    const header = `${t.insights.subject}: ${sanitizedSubject}\n${t.insights.from}: ${sanitizedFrom}\n${t.insights.to}: ${sanitizedToList}`;

    const content = this.extractEmailContent(email, supportedLocale);
    // Step 3: Redact PII from body content, then sanitize
    const piiRedactedContent = this.redactPii(content);
    const sanitizedContent = sanitizeForLLM(piiRedactedContent, { maxLength: 8000 });

    // Wrap user content with clear delimiters
    const userContent = wrapUserContent(`${header}\n\n${t.insights.emailBody}\n${sanitizedContent}`);

    // Validate total prompt length
    validatePromptLength(userContent, 15000);

    return userContent;
  }

  private extractEmailContent(email: EmailRecord, locale?: SupportedLocale): string {
    if (email.bodyText && email.bodyText.trim().length > 0) {
      return this.truncate(email.bodyText.trim());
    }

    if (email.bodyHtml) {
      const text = email.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 0) {
        return this.truncate(text);
      }
    }

    if (email.snippet) {
      return this.truncate(email.snippet.trim());
    }

    const t = getToolTranslations(locale || 'en');
    return t.insights.contentUnavailable;
  }

  private extractLines(payload: string): string[] {
    return payload
      .split(/\n+/)
      .map((line) => line.replace(/^[\-\*\d.\s]+/, '').trim())
      .filter(Boolean)
      .filter((line) => !/^```/.test(line))
      .filter((line) => !/^[\{\}\[\]]+$/.test(line))
      .filter((line) => !/^"?(replies|labels|subject|body|text|message|reply|content)"?\s*:/.test(line));
  }

  private normaliseLabel(label: string, allowedLabels: string[]): string {
    const trimmed = label.trim().toLowerCase();
    const found = allowedLabels.find(
      (item) => item.toLowerCase() === trimmed || item.toLowerCase().includes(trimmed),
    );
    return found ?? label.trim();
  }

  private resolveLocale(locale?: string): LocaleKey {
    return locale && locale.toLowerCase().startsWith('it') ? 'it' : 'en';
  }

  private resolveTone(tone?: string): ToneKey {
    if (tone && ['formal', 'casual', 'technical'].includes(tone.toLowerCase())) {
      return tone.toLowerCase() as ToneKey;
    }
    return 'casual'; // Default tone
  }


  private buildComposePrompt(
    payload: {
      prompt: string;
      to?: string[];
      subject?: string;
      tone?: string;
      threadContext?: Array<{ subject?: string; body?: string }>;
      senderName?: string;
      signature?: string;
    },
    _locale: LocaleKey,
    tone: ToneKey,
    styleSection?: string,
    supportedLocale?: SupportedLocale,
    memoryContext?: string,
  ): string {
    const t = getToolTranslations(supportedLocale || 'en');

    // PII redaction for user-provided content (GDPR/CCPA compliance)
    const redactedTo = payload.to?.map((email) => this.redactPii(email)) ?? [];
    const redactedSubject = payload.subject ? this.redactPii(payload.subject) : undefined;
    const redactedPrompt = this.redactPii(payload.prompt);
    const redactedThreadContext = payload.threadContext?.map((item) => ({
      subject: item.subject ? this.redactPii(item.subject) : item.subject,
      body: item.body ? this.redactPii(item.body) : item.body,
    }));

    const toLine =
      redactedTo.length
        ? `${t.insights.compose.recipients}: ${redactedTo.join(', ')}`
        : '';
    const subjectLine = redactedSubject
      ? `${t.insights.compose.subjectHint}: ${redactedSubject}`
      : '';
    const toneLine = `${t.insights.compose.requestedTone}: ${tone}.`;
    // Include sender name for signature personalization (kept as-is for personalization)
    const senderLine = payload.senderName
      ? `${t.insights.compose.senderName}: ${payload.senderName}`
      : '';
    // Include custom signature if provided (kept as-is for signature generation)
    const signatureLine = payload.signature
      ? `${t.insights.compose.signatureInstruction}: ${payload.signature}`
      : '';
    const threadLines =
      redactedThreadContext && redactedThreadContext.length
        ? t.insights.compose.threadContext +
          '\n' +
          redactedThreadContext
            .slice(0, 3)
            .map((item, idx) => {
              const header = `${t.insights.compose.message} #${idx + 1}`;
              return `${header}\nS: ${item.subject ?? '-'}\nB: ${this.truncate(item.body ?? '', 800)}`;
            })
            .join('\n\n')
        : '';

    return [
      t.insights.compose.draftInstruction,
      toneLine,
      senderLine,  // Include sender name in prompt
      signatureLine, // Include signature instruction
      toLine,
      subjectLine,
      threadLines,
      memoryContext,  // Include semantic memory context
      styleSection,
      `${t.insights.compose.userPrompt}: ${redactedPrompt}`,
      t.insights.compose.jsonInstruction,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseComposeResult(raw: string, fallbackSubject?: string): { body: string; subject?: string } {
    this.logger.debug(`[parseComposeResult] Input raw (first 300 chars): ${raw?.substring(0, 300)}`);
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      // Fix: Mistral often returns JSON with actual newlines inside string values
      // which is invalid JSON. We need to escape them properly.
      // This regex finds strings and escapes unescaped newlines within them.
      cleaned = this.fixJsonNewlines(cleaned);

      this.logger.debug(`[parseComposeResult] Cleaned JSON: ${cleaned.substring(0, 200)}`);
      const parsed = JSON.parse(cleaned);
      this.logger.debug(`[parseComposeResult] Parsed body: "${parsed.body?.substring(0, 100)}", subject: "${parsed.subject}"`);
      const body = parsed.body ? this.stripMarkdown(String(parsed.body)) : this.stripMarkdown(cleaned);
      const subject = parsed.subject ? this.stripMarkdown(String(parsed.subject)) : fallbackSubject;
      return { body, subject };
    } catch (error) {
      this.logger.warn(`[parseComposeResult] JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback: try to extract body/subject using regex
      const fallback = this.extractComposeFromMalformedJson(raw, fallbackSubject);
      return fallback;
    }
  }

  /**
   * Fix JSON strings that contain actual newlines instead of escaped \n
   * Mistral often returns multi-line strings without proper escaping
   */
  private fixJsonNewlines(json: string): string {
    // Replace actual newlines inside JSON string values with escaped \n
    // This is a simplified approach that works for our use case
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < json.length; i++) {
      const char = json[i];

      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      if (inString && char === '\n') {
        result += '\\n';
        continue;
      }

      if (inString && char === '\r') {
        // Skip carriage returns, just use \n
        continue;
      }

      result += char;
    }

    return result;
  }

  /**
   * Extract body and subject from malformed JSON response using regex
   */
  private extractComposeFromMalformedJson(raw: string, fallbackSubject?: string): { body: string; subject?: string } {
    // Try to extract subject
    const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/);
    const subject = subjectMatch ? subjectMatch[1] : fallbackSubject;

    // Try to extract body - find content between "body": " and the closing
    const bodyMatch = raw.match(/"body"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|"$)/);
    if (bodyMatch) {
      // Unescape and clean the body
      const body = bodyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      return { body: this.stripMarkdown(body), subject };
    }

    // Ultimate fallback: strip JSON markers and return as plain text
    const plainText = raw
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/\{[\s\S]*?"body"\s*:\s*"/g, '')
      .replace(/"[\s\S]*$/g, '')
      .trim();

    if (plainText) {
      return { body: this.stripMarkdown(plainText), subject };
    }

    return { body: 'Draft unavailable', subject: fallbackSubject };
  }

  private truncate(value: string, limit = 6000): string {
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Strip markdown formatting from AI-generated text
   */
  private stripMarkdown(text: string): string {
    return text
      // Remove bold/italic markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bullet points but keep content
      .replace(/^\s*[\-\*•]\s+/gm, '- ')
      // Remove numbered list markers but keep numbers
      .replace(/^\s*\d+\.\s+/gm, '')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Clean up excessive whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private formatSmartReplyCandidates(candidates: string[]): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();

    candidates.forEach((candidate) => {
      if (!candidate) {
        return;
      }

      const cleaned = candidate
        .replace(/```/g, '')
        .replace(/^"+|"+$/g, '')
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .replace(/\s*\n+\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\-\*\d.\s]+/, '')
        .trim();

      if (!cleaned) {
        return;
      }

      const dedupeKey = cleaned.toLowerCase();
      if (!seen.has(dedupeKey)) {
        normalized.push(cleaned);
        seen.add(dedupeKey);
      }
    });

    return normalized;
  }

  /**
   * Link email to UserLabel records via EmailLabel junction table.
   * Creates junction records for AI-assigned labels so they appear in UI.
   *
   * @param tenantId - Tenant ID for label lookup
   * @param emailId - Email to link
   * @param labelNames - Array of label names (e.g., ["Important", "Follow-up"])
   */
  private async linkEmailToUserLabels(
    tenantId: string,
    emailId: string,
    labelNames: string[],
  ): Promise<void> {
    if (labelNames.length === 0) return;

    try {
      // Find UserLabel records matching the AI-assigned label names (case-insensitive)
      const matchingLabels = await this.prisma.userLabel.findMany({
        where: {
          tenantId,
          isArchived: false,
          OR: labelNames.map((name) => ({
            name: { equals: name, mode: 'insensitive' as const },
          })),
        },
        select: { id: true, name: true },
      });

      if (matchingLabels.length === 0) {
        this.logger.debug(
          `[tenant:${tenantId}] No matching UserLabel records found for AI labels: ${labelNames.join(', ')}`,
        );
        return;
      }

      // Create EmailLabel junction records (skip duplicates)
      const emailLabelData = matchingLabels.map((label) => ({
        tenantId,
        emailId,
        labelId: label.id,
      }));

      const result = await this.prisma.emailLabel.createMany({
        data: emailLabelData,
        skipDuplicates: true,
      });

      this.logger.debug(
        `[tenant:${tenantId}] Linked email ${emailId} to ${result.count} UserLabel(s): ${matchingLabels.map((l) => l.name).join(', ')}`,
      );
    } catch (error) {
      // Don't fail triage if label linking fails - just log warning
      this.logger.warn(
        `[tenant:${tenantId}] Failed to link email ${emailId} to labels: ${this.getErrorMessage(error)}`,
      );
    }
  }
}