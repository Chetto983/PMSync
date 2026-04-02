/**
 * ReminderToolsService -- AI chat tools for smart follow-up reminders.
 *
 * Tools: create_reminder, list_reminders, complete_reminder,
 *        update_reminder, delete_reminder, snooze_reminder
 *
 * Phase REMINDER: Full lifecycle reminder management via AI chat.
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
  complete_reminder: z.object({
    reminderId: z.string().describe('ID of the reminder to mark as completed'),
  }),
  update_reminder: z.object({
    reminderId: z.string().describe('ID of the reminder to update'),
    titolo: z.string().max(100).optional().describe('New title'),
    descrizione: z.string().max(1000).optional().describe('New description'),
    contatto: z.string().max(200).optional().describe('New contact name'),
    scadenzaDatetime: z.string().optional().describe('New deadline as ISO 8601 datetime string'),
    priorita: z.enum(['bassa', 'media', 'alta']).optional().describe('New priority level'),
    azione: z.enum(['chiama', 'scrivi_mail', 'verifica', 'conferma', 'controlla', 'altro']).optional().describe('New action type'),
  }),
  delete_reminder: z.object({
    reminderId: z.string().describe('ID of the reminder to delete'),
  }),
  snooze_reminder: z.object({
    reminderId: z.string().describe('ID of the reminder to snooze/postpone'),
    days: z.number().min(1).max(30).describe('Number of days to postpone (1-30)'),
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
      { name: 'complete_reminder', description: 'Mark a reminder as completed', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: reminderSchemas.complete_reminder },
      { name: 'update_reminder', description: 'Update a reminder (title, deadline, priority, etc.)', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: reminderSchemas.update_reminder },
      { name: 'delete_reminder', description: 'Permanently delete a reminder', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: reminderSchemas.delete_reminder },
      { name: 'snooze_reminder', description: 'Postpone a reminder by N days', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: reminderSchemas.snooze_reminder },
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
      complete_reminder: this.buildCompleteReminder(tenantId, userId),
      update_reminder: this.buildUpdateReminder(tenantId, userId),
      delete_reminder: this.buildDeleteReminder(tenantId, userId),
      snooze_reminder: this.buildSnoozeReminder(tenantId, userId),
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

  private buildCompleteReminder(tenantId: string, userId: string) {
    return tool({
      description:
        "Mark a reminder as completed. Use when user says 'segna come fatto', " +
        "'completa il promemoria', 'mark reminder done', 'ho finito con...', " +
        "'reminder completed'.",
      inputSchema: reminderSchemas.complete_reminder,
      execute: async (args) => {
        try {
          const updated = await this.reminderService.completeReminder(
            tenantId, userId, args.reminderId,
          );
          return truncateToolResult({
            success: true,
            reminderId: updated.id,
            titolo: updated.titolo,
            status: updated.status,
            completatoAt: updated.completatoAt?.toISOString() ?? null,
          });
        } catch (err) {
          this.logger.warn(
            `complete_reminder failed: ${err instanceof Error ? err.message : err}`,
          );
          return { success: false, error: 'Failed to complete reminder' };
        }
      },
    });
  }

  private buildUpdateReminder(tenantId: string, userId: string) {
    return tool({
      description:
        "Update a reminder's fields (title, deadline, priority, contact, etc.). " +
        "Use when user says 'sposta il promemoria a...', 'cambia priorità', " +
        "'update reminder', 'modifica il promemoria', 'change deadline to...'.",
      inputSchema: reminderSchemas.update_reminder,
      execute: async (args) => {
        try {
          const { reminderId, ...fields } = args;
          const updated = await this.reminderService.updateReminder(
            tenantId, userId, reminderId, fields,
          );
          return truncateToolResult({
            success: true,
            reminderId: updated.id,
            titolo: updated.titolo,
            scadenzaDatetime: updated.scadenzaDatetime?.toISOString() ?? null,
            priorita: updated.priorita,
            status: updated.status,
          });
        } catch (err) {
          this.logger.warn(
            `update_reminder failed: ${err instanceof Error ? err.message : err}`,
          );
          return { success: false, error: 'Failed to update reminder' };
        }
      },
    });
  }

  private buildDeleteReminder(tenantId: string, userId: string) {
    return tool({
      description:
        "Permanently delete a reminder. DESTRUCTIVE — requires user approval. " +
        "Use when user says 'elimina il promemoria', 'delete reminder', " +
        "'cancella il promemoria per...', 'remove reminder'.",
      inputSchema: reminderSchemas.delete_reminder,
      execute: async (args) => {
        try {
          await this.reminderService.deleteReminder(
            tenantId, userId, args.reminderId,
          );
          return { success: true, reminderId: args.reminderId, deleted: true };
        } catch (err) {
          this.logger.warn(
            `delete_reminder failed: ${err instanceof Error ? err.message : err}`,
          );
          return { success: false, error: 'Failed to delete reminder' };
        }
      },
    });
  }

  private buildSnoozeReminder(tenantId: string, userId: string) {
    return tool({
      description:
        "Postpone a reminder by N days. Use when user says 'posticipa di 3 giorni', " +
        "'snooze reminder', 'rimanda il promemoria', 'postpone by...', " +
        "'spostalo avanti di una settimana'.",
      inputSchema: reminderSchemas.snooze_reminder,
      execute: async (args) => {
        try {
          const newDate = new Date();
          newDate.setDate(newDate.getDate() + args.days);
          const updated = await this.reminderService.updateReminder(
            tenantId, userId, args.reminderId,
            { scadenzaDatetime: newDate.toISOString() },
          );
          return truncateToolResult({
            success: true,
            reminderId: updated.id,
            titolo: updated.titolo,
            newScadenzaDatetime: updated.scadenzaDatetime?.toISOString() ?? null,
            snoozedByDays: args.days,
          });
        } catch (err) {
          this.logger.warn(
            `snooze_reminder failed: ${err instanceof Error ? err.message : err}`,
          );
          return { success: false, error: 'Failed to snooze reminder' };
        }
      },
    });
  }
}
