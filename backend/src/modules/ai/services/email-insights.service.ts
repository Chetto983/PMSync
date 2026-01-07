import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
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

type LocaleKey = 'en' | 'it';
type ToneKey = 'formal' | 'casual' | 'technical';

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
  private readonly allowedLabels = [
    'Important',
    'Follow-up',
    'Action Items',
    'Info',
    'Personal',
    'Finance',
    'Promotions',
    'Updates',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    private readonly writingStyle: WritingStyleService,
    // PersonalizationService removed - AI refactor v2.0
  ) {}

  async summarizeEmail(tenantId: string, emailId: string, locale?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const systemPrompt = t.insights.summarize.systemPrompt;

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const summary = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.2,
        maxTokens: 400,
      });
      return this.stripMarkdown(summary.trim());
    } catch (error) {
      this.logger.error(`Failed to summarize email ${emailId}: ${this.getErrorMessage(error)}`);
      throw new BadRequestException('Unable to generate email summary');
    }
  }

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
        jsonMode: true, // Enable JSON mode for guaranteed valid JSON output
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

  async categorizeEmail(tenantId: string, emailId: string, locale?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);

    const labelsList = this.allowedLabels.join(', ');
    const systemPrompt = t.insights.categorize.systemPrompt(labelsList);

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 300,
      });

      let labels = parseArrayFromAiPayload(raw, 'labels');
      if (!labels.length) {
        labels = this.guessLabelsFromText(raw);
      }

      if (!labels.length) {
        labels = ['Important'];
      }

      return Array.from(
        new Set(
          labels
            .map((label) => this.normaliseLabel(label))
            .filter((label) => this.allowedLabels.includes(label)),
        ),
      ).slice(0, 3);
    } catch (error) {
      this.logger.error(
        `Failed to categorize email ${emailId}: ${this.getErrorMessage(error)}`,
      );
      throw new BadRequestException('Unable to categorize email');
    }
  }

  /**
   * Analyze email sentiment using 2025 best practices:
   * - Aspect-Based Sentiment Analysis (ABSA)
   * - Emotion detection beyond polarity
   * - Churn/escalation risk prediction
   */
  async analyzeSentiment(tenantId: string, emailId: string, locale?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);

    const systemPrompt = t.insights.sentimentDeep.systemPrompt;

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 500,
      });

      const parsed = this.parseJsonResponse(raw);

      return {
        sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'casual',
        emotion: typeof parsed.emotion === 'string' ? parsed.emotion : 'neutral',
        emotionalIntensity: Math.min(1, Math.max(0, Number(parsed.emotionalIntensity) || 0.5)),
        churnRisk: Boolean(parsed.churnRisk),
        aspects: (parsed.aspects as Record<string, string>) || {},
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze sentiment for email ${emailId}: ${this.getErrorMessage(error)}`,
      );
      throw new BadRequestException('Unable to analyze sentiment');
    }
  }

  /**
   * Calculate email priority with multi-factor scoring
   */
  async calculatePriority(
    tenantId: string,
    emailId: string,
    locale?: string,
    senderImportance: 'vip' | 'important' | 'normal' | 'low' = 'normal',
  ) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);

    const systemPrompt = t.insights.priority.systemPrompt;

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 400,
      });

      const parsed = this.parseJsonResponse(raw);

      // Calculate weighted priority with sender importance boost
      const senderBoost = { vip: 3, important: 2, normal: 0, low: -1 }[senderImportance] ?? 0;
      const urgencyScore = Number(parsed.urgencyScore) || 5;
      const importanceScore = Number(parsed.importanceScore) || 5;
      const timeScore = Number(parsed.timeScore) || 5;
      const sentimentImpact = Number(parsed.sentimentImpact) || 0;

      const baseScore =
        urgencyScore * 0.35 +
        importanceScore * 0.35 +
        timeScore * 0.2 +
        sentimentImpact * 0.5;

      const finalScore = Math.min(10, Math.max(1, Math.round(baseScore + senderBoost)));

      return {
        score: finalScore,
        urgency: typeof parsed.urgency === 'string' ? parsed.urgency : 'medium',
        recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : 'handle_this_week',
        factors: Array.isArray(parsed.factors) ? (parsed.factors as string[]) : [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate priority for email ${emailId}: ${this.getErrorMessage(error)}`,
      );
      throw new BadRequestException('Unable to calculate priority');
    }
  }

  /**
   * Comprehensive email analysis combining sentiment, priority, and intent
   */
  async analyzeEmail(tenantId: string, emailId: string, locale?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);

    const systemPrompt = t.insights.analyzeComprehensive.systemPrompt;

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 600,
      });

      const parsed = this.parseJsonResponse(raw);

      return {
        sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'casual',
        urgency: typeof parsed.urgency === 'string' ? parsed.urgency : 'medium',
        intent: typeof parsed.intent === 'string' ? parsed.intent : 'fyi',
        priority: Math.min(10, Math.max(1, Number(parsed.priority) || 5)),
        escalationRisk: Boolean(parsed.escalationRisk),
        keyTopics: Array.isArray(parsed.keyTopics) ? (parsed.keyTopics as string[]) : [],
        suggestedResponse: typeof parsed.suggestedResponse === 'string' ? parsed.suggestedResponse : 'within_day',
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze email ${emailId}: ${this.getErrorMessage(error)}`,
      );
      throw new BadRequestException('Unable to analyze email');
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

    // Sanitize user-provided content to prevent prompt injection
    const sanitizedSubject = sanitizeForLLM(email.subject || t.insights.noSubject, { maxLength: 500 });
    const sanitizedFrom = sanitizeForLLM(email.from, { maxLength: 500 });
    const sanitizedToList = sanitizeForLLM(toList, { maxLength: 2000 });

    const header = `${t.insights.subject}: ${sanitizedSubject}\n${t.insights.from}: ${sanitizedFrom}\n${t.insights.to}: ${sanitizedToList}`;

    const content = this.extractEmailContent(email, supportedLocale);
    const sanitizedContent = sanitizeForLLM(content, { maxLength: 8000 });

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

  private guessLabelsFromText(payload: string): string[] {
    const lowered = payload.toLowerCase();
    return this.allowedLabels.filter((label) => lowered.includes(label.toLowerCase()));
  }

  private normaliseLabel(label: string): string {
    const trimmed = label.trim().toLowerCase();
    const found = this.allowedLabels.find(
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
    const toLine =
      payload.to && payload.to.length
        ? `${t.insights.compose.recipients}: ${payload.to.join(', ')}`
        : '';
    const subjectLine = payload.subject
      ? `${t.insights.compose.subjectHint}: ${payload.subject}`
      : '';
    const toneLine = `${t.insights.compose.requestedTone}: ${tone}.`;
    // Include sender name for signature personalization
    const senderLine = payload.senderName
      ? `${t.insights.compose.senderName}: ${payload.senderName}`
      : '';
    // Include custom signature if provided
    const signatureLine = payload.signature
      ? `${t.insights.compose.signatureInstruction}: ${payload.signature}`
      : '';
    const threadLines =
      payload.threadContext && payload.threadContext.length
        ? t.insights.compose.threadContext +
          '\n' +
          payload.threadContext
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
      `${t.insights.compose.userPrompt}: ${payload.prompt}`,
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
}







