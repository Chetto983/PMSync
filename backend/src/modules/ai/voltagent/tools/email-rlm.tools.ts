/**
 * RLM-Style Email Tools for VoltAgent
 *
 * Implements Recursive Language Model pattern for lazy loading context:
 * 1. list_email_index - lightweight metadata only (~100 chars per email)
 * 2. get_email_content - load full content on demand (max 5 emails)
 *
 * This pattern reduces token usage by 60-70% compared to loading all content upfront.
 * LLM sees the index first, decides which emails are relevant, then loads only those.
 *
 * @see https://github.com/alexzhang13/rlm-minimal
 * Created: 2026-01-28 (Performance optimization)
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';
import type { MistralService } from '../../services/mistral.service';
import type { EmbeddingsService } from '../../services/embeddings.service';
import { UnifiedRetriever } from '../rag/unified-retriever';

const logger = new Logger('EmailRLMTools');

/**
 * RAG options for semantic search
 */
export interface EmailRLMRagOptions {
  userId: string;
  mistralService: MistralService;
  embeddingsService: EmbeddingsService;
}

/**
 * Creates RLM-style email tools for efficient context loading.
 *
 * @param prisma - Prisma service for database access
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 * @param ragOptions - Optional RAG services for semantic search
 */
export function createEmailRLMTools(
  prisma: PrismaService,
  locale: SupportedLocale = 'en',
  tenantId: string,
  ragOptions?: EmailRLMRagOptions,
) {
  const t = getToolTranslations(locale);

  return [
    // ========================================================================
    // RLM TOOL #1: list_email_index (LIGHTWEIGHT)
    // Returns minimal metadata for quick overview - LLM decides what to load
    // ========================================================================
    createTool({
      name: 'list_email_index',
      description: `Get lightweight email index (metadata only, ~100 chars per email).

USE THIS FIRST to see what emails exist, then use get_email_content to load specific ones.

This is the EFFICIENT pattern:
1. Call list_email_index to see subjects and senders
2. Identify which emails are relevant to the user's request
3. Call get_email_content with ONLY the IDs you need (max 5)

Modes:
- "unread": Unread emails in inbox (excludes spam/trash)
- "recent": Recent emails (read or unread)
- "starred": Starred/flagged emails
- "search": Search by query (keyword in subject/from)

Returns: id, from, subject (truncated), date, preview (50 chars)
Does NOT return: full body content (use get_email_content for that)`,
      parameters: z.object({
        mode: z.enum(['unread', 'recent', 'starred', 'search']).describe('What to list'),
        limit: z.number().optional().default(15).describe('Max results (default 15)'),
        query: z.string().optional().describe('Search query for mode="search"'),
      }),
      execute: async ({ mode, limit = 15, query }) => {
        const startTime = Date.now();

        // Build where clause based on mode
         
        let where: any = { tenantId };

        switch (mode) {
          case 'unread':
            where = { ...where, isRead: false, folder: EXCLUDE_JUNK_FOLDERS };
            break;
          case 'recent':
            where = { ...where, folder: EXCLUDE_JUNK_FOLDERS };
            break;
          case 'starred':
            where = { ...where, isStarred: true };
            break;
          case 'search': {
            if (!query) {
              return { success: false, error: 'query is required for mode="search"' };
            }

            // Try RAG semantic search first if available
            if (ragOptions?.userId && ragOptions.mistralService && ragOptions.embeddingsService) {
              try {
                logger.log(`[list_email_index] RAG search: "${query.substring(0, 40)}..."`);

                const retriever = new UnifiedRetriever({
                  tenantId,
                  userId: ragOptions.userId,
                  locale,
                  prisma,
                  mistralService: ragOptions.mistralService,
                  embeddingsService: ragOptions.embeddingsService,
                  emailLimit: Math.min(limit, 20) * 2, // Fetch extra for fusion
                });

                const results = await retriever.searchSources(query, ['emails']);
                const emailResults = results.find((r) => r.source === 'emails');

                if (emailResults && emailResults.items.length > 0) {
                  const emailIds = emailResults.items.slice(0, Math.min(limit, 20)).map((item) => item.id);
                  const emails = await prisma.email.findMany({
                    where: { id: { in: emailIds }, tenantId },
                    select: {
                      id: true,
                      from: true,
                      subject: true,
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

                  const duration = Date.now() - startTime;
                  logger.log(`[list_email_index] RAG found=${orderedEmails.length} duration=${duration}ms`);

                  const index = orderedEmails.map((e, i) => ({
                    idx: i + 1,
                    id: e.id,
                    from: e.from.length > 40 ? e.from.slice(0, 37) + '...' : e.from,
                    subject: e.subject?.slice(0, 60) || '(no subject)',
                    date: e.receivedAt?.toISOString().split('T')[0] || 'unknown',
                    preview: e.snippet?.slice(0, 50) || '',
                    unread: !e.isRead,
                    starred: e.isStarred,
                  }));

                  return {
                    success: true,
                    count: index.length,
                    index,
                    searchType: 'semantic',
                    hint: t.email.rlmHint || 'Use get_email_content(ids) to load full content for specific emails.',
                  };
                }
              } catch (error) {
                logger.warn(`RAG search failed, falling back to text: ${error instanceof Error ? error.message : String(error)}`);
              }
            }

            // Fallback: text search
            where = {
              ...where,
              folder: EXCLUDE_JUNK_FOLDERS,
              OR: [
                { subject: { contains: query, mode: 'insensitive' } },
                { from: { contains: query, mode: 'insensitive' } },
              ],
            };
            break;
          }
        }

        // Fetch ONLY minimal metadata - NO body content!
        const emails = await prisma.email.findMany({
          where,
          take: Math.min(limit, 20), // Cap at 20 for performance
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            from: true,
            subject: true,
            snippet: true, // Already short (Gmail gives ~100 chars)
            receivedAt: true,
            isRead: true,
            isStarred: true,
            // AI triage fields
            aiPriority: true,
            aiSentiment: true,
            aiLabels: true,
          },
        });

        const duration = Date.now() - startTime;
        logger.log(`[list_email_index] mode=${mode} found=${emails.length} duration=${duration}ms`);

        // Format for minimal token usage
        const index = emails.map((e, i) => ({
          idx: i + 1, // 1-indexed for easier reference
          id: e.id,
          from: e.from.length > 40 ? e.from.slice(0, 37) + '...' : e.from,
          subject: e.subject?.slice(0, 60) || '(no subject)',
          date: e.receivedAt?.toISOString().split('T')[0] || 'unknown',
          preview: e.snippet?.slice(0, 50) || '',
          unread: !e.isRead,
          starred: e.isStarred,
        }));

        return {
          success: true,
          count: emails.length,
          index,
          hint: t.email.rlmHint || 'Use get_email_content(ids) to load full content for specific emails.',
        };
      },
    }),

    // ========================================================================
    // RLM TOOL #2: get_email_content (ON-DEMAND)
    // Loads full content for specific emails - call AFTER list_email_index
    // ========================================================================
    createTool({
      name: 'get_email_content',
      description: `Load full content for specific emails (max 5 at a time).

IMPORTANT: Call list_email_index FIRST to see what emails exist, then use this to load ONLY the ones you need.

Parameters:
- emailIds: Array of email IDs from list_email_index (max 5)

Returns: Full body content (up to 1500 chars per email), attachments info`,
      parameters: z.object({
        emailIds: z.array(z.string()).max(5).describe('Email IDs from list_email_index (max 5)'),
      }),
      execute: async ({ emailIds }) => {
        const startTime = Date.now();

        if (emailIds.length === 0) {
          return { success: false, error: 'No email IDs provided' };
        }

        if (emailIds.length > 5) {
          return { success: false, error: 'Maximum 5 emails at a time. Use list_email_index to identify the most relevant ones.' };
        }

        // Load full content for selected emails
        const emails = await prisma.email.findMany({
          where: { id: { in: emailIds }, tenantId },
          select: {
            id: true,
            from: true,
            to: true,
            cc: true,
            subject: true,
            bodyText: true, // Full body
            snippet: true,
            receivedAt: true,
            isRead: true,
            isStarred: true,
            folder: true,
            // AI triage fields
            aiPriority: true,
            aiSentiment: true,
            aiLabels: true,
            // Follow-up data (1:1 relation, max 5 emails loaded here)
            followUp: {
              select: {
                id: true,
                status: true,
                reason: true,
                dueDate: true,
                emailType: true,
                confidence: true,
              },
            },
          },
        });

        // Get attachments for these emails
        const attachments = await prisma.emailAttachment.findMany({
          where: { emailId: { in: emailIds }, tenantId },
          select: { emailId: true, filename: true, size: true },
        });

        const attachmentsByEmail = new Map<string, Array<{ filename: string; size: number }>>();
        for (const att of attachments) {
          if (!attachmentsByEmail.has(att.emailId)) {
            attachmentsByEmail.set(att.emailId, []);
          }
          attachmentsByEmail.get(att.emailId)!.push({ filename: att.filename, size: att.size });
        }

        const duration = Date.now() - startTime;
        logger.log(`[get_email_content] requested=${emailIds.length} found=${emails.length} duration=${duration}ms`);

        // Format with full content (capped at 1500 chars per email)
        const emailsData = emails.map((e) => {
          const content = (e.bodyText || e.snippet || '').slice(0, 1500);
          const atts = attachmentsByEmail.get(e.id) || [];
          return {
            id: e.id,
            from: e.from,
            to: e.to,
            cc: e.cc,
            subject: e.subject,
            content,
            date: e.receivedAt?.toISOString() ?? null,
            isRead: e.isRead,
            isStarred: e.isStarred,
            folder: e.folder ?? 'INBOX',
            hasAttachments: atts.length > 0,
            attachments: atts.map(a => a.filename),
          };
        });

        return {
          success: true,
          count: emails.length,
          emails: emailsData,
        };
      },
    }),
  ];
}
