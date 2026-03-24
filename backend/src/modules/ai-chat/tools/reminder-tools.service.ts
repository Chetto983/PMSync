/**
 * ReminderToolsService -- AI chat tools for smart follow-up reminders.
 *
 * Tools: create_reminder, list_reminders
 *
 * Phase REMINDER: Natural language reminder creation and listing.
 */
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { ReminderService } from '../../reminder/services/reminder.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

const reminderSchemas = {
  create_reminder: z.object({
    inputUtente: z.string().describe('Natural language description of the reminder in Italian or English'),
  }),
  list_reminders: z.object({
    status: z.enum(['attivo', 'completato', 'annullato', 'sospeso']).optional().describe('Filter by status (default: attivo)'),
    limit: z.number().min(1).max(20).optional().describe('Max results (default 10)'),
  }),
};

@Injectable()
export class ReminderToolsService implements OnModuleInit {
  private readonly logger = new Logger(ReminderToolsService.name);

  constructor(
    private readonly reminderService: ReminderService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'create_reminder', description: 'Create a smart follow-up reminder from natural language', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: reminderSchemas.create_reminder },
      { name: 'list_reminders', description: 'List active reminders', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: reminderSchemas.list_reminders },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name, description: t.description, parameters: {}, execute: noop,
        domain: 'productivity', riskLevel: t.riskLevel, requiresApproval: t.requiresApproval, inputSchema: t.inputSchema,
      });
    }
  }

  getTools(
    tenantId: string,
    userId: string,
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
      inputSchema: reminderSchemas.create_reminder,
      execute: async (args) => {
        try {
          const result = await this.reminderService.createReminder(
            tenantId,
            userId,
            { inputUtente: args.inputUtente },
          );

          // AI parser couldn't interpret input — return error with explicit stop signal
          if (result.failed) {
            const isParserError = (result as any).failReason === 'parser_error';
            return {
              success: false,
              error: isParserError
                ? 'Technical error parsing the reminder. DO NOT retry this tool call — inform the user there was a temporary issue and ask them to try again later.'
                : 'The input was not recognized as a reminder. DO NOT retry — ask the user to clarify what they want to be reminded about, when, and for whom.',
              rispostaChat: result.rispostaChat,
            };
          }

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
          return { success: false, error: 'Failed to create reminder' };
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
      inputSchema: reminderSchemas.list_reminders,
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
