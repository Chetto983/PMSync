import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { parseArrayFromAiPayload } from '../utils/ai-output.utils';

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
  ) {}

  async summarizeEmail(tenantId: string, emailId: string, locale?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);
    const systemPrompt =
      lang === 'it'
        ? 'Sei un assistente che riassume email di lavoro. Rispondi con un breve riassunto (massimo 5 frasi) evidenziando intenti, richieste e prossimi passi.'
        : 'You are an assistant who summarizes business emails. Reply with a short summary (max 5 sentences) highlighting intent, requests, and next steps.';

    const userPrompt = this.buildEmailPrompt(email, lang);

    try {
      const summary = await this.mistral.completePrompt({
        systemPrompt,
        userPrompt,
        temperature: 0.2,
        maxTokens: 400,
      });
      return summary.trim();
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

    const toneInstructions = this.getToneInstructions(replyTone, lang);
    const systemPrompt =
      lang === 'it'
        ? `Genera da 2 a 3 possibili risposte brevi all'email. ${toneInstructions} Rispondi in JSON nel formato {"replies":["..."]}.`
        : `Generate 2-3 concise replies to the email. ${toneInstructions} Respond in JSON format {"replies":["..."]}.`;

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

  async categorizeEmail(tenantId: string, emailId: string, locale?: string) {
    const email = await this.getEmailOrThrow(tenantId, emailId);
    const lang = this.resolveLocale(locale);

    const labelsList = this.allowedLabels.join(', ');
    const systemPrompt =
      lang === 'it'
        ? `Suggerisci fino a 3 etichette dall'elenco [${labelsList}]. Rispondi in JSON: {"labels":["..."]}.`
        : `Suggest up to 3 labels from [${labelsList}]. Respond in JSON: {"labels":["..."]}.`;

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
    const toList = email.to.join(', ');
    const header =
      locale === 'it'
        ? `Oggetto: ${email.subject || '(senza oggetto)'}\nDa: ${email.from}\nA: ${toList}`
        : `Subject: ${email.subject || '(no subject)'}\nFrom: ${email.from}\nTo: ${toList}`;

    const content = this.extractEmailContent(email);

    return `${header}\n\n${locale === 'it' ? 'Testo email:' : 'Email body:'}\n${content}`;
  }

  private extractEmailContent(email: EmailRecord): string {
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

    return '(content unavailable)';
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

  private getToneInstructions(tone: ToneKey, locale: LocaleKey): string {
    const instructions = {
      formal: {
        en: 'Use a formal, professional tone with proper business etiquette.',
        it: 'Usa un tono formale e professionale con etichetta aziendale appropriata.',
      },
      casual: {
        en: 'Use a friendly, conversational tone while remaining professional.',
        it: 'Usa un tono amichevole e colloquiale pur rimanendo professionale.',
      },
      technical: {
        en: 'Use a precise, technical tone with clear and direct language.',
        it: 'Usa un tono preciso e tecnico con linguaggio chiaro e diretto.',
      },
    };
    return instructions[tone][locale];
  }

  private truncate(value: string, limit = 6000): string {
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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







