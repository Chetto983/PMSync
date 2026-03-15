/**
 * ReminderToolsService -- AI chat tools for smart follow-up reminders.
 *
 * Tools: create_reminder, list_reminders
 *
 * Phase REMINDER: Natural language reminder creation and listing.
 */
import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { ReminderService } from '../../reminder/services/reminder.service';
import { truncateToolResult } from '../utils/tool-result-truncator';

type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

@Injectable()
export class ReminderToolsService {
  private readonly logger = new Logger(ReminderToolsService.name);

  constructor(
    private readonly reminderService: ReminderService,
  ) {}

  getTools(
    tenantId: string,
    userId: string,
    _conversationId: string,
    _piiResolve: PiiResolveFn,
  ) {
    return {
      create_reminder: this.buildCreateReminder(tenantId, userId),
      list_reminders: this.buildListReminders(tenantId, userId),
    };
  }

  private buildCreateReminder(tenantId: string, userId: string) {
    return tool({
      description:
        'Create a smart follow-up reminder from natural language. Use when user says ' +
        "'ricordami di...', 'remind me to...', 'follow up with...', 'se non risponde...', " +
        "'controllare se...'. Parses Italian/English input into a structured reminder " +
        'with optional email monitoring and Telegram notifications.',
      inputSchema: z.object({
        inputUtente: z.string().describe(
          'Natural language description of the reminder in Italian or English',
        ),
      }),
      execute: async (args) => {
        try {
          const result = await this.reminderService.createReminder(
            tenantId,
            userId,
            { inputUtente: args.inputUtente },
          );

          return truncateToolResult({
            success: true,
            reminderId: result.reminder.id,
            titolo: result.reminder.titolo,
            scadenzaDatetime: result.reminder.scadenzaDatetime?.toISOString() ?? null,
            condizioneTipo: result.reminder.condizioneTipo,
            monitoraEmail: result.reminder.monitoraEmail,
            messaggioTelegram: result.reminder.messaggioTelegram,
            rispostaChat: result.rispostaChat,
          });
        } catch (err) {
          this.logger.warn(
            `create_reminder failed: ${err instanceof Error ? err.message : err}`,
          );
          return { error: 'Failed to create reminder' };
        }
      },
    });
  }

  private buildListReminders(tenantId: string, userId: string) {
    return tool({
      description:
        "List user's reminders/follow-ups. Use when user says 'i miei promemoria', " +
        "'my reminders', 'cosa devo fare', 'show reminders', 'promemoria attivi', " +
        "'what do I need to do'.",
      inputSchema: z.object({
        status: z
          .enum(['attivo', 'completato', 'annullato', 'sospeso'])
          .optional()
          .describe('Filter by status (default: attivo)'),
        limit: z
          .number()
          .min(1)
          .max(20)
          .optional()
          .describe('Max results (default 10)'),
      }),
      execute: async (args) => {
        try {
          const status = args.status || 'attivo';
          const limit = args.limit || 10;

          const result = await this.reminderService.listReminders(
            tenantId,
            userId,
            { status: status as any, limit },
          );

          const items = result.reminders.map((r) => ({
            id: r.id,
            titolo: r.titolo,
            contatto: r.contatto,
            scadenzaDatetime: r.scadenzaDatetime?.toISOString() ?? null,
            priorita: r.priorita,
            condizioneTipo: r.condizioneTipo,
            monitoraEmail: r.monitoraEmail,
            status: r.status,
          }));

          return truncateToolResult({
            count: items.length,
            reminders: items,
          });
        } catch (err) {
          this.logger.warn(
            `list_reminders failed: ${err instanceof Error ? err.message : err}`,
          );
          return { error: 'Failed to list reminders', count: 0, reminders: [] };
        }
      },
    });
  }
}
