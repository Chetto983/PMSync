/**
 * ReminderAiParserService — Natural language parsing for reminders.
 *
 * Uses Qwen 3.5 via OpenRouter + `generateText` + `parseJsonOutput` with Zod schema
 * to extract structured reminder fields from Italian/English free text.
 *
 * Pattern: follows FollowUpDetectionService
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';
import { parseJsonOutput } from '../../ai/utils/parse-json-output';

// ============ Zod Schema ============

export const reminderParseSchema = z.object({
  is_reminder: z.boolean().describe('True if the input is a reminder request'),
  titolo: z.string().describe('Short title, max 60 chars, clear and direct'),
  descrizione: z.string().nullable().describe('Full description of the task'),
  contatto: z.string().nullable().describe('Company or person name, null if not present'),
  scadenza_datetime: z.string().nullable().describe('ISO 8601 date string for the deadline'),
  periodo: z
    .enum(['mattina', 'pomeriggio', 'sera', 'tutto_il_giorno'])
    .nullable()
    .describe('Time of day'),
  azione: z
    .enum(['chiama', 'scrivi_mail', 'verifica', 'conferma', 'controlla', 'altro'])
    .describe('Type of action'),
  priorita: z.enum(['alta', 'media', 'bassa']).describe('Priority level'),
  condizione_tipo: z
    .enum(['sempre', 'se_risponde_mail', 'se_non_risponde_mail', 'manuale'])
    .describe('Condition type for notification'),
  condizione_dettaglio: z.string().nullable().describe('Condition explanation or null'),
  monitora_email: z.boolean().describe('Whether to monitor email for this reminder'),
  email_keywords: z.array(z.string()).describe('Keywords for email matching'),
  email_mittente: z.string().nullable().describe('Expected sender email or null'),
  messaggio_telegram: z
    .string()
    .nullable()
    .describe('Telegram notification text, max 120 chars, starts with action emoji'),
  risposta_chat: z
    .string()
    .describe('Conversational response confirming what was understood'),
});

export type ReminderParseOutput = z.infer<typeof reminderParseSchema>;

// ============ System Prompt ============

const SYSTEM_PROMPT = `Sei un assistente aziendale esperto in follow-up commerciali. L'utente lavora in ambito vendite/commerciale e ti descrive attivita da tenere sotto controllo: telefonate da richiamare, risposte da attendere, conferme da ottenere, trattative in corso.

Analizza la richiesta e restituisci un oggetto JSON strutturato.

Regole per il calcolo della scadenza:
- La data/ora corrente ti verra fornita. Calcola le date relative a partire da essa.
- "mattina" = 09:00, "pomeriggio" = 14:30, "sera" = 18:00, "tutto_il_giorno" = 08:30
- "lunedi" = prossimo lunedi, "domani" = giorno dopo, "questa settimana" = venerdi corrente
- Restituisci sempre ISO 8601 per scadenza_datetime

Regole per le condizioni:
- Se l'utente dice "se risponde", "quando risponde", "se mi manda" -> condizione_tipo = "se_risponde_mail"
- Se l'utente dice "se non risponde", "se non mi risponde", "se non arriva" -> condizione_tipo = "se_non_risponde_mail"
- Se c'e una condizione email -> monitora_email = true, estrai keywords dal contesto
- Se non c'e condizione esplicita -> condizione_tipo = "sempre"

Regole per l'azione:
- "chiama", "telefona", "richiama" -> azione = "chiama"
- "scrivi", "manda email", "rispondi" -> azione = "scrivi_mail"
- "verifica", "controlla" -> azione = "verifica" o "controlla"
- "conferma" -> azione = "conferma"

Il messaggio_telegram deve iniziare con un'emoji appropriata all'azione.
La risposta_chat deve essere in italiano, breve e confermare cosa hai capito.`;

// ============ Safe Fallback ============

const SAFE_FALLBACK: ReminderParseOutput = {
  is_reminder: false,
  titolo: 'Promemoria',
  descrizione: null,
  contatto: null,
  scadenza_datetime: null,
  periodo: null,
  azione: 'altro',
  priorita: 'media',
  condizione_tipo: 'sempre',
  condizione_dettaglio: null,
  monitora_email: false,
  email_keywords: [],
  email_mittente: null,
  messaggio_telegram: null,
  risposta_chat: 'Non sono riuscito a interpretare la richiesta. Puoi riprovare?',
};

@Injectable()
export class ReminderAiParserService {
  private readonly logger = new Logger(ReminderAiParserService.name);
  private readonly parserModelId: string;

  constructor(
    private readonly mistralProvider: OpenRouterProviderService,
    private readonly aiRunLedger: AiRunLedgerService,
    private readonly configService: ConfigService,
  ) {
    // Use fast/simple model for structured JSON extraction — NOT the main chat
    // model (M2.7 has Interleaved Thinking that breaks JSON parsing).
    this.parserModelId = this.configService.get<string>(
      'AI_MODEL_SIMPLE',
      'mistralai/mistral-small-3.1-24b-instruct',
    );
  }

  async parse(
    inputUtente: string,
    tenantId: string,
    userId: string,
  ): Promise<ReminderParseOutput> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const now = new Date().toISOString();
      const startTime = Date.now();

      try {
        const model = this.mistralProvider.getChatModel(this.parserModelId);

        const result = await generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt: `Data/ora corrente: ${now}\n\nRichiesta utente:\n${inputUtente}\n\nRispondi SOLO con un singolo oggetto JSON (NON un array). Inizia con { e termina con }. Nessun testo prima o dopo il JSON.`,
          temperature: attempt === 1 ? 0.1 : 0.3,
          // Qwen 3.5 Flash emits <think> tokens before JSON — budget extra tokens
          maxOutputTokens: 1200,
          abortSignal: AbortSignal.timeout(45_000),
        });

        const latencyMs = Date.now() - startTime;
        this.logger.debug(
          `AI parser raw response attempt=${attempt} (${result.text.length} chars, ${latencyMs}ms, model=${this.parserModelId}): ${result.text.slice(0, 500)}`,
        );
        const parsed = parseJsonOutput(result.text, reminderParseSchema);
        this.logger.debug(`AI parser result: is_reminder=${parsed.is_reminder}, titolo="${parsed.titolo}"`);

        this.aiRunLedger.recordRun({
          tenantId,
          userId,
          runType: 'reminder-parse',
          model: this.parserModelId,
          promptTokens: result.usage?.inputTokens ?? 0,
          completionTokens: result.usage?.outputTokens ?? 0,
          totalTokens: result.usage?.totalTokens ?? 0,
          latencyMs,
          status: AiRunStatus.SUCCESS,
        }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

        return parsed;
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `AI parser error attempt=${attempt}/${maxAttempts} (${latencyMs}ms, model=${this.parserModelId}): ${message}`,
        );

        this.aiRunLedger.recordRun({
          tenantId,
          userId,
          runType: 'reminder-parse',
          model: this.parserModelId,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
          status: AiRunStatus.FAILED,
          errorMessage: message,
        }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

        // On last attempt, return fallback marked as parser failure
        if (attempt === maxAttempts) {
          return { ...SAFE_FALLBACK, _parserError: true, _errorMessage: message } as ReminderParseOutput & { _parserError: true; _errorMessage: string };
        }

        this.logger.warn(`Retrying AI parser (attempt ${attempt + 1}/${maxAttempts})...`);
      }
    }

    // Unreachable, but TypeScript needs it
    return SAFE_FALLBACK;
  }
}
