/**
 * Email Tools for VoltAgent
 *
 * Provides email operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 *
 * Performance optimizations (2025-12-14):
 * - Redis caching for email metadata lookups (tenant-scoped)
 * - Memory fallback when Redis unavailable
 *
 * RAG Enhancement (2025-01):
 * - search_emails now uses UnifiedRetriever (hybrid vector+keyword with RRF fusion)
 * - Falls back to Prisma text search if RAG services unavailable
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { EmailSendService } from '../../../email/services/email-send.service';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import { UnifiedRetriever } from '../rag/unified-retriever';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';

const logger = new Logger('EmailTools');

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
 * RAG options for email search enhancement
 */
export interface EmailToolsRagOptions {
  userId?: string;
  mistralService?: MistralService;
  embeddingsService?: EmbeddingsService;
}

/**
 * Creates all email-related tools for VoltAgent.
 *
 * @param prisma - Prisma service for database access
 * @param emailSendService - Email send service (nullable)
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 * @param cacheService - Optional cache service for Redis caching
 * @param ragOptions - Optional RAG services for semantic search (hybrid vector+keyword)
 */
export function createEmailTools(
  prisma: PrismaService,
  emailSendService: EmailSendService | null,
  locale: SupportedLocale = 'en',
  tenantId: string,
  cacheService?: CacheService,
  ragOptions?: EmailToolsRagOptions,
) {
  const t = getToolTranslations(locale);

  return [
    // ========================================================================
    // CONSOLIDATED TOOL #1: list_emails
    // Combines: list_email_accounts, get_unread_emails, get_email_content
    // ========================================================================
    createTool({
      name: 'list_emails',
      description: `Get email data based on mode. CONSOLIDATED TOOL - use ONE call for multiple needs.
Supports optional triage filters: priority (1-5), sentiment, label, needsFollowUp.

Modes:
- "accounts": List connected email accounts (REQUIRED before sending)
- "unread": Get unread emails from inbox (excludes spam/trash)
- "content": Get full content of a specific email (for reading/summarizing)

Examples:
- Before sending: mode="accounts" → returns account IDs
- Check unread: mode="unread", limit=10
- Read email: mode="content", emailId="abc123"
- Urgent emails: mode="unread", priority=1
- Negative sentiment: mode="unread", sentiment="negative"
- Emails needing follow-up: mode="unread", needsFollowUp=true`,
      parameters: z.object({
        mode: z.enum(['accounts', 'unread', 'content']).describe('What to list'),
        emailId: z.string().optional().describe('Email ID (required for mode="content")'),
        limit: z.number().optional().describe('Max results for mode="unread" (default 10)'),
        // Triage filters (apply to unread/content modes)
        priority: z.number().min(1).max(5).optional().describe('Filter by AI priority (1=highest urgency, 5=lowest). Use 1-2 for urgent emails.'),
        sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional().describe('Filter by AI-detected sentiment'),
        label: z.string().optional().describe('Filter by AI-assigned label (e.g. "meeting", "invoice", "newsletter")'),
        needsFollowUp: z.boolean().optional().describe('If true, only show emails with pending/reminded follow-up records'),
      }),
      execute: async ({ mode, emailId, limit, priority, sentiment, label, needsFollowUp }) => {
        switch (mode) {
          case 'accounts': {
            const providers = await prisma.providerConfig.findMany({
              where: { tenantId, isActive: true, supportsEmail: true },
              select: { id: true, email: true, providerType: true, displayName: true },
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
          }

          case 'unread': {
            const where: any = { tenantId, isRead: false, folder: EXCLUDE_JUNK_FOLDERS };
            // Apply triage filters
            if (priority) where.aiPriority = priority;
            if (sentiment) where.aiSentiment = sentiment;
            if (label) where.aiLabels = { has: label };
            if (needsFollowUp) {
              where.followUp = { status: { in: ['PENDING', 'REMINDED'] } };
            }
            const emails = await prisma.email.findMany({
              where,
              take: limit ?? 10,
              orderBy: { receivedAt: 'desc' },
              select: {
                id: true, subject: true, from: true, snippet: true, receivedAt: true,
                // AI triage fields
                aiPriority: true, aiSentiment: true, aiLabels: true,
              },
            });
            const serializedEmails = emails.map((e) => ({
              ...e,
              receivedAt: e.receivedAt?.toISOString() ?? null,
            }));
            return {
              success: true,
              data: serializedEmails,
              summary: t.email.unreadCount(emails.length),
            };
          }

          case 'content': {
            if (!emailId) {
              return { success: false, error: 'emailId is required for mode="content"' };
            }
            const contentWhere: any = { id: emailId, tenantId };
            // Apply triage filters
            if (priority) contentWhere.aiPriority = priority;
            if (sentiment) contentWhere.aiSentiment = sentiment;
            if (label) contentWhere.aiLabels = { has: label };
            if (needsFollowUp) {
              contentWhere.followUp = { status: { in: ['PENDING', 'REMINDED'] } };
            }
            const email = await prisma.email.findFirst({
              where: contentWhere,
              select: {
                id: true, subject: true, from: true, to: true, cc: true,
                bodyText: true, snippet: true, // NO bodyHtml - 80% token savings!
                receivedAt: true, isRead: true, isStarred: true, folder: true,
                // AI triage fields
                aiPriority: true, aiSentiment: true, aiLabels: true,
              },
            });
            if (!email) {
              return { success: false, error: t.email.notFound };
            }
            const attachments = await prisma.emailAttachment.findMany({
              where: { emailId, tenantId },
              select: { filename: true, size: true },
            });
            // CRITICAL: Use bodyText or snippet ONLY - NEVER bodyHtml (10x smaller)
            const rawBody = email.bodyText || email.snippet || '';
            const body = rawBody.slice(0, 1500); // Limit to 1500 chars (~375 tokens)
            return {
              success: true,
              data: {
                id: email.id, subject: email.subject, from: email.from,
                to: email.to, cc: email.cc, body,
                receivedAt: email.receivedAt?.toISOString() ?? null,
                isRead: email.isRead, isStarred: email.isStarred,
                folder: email.folder ?? 'INBOX',
                hasAttachments: attachments.length > 0,
                attachments: attachments.map((a) => a.filename),
              },
              summary: `Email from ${email.from}: "${email.subject}"`,
            };
          }

          default:
            return { success: false, error: `Unknown mode: ${mode}` };
        }
      },
    }),

    // ========================================================================
    // CONSOLIDATED TOOL #2: manage_email
    // Combines: send_email, reply_email, forward_email, delete_email,
    //           archive_email, mark_read, mark_unread, star_email, unstar_email
    // All actions require HITL approval
    // ========================================================================
    createTool({
      name: 'manage_email',
      description: `Perform email actions. CONSOLIDATED TOOL - handles send, reply, forward, and status changes.

Actions:
- "send": Send new email (requires providerId, to, subject, body)
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
        // Send params
        providerId: z.string().optional().describe('Provider ID for "send" (from list_emails mode=accounts)'),
        to: z.array(z.string()).optional().describe('Recipients for "send" or "forward"'),
        subject: z.string().optional().describe('Subject for "send"'),
        body: z.string().optional().describe('Body for "send" or "reply"'),
        cc: z.array(z.string()).optional().describe('CC recipients for "send"'),
        bcc: z.array(z.string()).optional().describe('BCC recipients for "send"'),
        // Reply params
        replyAll: z.boolean().optional().describe('Reply to all for "reply"'),
        // Forward params
        additionalMessage: z.string().optional().describe('Message to add for "forward"'),
        // Delete params
        permanent: z.boolean().optional().describe('Permanent delete for "delete"'),
      }),
      execute: async (params) => {
        const { action, emailId } = params;

        // Actions that require emailId
        if (action !== 'send' && !emailId) {
          return { success: false, error: `emailId is required for action "${action}"` };
        }

        switch (action) {
          case 'send': {
            if (!emailSendService) {
              return { success: false, error: t.email.serviceUnavailable };
            }
            const { providerId, to, subject, body, cc, bcc } = params;
            if (!providerId || !to?.length || !body) {
              return { success: false, error: 'send requires providerId, to, and body' };
            }
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
            const subjectText = email.subject || t.email.noSubject;
            return {
              success: true,
              requiresApproval: true,
              actionType: 'DELETE_EMAIL',
              severity: 'HIGH',
              payload: { emailId, permanent: params.permanent ?? false },
              summary: t.email.deleted(subjectText),
            };
          }

          case 'archive': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
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
          }

          case 'mark_read': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
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
          }

          case 'mark_unread': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
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
          }

          case 'star': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
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
          }

          case 'unstar': {
            const email = await getEmailMetadata(prisma, tenantId, emailId!, cacheService);
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
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),

    // ========== SEARCH EMAILS ==========
    createTool({
      name: 'search_emails',
      description: `Search emails by query. Returns matching emails.

For EXACT matches (sender, subject keywords): Uses text search.
For MEANING-based queries (concepts, topics): Uses semantic RAG when available.

Examples:
- "from:john subject:invoice" → exact text search
- "emails about payment problems" → semantic search (finds invoices, billing issues)
- "meeting agenda" → searches subject/body for keywords`,
      parameters: z.object({
        query: z.string().describe('Search query (searches subject, body, sender semantically when RAG available)'),
        limit: z.number().optional().describe('Maximum results (default 10)'),
        folder: z.string().optional().describe('Folder to search in (inbox, sent, etc.)'),
      }),
      execute: async ({ query, limit, folder }) => {
        const maxResults = limit ?? 10;

        // Try RAG search first if services are available
        if (ragOptions?.userId && ragOptions.mistralService && ragOptions.embeddingsService) {
          try {
            logger.debug(`[${tenantId}] RAG search: "${query.substring(0, 50)}..."`);

            const retriever = new UnifiedRetriever({
              tenantId,
              userId: ragOptions.userId,
              locale,
              prisma,
              mistralService: ragOptions.mistralService,
              embeddingsService: ragOptions.embeddingsService,
              emailLimit: maxResults * 2, // Fetch more for fusion, then limit
            });

            // Search emails with hybrid RAG (vector + keyword + RRF fusion)
            const results = await retriever.searchSources(query, ['emails']);
            const emailResults = results.find((r) => r.source === 'emails');

            if (emailResults && emailResults.items.length > 0) {
              // Fetch full email details for the top results
              const emailIds = emailResults.items.slice(0, maxResults).map((item) => item.id);
              const emails = await prisma.email.findMany({
                where: {
                  id: { in: emailIds },
                  tenantId,
                  ...(folder ? { folder: { contains: folder, mode: 'insensitive' as const } } : {}),
                },
                select: {
                  id: true,
                  subject: true,
                  from: true,
                  snippet: true,
                  receivedAt: true,
                  isRead: true,
                  isStarred: true,
                  // AI triage fields
                  aiPriority: true,
                  aiSentiment: true,
                  aiLabels: true,
                },
              });

              // Preserve RAG ranking order
              const emailMap = new Map(emails.map((e) => [e.id, e]));
              const orderedEmails = emailIds
                .map((id) => emailMap.get(id))
                .filter((e): e is NonNullable<typeof e> => e !== undefined);

              // Convert Date objects to ISO strings for AI SDK JSON schema compatibility
              const serializedEmails = orderedEmails.map((e) => ({
                ...e,
                receivedAt: e.receivedAt?.toISOString() ?? null,
              }));

              logger.debug(`[${tenantId}] RAG search found ${serializedEmails.length} emails`);

              return {
                success: true,
                data: serializedEmails,
                summary: t.email.searched(serializedEmails.length, query) + ' (semantic)',
                searchType: 'rag',
              };
            }
          } catch (error) {
            logger.warn(`RAG search failed, falling back to text search: ${error instanceof Error ? error.message : String(error)}`);
            // Fall through to text search
          }
        }

        // Fallback: Prisma text search
        logger.debug(`[${tenantId}] Text search: "${query.substring(0, 50)}..."`);

        // Split multi-word queries and require all words to match (in any field)
        // This handles queries like "ordine consegna" matching emails where
        // "ordine" is in subject and "consegna" is in body
        const queryWords = query.trim().split(/\s+/).filter(w => w.length > 2);

        // Build AND condition: each word must match at least one field
        const wordConditions = queryWords.length > 1
          ? queryWords.map(word => ({
              OR: [
                { subject: { contains: word, mode: 'insensitive' as const } },
                { snippet: { contains: word, mode: 'insensitive' as const } },
                { from: { contains: word, mode: 'insensitive' as const } },
              ],
            }))
          : []; // Single word uses original OR logic

        const emails = await prisma.email.findMany({
          where: {
            tenantId,
            ...(folder ? { folder: { contains: folder, mode: 'insensitive' as const } } : {}),
            // For multi-word: AND all words must match somewhere
            // For single word: OR across fields
            ...(queryWords.length > 1
              ? { AND: wordConditions }
              : {
                  OR: [
                    { subject: { contains: query, mode: 'insensitive' as const } },
                    { snippet: { contains: query, mode: 'insensitive' as const } },
                    { from: { contains: query, mode: 'insensitive' as const } },
                  ],
                }),
          },
          take: maxResults,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            from: true,
            snippet: true,
            receivedAt: true,
            isRead: true,
            isStarred: true,
            // AI triage fields
            aiPriority: true,
            aiSentiment: true,
            aiLabels: true,
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
          searchType: 'text',
        };
      },
    }),

    // ========== COUNT EMAILS ==========
    createTool({
      name: 'count_emails',
      description:
        'Count emails by time period. Use for: "how many emails this week?", "emails today", "count yesterday\'s emails", "emails in last 7 days".',
      parameters: z.object({
        period: z
          .string()
          .optional()
          .describe('Time period: "today", "yesterday", "this week", "this month", "last 7 days", "last 30 days", etc.'),
        folder: z.string().optional().describe('Folder to count (inbox, sent, etc.)'),
        unreadOnly: z.boolean().optional().describe('Count only unread emails'),
      }),
      execute: async ({ period, folder, unreadOnly }) => {
        const whereClause: Prisma.EmailWhereInput = {
          tenantId,
          folder: EXCLUDE_JUNK_FOLDERS,
        };

        // Apply folder filter
        if (folder) {
          whereClause.folder = { contains: folder, mode: 'insensitive' };
        }

        // Apply unread filter
        if (unreadOnly) {
          whereClause.isRead = false;
        }

        // Flexible time period parsing
        const now = new Date();
        let startDate: Date | undefined;
        let endDate: Date | undefined;
        let periodLabel = 'total';

        if (period) {
          const p = period.toLowerCase().trim();

          if (p.includes('today') || p === 'now') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            periodLabel = 'today';
          } else if (p.includes('yesterday')) {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            periodLabel = 'yesterday';
          } else if (p.includes('week')) {
            const dayOfWeek = now.getDay();
            startDate = new Date(now);
            startDate.setDate(now.getDate() - dayOfWeek);
            startDate.setHours(0, 0, 0, 0);
            periodLabel = 'this week';
          } else if (p.includes('month')) {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            periodLabel = 'this month';
          } else if (p.includes('year')) {
            startDate = new Date(now.getFullYear(), 0, 1);
            periodLabel = 'this year';
          } else {
            // Try to parse "last N days" pattern
            const daysMatch = p.match(/(?:last\s+)?(\d+)\s*days?/i);
            if (daysMatch) {
              const days = parseInt(daysMatch[1], 10);
              startDate = new Date(now);
              startDate.setDate(now.getDate() - days);
              startDate.setHours(0, 0, 0, 0);
              periodLabel = `last ${days} days`;
            }
          }
        }

        // Apply time filter if parsed
        if (startDate) {
          whereClause.receivedAt = endDate ? { gte: startDate, lt: endDate } : { gte: startDate };
        }

        const count = await prisma.email.count({ where: whereClause });

        // Get additional stats for richer response
        const unreadCount = await prisma.email.count({
          where: { ...whereClause, isRead: false },
        });

        return {
          success: true,
          data: {
            total: count,
            unread: unreadCount,
            read: count - unreadCount,
            period: periodLabel,
            folder: folder || 'all (excluding junk)',
          },
          summary: `You have ${count} email${count === 1 ? '' : 's'} ${periodLabel}${unreadOnly ? ' (unread)' : ''} (${unreadCount} unread).`,
        };
      },
    }),

    // ========================================================================
    // CONSOLIDATED TOOL #5: bulk_email_actions
    // Combines: bulk_delete_emails, empty_folder, bulk_archive_emails, bulk_mark_read
    // All bulk actions require HITL approval
    // ========================================================================
    createTool({
      name: 'bulk_email_actions',
      description: `Perform bulk email operations. CONSOLIDATED TOOL - handles mass delete, archive, and mark-read.

Actions:
- "delete": Delete multiple emails (requires folder OR emailIds)
- "empty_folder": Empty JUNK/SPAM/TRASH completely (requires folder)
- "archive": Archive multiple emails (folder defaults to INBOX)
- "mark_read": Mark multiple emails as read

Filters (optional):
- emailIds: Specific emails to target
- folder: Folder to operate on
- olderThanDays: Only emails older than X days
- onlyRead: Only read emails (for archive)
- permanent: Permanently delete (for delete/empty_folder)

All actions require user approval (HITL).`,
      parameters: z.object({
        action: z.enum(['delete', 'empty_folder', 'archive', 'mark_read'])
          .describe('Bulk action to perform'),
        folder: z.string().optional().describe('Folder name (JUNK, SPAM, TRASH, INBOX, etc.)'),
        emailIds: z.array(z.string()).optional().describe('Specific email IDs to target'),
        olderThanDays: z.number().optional().describe('Only emails older than X days'),
        onlyRead: z.boolean().optional().describe('Only read emails (for archive)'),
        permanent: z.boolean().optional().describe('Permanently delete'),
      }),
      execute: async (params) => {
        const { action, folder, emailIds, olderThanDays, onlyRead, permanent } = params;

        // Helper to resolve folder names from specialUse (handles JUNK/SPAM synonyms)
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
          return []; // Will fallback to direct name match
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
            const selectedCount = emailsToDelete.length;
            if (selectedCount === 0) {
              return { success: true, data: { count: 0 }, summary: 'No emails found to delete' };
            }

            const truncationNote = count > selectedCount
              ? ` (showing first ${selectedCount} of ${count}; refine filters to delete more)`
              : '';

            return {
              success: true,
              requiresApproval: true,
              actionType: 'BULK_DELETE_EMAILS',
              severity: 'HIGH',
              payload: {
                emailIds: emailsToDelete.map((e) => e.id),
                folder: folder?.toUpperCase(),
                permanent: permanent ?? false,
                count: selectedCount,
              },
              summary: `Delete ${selectedCount} email${selectedCount === 1 ? '' : 's'}${truncationNote}`,
            };
          }

          case 'empty_folder': {
            if (!folder) {
              return { success: false, error: 'empty_folder requires folder (JUNK, SPAM, or TRASH)' };
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
            const selectedCount = emailsToDelete.length;
            if (selectedCount === 0) {
              return { success: true, data: { count: 0 }, summary: `${upperFolder} folder is already empty` };
            }

            const truncationNote = count > selectedCount
              ? ` (showing first ${selectedCount} of ${count}; refine filters to delete more)`
              : '';

            return {
              success: true,
              requiresApproval: true,
              actionType: 'EMPTY_FOLDER',
              severity: 'HIGH',
              payload: {
                folder: upperFolder,
                emailIds: emailsToDelete.map((e) => e.id),
                permanent: permanent ?? (upperFolder === 'TRASH'),
                count: selectedCount,
              },
              summary: `Empty ${upperFolder} folder (${selectedCount} email${selectedCount === 1 ? '' : 's'})${truncationNote}`,
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
            const selectedCount = emailsToArchive.length;
            if (selectedCount === 0) {
              return { success: true, data: { count: 0 }, summary: 'No emails found to archive' };
            }

            const truncationNote = count > selectedCount
              ? ` (showing first ${selectedCount} of ${count}; refine filters to archive more)`
              : '';

            return {
              success: true,
              requiresApproval: true,
              actionType: 'BULK_ARCHIVE_EMAILS',
              severity: 'MEDIUM',
              payload: {
                emailIds: emailsToArchive.map((e) => e.id),
                count: selectedCount,
              },
              summary: `Archive ${selectedCount} email${selectedCount === 1 ? '' : 's'}${truncationNote}`,
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
            const selectedCount = emailsToMark.length;
            if (selectedCount === 0) {
              return { success: true, data: { count: 0 }, summary: 'No unread emails found' };
            }

            const truncationNote = count > selectedCount
              ? ` (showing first ${selectedCount} of ${count}; refine filters to mark more)`
              : '';

            return {
              success: true,
              requiresApproval: true,
              actionType: 'BULK_MARK_READ',
              severity: 'LOW',
              payload: {
                emailIds: emailsToMark.map((e) => e.id),
                count: selectedCount,
              },
              summary: `Mark ${selectedCount} email${selectedCount === 1 ? '' : 's'} as read${truncationNote}`,
            };
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),
  ];
}
