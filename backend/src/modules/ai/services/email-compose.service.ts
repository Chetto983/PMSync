/**
 * EmailComposeService - Email composition and smart replies via LLM.
 * Handles: composeEmail, generateSmartReplies, prompt builders, JSON parsers.
 * Extracted from EmailInsightsService (Phase 43).
 */
import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { InsightUtilsService } from './insight-utils.service';
import { EmailAnalysisService } from './email-analysis.service';
import { parseArrayFromAiPayload } from '../utils/ai-output.utils';
import { getLocale, getToolTranslations, type SupportedLocale } from '../locales';
import { PiiDetectionService } from '../guards';

type LocaleKey = 'en' | 'it';
type ToneKey = 'formal' | 'casual' | 'technical';

interface EmailRecord {
  id: string; subject: string | null; from: string; to: string[];
  bodyText: string | null; bodyHtml: string | null; snippet: string | null; receivedAt: Date;
}

@Injectable()
export class EmailComposeService {
  private readonly logger = new Logger(EmailComposeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistral: MistralService,
    private readonly utils: InsightUtilsService,
    private readonly analysis: EmailAnalysisService,
    @Optional() @Inject(PiiDetectionService) private readonly piiDetection?: PiiDetectionService,
  ) {}

  async generateSmartReplies(tenantId: string, emailId: string, locale?: string, tone?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.analysis.resolveLocale(locale);
    const replyTone = this.resolveTone(tone);
    const supportedLocale = getLocale(locale);
    const t = getToolTranslations(supportedLocale);
    const toneInstructions = t.insights.tones[replyTone];
    const systemPrompt = t.insights.smartReplies.systemPrompt(toneInstructions);
    const userPrompt = this.analysis.buildEmailPrompt(email, lang);

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt, userPrompt, temperature: 0.4, maxTokens: 500,
        modelTier: 'creative', validationContext: 'SYSTEM_INTERNAL',
      });
      const parsedReplies = parseArrayFromAiPayload(raw, 'replies');
      const candidates = parsedReplies.length ? parsedReplies : this.utils.extractLines(raw);
      const suggestions = this.utils.formatSmartReplyCandidates(candidates);
      if (!suggestions.length) throw new Error('Empty smart replies');
      return suggestions.slice(0, 3);
    } catch (error) {
      this.logger.error(`Failed to generate smart replies for email ${emailId}: ${this.utils.getErrorMessage(error)}`);
      throw this.utils.mapAiErrorToHttpException(error, 'generate smart replies');
    }
  }

  async composeEmail(
    tenantId: string,
    payload: {
      prompt: string; to?: string[]; subject?: string; tone?: string; locale?: string;
      threadContext?: Array<{ subject?: string; body?: string }>; senderName?: string; signature?: string;
    },
    _userId?: string,
  ) {
    const lang = this.analysis.resolveLocale(payload.locale);
    const toneKey = this.resolveTone(payload.tone);
    const supportedLocale = getLocale(payload.locale);
    const t = getToolTranslations(supportedLocale);
    const toneInstruction = t.insights.tones[toneKey];
    const languageName = t.insights.compose.languageNames?.[lang] || (lang === 'it' ? 'Italian' : 'English');
    const systemPrompt = t.insights.compose.systemPrompt(toneInstruction, languageName);
    const userPrompt = this.buildComposePrompt(payload, lang, toneKey, '', supportedLocale, '');

    try {
      const raw = await this.mistral.completePrompt({
        systemPrompt, userPrompt, temperature: 0.35, maxTokens: 900,
        modelTier: 'creative', jsonMode: true, validationContext: 'SYSTEM_INTERNAL',
      });
      this.logger.debug(`[composeEmail] Raw Mistral response (first 500 chars): ${raw?.substring(0, 500)}`);
      const parsed = this.parseComposeResult(raw, payload.subject);
      this.logger.log(`[composeEmail] Parsed result: body="${parsed.body?.substring(0, 100)}..." subject="${parsed.subject}"`);
      return { body: parsed.body, subject: parsed.subject };
    } catch (error) {
      this.logger.error(`Failed to compose email for tenant=${tenantId}: ${this.utils.getErrorMessage(error)}`);
      throw this.utils.mapAiErrorToHttpException(error, 'compose email');
    }
  }

  // --- Private helpers ---

  private async getEmailOrThrow(tenantId: string, emailId: string): Promise<EmailRecord> {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: { id: true, subject: true, from: true, to: true, bodyText: true, bodyHtml: true, snippet: true, receivedAt: true },
    });
    if (!email) throw new NotFoundException('Email not found');
    return email;
  }

  private resolveTone(tone?: string): ToneKey {
    if (tone && ['formal', 'casual', 'technical'].includes(tone.toLowerCase())) return tone.toLowerCase() as ToneKey;
    return 'casual';
  }

  private redactPii(text: string): string {
    if (!this.piiDetection || !text) return text;
    try { return this.piiDetection.detect(text).redactedText; } catch { return text; }
  }

  private buildComposePrompt(
    payload: { prompt: string; to?: string[]; subject?: string; tone?: string; threadContext?: Array<{ subject?: string; body?: string }>; senderName?: string; signature?: string; },
    _locale: LocaleKey, tone: ToneKey, styleSection?: string, supportedLocale?: SupportedLocale, memoryContext?: string,
  ): string {
    const t = getToolTranslations(supportedLocale || 'en');
    const redactedTo = payload.to?.map((email) => this.redactPii(email)) ?? [];
    const redactedSubject = payload.subject ? this.redactPii(payload.subject) : undefined;
    const redactedPrompt = this.redactPii(payload.prompt);
    const redactedThreadContext = payload.threadContext?.map((item) => ({
      subject: item.subject ? this.redactPii(item.subject) : item.subject,
      body: item.body ? this.redactPii(item.body) : item.body,
    }));
    const groundingTopic = redactedSubject
      || redactedThreadContext?.find((item) => item.subject?.trim())?.subject
      || redactedPrompt.match(/"([^"]+)"/)?.[1]
      || '';

    const toLine = redactedTo.length ? `${t.insights.compose.recipients}: ${redactedTo.join(', ')}` : '';
    const subjectLine = redactedSubject ? `${t.insights.compose.subjectHint}: ${redactedSubject}` : '';
    const toneLine = `${t.insights.compose.requestedTone}: ${tone}.`;
    const senderLine = payload.senderName ? `${t.insights.compose.senderName}: ${payload.senderName}` : '';
    const signatureLine = payload.signature ? `${t.insights.compose.signatureInstruction}: ${payload.signature}` : '';
    const groundingLine = groundingTopic ? `Specific topic to acknowledge: ${groundingTopic}` : '';
    const threadLines = redactedThreadContext?.length
      ? t.insights.compose.threadContext + '\n' + redactedThreadContext.slice(0, 3).map((item, idx) => {
        const header = `${t.insights.compose.message} #${idx + 1}`;
        return `${header}\nS: ${item.subject ?? '-'}\nB: ${this.utils.truncate(item.body ?? '', 800)}`;
      }).join('\n\n')
      : '';

    return [t.insights.compose.draftInstruction, toneLine, senderLine, signatureLine, toLine, subjectLine, groundingLine, threadLines, memoryContext, styleSection, `${t.insights.compose.userPrompt}: ${redactedPrompt}`, t.insights.compose.jsonInstruction].filter(Boolean).join('\n');
  }

  private parseComposeResult(raw: string, fallbackSubject?: string): { body: string; subject?: string } {
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = this.fixJsonNewlines(cleaned.trim());
      const parsed = JSON.parse(cleaned);
      const body = parsed.body ? this.utils.stripMarkdown(String(parsed.body)) : this.utils.stripMarkdown(cleaned);
      const subject = parsed.subject ? this.utils.stripMarkdown(String(parsed.subject)) : fallbackSubject;
      return { body, subject };
    } catch {
      return this.extractComposeFromMalformedJson(raw, fallbackSubject);
    }
  }

  private fixJsonNewlines(json: string): string {
    let result = ''; let inString = false; let escaped = false;
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      if (escaped) { result += char; escaped = false; continue; }
      if (char === '\\') { result += char; escaped = true; continue; }
      if (char === '"') { inString = !inString; result += char; continue; }
      if (inString && char === '\n') { result += '\\n'; continue; }
      if (inString && char === '\r') { continue; }
      result += char;
    }
    return result;
  }

  private extractComposeFromMalformedJson(raw: string, fallbackSubject?: string): { body: string; subject?: string } {
    const subjectMatch = raw.match(/"subject"\s*:\s*"([^"]+)"/);
    const subject = subjectMatch ? subjectMatch[1] : fallbackSubject;
    const bodyMatch = raw.match(/"body"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|"$)/);
    if (bodyMatch) {
      const body = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      return { body: this.utils.stripMarkdown(body), subject };
    }
    const plainText = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').replace(/\{[\s\S]*?"body"\s*:\s*"/g, '').replace(/"[\s\S]*$/g, '').trim();
    if (plainText) return { body: this.utils.stripMarkdown(plainText), subject };
    return { body: 'Draft unavailable', subject: fallbackSubject };
  }
}
