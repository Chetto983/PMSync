/**
 * ProductivityToolsService -- Missing tools for follow-ups, labels, stars, email index.
 *
 * Tools: list_email_index, star_email, mark_email_read, label_email,
 *        list_follow_ups, update_follow_up
 *
 * Phase CONSOLIDATION: Completes the agent tool gap.
 */
import { Injectable, Logger } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailBulkService } from '../../email/services/email-bulk.service';
import { EmailCrudService } from '../../email/services/email-crud.service';
import { truncateToolResult } from '../utils/tool-result-truncator';

type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

type WorkspaceLabel = {
  id: string;
  name: string;
};

type ResolvedWorkspaceLabels = {
  ids: string[];
  names: string[];
  unmatched: string[];
};

@Injectable()
export class ProductivityToolsService {
  private readonly logger = new Logger(ProductivityToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailCrudService: EmailCrudService,
    private readonly emailBulkService: EmailBulkService,
  ) {}

  getTools(
    tenantId: string,
    userId: string,
    _conversationId: string,
    _piiResolve: PiiResolveFn,
  ) {
    return {
      list_email_index: this.buildListEmailIndex(tenantId),
      star_email: this.buildStarEmail(tenantId),
      mark_email_read: this.buildMarkEmailRead(tenantId),
      label_email: this.buildLabelEmail(tenantId),
      list_follow_ups: this.buildListFollowUps(tenantId, userId),
      update_follow_up: this.buildUpdateFollowUp(tenantId, userId),
    };
  }

  private buildListEmailIndex(tenantId: string) {
    return tool({
      description:
        'Get a numbered index of recent emails. Useful for browsing inbox, showing what arrived, ' +
        'or when user says "show my emails", "what\'s in my inbox", "any new emails". ' +
        'Returns: { count, index: [{ idx, id, from, subject, date, preview, unread, starred }] }.',
      inputSchema: z.object({
        folder: z
          .string()
          .optional()
          .describe('Filter by folder (INBOX, SENT, DRAFTS, etc.)'),
        limit: z
          .number()
          .min(1)
          .max(20)
          .optional()
          .describe('Number of emails (default 10)'),
        unreadOnly: z
          .boolean()
          .optional()
          .describe('Only show unread emails'),
      }),
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
      inputSchema: z.object({
        emailId: z.string().describe('Email ID to star/unstar'),
        starred: z.boolean().describe('true to star, false to unstar'),
      }),
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
      inputSchema: z.object({
        emailId: z.string().describe('Email ID'),
        read: z.boolean().describe('true = mark read, false = mark unread'),
      }),
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
      inputSchema: z.object({
        emailId: z.string().describe('Email ID'),
        addLabels: z.array(z.string()).optional().describe('Labels to add'),
        removeLabels: z
          .array(z.string())
          .optional()
          .describe('Labels to remove'),
      }),
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

  private buildListFollowUps(tenantId: string, userId: string) {
    return tool({
      description:
        'List pending follow-ups. Shows emails needing action or waiting for response. ' +
        'Use for "what do I need to follow up on", "my follow-ups", "pending tasks", ' +
        '"what needs my attention", "any overdue items".',
      inputSchema: z.object({
        status: z
          .enum(['PENDING', 'REMINDED', 'RESOLVED', 'EXPIRED'])
          .optional()
          .describe('Filter by status (default: pending + reminded)'),
        limit: z
          .number()
          .min(1)
          .max(20)
          .optional()
          .describe('Max results (default 10)'),
      }),
      execute: async (args) => {
        try {
          const limit = args.limit ?? 10;
          const statusFilter = args.status
            ? [args.status as FollowUpStatus]
            : [FollowUpStatus.PENDING, FollowUpStatus.REMINDED];

          const followUps = await this.prisma.emailFollowUp.findMany({
            where: {
              tenantId,
              userId,
              status: { in: statusFilter },
            },
            include: {
              email: {
                select: {
                  id: true,
                  subject: true,
                  from: true,
                  receivedAt: true,
                  aiPriority: true,
                  aiSentiment: true,
                },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: limit,
          });

          const items = followUps.map((followUp) => ({
            followUpId: followUp.id,
            status: followUp.status.toLowerCase(),
            reason: followUp.reason,
            dueDate: followUp.dueDate?.toISOString() ?? null,
            emailType: followUp.followUpType ?? null,
            confidence: followUp.confidence,
            remindCount: followUp.remindCount,
            lastRemindedAt: followUp.lastRemindedAt?.toISOString() ?? null,
            email: {
              id: followUp.email?.id ?? followUp.emailId,
              subject: followUp.email?.subject ?? null,
              from: followUp.email?.from ?? '',
              receivedAt: followUp.email?.receivedAt?.toISOString() ?? null,
              aiPriority: followUp.email?.aiPriority ?? null,
              aiSentiment: followUp.email?.aiSentiment ?? null,
            },
          }));

          return truncateToolResult({
            count: items.length,
            followUps: items,
            message: items.length === 0 ? 'No follow-ups found.' : undefined,
          });
        } catch (error) {
          this.logger.warn(
            `list_follow_ups failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return {
            error: 'Failed to list follow-ups',
            count: 0,
            followUps: [],
          };
        }
      },
    });
  }

  private buildUpdateFollowUp(tenantId: string, userId: string) {
    return tool({
      description:
        'Update a follow-up: resolve, snooze, or reopen. ' +
        'Use when user says "mark as done", "snooze for 3 days", "resolve follow-up", "reopen".',
      inputSchema: z.object({
        followUpId: z.string().describe('Follow-up ID'),
        action: z
          .enum(['resolve', 'snooze', 'reopen'])
          .describe('Action to take'),
        snoozeDays: z
          .number()
          .min(1)
          .max(30)
          .optional()
          .describe('Days to snooze (only for snooze action, default 3)'),
      }),
      execute: async ({ followUpId, action, snoozeDays }) => {
        try {
          const where = { id: followUpId, tenantId, userId };

          if (action === 'resolve') {
            const result = await this.prisma.emailFollowUp.updateMany({
              where,
              data: {
                status: FollowUpStatus.RESOLVED,
                resolvedAt: new Date(),
              },
            });

            if (result.count === 0) {
              return { error: 'Follow-up not found' };
            }

            return { success: true, followUpId, action: 'resolved' };
          }

          if (action === 'snooze') {
            const days = snoozeDays ?? 3;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + days);
            dueDate.setHours(9, 0, 0, 0);

            const result = await this.prisma.emailFollowUp.updateMany({
              where,
              data: {
                dueDate,
                status: FollowUpStatus.PENDING,
                remindCount: 0,
              },
            });

            if (result.count === 0) {
              return { error: 'Follow-up not found' };
            }

            return {
              success: true,
              followUpId,
              action: 'snoozed',
              newDueDate: dueDate.toISOString(),
            };
          }

          if (action === 'reopen') {
            const result = await this.prisma.emailFollowUp.updateMany({
              where,
              data: {
                status: FollowUpStatus.PENDING,
                resolvedAt: null,
              },
            });

            if (result.count === 0) {
              return { error: 'Follow-up not found' };
            }

            return { success: true, followUpId, action: 'reopened' };
          }

          return { error: `Unknown action: ${action}` };
        } catch (error) {
          this.logger.warn(
            `update_follow_up failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { error: 'Failed to update follow-up' };
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
