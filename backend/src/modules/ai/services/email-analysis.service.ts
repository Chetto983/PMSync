/**
 * Email Analysis Service
 *
 * Extracted from EmailInsightsService (Phase 11-03).
 * Provides standalone email analysis utilities:
 * - Smart reply generation
 * - Email composition with writing style
 * - JSON response parsing
 * - Prompt building helpers
 *
 * These are NOT part of unified triage - they are standalone features
 * that make separate LLM calls when specifically requested.
 */
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
// TODO Phase 24: Rebuild WritingStyleService with new AiChatService
// import { WritingStyleService } from '../voltagent/services/writing-style.service';
import { parseArrayFromAiPayload } from '../utils/ai-output.utils';
import { sanitizeForLLM, wrapUserContent, validatePromptLength } from '../utils/prompt-sanitizer';
import {
  getLocale,
  getToolTranslations,
  type SupportedLocale,
} from '../locales';
import { PiiDetectionService } from '../guards';
import { AiError, AiErrorCode } from '../errors';

type LocaleKey = 'en' | 'it';
type ToneKey = 'formal' | 'casual' | 'technical';

/**
 * Email record structure for analysis.
 */
export interface EmailRecord {
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
export class EmailAnalysisService {
  private readonly logger = new Logger(EmailAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    // TODO Phase 24: Rebuild WritingStyleService with new AiChatService
    @Optional() @Inject('WritingStyleService')
    private readonly writingStyle?: any,
    @Optional() @Inject(PiiDetectionService)
    private readonly piiDetection?: PiiDetectionService,
  ) {}

  // ==========================================================================
  // STANDALONE METHODS - Not part of unified triage
  // ==========================================================================

  /**
   * Generate smart reply suggestions for an email.
   */
  async generateSmartReplies(
    tenantId: string,
    emailId: string,
    locale?: string,
    tone?: string,
  ): Promise<string[]> {
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
        modelTier: 'creative',
        validationContext: 'SYSTEM_INTERNAL',
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
      throw this.mapAiErrorToHttpException(error, 'generate smart replies');
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
  ): Promise<{ body: string; subject?: string }> {
    const lang = this.resolveLocale(payload.locale);
    const toneKey = this.resolveTone(payload.tone);
    const supportedLocale = getLocale(payload.locale);
    const t = getToolTranslations(supportedLocale);

    // Fetch user's writing style if available
    let styleSection = '';
    if (userId) {
      try {
        const style = await this.writingStyle?.getStylePromptSection(
          tenantId,
          userId,
          lang,
        );
        styleSection = style ?? '';
      } catch (error) {
        this.logger.debug(
          `No writing style found for user ${userId}: ${this.getErrorMessage(error)}`,
        );
      }
    }

    const memoryContext = '';

    const toneInstruction = t.insights.tones[toneKey];
    const languageName =
      t.insights.compose.languageNames?.[lang] ||
      (lang === 'it' ? 'Italian' : 'English');
    const systemPrompt = t.insights.compose.systemPrompt(
      toneInstruction,
      languageName,
    );

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
        modelTier: 'creative',
        jsonMode: true,
        validationContext: 'SYSTEM_INTERNAL',
      });

      this.logger.debug(
        `[composeEmail] Raw Mistral response (first 500 chars): ${raw?.substring(0, 500)}`,
      );

      const parsed = this.parseComposeResult(raw, payload.subject);

      this.logger.log(
        `[composeEmail] Parsed result: body="${parsed.body?.substring(0, 100)}..." subject="${parsed.subject}"`,
      );

