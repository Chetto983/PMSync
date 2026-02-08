/**
 * Email Write Tools for VoltAgent
 *
 * Extracted from email.tools.ts (Phase 11-03).
 * Contains write/action operations: send, reply, forward, delete, archive, mark, star, bulk actions.
 * All write operations require HITL approval.
 *
 * Read operations remain in email.tools.ts:
 * - list_emails
 * - search_emails
 * - count_emails
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

const logger = new Logger('EmailWriteTools');

/**
 * Email metadata for caching (shared with email.tools.ts)
 */
interface EmailMetadata {
  id: string;
  subject: string | null;
  from: string;
}

const EMAIL_METADATA_CACHE_TTL = 300; // 5 minutes

/**
 * Get email metadata with Redis caching
 */
async function getEmailMetadata(
  prisma: PrismaService,
  tenantId: string,
  emailId: string,
  cacheService?: CacheService,
): Promise<EmailMetadata | null> {
  const cacheKey = `${tenantId}:meta:${emailId}`;

  if (cacheService?.isHealthy()) {
    try {
      const cached = await cacheService.get<EmailMetadata>(cacheKey, {
        namespace: CacheNamespace.EMAIL_METADATA,
      });
      if (cached) return cached;
    } catch {
      // Fall through to DB
    }
  }

  const email = await prisma.email.findFirst({
    where: { id: emailId, tenantId },
    select: { id: true, subject: true, from: true },
  });

  if (email && cacheService?.isHealthy()) {
    try {
      await cacheService.set(cacheKey, email, {
        namespace: CacheNamespace.EMAIL_METADATA,
        ttl: EMAIL_METADATA_CACHE_TTL,
      });
    } catch {
      // Ignore cache errors
    }
  }

  return email;
}

/**
 * Creates email write tools for VoltAgent.
 * These are action tools that modify data and require HITL approval.
 */
