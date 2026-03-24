/**
 * EmailProductivityToolsService -- Email management tools for the AI chat pipeline.
 *
 * Tools: list_email_index, star_email, mark_email_read, label_email
 *
 * Phase 87 Plan 04: Split from ProductivityToolsService for RULE-3 compliance.
 */
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailBulkService } from '../../email/services/email-bulk.service';
import { EmailCrudService } from '../../email/services/email-crud.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

type WorkspaceLabel = {
  id: string;
  name: string;
};

type ResolvedWorkspaceLabels = {
  ids: string[];
  names: string[];
  unmatched: string[];
};

const emailProductivitySchemas = {
  list_email_index: z.object({
    folder: z.string().optional().describe('Filter by folder'),
    limit: z.number().min(1).max(20).optional().describe('Number of emails (default 10)'),
    unreadOnly: z.boolean().optional().describe('Only show unread emails'),
    todayOnly: z.boolean().optional().describe('Only show emails received today'),
  }),
  star_email: z.object({
    emailId: z.string().describe('Email ID to star/unstar'),
    starred: z.boolean().describe('true to star, false to unstar'),
  }),
  mark_email_read: z.object({
    emailId: z.string().describe('Email ID'),
    read: z.boolean().describe('true = mark read, false = mark unread'),
  }),
  label_email: z.object({
    emailId: z.string().describe('Email ID'),
    addLabels: z.array(z.string()).optional().describe('Labels to add'),
    removeLabels: z.array(z.string()).optional().describe('Labels to remove'),
  }),
};