      return {
        body: parsed.body,
        subject: parsed.subject,
      };
    } catch (error) {
      this.logger.error(
        `Failed to compose email for tenant=${tenantId}: ${this.getErrorMessage(error)}`,
      );
      throw this.mapAiErrorToHttpException(error, 'compose email');
    }
  }

  // ==========================================================================
  // Public Helpers (used by EmailInsightsService)
  // ==========================================================================

  /**
   * Parse JSON response from AI, handling markdown code blocks.
   */
  parseJsonResponse(raw: string): Record<string, unknown> {
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

  /**
   * Build email prompt with PII redaction and sanitization.
   */
  buildEmailPrompt(email: EmailRecord, locale: LocaleKey): string {
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const toList = email.to.join(', ');

    // Step 1: Redact PII
    const piiRedactedSubject = this.redactPii(
      email.subject || t.insights.noSubject,
    );
    const piiRedactedFrom = this.redactPii(email.from);
    const piiRedactedToList = this.redactPii(toList);

    // Step 2: Sanitize for prompt injection
    const sanitizedSubject = sanitizeForLLM(piiRedactedSubject, {
      maxLength: 500,
    });
    const sanitizedFrom = sanitizeForLLM(piiRedactedFrom, { maxLength: 500 });
    const sanitizedToList = sanitizeForLLM(piiRedactedToList, {
      maxLength: 2000,
    });

    const header = `${t.insights.subject}: ${sanitizedSubject}\n${t.insights.from}: ${sanitizedFrom}\n${t.insights.to}: ${sanitizedToList}`;

    const content = this.extractEmailContent(email, supportedLocale);
    const piiRedactedContent = this.redactPii(content);
    const sanitizedContent = sanitizeForLLM(piiRedactedContent, {
      maxLength: 8000,
    });

    const userContent = wrapUserContent(
      `${header}\n\n${t.insights.emailBody}\n${sanitizedContent}`,
    );

    validatePromptLength(userContent, 15000);

    return userContent;
  }

  /**
   * Map AiError codes to appropriate HTTP exceptions.
   */
  mapAiErrorToHttpException(error: unknown, operation: string): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    const aiError = error instanceof AiError ? error : AiError.fromError(error);

    switch (aiError.code) {
      case AiErrorCode.CIRCUIT_BREAKER_OPEN:
        return new ServiceUnavailableException({
          message: `AI service temporarily unavailable. Please try again in a minute.`,
          code: aiError.code,
          retryable: true,
        });

      case AiErrorCode.QUOTA_EXCEEDED:
        return new HttpException(
          {
            message:
              aiError.message ||
              'AI usage quota exceeded. Please check your subscription.',
            code: aiError.code,
            retryable: false,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );

      case AiErrorCode.RATE_LIMITED:
        return new HttpException(
          {
            message: 'Too many AI requests. Please wait a moment and try again.',
            code: aiError.code,
            retryable: true,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );

      case AiErrorCode.PROVIDER_TIMEOUT:
        return new HttpException(
          {
            message: 'AI service timed out. Please try again.',
            code: aiError.code,
            retryable: true,
          },
          HttpStatus.GATEWAY_TIMEOUT,
        );

      case AiErrorCode.PROVIDER_UNAVAILABLE:
        return new ServiceUnavailableException({
          message: 'AI provider is currently unavailable. Please try again later.',
          code: aiError.code,
          retryable: true,
        });

      case AiErrorCode.PROVIDER_ERROR:
        return new ServiceUnavailableException({
          message: aiError.message || 'AI provider error. Please contact support.',
          code: aiError.code,
          retryable: false,
        });

      case AiErrorCode.PROMPT_BLOCKED:
      case AiErrorCode.OUTPUT_BLOCKED:
        return new BadRequestException({
          message: 'Request blocked by security filters.',
          code: aiError.code,
          retryable: false,
        });

      case AiErrorCode.CONTEXT_TOO_LONG:
        return new BadRequestException({
          message: 'Input too long for AI processing. Please shorten your request.',
          code: aiError.code,
          retryable: false,
        });

      case AiErrorCode.EMPTY_RESPONSE:
        return new ServiceUnavailableException({
          message: 'AI returned an empty response. Please try again.',
          code: aiError.code,
          retryable: true,
        });

      case AiErrorCode.AUTH_FAILED:
        return new ServiceUnavailableException({
          message: 'AI service authentication failed. Please contact support.',
          code: aiError.code,
          retryable: false,
        });

      default:
        return new HttpException(
          {
            message: `Unable to ${operation}: ${aiError.message}`,
            code: aiError.code || 'INTERNAL_ERROR',
            retryable: aiError.retryable,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async getEmailOrThrow(
    tenantId: string,
    emailId: string,
  ): Promise<EmailRecord> {
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
      throw new BadRequestException('Email not found');
    }

    return email;
  }

  private redactPii(text: string): string {
    if (!this.piiDetection || !text) {
      return text;
    }
    try {
      const result = this.piiDetection.detect(text);
      if (result.details.length > 0) {
        this.logger.debug(
          `Redacted ${result.details.length} PII items from email content`,
        );
      }
      return result.redactedText;
    } catch (error) {
      this.logger.warn(
        `PII detection failed, using original content: ${error}`,
      );
      return text;
    }
  }

  private extractEmailContent(
    email: EmailRecord,
    locale?: SupportedLocale,
  ): string {
    if (email.bodyText && email.bodyText.trim().length > 0) {
      return this.truncate(email.bodyText.trim());
    }

    if (email.bodyHtml) {
      const text = email.bodyHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
      .filter(
        (line) =>
          !/^"?(replies|labels|subject|body|text|message|reply|content)"?\s*:/.test(
            line,
          ),
      );
  }

  private resolveLocale(locale?: string): LocaleKey {
    return locale && locale.toLowerCase().startsWith('it') ? 'it' : 'en';
  }

  private resolveTone(tone?: string): ToneKey {
    if (tone && ['formal', 'casual', 'technical'].includes(tone.toLowerCase())) {
      return tone.toLowerCase() as ToneKey;
    }
    return 'casual';
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

    // PII redaction
    const redactedTo = payload.to?.map((email) => this.redactPii(email)) ?? [];
    const redactedSubject = payload.subject
      ? this.redactPii(payload.subject)
      : undefined;
    const redactedPrompt = this.redactPii(payload.prompt);
    const redactedThreadContext = payload.threadContext?.map((item) => ({
      subject: item.subject ? this.redactPii(item.subject) : item.subject,
      body: item.body ? this.redactPii(item.body) : item.body,
    }));

    const toLine = redactedTo.length
      ? `${t.insights.compose.recipients}: ${redactedTo.join(', ')}`
      : '';
    const subjectLine = redactedSubject
      ? `${t.insights.compose.subjectHint}: ${redactedSubject}`
      : '';
    const toneLine = `${t.insights.compose.requestedTone}: ${tone}.`;
    const senderLine = payload.senderName
      ? `${t.insights.compose.senderName}: ${payload.senderName}`
      : '';
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
      senderLine,
      signatureLine,
      toLine,
      subjectLine,
      threadLines,
      memoryContext,
      styleSection,
      `${t.insights.compose.userPrompt}: ${redactedPrompt}`,
      t.insights.compose.jsonInstruction,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseComposeResult(
    raw: string,
    fallbackSubject?: string,
  ): { body: string; subject?: string } {
    this.logger.debug(
      `[parseComposeResult] Input raw (first 300 chars): ${raw?.substring(0, 300)}`,
    );
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

      // Fix newlines in JSON string values
      cleaned = this.fixJsonNewlines(cleaned);

      this.logger.debug(
        `[parseComposeResult] Cleaned JSON: ${cleaned.substring(0, 200)}`,
      );
      const parsed = JSON.parse(cleaned);
      this.logger.debug(
        `[parseComposeResult] Parsed body: "${parsed.body?.substring(0, 100)}", subject: "${parsed.subject}"`,
      );
      const body = parsed.body
        ? this.stripMarkdown(String(parsed.body))
        : this.stripMarkdown(cleaned);
      const subject = parsed.subject
        ? this.stripMarkdown(String(parsed.subject))
        : fallbackSubject;
      return { body, subject };
    } catch (error) {
      this.logger.warn(
        `[parseComposeResult] JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      const fallback = this.extractComposeFromMalformedJson(raw, fallbackSubject);
      return fallback;
    }
  }

  private fixJsonNewlines(json: string): string {
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
        continue;
      }

      result += char;
    }

    return result;
  }

  private extractComposeFromMalformedJson(
    raw: string,
    fallbackSubject?: string,
  ): { body: string; subject?: string } {
    const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/);
    const subject = subjectMatch ? subjectMatch[1] : fallbackSubject;

    const bodyMatch = raw.match(/"body"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|"$)/);
    if (bodyMatch) {
      const body = bodyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      return { body: this.stripMarkdown(body), subject };
    }

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

  private stripMarkdown(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[\-\*•]\s+/gm, '- ')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
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