export function createEmailWriteTools(
  prisma: PrismaService,
  emailSendService: EmailSendService | null,
  locale: SupportedLocale = 'en',
  tenantId: string,
  cacheService?: CacheService,
) {
  const t = getToolTranslations(locale);

  return [
    // ========================================================================
    // MANAGE_EMAIL - Single email actions
    // ========================================================================
    createTool({
      name: 'manage_email',
      description: `Perform email actions. CONSOLIDATED TOOL - handles send, reply, forward, and status changes.

Actions:
- "send": Send new email (requires to, body, and EITHER providerId OR from). ALWAYS call list_emails(mode='accounts') first.
- "reply": Reply to email (requires emailId, body; optional replyAll)
- "forward": Forward email (requires emailId, to)
- "delete": Delete email (requires emailId; optional permanent)
- "archive": Archive email (requires emailId)
- "mark_read": Mark as read (requires emailId)
- "mark_unread": Mark as unread (requires emailId)
- "star": Star/flag email (requires emailId)
- "unstar": Remove star (requires emailId)

All actions require user approval (HITL).`,
      parameters: z.object({
        action: z.enum(['send', 'reply', 'forward', 'delete', 'archive', 'mark_read', 'mark_unread', 'star', 'unstar'])
          .describe('Action to perform'),
        emailId: z.string().optional().describe('Email ID (required for all except "send")'),
        providerId: z.string().optional().describe('Provider ID for "send" (from list_emails mode=accounts)'),
        from: z.string().optional().describe('Sender email address for "send"'),
        to: z.array(z.string()).optional().describe('Recipients for "send" or "forward"'),
        subject: z.string().optional().describe('Subject for "send"'),
        body: z.string().optional().describe('Body for "send" or "reply"'),
        cc: z.array(z.string()).optional().describe('CC recipients for "send"'),
        bcc: z.array(z.string()).optional().describe('BCC recipients for "send"'),
        replyAll: z.boolean().optional().describe('Reply to all for "reply"'),
        additionalMessage: z.string().optional().describe('Message to add for "forward"'),
        permanent: z.boolean().optional().describe('Permanent delete for "delete"'),
      }),
      execute: async (params) => {
        const { action, emailId } = params;

        if (action !== 'send' && !emailId) {
          return { success: false, error: `emailId is required for action "${action}"` };
        }

        switch (action) {
          case 'send': {
            if (!emailSendService) {
              return { success: false, error: t.email.serviceUnavailable };
            }
            const { providerId, from: fromEmail, to, subject, body, cc, bcc } = params;
            if (!to?.length || !body) {
              return { success: false, error: 'send requires to and body' };
            }
            if (!providerId && !fromEmail) {
              return { success: false, error: 'send requires providerId or from email. Call list_emails(mode="accounts") first.' };
            }

            let resolvedProviderId = providerId;
            let senderEmail = fromEmail;

            if (providerId) {
              const provider = await prisma.providerConfig.findFirst({
                where: { id: providerId, tenantId, isActive: true, supportsEmail: true },
                select: { email: true },
              });
              if (!provider) {
                return { success: false, error: 'Email account not found or not active' };
              }
              senderEmail = provider.email;
            } else if (fromEmail) {
              const provider = await prisma.providerConfig.findFirst({
                where: { email: fromEmail, tenantId, isActive: true, supportsEmail: true },
                select: { id: true, email: true },
              });
              if (provider) {
                resolvedProviderId = provider.id;
                senderEmail = provider.email;
              }
            }

            const subjectText = subject || t.email.noSubject;
            const summaryFrom = senderEmail ? ` (from ${senderEmail})` : '';
            return {
              success: true,
              requiresApproval: true,
              actionType: 'SEND_EMAIL',
              severity: 'HIGH',
              payload: { providerId: resolvedProviderId, from: senderEmail, to, subject: subjectText, body, cc, bcc },
              summary: t.email.sent(to.join(', '), subjectText) + summaryFrom,
            };
          }

          case 'reply': {
            if (!emailSendService) {
              return { success: false, error: t.email.serviceUnavailable };
            }
            const { body, replyAll } = params;
            if (!body) {
              return { success: false, error: 'reply requires body' };
            }
            const originalEmail = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!originalEmail) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'REPLY_EMAIL',
              severity: 'HIGH',
              payload: {
                emailId,
                body,
                replyAll: replyAll ?? false,
                originalSubject: originalEmail.subject || t.email.noSubject,
                originalFrom: originalEmail.from,
              },
              summary: t.email.replied(originalEmail.subject || t.email.noSubject),
            };
          }

          case 'forward': {
            if (!emailSendService) {
              return { success: false, error: t.email.serviceUnavailable };
            }
            const { to, additionalMessage } = params;
            if (!to?.length) {
              return { success: false, error: 'forward requires to' };
            }
            const originalEmail = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!originalEmail) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'FORWARD_EMAIL',
              severity: 'HIGH',
              payload: { emailId, to, additionalMessage },
              summary: t.email.forwarded(to.join(', ')),
            };
          }

          case 'delete': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'DELETE_EMAIL',
              severity: 'HIGH',
              payload: { emailId, permanent: params.permanent ?? false },
              summary: t.email.deleted(email.subject || t.email.noSubject),
            };
          }

          case 'archive': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'ARCHIVE_EMAIL',
              severity: 'MEDIUM',
              payload: { emailId },
              summary: t.email.archived(email.subject || t.email.noSubject),
            };
          }

          case 'mark_read': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'MARK_READ',
              severity: 'LOW',
              payload: { emailId },
              summary: t.email.markedRead(email.subject || t.email.noSubject),
            };
          }

          case 'mark_unread': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'MARK_UNREAD',
              severity: 'LOW',
              payload: { emailId },
              summary: t.email.markedUnread(email.subject || t.email.noSubject),
            };
          }

          case 'star': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'STAR_EMAIL',
              severity: 'LOW',
              payload: { emailId },
              summary: t.email.starred(email.subject || t.email.noSubject),
            };
          }

          case 'unstar': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            return {
              success: true,
              requiresApproval: true,
              actionType: 'UNSTAR_EMAIL',
              severity: 'LOW',
              payload: { emailId },
              summary: t.email.unstarred(email.subject || t.email.noSubject),
            };
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),

    // ========================================================================
    // BULK_EMAIL_ACTIONS - Bulk operations
    // ========================================================================
    createTool({
      name: 'bulk_email_actions',
      description: `Perform bulk email operations. CONSOLIDATED TOOL - handles mass delete, archive, and mark-read.

Actions:
- "delete": Delete multiple emails (requires folder OR emailIds)
- "empty_folder": Empty JUNK/SPAM/TRASH completely (requires folder)
- "archive": Archive multiple emails (folder defaults to INBOX)
- "mark_read": Mark multiple emails as read

All actions require user approval (HITL).`,
      parameters: z.object({
        action: z.enum(['delete', 'empty_folder', 'archive', 'mark_read'])
          .describe('Bulk action to perform'),
        folder: z.string().optional().describe('Folder name'),
        emailIds: z.array(z.string()).optional().describe('Specific email IDs'),
        olderThanDays: z.number().optional().describe('Only emails older than X days'),
        onlyRead: z.boolean().optional().describe('Only read emails'),
        permanent: z.boolean().optional().describe('Permanently delete'),
      }),
      execute: async (params) => {
        const { action, folder, emailIds, olderThanDays, onlyRead, permanent } = params;

        const resolveFolderNames = async (folderName: string): Promise<string[]> => {
          const upperFolder = folderName.toUpperCase();
          const specialUseVariants = upperFolder === 'JUNK' || upperFolder === 'SPAM'
            ? ['JUNK', 'SPAM']
            : [upperFolder];

          const matchingFolders = await prisma.folder.findMany({
            where: { tenantId, specialUse: { in: specialUseVariants } },
            select: { name: true, path: true },
          });

          if (matchingFolders.length > 0) {
            return matchingFolders.flatMap((f) => [f.name, f.path]);
          }
          return [];
        };

        switch (action) {
          case 'delete': {
            const whereClause: Prisma.EmailWhereInput = { tenantId };

            if (emailIds?.length) {
              whereClause.id = { in: emailIds };
            } else if (folder) {
              const resolvedFolders = await resolveFolderNames(folder);
              if (resolvedFolders.length > 0) {
                whereClause.folder = { in: resolvedFolders };
              } else {
                whereClause.folder = { contains: folder, mode: 'insensitive' };
              }
            } else {
              return { success: false, error: 'delete requires folder or emailIds' };
            }

            if (olderThanDays) {
              const cutoffDate = new Date();
              cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
              whereClause.receivedAt = { lt: cutoffDate };
            }

            const count = await prisma.email.count({ where: whereClause });
            if (count === 0) {
              return { success: true, data: { count: 0 }, summary: 'No emails found to delete' };
            }

            const emailsToDelete = await prisma.email.findMany({
              where: whereClause,
              select: { id: true },
              take: 1000,
            });

            return {
              success: true,
              requiresApproval: true,
              actionType: 'BULK_DELETE_EMAILS',
              severity: 'HIGH',
              payload: {
                emailIds: emailsToDelete.map((e) => e.id),
                folder: folder?.toUpperCase(),
                permanent: permanent ?? false,
                count: emailsToDelete.length,
              },
              summary: `Delete ${emailsToDelete.length} email(s)`,
            };
          }

          case 'empty_folder': {
            if (!folder) {
              return { success: false, error: 'empty_folder requires folder' };
            }

            const upperFolder = folder.toUpperCase();
            if (!['JUNK', 'SPAM', 'TRASH'].includes(upperFolder)) {
              return { success: false, error: 'empty_folder only works with JUNK, SPAM, or TRASH' };
            }

            const resolvedFolders = await resolveFolderNames(folder);
            const whereClause: Prisma.EmailWhereInput = { tenantId };
            if (resolvedFolders.length > 0) {
              whereClause.folder = { in: resolvedFolders };
            } else {
              whereClause.folder = { contains: folder, mode: 'insensitive' };
            }

            const count = await prisma.email.count({ where: whereClause });
            if (count === 0) {
              return { success: true, data: { count: 0 }, summary: `${upperFolder} folder is already empty` };
            }

            const emailsToDelete = await prisma.email.findMany({
              where: whereClause,
              select: { id: true },
              take: 5000,
            });

            return {
              success: true,
              requiresApproval: true,
              actionType: 'EMPTY_FOLDER',
              severity: 'HIGH',
              payload: {
                folder: upperFolder,
                emailIds: emailsToDelete.map((e) => e.id),
                permanent: permanent ?? (upperFolder === 'TRASH'),
                count: emailsToDelete.length,
              },
              summary: `Empty ${upperFolder} folder (${emailsToDelete.length} emails)`,
            };
          }

          case 'archive': {
            const whereClause: Prisma.EmailWhereInput = { tenantId };

            if (emailIds?.length) {
              whereClause.id = { in: emailIds };
            } else if (folder) {
              const resolvedFolders = await resolveFolderNames(folder);
              if (resolvedFolders.length > 0) {
                whereClause.folder = { in: resolvedFolders };
              } else {
                whereClause.folder = { contains: folder, mode: 'insensitive' };
              }
            } else {
              whereClause.folder = 'INBOX';
            }

            if (onlyRead) whereClause.isRead = true;

            if (olderThanDays) {
              const cutoffDate = new Date();
              cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
              whereClause.receivedAt = { lt: cutoffDate };
            }

            const count = await prisma.email.count({ where: whereClause });
            if (count === 0) {
              return { success: true, data: { count: 0 }, summary: 'No emails found to archive' };
            }

            const emailsToArchive = await prisma.email.findMany({
              where: whereClause,
              select: { id: true },
              take: 1000,
            });

            return {
              success: true,
              requiresApproval: true,
              actionType: 'BULK_ARCHIVE_EMAILS',
              severity: 'MEDIUM',
              payload: {
                emailIds: emailsToArchive.map((e) => e.id),
                count: emailsToArchive.length,
              },
              summary: `Archive ${emailsToArchive.length} email(s)`,
            };
          }

          case 'mark_read': {
            const whereClause: Prisma.EmailWhereInput = { tenantId, isRead: false };

            if (emailIds?.length) {
              whereClause.id = { in: emailIds };
            } else if (folder) {
              const resolvedFolders = await resolveFolderNames(folder);
              if (resolvedFolders.length > 0) {
                whereClause.folder = { in: resolvedFolders };
              } else {
                whereClause.folder = { contains: folder, mode: 'insensitive' };
              }
            } else {
              whereClause.folder = { not: { in: ['SPAM', 'TRASH'] } };
            }

            const count = await prisma.email.count({ where: whereClause });
            if (count === 0) {
              return { success: true, data: { count: 0 }, summary: 'No unread emails found' };
            }

            const emailsToMark = await prisma.email.findMany({
              where: whereClause,
              select: { id: true },
              take: 1000,
            });

            return {
              success: true,
              requiresApproval: true,
              actionType: 'BULK_MARK_READ',
              severity: 'LOW',
              payload: {
                emailIds: emailsToMark.map((e) => e.id),
                count: emailsToMark.length,
              },
              summary: `Mark ${emailsToMark.length} email(s) as read`,
            };
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),
  ];
}
