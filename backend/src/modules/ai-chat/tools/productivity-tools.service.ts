/**
 * ProductivityToolsService -- Missing tools for follow-ups, labels, stars, email index.
 *
 * Tools: list_email_index, star_email, mark_email_read, label_email,
 *        list_follow_ups, update_follow_up
 *
 * Phase CONSOLIDATION: Completes the agent tool gap.
 */
import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { FollowUpStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailCrudService } from '../../email/services/email-crud.service';
import { truncateToolResult } from '../utils/tool-result-truncator';

type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

@Injectable()
export class ProductivityToolsService {
  private readonly logger = new Logger(ProductivityToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailCrudService: EmailCrudService,
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
        folder: z.string().optional().describe('Filter by folder (INBOX, SENT, DRAFTS, etc.)'),
        limit: z.number().min(1).max(20).optional().describe('Number of emails (default 10)'),
        unreadOnly: z.boolean().optional().describe('Only show unread emails'),
      }),
      execute: async (args) => {
        try {
          const limit = args.limit ?? 10;
          const where: Record<string, unknown> = { tenantId, isDeleted: false };
          if (args.folder) where.folder = args.folder;
          if (args.unreadOnly) where.isRead = false;

          const emails = await this.prisma.email.findMany({
            where,
            orderBy: { receivedAt: 'desc' },
            take: limit,
            select: {
              id: true, from: true, subject: true, receivedAt: true,
              snippet: true, isRead: true, isStarred: true,
            },
          });

          const index = emails.map((e, i) => ({
            idx: i + 1,
            id: e.id,
            from: e.from,
            subject: e.subject || '(no subject)',
            date: e.receivedAt?.toISOString() ?? '',
            preview: e.snippet?.slice(0, 80) ?? '',
            unread: !e.isRead,
            starred: e.isStarred,
          }));

          return truncateToolResult({
            count: index.length,
            index,
            hint: index.length === limit ? 'More emails available — ask for more or search.' : undefined,
          });
        } catch (err) {
          this.logger.warn(`list_email_index failed: ${err instanceof Error ? err.message : err}`);
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
          await this.emailCrudService.updateEmail(emailId, tenantId, { isStarred: starred });
          return { success: true, emailId, starred };
        } catch (err) {
          this.logger.warn(`star_email failed: ${err instanceof Error ? err.message : err}`);
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
          await this.emailCrudService.updateEmail(emailId, tenantId, { isRead: read });
          return { success: true, emailId, read };
        } catch (err) {
          this.logger.warn(`mark_email_read failed: ${err instanceof Error ? err.message : err}`);
          return { error: `Failed to mark email as ${read ? 'read' : 'unread'}` };
        }
      },
    });
  }

  private buildLabelEmail(tenantId: string) {
    return tool({
      description:
        'Add or remove labels on an email. Use when user says "label as urgent", ' +
        '"tag as important", "remove label", "categorize".',
      inputSchema: z.object({
        emailId: z.string().describe('Email ID'),
        addLabels: z.array(z.string()).optional().describe('Labels to add'),
        removeLabels: z.array(z.string()).optional().describe('Labels to remove'),
      }),
      execute: async ({ emailId, addLabels, removeLabels }) => {
        try {
          const email = await this.prisma.email.findFirst({
            where: { id: emailId, tenantId },
            select: { labels: true },
          });
          if (!email) return { error: 'Email not found' };

          let labels = [...(email.labels || [])];
          if (addLabels?.length) {
            for (const l of addLabels) {
              if (!labels.includes(l)) labels.push(l);
            }
          }
          if (removeLabels?.length) {
            labels = labels.filter((l) => !removeLabels.includes(l));
          }

          await this.prisma.email.update({
            where: { id_tenantId: { id: emailId, tenantId } },
            data: { labels },
          });

          return { success: true, emailId, labels };
        } catch (err) {
          this.logger.warn(`label_email failed: ${err instanceof Error ? err.message : err}`);
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
        limit: z.number().min(1).max(20).optional().describe('Max results (default 10)'),
      }),
      execute: async (args) => {
        try {
          const limit = args.limit ?? 10;
          const statusFilter = args.status
            ? [args.status as FollowUpStatus]
            : [FollowUpStatus.PENDING, FollowUpStatus.REMINDED];

          const followUps = await this.prisma.emailFollowUp.findMany({
            where: { tenantId, userId, status: { in: statusFilter } },
            include: {
              email: {
                select: {
                  id: true, subject: true, from: true, receivedAt: true,
                  aiPriority: true, aiSentiment: true,
                },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: limit,
          });

          const items = followUps.map((f) => ({
            followUpId: f.id,
            status: f.status.toLowerCase(),
            reason: f.reason,
            dueDate: f.dueDate?.toISOString() ?? null,
            emailType: f.followUpType ?? null,
            confidence: f.confidence,
            remindCount: f.remindCount,
            lastRemindedAt: f.lastRemindedAt?.toISOString() ?? null,
            email: {
              id: f.email?.id ?? f.emailId,
              subject: f.email?.subject ?? null,
              from: f.email?.from ?? '',
              receivedAt: f.email?.receivedAt?.toISOString() ?? null,
              aiPriority: f.email?.aiPriority ?? null,
              aiSentiment: f.email?.aiSentiment ?? null,
            },
          }));

          return truncateToolResult({
            count: items.length,
            followUps: items,
            message: items.length === 0 ? 'No follow-ups found.' : undefined,
          });
        } catch (err) {
          this.logger.warn(`list_follow_ups failed: ${err instanceof Error ? err.message : err}`);
          return { error: 'Failed to list follow-ups', count: 0, followUps: [] };
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
        action: z.enum(['resolve', 'snooze', 'reopen']).describe('Action to take'),
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
            const r = await this.prisma.emailFollowUp.updateMany({
              where,
              data: { status: FollowUpStatus.RESOLVED, resolvedAt: new Date() },
            });
            if (r.count === 0) return { error: 'Follow-up not found' };
            return { success: true, followUpId, action: 'resolved' };
          }

          if (action === 'snooze') {
            const days = snoozeDays ?? 3;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + days);
            dueDate.setHours(9, 0, 0, 0);
            const r = await this.prisma.emailFollowUp.updateMany({
              where,
              data: { dueDate, status: FollowUpStatus.PENDING, remindCount: 0 },
            });
            if (r.count === 0) return { error: 'Follow-up not found' };
            return { success: true, followUpId, action: 'snoozed', newDueDate: dueDate.toISOString() };
          }

          if (action === 'reopen') {
            const r = await this.prisma.emailFollowUp.updateMany({
              where,
              data: { status: FollowUpStatus.PENDING, resolvedAt: null },
            });
            if (r.count === 0) return { error: 'Follow-up not found' };
            return { success: true, followUpId, action: 'reopened' };
          }

          return { error: `Unknown action: ${action}` };
        } catch (err) {
          this.logger.warn(`update_follow_up failed: ${err instanceof Error ? err.message : err}`);
          return { error: 'Failed to update follow-up' };
        }
      },
    });
  }
}
