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
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

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
    // ========== SEND EMAIL ==========
    createTool({
      name: 'send_email',
      description:
        'Send a new email to one or more recipients. Use this when the user explicitly wants to send a new email (not reply or forward).',
      parameters: z.object({
        to: z.array(z.string()).min(1).describe('List of recipient email addresses'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content (plain text or HTML)'),
        cc: z.array(z.string()).optional().describe('Optional CC recipients'),
        bcc: z.array(z.string()).optional().describe('Optional BCC recipients'),
      }),
      execute: async ({ to, subject, body, cc, bcc }) => {
        if (!emailSendService) {
          return { success: false, error: t.email.serviceUnavailable };
        }

        const subjectText = subject || t.email.noSubject;
        return {
          success: true,
          requiresApproval: true,
          actionType: 'SEND_EMAIL',
          severity: 'HIGH',
          payload: { to, subject: subjectText, body, cc, bcc },
          summary: t.email.sent(to.join(', '), subjectText),
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

        return {
          success: true,
          data: emails,
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
      description: 'Get a list of unread emails from the inbox.',
      parameters: z.object({
        limit: z.number().optional().describe('Maximum results (default 10)'),
      }),
      execute: async ({ limit }) => {
        const emails = await prisma.email.findMany({
          where: {
            tenantId,
            isRead: false,
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

        return {
          success: true,
          data: emails,
          summary: t.email.unreadCount(emails.length),
        };
      },
    }),
  ];
}
