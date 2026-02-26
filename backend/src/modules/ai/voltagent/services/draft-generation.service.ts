/**
 * Draft Generation Service
 * Phase 19: AI Draft Generation
 *
 * Orchestrates AI reply draft creation:
 * 1. Fetches email context
 * 2. Gets writing style prompt section
 * 3. Detects incoming email language
 * 4. Redacts PII before LLM call
 * 5. Calls Mistral for draft generation
 * 6. Rehydrates PII tokens
 * 7. Records draft for feedback tracking
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';
import { WritingStyleService } from './writing-style.service';
import { PiiDetectionService } from '../../guards';
import type { PiiMatch } from '../../guards';

/** Italian keyword patterns for language detection */
const ITALIAN_KEYWORDS = [
  'ciao', 'buongiorno', 'buonasera', 'saluti', 'cordiali',
  'gentile', 'grazie', 'prego', 'salve', 'arrivederci',
  'perfetto', 'bene', 'comunque', 'quindi', 'inoltre',
  'tuttavia', 'pertanto', 'risposta', 'richiesta', 'invio',
];

export interface GenerateDraftOptions {
  tone?: string;
  instructions?: string;
  locale?: string;
  providerId?: string;
}

export interface GenerateDraftResult {
  draftId: string;
  body: string;
  subject: string;
}

@Injectable()
export class DraftGenerationService {
  private readonly logger = new Logger(DraftGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly writingStyleService: WritingStyleService,
    @Optional() @Inject(PiiDetectionService)
    private readonly piiDetectionService: PiiDetectionService | null,
  ) {}

  /**
   * Generate an AI reply draft for a given email.
   *
   * Steps:
   * 1. Fetch email from DB
   * 2. Get writing style context
   * 3. Detect language of incoming email
   * 4. Redact PII from email body
   * 5. Build system prompt with style + language + tone + instructions
   * 6. Call Mistral LLM in JSON mode
   * 7. Rehydrate PII tokens in response
   * 8. Parse JSON response
   * 9. Record AiDraftFeedback for tracking
   * 10. Return draftId + body + subject
   */
  async generateDraft(
    tenantId: string,
    userId: string,
    emailId: string,
    options: GenerateDraftOptions,
  ): Promise<GenerateDraftResult> {
    // 1. Fetch the original email
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        bodyText: true,
        snippet: true,
        providerId: true,
      },
    });

    if (!email) {
      throw new NotFoundException(`Email not found: ${emailId}`);
    }

    // 2. Get writing style prompt section
    const emailLang = this.detectLanguage(email.bodyText || email.snippet || '');
    const locale = (options.locale || emailLang) as 'en' | 'it';
    const styleSection = await this.writingStyleService.getStylePromptSection(
      tenantId,
      userId,
      locale,
    ) ?? '';

    // 3. PII redaction
    const rawBody = email.bodyText || email.snippet || '';
    let safeText = rawBody;
    let piiMatches: PiiMatch[] = [];

    if (this.piiDetectionService) {
      const detection = this.piiDetectionService.detect(rawBody);
      safeText = detection.redactedText;
      piiMatches = detection.details;
    }

    // 4. Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      styleSection,
      emailLang,
      options.tone,
      options.instructions,
    );

    const userPrompt = [
      'Reply to:',
      `From: ${email.from}`,
      `Subject: ${email.subject}`,
      '',
      safeText,
    ].join('\n');

    // 5. Call Mistral
    let raw: string;
    try {
      raw = await this.mistralService.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.35,
        maxTokens: 800,
        jsonMode: true,
      });
    } catch (error) {
      this.logger.error(
        `LLM call failed for draft generation: ${(error as Error).message}`,
      );
      throw error;
    }

    // 6. Rehydrate PII tokens
    const rehydrated = this.piiDetectionService && piiMatches.length > 0
      ? this.piiDetectionService.resolveFromMatches(raw, piiMatches)
      : raw;

    // 7. Parse JSON response
    let body: string;
    let subject: string;

    try {
      const parsed = JSON.parse(rehydrated);
      body = parsed.body || rehydrated;
      subject = parsed.subject || `Re: ${email.subject || ''}`;
    } catch {
      // Fallback: treat raw text as body
      this.logger.warn('Failed to parse LLM JSON response, using raw text as body');
      body = rehydrated;
      subject = `Re: ${email.subject || ''}`;
    }

    // 8. Record AiDraftFeedback
    const draft = await this.prisma.aiDraftFeedback.create({
      data: {
        tenantId,
        userId,
        emailId,
        draftBody: body,
        tone: options.tone,
        locale: emailLang,
        providerId: email.providerId,
      },
    });

    this.logger.log(
      `Generated draft ${draft.id} for email ${emailId} (lang=${emailLang}, tone=${options.tone || 'default'})`,
    );

    return { draftId: draft.id, body, subject };
  }

  /**
   * Detect language of incoming email text.
   * Returns 'it' for Italian, 'en' for English (default).
   */
  private detectLanguage(text: string): string {
    if (!text) return 'en';

    const lowerText = text.toLowerCase();
    let italianHits = 0;

    for (const keyword of ITALIAN_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        italianHits++;
      }
    }

    // If 2+ Italian keywords detected, treat as Italian
    return italianHits >= 2 ? 'it' : 'en';
  }

  /**
   * Build the system prompt for draft generation.
   */
  private buildSystemPrompt(
    styleSection: string,
    language: string,
    tone?: string,
    instructions?: string,
  ): string {
    const parts: string[] = [
      'You are composing a reply email.',
    ];

    if (styleSection) {
      parts.push(styleSection);
    }

    parts.push(`Language: Write in ${language === 'it' ? 'Italian' : 'English'}.`);
    parts.push(
      'Do NOT include a signature or sign-off line. The email signature will be appended automatically.',
    );

    if (tone) {
      parts.push(`Tone: ${tone}`);
    }

    if (instructions) {
      parts.push(`Additional instructions: ${instructions}`);
    }

    parts.push('Return JSON: { "subject": "Re: ...", "body": "..." }');

    return parts.join('\n');
  }
}
