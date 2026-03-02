import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSearchService } from '../../email/services/email-search.service';
import { EmailCrudService } from '../../email/services/email-crud.service';
import { EmailSendService } from '../../email/services/email-send.service';
import { EmailFetchService } from '../../email/services/email-fetch.service';

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
@Injectable()
export class EmailToolsService {
  private readonly logger = new Logger(EmailToolsService.name);

  constructor(
    private readonly emailSearchService: EmailSearchService,
    private readonly emailCrudService: EmailCrudService,
    private readonly emailSendService: EmailSendService,
    private readonly emailFetchService: EmailFetchService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns all email tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    _conversationId: string,
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
        'Send an email on behalf of the user. Provide recipient address, subject, and body. ' +
        'Example: send_email({ to: "john@example.com", subject: "Meeting tomorrow", body: "Hi John, ..." })',
      inputSchema: z.object({
        to: z.string().describe('Recipient email address'),
        cc: z.string().optional().describe('CC recipients, comma-separated'),
        bcc: z.string().optional().describe('BCC recipients, comma-separated'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body in plain text or HTML'),
      }),
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

        return {
          jobId: result.jobId,
          to: toAddresses,
          subject: resolved.subject,
          status: 'queued',
        };
      },
    });
  }

  private buildSearchEmails(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Search through the user\'s emails by keyword, sender, subject, or date. ' +
        'Returns matching emails with subject, sender, date, AI triage (priority, sentiment, labels). ' +
        'Example: search_emails({ query: "invoice from Acme", limit: 10 })',
      inputSchema: z.object({
        query: z.string().describe('Search query (keywords, sender name, subject text)'),
        limit: z.number().optional().describe('Max results to return (default 20, max 50)'),
      }),
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

        return { results, count: results.length };
      },
    });
  }

  private buildReadEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Read the full content of a specific email by its ID. ' +
        'Returns sender, recipients, subject, body text, labels, AI triage (priority, sentiment, labels), ' +
        'and analysis (summary, key points, category, suggested actions). ' +
        'Example: read_email({ emailId: "clx123abc" })',
      inputSchema: z.object({
        emailId: z.string().describe('The ID of the email to read'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const email = await this.prisma.email.findFirst({
          where: { id: resolved.emailId, tenantId },
          include: { analysis: true },
        });

        if (!email) {
          return { error: 'Email not found', emailId: resolved.emailId };
        }

        const bodyText = typeof email.bodyText === 'string'
          ? email.bodyText.slice(0, 2000)
          : '';

        const analysis = (email as any).analysis;

        return {
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
        };
      },
    });
  }

  private buildArchiveEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Archive an email, removing it from the inbox without deleting it. ' +
        'Example: archive_email({ emailId: "clx123abc" })',
      inputSchema: z.object({
        emailId: z.string().describe('The ID of the email to archive'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.emailCrudService.updateEmail(
          resolved.emailId,
          tenantId,
          { folder: 'Archive' },
        );
        return { id: resolved.emailId, archived: true };
      },
    });
  }

  private buildMoveEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Move an email to a specific folder. ' +
        'Example: move_email({ emailId: "clx123abc", folder: "Work" })',
      inputSchema: z.object({
        emailId: z.string().describe('The ID of the email to move'),
        folder: z.string().describe('Target folder name or path'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.emailCrudService.updateEmail(
          resolved.emailId,
          tenantId,
          { folder: resolved.folder },
        );
        return { id: resolved.emailId, movedTo: resolved.folder };
      },
    });
  }

  private buildDeleteEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Permanently delete an email. This action cannot be undone. ' +
        'Example: delete_email({ emailId: "clx123abc" })',
      inputSchema: z.object({
        emailId: z.string().describe('The ID of the email to delete'),
      }),
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        await this.emailCrudService.deleteEmail(resolved.emailId, tenantId);
        return { id: resolved.emailId, deleted: true };
      },
    });
  }

  private buildForwardEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Forward an existing email to another recipient. Includes the original email body. ' +
        'Example: forward_email({ emailId: "clx123abc", to: "jane@example.com", message: "FYI" })',
      inputSchema: z.object({
        emailId: z.string().describe('The ID of the email to forward'),
        to: z.string().describe('Recipient email address for forwarding'),
        message: z.string().optional().describe('Optional message to prepend'),
      }),
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const original = await this.prisma.email.findFirst({
          where: { id: resolved.emailId, tenantId },
        });

        if (!original) {
          return { error: 'Original email not found', emailId: resolved.emailId };
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

        return {
          jobId: result.jobId,
          forwardedEmailId: resolved.emailId,
          to: resolved.to,
          subject: `Fwd: ${original.subject}`,
          status: 'queued',
        };
      },
    });
  }

  private buildReplyEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Reply to an email. The original sender becomes the recipient. ' +
        'Example: reply_email({ emailId: "clx123abc", body: "Thanks for the update!" })',
      inputSchema: z.object({
        emailId: z.string().describe('The ID of the email to reply to'),
        body: z.string().describe('Reply message body'),
        replyAll: z.boolean().optional().describe('Reply to all recipients (default false)'),
      }),
      needsApproval: true,
      execute: async (args) => {
        const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
        const original = await this.prisma.email.findFirst({
          where: { id: resolved.emailId, tenantId },
        });

        if (!original) {
          return { error: 'Original email not found', emailId: resolved.emailId };
        }

        const provider = await this.getDefaultProvider(tenantId);
        const toAddress = typeof original.from === 'string' ? original.from : '';

        const result = await this.emailSendService.queueSend({
          tenantId,
          providerId: provider.id,
          to: [toAddress],
          subject: `Re: ${original.subject}`,
          bodyHtml: resolved.body,
          bodyText: resolved.body,
          inReplyTo: original.messageId ?? undefined,
          threadId: original.threadId ?? undefined,
        });

        return {
          jobId: result.jobId,
          repliedToEmailId: resolved.emailId,
          to: toAddress,
          subject: `Re: ${original.subject}`,
          status: 'queued',
        };
      },
    });
  }

  private buildDraftEmail(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a draft email without sending it. The user can review and send later. ' +
        'Example: draft_email({ to: "john@example.com", subject: "Proposal", body: "..." })',
      inputSchema: z.object({
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content'),
      }),
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
            sentAt: new Date(),
            receivedAt: new Date(),
          },
        });

        return {
          id: draft.id,
          subject: resolved.subject,
          to: resolved.to,
          status: 'draft',
        };
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
    });

    if (!provider) {
      throw new Error('No active email provider found for tenant');
    }

    return provider;
  }
}
