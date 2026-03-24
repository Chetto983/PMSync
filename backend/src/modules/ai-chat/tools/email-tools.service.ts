import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSearchService } from '../../email/services/email-search.service';
import { EmailCrudService } from '../../email/services/email-crud.service';
import { EmailSendService } from '../../email/services/email-send.service';
import { EmailFetchService } from '../../email/services/email-fetch.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * EmailToolsService -- 9 email tools for the AI chat pipeline.
 *
 * Tools: send_email, search_emails, read_email, archive_email,
 *        move_email, delete_email, forward_email, reply_email, draft_email
 *
 * Phase 25: Tools & RAG
 */
/** Zod schemas for email tools -- shared between tool() calls and registry */
const schemas = {
  send_email: z.object({
    to: z.string().describe('Recipient email address'),
    cc: z.string().optional().describe('CC recipients, comma-separated'),
    bcc: z.string().optional().describe('BCC recipients, comma-separated'),
    subject: z.string().max(500).describe('Email subject line'),
    body: z.string().max(50000).describe('Email body in plain text or HTML'),
  }),
  search_emails: z.object({
    query: z.string().describe('Search query (keywords, sender name, subject text)'),
    limit: z.number().optional().describe('Max results to return (default 20, max 50)'),
  }),
  read_email: z.object({
    emailId: z.string().describe('The ID of the email to read'),
  }),
  archive_email: z.object({
    emailId: z.string().describe('The ID of the email to archive'),
  }),
  move_email: z.object({
    emailId: z.string().describe('The ID of the email to move'),
    folder: z.string().describe('Target folder name or path'),
  }),
  delete_email: z.object({
    emailId: z.string().describe('The ID of the email to delete'),
  }),
  forward_email: z.object({
    emailId: z.string().describe('The ID of the email to forward'),
    to: z.string().describe('Recipient email address for forwarding'),
    message: z.string().max(10000).optional().describe('Optional message to prepend'),
  }),
  reply_email: z.object({
    emailId: z.string().describe('The ID of the email to reply to'),
    body: z.string().max(50000).describe('Reply message body'),
    replyAll: z.boolean().optional().describe('Reply to all recipients (default false)'),
  }),
  draft_email: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string().max(500).describe('Email subject line'),
    body: z.string().max(50000).describe('Email body content'),
  }),
};

@Injectable()
export class EmailToolsService implements OnModuleInit {
  private readonly logger = new Logger(EmailToolsService.name);