@Injectable()
export class EmailProductivityToolsService implements OnModuleInit {
  private readonly logger = new Logger(EmailProductivityToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailCrudService: EmailCrudService,
    private readonly emailBulkService: EmailBulkService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'list_email_index', description: 'Get a numbered index of recent emails', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: emailProductivitySchemas.list_email_index },
      { name: 'star_email', description: 'Star or unstar an email', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: emailProductivitySchemas.star_email },
      { name: 'mark_email_read', description: 'Mark an email as read or unread', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: emailProductivitySchemas.mark_email_read },
      { name: 'label_email', description: 'Add or remove workspace labels on an email', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: emailProductivitySchemas.label_email },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name, description: t.description, parameters: {}, execute: noop,
        domain: 'productivity', riskLevel: t.riskLevel, requiresApproval: t.requiresApproval, inputSchema: t.inputSchema,
      });
    }
  }

  getTools(tenantId: string) {
    return {
      list_email_index: this.buildListEmailIndex(tenantId),
      star_email: this.buildStarEmail(tenantId),
      mark_email_read: this.buildMarkEmailRead(tenantId),
      label_email: this.buildLabelEmail(tenantId),
    };
  }

  private buildListEmailIndex(tenantId: string) {
    return tool({
      description:
        'Get a numbered index of recent emails. Useful for browsing inbox, showing what arrived, ' +
        'or when user says "show my emails", "what\'s in my inbox", "any new emails". ' +
        'Supports unreadOnly and todayOnly for focused inbox views. ' +
        'Returns: { count, index: [{ idx, id, from, subject, date, preview, unread, starred }] }.',
      inputSchema: emailProductivitySchemas.list_email_index,
      execute: async (args) => {
        try {
          const limit = args.limit ?? 10;
          const where: Record<string, unknown> = {
            tenantId,
            isDeleted: false,
          };

          if (args.folder) {
            where.folder = args.folder;
          }

          if (args.unreadOnly) {
            where.isRead = false;
          }

          if (args.todayOnly) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);
            where.receivedAt = { gte: startOfToday, lte: endOfToday };
          }

          const emails = await this.prisma.email.findMany({
            where,
            orderBy: { receivedAt: 'desc' },
            take: limit,
            select: {
              id: true,
              from: true,
              subject: true,
              receivedAt: true,
              snippet: true,
              isRead: true,
              isStarred: true,
            },
          });

          const index = emails.map((email, indexValue) => ({
            idx: indexValue + 1,
            id: email.id,
            from: email.from,
            subject: email.subject || '(no subject)',
            date: email.receivedAt?.toISOString() ?? '',
            preview: email.snippet?.slice(0, 80) ?? '',
            unread: !email.isRead,
            starred: email.isStarred,
          }));

          return truncateToolResult({
            count: index.length,
            index,
            hint:
              index.length === limit
                ? 'More emails available - ask for more or search.'
                : undefined,
          });
        } catch (error) {
          this.logger.warn(
            `list_email_index failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { error: 'Failed to list emails' };
        }
      },
    });
  }

  private buildStarEmail(tenantId: string) {
    return tool({
      description:
        'Star or unstar an email. Use when user says "star this", "unstar", "mark as important".',
      inputSchema: emailProductivitySchemas.star_email,
      execute: async ({ emailId, starred }) => {
        try {
          await this.emailCrudService.updateEmail(emailId, tenantId, {
            isStarred: starred,
          });
          return { success: true, emailId, starred };
        } catch (error) {
          this.logger.warn(
            `star_email failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { error: `Failed to ${starred ? 'star' : 'unstar'} email` };
        }
      },
    });
  }

  private buildMarkEmailRead(tenantId: string) {
    return tool({
      description: 'Mark an email as read or unread.',
      inputSchema: emailProductivitySchemas.mark_email_read,
      execute: async ({ emailId, read }) => {
        try {
          await this.emailCrudService.updateEmail(emailId, tenantId, {
            isRead: read,
          });
          return { success: true, emailId, read };
        } catch (error) {
          this.logger.warn(
            `mark_email_read failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { error: `Failed to mark email as ${read ? 'read' : 'unread'}` };
        }
      },
    });
  }

  private buildLabelEmail(tenantId: string) {
    return tool({
      description:
        'Add or remove existing workspace labels on an email. ' +
        'Only use labels that already exist for this tenant. Never invent new label names. ' +
        'Use when user says "tag this", "label as", "remove label", "categorize".',
      inputSchema: emailProductivitySchemas.label_email,
      execute: async ({ emailId, addLabels, removeLabels }) => {
        try {
          const email = await this.prisma.email.findFirst({
            where: { id: emailId, tenantId },
            select: { id: true },
          });

          if (!email) {
            return { error: 'Email not found' };
          }

          const availableLabels = await this.prisma.userLabel.findMany({
            where: {
              tenantId,
              isArchived: false,
              type: 'USER',
            },
            select: { id: true, name: true },
            orderBy: { orderIndex: 'asc' },
          });

          if (availableLabels.length === 0) {
            return { error: 'No labels are configured for this workspace' };
          }

          const additions = this.resolveWorkspaceLabels(
            availableLabels,
            addLabels,
          );
          const removals = this.resolveWorkspaceLabels(
            availableLabels,
            removeLabels,
          );

          const removalIds = new Set<string>(removals.ids);
          const addIds = additions.ids.filter(
            (labelId) => !removalIds.has(labelId),
          );
          const addedLabels = additions.names.filter(
            (_name, indexValue) =>
              !removalIds.has(additions.ids[indexValue] ?? ''),
          );

          if (addIds.length === 0 && removals.ids.length === 0) {
            return {
              error: 'No matching labels found',
              unmatchedLabels: Array.from(
                new Set([...additions.unmatched, ...removals.unmatched]),
              ),
              availableLabels: availableLabels.map((label) => label.name),
            };
          }

          if (addIds.length > 0) {
            await this.emailBulkService.bulkAddLabels([emailId], tenantId, addIds);
          }

          if (removals.ids.length > 0) {
            await this.emailBulkService.bulkRemoveLabels(
              [emailId],
              tenantId,
              removals.ids,
            );
          }

          const updatedEmail = await this.emailCrudService.getEmailById(
            emailId,
            tenantId,
          );
          const currentLabels =
            updatedEmail.emailLabels
              ?.map((entry) => entry.label?.name)
              .filter((name): name is string => Boolean(name)) ?? [];

          return {
            success: true,
            emailId,
            addedLabels,
            removedLabels: removals.names,
            unmatchedLabels: Array.from(
              new Set([...additions.unmatched, ...removals.unmatched]),
            ),
            currentLabels,
          };
        } catch (error) {
          this.logger.warn(
            `label_email failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { error: 'Failed to update labels' };
        }
      },
    });
  }

  private normalizeLabelName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private resolveWorkspaceLabels(
    availableLabels: WorkspaceLabel[],
    requestedLabels?: string[],
  ): ResolvedWorkspaceLabels {
    if (!requestedLabels?.length) {
      return { ids: [], names: [], unmatched: [] };
    }

    const normalizedCatalog = availableLabels.map((label) => ({
      ...label,
      normalized: this.normalizeLabelName(label.name),
    }));

    const exactMatches = new Map<string, (WorkspaceLabel & { normalized: string })>(
      normalizedCatalog.map((label) => [label.normalized, label]),
    );

    const ids: string[] = [];
    const names: string[] = [];
    const unmatched: string[] = [];
    const seen = new Set<string>();

    for (const rawLabel of requestedLabels) {
      const normalized = this.normalizeLabelName(rawLabel);
      if (!normalized) {
        continue;
      }

      let match = exactMatches.get(normalized);

      if (!match) {
        const candidates = normalizedCatalog.filter(
          (label) =>
            label.normalized.includes(normalized) ||
            normalized.includes(label.normalized),
        );

        if (candidates.length === 1) {
          match = candidates[0];
        }
      }

      if (!match) {
        unmatched.push(rawLabel);
        continue;
      }

      if (!seen.has(match.id)) {
        seen.add(match.id);
        ids.push(match.id);
        names.push(match.name);
      }
    }

    return { ids, names, unmatched };
  }
}
