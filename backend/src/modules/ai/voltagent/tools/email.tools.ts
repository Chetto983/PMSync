/**
 * Email Tools for VoltAgent
 *
 * Provides email operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 *
 * Performance optimizations (2025-12-14):
 * - Redis caching for email metadata lookups (tenant-scoped)
 * - Memory fallback when Redis unavailable
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';

/**
 * Email metadata for caching
 */
interface EmailMetadata {
  id: string;
  subject: string | null;
  from: string;
}

/**
 * Cache configuration
 */
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

  // Try Redis cache first
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

  // Query database
  const email = await prisma.email.findFirst({
    where: { id: emailId, tenantId },
    select: { id: true, subject: true, from: true },
  });

  // Cache the result
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
 * Creates all email-related tools for VoltAgent.
 *
 * @param prisma - Prisma service for database access
 * @param emailSendService - Email send service (nullable)
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 * @param cacheService - Optional cache service for Redis caching
 */
export function createEmailTools(
  prisma: PrismaService,
  emailSendService: EmailSendService | null,
  locale: SupportedLocale = 'en',
  tenantId: string,
  cacheService?: CacheService,
) {
  const t = getToolTranslations(locale);

  return [
    // ========== LIST EMAIL ACCOUNTS ==========
    createTool({
      name: 'list_email_accounts',
      description:
        'List all connected email accounts/providers. Use this BEFORE sending emails to know which account to send from.',
      parameters: z.object({}),
      execute: async () => {
        const providers = await prisma.providerConfig.findMany({
          where: { tenantId, isActive: true, supportsEmail: true },
          select: {
            id: true,
            email: true,
            providerType: true,
            displayName: true,
          },
          orderBy: { email: 'asc' },
        });

        return {
          success: true,
          data: providers.map((p: { id: string; email: string; providerType: string; displayName: string | null }) => ({
            providerId: p.id,
            email: p.email,
            provider: p.providerType,
            displayName: p.displayName,
          })),
          summary: `Found ${providers.length} connected email account(s): ${providers.map((p: { email: string }) => p.email).join(', ')}`,
        };
      },
    }),

    // ========== SEND EMAIL ==========
    createTool({
      name: 'send_email',
      description:
        'Send a new email to one or more recipients. IMPORTANT: You MUST first call list_email_accounts to get available accounts, then ask the user which account to send from.',
      parameters: z.object({
        providerId: z.string().describe('ID of the email provider/account to send from (get from list_email_accounts)'),
        to: z.array(z.string()).min(1).describe('List of recipient email addresses'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content (plain text or HTML)'),
        cc: z.array(z.string()).optional().describe('Optional CC recipients'),
        bcc: z.array(z.string()).optional().describe('Optional BCC recipients'),
      }),
      execute: async ({ providerId, to, subject, body, cc, bcc }) => {
        if (!emailSendService) {
          return { success: false, error: t.email.serviceUnavailable };
        }

        // Verify the provider belongs to this tenant
        const provider = await prisma.providerConfig.findFirst({
          where: { id: providerId, tenantId, isActive: true, supportsEmail: true },
          select: { email: true },
        });

        if (!provider) {
          return { success: false, error: 'Email account not found or not active' };
        }

        const subjectText = subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'SEND_EMAIL',
          severity: 'HIGH',
          payload: { providerId, from: provider.email, to, subject: subjectText, body, cc, bcc },
          summary: t.email.sent(to.join(', '), subjectText) + ` (from ${provider.email})`,
        };
      },
    }),

    // ========== REPLY EMAIL ==========
    createTool({
      name: 'reply_email',
      description:
        'Reply to an existing email. Use when user wants to respond to a received email.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to reply to'),
        body: z.string().describe('Reply message content'),
        replyAll: z.boolean().optional().describe('Whether to reply to all recipients'),
      }),
      execute: async ({ emailId, body, replyAll }) => {
        if (!emailSendService) {
          return { success: false, error: t.email.serviceUnavailable };
        }

        const originalEmail = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!originalEmail) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = originalEmail.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'REPLY_EMAIL',
          severity: 'HIGH',
          payload: {
            emailId,
            body,
            replyAll: replyAll ?? false,
            originalSubject: subjectText,
            originalFrom: originalEmail.from,
          },
          summary: t.email.replied(subjectText),
        };
      },
    }),

    // ========== FORWARD EMAIL ==========
    createTool({
      name: 'forward_email',
      description: 'Forward an existing email to other recipients.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to forward'),
        to: z.array(z.string()).describe('Recipients to forward to'),
        additionalMessage: z.string().optional().describe('Optional message to add before forwarded content'),
      }),
      execute: async ({ emailId, to, additionalMessage }) => {
        if (!emailSendService) {
          return { success: false, error: t.email.serviceUnavailable };
        }

        const originalEmail = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

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
      },
    }),

    // ========== SEARCH EMAILS ==========
    createTool({
      name: 'search_emails',
      description: 'Search emails by query. Returns matching emails from the inbox.',
      parameters: z.object({
        query: z.string().describe('Search query (searches subject and body)'),
        limit: z.number().optional().describe('Maximum results (default 10)'),
        folder: z.string().optional().describe('Folder to search in (inbox, sent, etc.)'),
      }),
      execute: async ({ query, limit, folder }) => {
        const emails = await prisma.email.findMany({
          where: {
            tenantId,
            ...(folder ? { folder: { contains: folder, mode: 'insensitive' as const } } : {}),
            OR: [
              { subject: { contains: query, mode: 'insensitive' as const } },
              { snippet: { contains: query, mode: 'insensitive' as const } },
              { from: { contains: query, mode: 'insensitive' as const } },
            ],
          },
          take: limit ?? 10,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            from: true,
            snippet: true,
            receivedAt: true,
            isRead: true,
            isStarred: true,
          },
        });

        // Convert Date objects to ISO strings for AI SDK JSON schema compatibility
        const serializedEmails = emails.map((e) => ({
          ...e,
          receivedAt: e.receivedAt?.toISOString() ?? null,
        }));

        return {
          success: true,
          data: serializedEmails,
          summary: t.email.searched(emails.length, query),
        };
      },
    }),

    // ========== DELETE EMAIL ==========
    createTool({
      name: 'delete_email',
      description: 'Delete an email (move to trash or permanently delete).',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to delete'),
        permanent: z.boolean().optional().describe('Permanently delete instead of moving to trash'),
      }),
      execute: async ({ emailId, permanent }) => {
        const email = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!email) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = email.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'DELETE_EMAIL',
          severity: 'HIGH',
          payload: { emailId, permanent: permanent ?? false },
          summary: t.email.deleted(subjectText),
        };
      },
    }),

    // ========== ARCHIVE EMAIL ==========
    createTool({
      name: 'archive_email',
      description: 'Archive an email (move out of inbox).',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to archive'),
      }),
      execute: async ({ emailId }) => {
        const email = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!email) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = email.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'ARCHIVE_EMAIL',
          severity: 'MEDIUM',
          payload: { emailId },
          summary: t.email.archived(subjectText),
        };
      },
    }),

    // ========== MARK READ ==========
    // Note: This action routes through action-executor which syncs to email provider via EmailSyncBackService
    createTool({
      name: 'mark_read',
      description: 'Mark an email as read.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email'),
      }),
      execute: async ({ emailId }) => {
        const email = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!email) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = email.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'MARK_READ',
          severity: 'LOW',
          payload: { emailId },
          summary: t.email.markedRead(subjectText),
        };
      },
    }),

    // ========== MARK UNREAD ==========
    // Note: This action routes through action-executor which syncs to email provider via EmailSyncBackService
    createTool({
      name: 'mark_unread',
      description: 'Mark an email as unread.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email'),
      }),
      execute: async ({ emailId }) => {
        const email = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!email) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = email.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'MARK_UNREAD',
          severity: 'LOW',
          payload: { emailId },
          summary: t.email.markedUnread(subjectText),
        };
      },
    }),

    // ========== STAR EMAIL ==========
    // Note: This action routes through action-executor which syncs to email provider via EmailSyncBackService
    createTool({
      name: 'star_email',
      description: 'Star/flag an email for importance.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to star'),
      }),
      execute: async ({ emailId }) => {
        const email = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!email) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = email.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'STAR_EMAIL',
          severity: 'LOW',
          payload: { emailId },
          summary: t.email.starred(subjectText),
        };
      },
    }),

    // ========== UNSTAR EMAIL ==========
    // Note: This action routes through action-executor which syncs to email provider via EmailSyncBackService
    createTool({
      name: 'unstar_email',
      description: 'Remove star/flag from an email.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to unstar'),
      }),
      execute: async ({ emailId }) => {
        const email = await getEmailMetadata(prisma, tenantId, emailId, cacheService);

        if (!email) {
          return { success: false, error: t.email.notFound };
        }

        const subjectText = email.subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'UNSTAR_EMAIL',
          severity: 'LOW',
          payload: { emailId },
          summary: t.email.unstarred(subjectText),
        };
      },
    }),

    // ========== GET UNREAD ==========
    createTool({
      name: 'get_unread_emails',
      description: 'Get a list of unread emails from the inbox (excludes SPAM/TRASH).',
      parameters: z.object({
        limit: z.number().optional().describe('Maximum results (default 10)'),
      }),
      execute: async ({ limit }) => {
        // Exclude SPAM and TRASH - they're junk
        const emails = await prisma.email.findMany({
          where: {
            tenantId,
            isRead: false,
            folder: EXCLUDE_JUNK_FOLDERS,
          },
          take: limit ?? 10,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            from: true,
            snippet: true,
            receivedAt: true,
          },
        });

        // Convert Date objects to ISO strings for AI SDK JSON schema compatibility
        const serializedEmails = emails.map((e) => ({
          ...e,
          receivedAt: e.receivedAt?.toISOString() ?? null,
        }));

        return {
          success: true,
          data: serializedEmails,
          summary: t.email.unreadCount(emails.length),
        };
      },
    }),

    // ========== BULK DELETE EMAILS ==========
    createTool({
      name: 'bulk_delete_emails',
      description:
        'Delete multiple emails from a folder at once. Use for: "delete all junk", "empty spam folder", "delete old emails".',
      parameters: z.object({
        folder: z.string().optional().describe('Folder to delete from: JUNK, SPAM, TRASH, INBOX, SENT, etc.'),
        emailIds: z.array(z.string()).optional().describe('Specific email IDs to delete (alternative to folder)'),
        olderThanDays: z.number().optional().describe('Only delete emails older than X days'),
        permanent: z.boolean().optional().describe('Permanently delete instead of moving to trash'),
      }),
      execute: async ({ folder, emailIds, olderThanDays, permanent }) => {
        // Build query to count emails
        const whereClause: Prisma.EmailWhereInput = { tenantId };

        if (emailIds && emailIds.length > 0) {
          whereClause.id = { in: emailIds };
        } else if (folder) {
          // Normalize folder specialUse type
          // Handle JUNK/SPAM synonyms - folder-sync stores 'JUNK', but user may say 'SPAM'
          const upperFolder = folder.toUpperCase();
          const specialUseVariants = upperFolder === 'JUNK' || upperFolder === 'SPAM'
            ? ['JUNK', 'SPAM']
            : [upperFolder];

          // Look up actual folder names by specialUse (handles localized folder names)
          const matchingFolders = await prisma.folder.findMany({
            where: { tenantId, specialUse: { in: specialUseVariants } },
            select: { name: true, path: true },
          });

          if (matchingFolders.length > 0) {
            // Match by folder name or path (providers may use either)
            const folderNames = matchingFolders.flatMap((f) => [f.name, f.path]);
            whereClause.folder = { in: folderNames };
          } else {
            // Fallback: try direct folder name match (case-insensitive)
            whereClause.folder = { contains: folder, mode: 'insensitive' };
          }
        } else {
          return { success: false, error: 'Either folder or emailIds must be provided' };
        }

        if (olderThanDays) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
          whereClause.receivedAt = { lt: cutoffDate };
        }

        // Count emails to be deleted
        const count = await prisma.email.count({ where: whereClause });

        if (count === 0) {
          return { success: true, data: { count: 0 }, summary: 'No emails found to delete' };
        }

        // Get IDs for the bulk operation
        const emailsToDelete = await prisma.email.findMany({
          where: whereClause,
          select: { id: true },
          take: 1000, // Limit to prevent memory issues
        });

        const folderName = folder ? folder.toUpperCase() : 'selected';
        return {
          success: true,
          requiresApproval: true,
          actionType: 'BULK_DELETE_EMAILS',
          severity: 'HIGH',
          payload: {
            emailIds: emailsToDelete.map((e) => e.id),
            folder: folder?.toUpperCase(),
            permanent: permanent ?? false,
            count,
          },
          summary: `Delete ${count} email${count === 1 ? '' : 's'} from ${folderName} folder`,
        };
      },
    }),

    // ========== EMPTY FOLDER ==========
    createTool({
      name: 'empty_folder',
      description:
        'Empty a folder completely (JUNK, SPAM, TRASH). Use for: "empty trash", "clear spam", "empty junk folder".',
      parameters: z.object({
        folder: z
          .enum(['JUNK', 'SPAM', 'TRASH'])
          .describe('Folder to empty: JUNK, SPAM, or TRASH'),
        permanent: z.boolean().optional().describe('Permanently delete instead of moving to trash (only for non-TRASH folders)'),
      }),
      execute: async ({ folder, permanent }) => {
        // Normalize folder specialUse type
        // Handle JUNK/SPAM synonyms - folder-sync stores 'JUNK', but user may say 'SPAM'
        const upperFolder = folder.toUpperCase();
        const specialUseVariants = upperFolder === 'JUNK' || upperFolder === 'SPAM'
          ? ['JUNK', 'SPAM']
          : [upperFolder];

        // Look up actual folder names by specialUse (handles localized folder names)
        const matchingFolders = await prisma.folder.findMany({
          where: { tenantId, specialUse: { in: specialUseVariants } },
          select: { name: true, path: true },
        });

        // Build where clause with actual folder names
        const folderWhereClause: Prisma.EmailWhereInput = { tenantId };
        if (matchingFolders.length > 0) {
          const folderNames = matchingFolders.flatMap((f) => [f.name, f.path]);
          folderWhereClause.folder = { in: folderNames };
        } else {
          // Fallback: try direct folder name match
          folderWhereClause.folder = { contains: folder, mode: 'insensitive' };
        }

        // Count emails in folder
        const count = await prisma.email.count({
          where: folderWhereClause,
        });

        if (count === 0) {
          return { success: true, data: { count: 0 }, summary: `${folder} folder is already empty` };
        }

        // Get IDs for the bulk operation
        const emailsToDelete = await prisma.email.findMany({
          where: folderWhereClause,
          select: { id: true },
          take: 5000, // Higher limit for empty operations
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
            count,
          },
          summary: `Empty ${folder} folder (${count} email${count === 1 ? '' : 's'})`,
        };
      },
    }),

    // ========== BULK ARCHIVE EMAILS ==========
    createTool({
      name: 'bulk_archive_emails',
      description:
        'Archive multiple emails at once. Use for: "archive all read emails", "archive old emails".',
      parameters: z.object({
        folder: z.string().optional().describe('Folder to archive from: INBOX, etc.'),
        emailIds: z.array(z.string()).optional().describe('Specific email IDs to archive'),
        onlyRead: z.boolean().optional().describe('Only archive read emails'),
        olderThanDays: z.number().optional().describe('Only archive emails older than X days'),
      }),
      execute: async ({ folder, emailIds, onlyRead, olderThanDays }) => {
        const whereClause: Prisma.EmailWhereInput = { tenantId };

        if (emailIds && emailIds.length > 0) {
          whereClause.id = { in: emailIds };
        } else if (folder) {
          whereClause.folder = folder.toUpperCase();
        } else {
          whereClause.folder = 'INBOX';
        }

        if (onlyRead) {
          whereClause.isRead = true;
        }

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
            count,
          },
          summary: `Archive ${count} email${count === 1 ? '' : 's'}`,
        };
      },
    }),

    // ========== BULK MARK READ ==========
    createTool({
      name: 'bulk_mark_read',
      description:
        'Mark multiple emails as read. Use for: "mark all as read", "mark inbox as read".',
      parameters: z.object({
        folder: z.string().optional().describe('Folder to mark as read: INBOX, etc.'),
        emailIds: z.array(z.string()).optional().describe('Specific email IDs to mark as read'),
      }),
      execute: async ({ folder, emailIds }) => {
        const whereClause: Prisma.EmailWhereInput = { tenantId, isRead: false };

        if (emailIds && emailIds.length > 0) {
          whereClause.id = { in: emailIds };
        } else if (folder) {
          whereClause.folder = folder.toUpperCase();
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
            count,
          },
          summary: `Mark ${count} email${count === 1 ? '' : 's'} as read`,
        };
      },
    }),
  ];
}
