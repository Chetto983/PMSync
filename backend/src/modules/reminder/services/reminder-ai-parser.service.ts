/**
 * ReminderAiParserService — Natural language parsing for reminders.
 *
 * Uses AI SDK `generateObject` with Zod schema for structured extraction
 * from Italian/English free text. Falls back to `generateText` + manual
 * JSON parsing when `generateObject` fails (e.g. model doesn't support
 * response_format).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject, generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';
import { parseJsonOutput } from '../../ai/utils/parse-json-output';

// ============ Zod Schema ============

// Schema uses .default() on non-critical fields to tolerate partial LLM output.
// Only is_reminder + titolo + risposta_chat are truly required.
export const reminderParseSchema = z.object({
  is_reminder: z.boolean().describe('True if the input is a reminder request'),
  titolo: z.string().describe('Short title, max 60 chars, clear and direct'),
  descrizione: z.string().nullable().default(null).describe('Full description of the task'),
  contatto: z.string().nullable().default(null).describe('Company or person name, null if not present'),
  scadenza_datetime: z.string().nullable().default(null).describe('ISO 8601 date string for the deadline'),
  periodo: z
    .enum(['mattina', 'pomeriggio', 'sera', 'tutto_il_giorno'])
    .nullable()
    .default(null)
    .describe('Time of day'),
  azione: z
    .enum(['chiama', 'scrivi_mail', 'verifica', 'conferma', 'controlla', 'altro'])
    .default('altro')
    .describe('Type of action'),
  priorita: z.enum(['alta', 'media', 'bassa']).default('media').describe('Priority level'),
  condizione_tipo: z
    .enum(['sempre', 'se_risponde_mail', 'se_non_risponde_mail', 'manuale'])
    .default('sempre')
    .describe('Condition type for notification'),
  condizione_dettaglio: z.string().nullable().default(null).describe('Condition explanation or null'),
  monitora_email: z.boolean().default(false).describe('Whether to monitor email for this reminder'),
  email_keywords: z.array(z.string()).default([]).describe('Keywords for email matching'),
  email_mittente: z.string().nullable().default(null).describe('Expected sender email or null'),
  messaggio_telegram: z
    .string()
    .nullable()
    .default(null)
    .describe('Telegram notification text, max 120 chars, starts with action emoji'),
  is_recurring: z.boolean().default(false).describe('True if user wants a recurring/repeating reminder'),
  recurrence_rule: z
    .string()
    .nullable()
    .default(null)
    .describe('RRULE string (RFC 5545) for recurring reminders, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'),
  risposta_chat: z
    .string()
    .default('Promemoria creato.')
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

Regole per la ricorrenza:
- Se l'utente dice "ogni giorno", "every day", "tutti i giorni" -> is_recurring = true, recurrence_rule = "FREQ=DAILY;INTERVAL=1"
- Se l'utente dice "ogni lunedi", "every Monday", "tutti i lunedi" -> is_recurring = true, recurrence_rule = "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"
- Se l'utente dice "ogni settimana", "weekly", "settimanale" -> is_recurring = true, recurrence_rule = "FREQ=WEEKLY;INTERVAL=1"
- Se l'utente dice "ogni mese", "monthly", "una volta al mese" -> is_recurring = true, recurrence_rule = "FREQ=MONTHLY;INTERVAL=1"
- Se l'utente dice "ogni 2 settimane", "biweekly" -> is_recurring = true, recurrence_rule = "FREQ=WEEKLY;INTERVAL=2"
- Usa il formato RRULE RFC 5545. BYDAY: MO,TU,WE,TH,FR,SA,SU
- Se non c'e ricorrenza -> is_recurring = false, recurrence_rule = null

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
  is_recurring: false,
  recurrence_rule: null,
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
      'mistralai/mistral-small-2603',
    );
  }

  async parse(
    inputUtente: string,
    tenantId: string,
    userId: string,
  ): Promise<ReminderParseOutput> {
    const now = new Date().toISOString();
    const userPrompt = `Data/ora corrente: ${now}\n\nRichiesta utente:\n${inputUtente}`;

    // Attempt 1: generateObject (structured output — most reliable)
    const attempt1 = await this.tryGenerateObject(userPrompt, tenantId, userId);
    if (attempt1) return attempt1;

    // Attempt 2: generateText + manual JSON extraction (fallback for models
    // that don't support response_format / structured output)
    const attempt2 = await this.tryGenerateText(userPrompt, tenantId, userId);
    if (attempt2) return attempt2;

    // Both attempts failed — return marked fallback
    this.logger.error(`All parsing attempts failed for: "${inputUtente}"`);
    return {
      ...SAFE_FALLBACK,
      _parserError: true,
      _errorMessage: 'All parsing attempts failed',
    } as ReminderParseOutput & { _parserError: true; _errorMessage: string };
  }

  /**
   * Primary: AI SDK generateObject with Zod schema validation.
   * Handles JSON extraction, schema coercion, and retries internally.
   */
  private async tryGenerateObject(
    userPrompt: string,
    tenantId: string,
    userId: string,
  ): Promise<ReminderParseOutput | null> {
    const startTime = Date.now();
    try {
      const model = this.mistralProvider.getChatModel(this.parserModelId);

      const result = await generateObject({
        model,
        schema: reminderParseSchema,
        schemaName: 'ReminderParse',
        schemaDescription: 'Structured reminder extracted from natural language input',
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.1,
        maxOutputTokens: 800,
        abortSignal: AbortSignal.timeout(45_000),
      });

      const latencyMs = Date.now() - startTime;
      this.logger.debug(
        `generateObject success (${latencyMs}ms, model=${this.parserModelId}): is_reminder=${result.object.is_reminder}, titolo="${result.object.titolo}"`,
      );

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

      return result.object;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `generateObject failed (${latencyMs}ms, model=${this.parserModelId}): ${message}`,
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
        errorMessage: `generateObject: ${message}`,
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      return null;
    }
  }

  /**
   * Fallback: generateText + manual JSON extraction via parseJsonOutput.
   * Works with models that emit <think> tokens or don't support response_format.
   */
  private async tryGenerateText(
    userPrompt: string,
    tenantId: string,
    userId: string,
  ): Promise<ReminderParseOutput | null> {
    const startTime = Date.now();
    try {
      const model = this.mistralProvider.getChatModel(this.parserModelId);

      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt: `${userPrompt}\n\nRispondi SOLO con un singolo oggetto JSON (NON un array). Inizia con { e termina con }. Nessun testo prima o dopo il JSON.`,
        temperature: 0.3,
        maxOutputTokens: 1200,
        abortSignal: AbortSignal.timeout(45_000),
      });

      const latencyMs = Date.now() - startTime;
      this.logger.debug(
        `generateText raw response (${result.text.length} chars, ${latencyMs}ms, model=${this.parserModelId}): ${result.text.slice(0, 500)}`,
      );

      const parsed = parseJsonOutput(result.text, reminderParseSchema);
      this.logger.debug(
        `generateText parsed: is_reminder=${parsed.is_reminder}, titolo="${parsed.titolo}"`,
      );

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
        `generateText fallback failed (${latencyMs}ms, model=${this.parserModelId}): ${message}`,
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
        errorMessage: `generateText: ${message}`,
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      return null;
    }
  }
}