  constructor(
    private readonly emailSearchService: EmailSearchService,
    private readonly emailCrudService: EmailCrudService,
    private readonly emailSendService: EmailSendService,
    private readonly emailFetchService: EmailFetchService,
    private readonly prisma: PrismaService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'search_emails', description: 'Search emails by keyword, sender, or subject', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.search_emails },
      { name: 'read_email', description: 'Fetch full content of a specific email by ID', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.read_email },
      { name: 'send_email', description: 'Queue an email for delivery on behalf of the user', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: schemas.send_email },
      { name: 'delete_email', description: 'Permanently delete an email', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: schemas.delete_email },
      { name: 'forward_email', description: 'Forward an email to another recipient', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: schemas.forward_email },
      { name: 'reply_email', description: 'Reply to an email', riskLevel: 'HIGH' as const, requiresApproval: true, inputSchema: schemas.reply_email },
      { name: 'draft_email', description: 'Create a draft email without sending', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.draft_email },
      { name: 'archive_email', description: 'Move an email to the Archive folder', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.archive_email },
      { name: 'move_email', description: 'Move an email to a specific folder', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.move_email },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name,
        description: t.description,
        parameters: {},
        execute: noop,
        domain: 'email',
        riskLevel: t.riskLevel,
        requiresApproval: t.requiresApproval,
        inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns all email tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      send_email: this.buildSendEmail(tenantId, piiResolve),
      search_emails: this.buildSearchEmails(tenantId, piiResolve),
      read_email: this.buildReadEmail(tenantId, piiResolve),
      archive_email: this.buildArchiveEmail(tenantId, piiResolve),
      move_email: this.buildMoveEmail(tenantId, piiResolve),
      delete_email: this.buildDeleteEmail(tenantId, piiResolve),
      forward_email: this.buildForwardEmail(tenantId, piiResolve),
      reply_email: this.buildReplyEmail(tenantId, piiResolve),
      draft_email: this.buildDraftEmail(tenantId, piiResolve),
    };
  }

  private buildSendEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Send an email on behalf of the user. The email is QUEUED for delivery, not sent instantly. ' +
        'Use when the user explicitly says "send" — if they say "write" or "draft", use draft_email instead. ' +
        'Always verify the recipient address first via search_contacts if you only have a name. ' +
        'Returns: { jobId, to, subject, status: "queued" }. ' +
        'Requires user approval before execution.',
      inputSchema: schemas.send_email,
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const provider = await this.getDefaultProvider(tenantId);
        const toAddresses = resolved.to.split(',').map((e) => e.trim());
        const ccAddresses = resolved.cc?.split(',').map((e) => e.trim());
        const bccAddresses = resolved.bcc?.split(',').map((e) => e.trim());

        const result = await this.emailSendService.queueSend({
          tenantId,
          providerId: provider.id,
          to: toAddresses,
          cc: ccAddresses,
          bcc: bccAddresses,
          subject: resolved.subject,
          bodyHtml: resolved.body,
          bodyText: resolved.body,
        });

        return truncateToolResult({
          jobId: result.jobId,
          to: toAddresses,
          subject: resolved.subject,
          status: 'queued',
        });
      },
    });
  }

  private buildSearchEmails(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search emails by keyword, sender name, subject text, or date. ' +
        'Use for SPECIFIC lookups: "emails from John", "invoices", "emails about the budget". ' +
        'Do NOT use for vague/meaning-based queries — use semantic_search instead. ' +
        'Returns: array of { id, from, subject, date, snippet, labels, aiPriority, aiSentiment, aiLabels }. ' +
        'Max 50 results. Default 20.',
      inputSchema: schemas.search_emails,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const limit = Math.min(resolved.limit ?? 20, 50);
        const emails = await this.emailSearchService.searchEmails(
          tenantId,
          resolved.query,
          undefined,
          limit,
        );

        const results = (Array.isArray(emails) ? emails : []).map((e: any) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          date: e.receivedAt ?? e.createdAt,
          snippet: e.snippet ?? e.bodyText?.slice(0, 120),
          labels: e.labels ?? [],
          aiPriority: e.aiPriority ?? null,
          aiSentiment: e.aiSentiment ?? null,
          aiLabels: e.aiLabels ?? [],
        }));

        return truncateToolResult({ results, count: results.length });
      },
    });
  }

  private buildReadEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Fetch the full content of a specific email by its ID. ' +
        'ALWAYS search first (search_emails or semantic_search) to get the ID — never guess IDs. ' +
        'Returns: { id, from, to, cc, subject, date, bodyText (max 2000 chars), labels, isRead, isStarred, ' +
        'aiPriority, aiSentiment, aiLabels, analysis: { summary, keyPoints, sentiment, priority, category, ' +
        'hasDeadline, deadlineDate, needsFollowUp, followUpDate, suggestedActions } }.',
      inputSchema: schemas.read_email,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const email = await this.prisma.email.findFirst({
          where: { id: resolved.emailId, tenantId },
          include: { analysis: true },
        });

        if (!email) {
          return truncateToolResult({ error: 'Email not found', emailId: resolved.emailId });
        }

        const bodyText = typeof email.bodyText === 'string'
          ? email.bodyText.slice(0, 2000)
          : '';

        const analysis = (email as any).analysis;

        return truncateToolResult({
          id: email.id,
          from: email.from,
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          date: email.receivedAt ?? email.createdAt,
          bodyText,
          snippet: email.snippet,
          labels: email.labels ?? [],
          isRead: email.isRead,
          isStarred: email.isStarred,
          aiPriority: email.aiPriority ?? null,
          aiSentiment: email.aiSentiment ?? null,
          aiLabels: email.aiLabels ?? [],
          analysis: analysis ? {
            summary: analysis.summary ?? null,
            keyPoints: analysis.keyPoints ?? [],
            sentiment: analysis.sentiment ?? null,
            priority: analysis.priority ?? null,
            category: analysis.category ?? null,
            hasDeadline: analysis.hasDeadline ?? false,
            deadlineDate: analysis.deadlineDate ?? null,
            needsFollowUp: analysis.needsFollowUp ?? false,
            followUpDate: analysis.followUpDate ?? null,
            suggestedActions: analysis.suggestedActions ?? null,
          } : null,
        });
      },
    });
  }

  private buildArchiveEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Move an email to the Archive folder, removing it from the Inbox. ' +
        'This does NOT delete the email — it can still be found via search. ' +
        'Use when user says "archive", "clean up", or "done with this". ' +
        'Returns: { id, archived: true }.',
      inputSchema: schemas.archive_email,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.emailCrudService.updateEmail(
          resolved.emailId,
          tenantId,
          { folder: 'Archive' },
        );
        return truncateToolResult({ id: resolved.emailId, archived: true });
      },
    });
  }

  private buildMoveEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Move an email to a specific folder. Use list_folders first if you do not know the exact folder name. ' +
        'Returns: { id, movedTo: <folder name> }.',
      inputSchema: schemas.move_email,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.emailCrudService.updateEmail(
          resolved.emailId,
          tenantId,
          { folder: resolved.folder },
        );
        return truncateToolResult({ id: resolved.emailId, movedTo: resolved.folder });
      },
    });
  }

  private buildDeleteEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Permanently delete an email. This action CANNOT be undone. ' +
        'Use ONLY when the user explicitly asks to delete. For cleanup, prefer archive_email. ' +
        'Returns: { id, deleted: true }. Requires user approval before execution.',
      inputSchema: schemas.delete_email,
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.emailCrudService.deleteEmail(resolved.emailId, tenantId);
        return truncateToolResult({ id: resolved.emailId, deleted: true });
      },
    });
  }

  private buildForwardEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Forward an existing email to another recipient, including the original email body. ' +
        'ALWAYS search first to get the email ID, then verify the recipient via search_contacts. ' +
        'Returns: { jobId, forwardedEmailId, to, subject, status: "queued" }. ' +
        'Requires user approval before execution.',
      inputSchema: schemas.forward_email,
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const original = await this.prisma.email.findFirst({
          where: { id: resolved.emailId, tenantId },
        });

        if (!original) {
          return truncateToolResult({ error: 'Original email not found', emailId: resolved.emailId });
        }

        const provider = await this.getDefaultProvider(tenantId);
        const forwardBody = `${resolved.message ?? ''}\n\n---------- Forwarded message ----------\nFrom: ${original.from}\nSubject: ${original.subject}\n\n${original.bodyText ?? original.snippet ?? ''}`;

        const result = await this.emailSendService.queueSend({
          tenantId,
          providerId: provider.id,
          to: [resolved.to],
          subject: `Fwd: ${original.subject}`,
          bodyHtml: forwardBody,
          bodyText: forwardBody,
        });

        return truncateToolResult({
          jobId: result.jobId,
          forwardedEmailId: resolved.emailId,
          to: resolved.to,
          subject: `Fwd: ${original.subject}`,
          status: 'queued',
        });
      },
    });
  }

  private buildReplyEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Reply to an email. The original sender becomes the recipient automatically. ' +
        'ALWAYS use read_email first to understand what you are replying to. ' +
        'Set replyAll: true to include all original recipients (CC). ' +
        'Returns: { jobId, repliedToEmailId, to, subject, status: "queued" }. ' +
        'Requires user approval before execution.',
      inputSchema: schemas.reply_email,
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const original = await this.prisma.email.findFirst({
          where: { id: resolved.emailId, tenantId },
        });

        if (!original) {
          return truncateToolResult({ error: 'Original email not found', emailId: resolved.emailId });
        }

        const provider = await this.getDefaultProvider(tenantId);
        const toAddress = typeof original.from === 'string' ? original.from : '';
        const ccAddresses = resolved.replyAll
          ? Array.from(
              new Set(
                [...(original.cc ?? []), ...(original.to ?? [])].filter(
                  (address) =>
                    Boolean(address) &&
                    address !== toAddress,
                ),
              ),
            )
          : undefined;

        const result = await this.emailSendService.queueSend({
          tenantId,
          providerId: provider.id,
          to: [toAddress],
          cc: ccAddresses && ccAddresses.length > 0 ? ccAddresses : undefined,
          subject: `Re: ${original.subject}`,
          bodyHtml: resolved.body,
          bodyText: resolved.body,
          inReplyTo: original.messageId ?? undefined,
          threadId: original.threadId ?? undefined,
        });

        return truncateToolResult({
          jobId: result.jobId,
          repliedToEmailId: resolved.emailId,
          to: toAddress,
          subject: `Re: ${original.subject}`,
          status: 'queued',
        });
      },
    });
  }

  private buildDraftEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a draft email saved in the Drafts folder WITHOUT sending it. ' +
        'Use when user says "write", "draft", "compose", or "prepare" — NOT when they say "send". ' +
        'The user can review and send the draft later. ' +
        'Returns: { id, subject, to, status: "draft" }.',
      inputSchema: schemas.draft_email,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const provider = await this.getDefaultProvider(tenantId);

        // Create draft in DB -- not actually sent
        const draft = await this.prisma.email.create({
          data: {
            tenantId,
            providerId: provider.id,
            externalId: `draft-${Date.now()}`,
            from: '', // Will be filled by provider
            to: [resolved.to],
            subject: resolved.subject,
            bodyText: resolved.body,
            bodyHtml: resolved.body,
            snippet: resolved.body.slice(0, 200),
            folder: 'Drafts',
            isDraft: true,
            isRead: true,
            receivedAt: new Date(),
          },
        });

        return truncateToolResult({
          id: draft.id,
          subject: resolved.subject,
          to: resolved.to,
          status: 'draft',
        });
      },
    });
  }

  /**
   * Get the user's default active email provider.
   */
  private async getDefaultProvider(tenantId: string) {
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        supportsEmail: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!provider) {
      throw new Error('No active email provider found for tenant');
    }

    return provider;
  }
}
