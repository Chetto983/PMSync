/**
 * VoltAgent Attachment Tools
 *
 * On-demand attachment content extraction using Mistral OCR.
 * This approach saves costs by only extracting when the agent needs it.
 *
 * Cost savings:
 * - Old approach: Extract ALL attachments upfront during email sync
 * - New approach: Extract ON-DEMAND when agent needs attachment content
 * - Pricing: $1/1000 pages (Mistral OCR)
 *
 * Tools:
 * - get_attachment_content: Extract text from email attachment using OCR
 * - list_email_attachments: List attachments for an email (without extraction)
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralOcrService } from '../../services/mistral-ocr.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Options for creating attachment tools
 */
export interface AttachmentToolsOptions {
  prisma: PrismaService;
  mistralOcrService: MistralOcrService;
  tenantId: string;
  locale?: SupportedLocale;
}

/**
 * Create the list_email_attachments tool
 *
 * Lists all attachments for an email without extracting content.
 * Agent can use this to see what attachments exist before deciding to extract.
 */
export function createListAttachmentsTool(options: AttachmentToolsOptions) {
  const { prisma, tenantId, locale } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'list_email_attachments',
    description: t.attachments?.list?.description ||
      'List all attachments for an email. Use this to see what files are attached before extracting content.',
    parameters: z.object({
      emailId: z.string().describe('The email ID to list attachments for'),
    }),
    execute: async ({ emailId }) => {
      // Verify email belongs to tenant
      const email = await prisma.email.findFirst({
        where: { id: emailId, tenantId },
        select: { id: true, subject: true },
      });

      if (!email) {
        return {
          success: false,
          error: 'Email not found or access denied',
          attachments: [],
        };
      }

      // Fetch attachments
      const attachments = await prisma.emailAttachment.findMany({
        where: { emailId, isInline: false },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
        },
        orderBy: { filename: 'asc' },
      });

      return {
        success: true,
        emailId,
        emailSubject: email.subject,
        attachmentCount: attachments.length,
        attachments: attachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          sizeKb: att.size ? Math.round(att.size / 1024) : null,
          canExtract: isSupportedForOcr(att.mimeType),
        })),
      };
    },
  });
}

/**
 * Create the get_attachment_content tool
 *
 * Extracts text from email attachments using Mistral OCR.
 * This is an ON-DEMAND extraction - only called when agent needs the content.
 */
export function createGetAttachmentContentTool(options: AttachmentToolsOptions) {
  const { prisma, mistralOcrService, tenantId, locale } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'get_attachment_content',
    description: t.attachments?.getContent?.description ||
      'Extract text content from an email attachment using OCR. Supports PDFs, images, and Office documents. Use when you need to read the actual content of an attachment.',
    parameters: z.object({
      emailId: z.string().describe('The email ID'),
      attachmentId: z.string().optional().describe(
        'Specific attachment ID to extract. If not provided, extracts from all supported attachments.',
      ),
      maxAttachments: z.number().optional().default(3).describe(
        'Maximum number of attachments to extract (default: 3). Helps control costs.',
      ),
    }),
    execute: async ({ emailId, attachmentId, maxAttachments = 3 }) => {
      // Check if OCR is available
      if (!mistralOcrService.isAvailable()) {
        return {
          success: false,
          error: 'OCR service not available. MISTRAL_API_KEY may not be configured.',
          content: null,
        };
      }

      // Verify email belongs to tenant
      const email = await prisma.email.findFirst({
        where: { id: emailId, tenantId },
        select: { id: true, subject: true },
      });

      if (!email) {
        return {
          success: false,
          error: 'Email not found or access denied',
          content: null,
        };
      }

      // Fetch attachment(s)
      const whereClause = attachmentId
        ? { id: attachmentId, emailId, isInline: false }
        : { emailId, isInline: false };

      const attachments = await prisma.emailAttachment.findMany({
        where: whereClause,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          storagePath: true,
        },
        take: maxAttachments,
      });

      if (attachments.length === 0) {
        return {
          success: false,
          error: attachmentId ? 'Attachment not found' : 'No attachments found for this email',
          content: null,
        };
      }

      // Filter to supported types and those with storage path
      const extractable = attachments.filter(
        (att) => att.storagePath && isSupportedForOcr(att.mimeType),
      );

      if (extractable.length === 0) {
        return {
          success: false,
          error: 'No extractable attachments found. Supported types: PDF, images, Office documents.',
          attachments: attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            supported: isSupportedForOcr(a.mimeType),
          })),
          content: null,
        };
      }

      // Extract content using Mistral OCR
      const results = await mistralOcrService.extractFromAttachments(
        extractable.map((att) => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          storagePath: att.storagePath!,
        })),
      );

      if (results.length === 0) {
        return {
          success: false,
          error: 'Failed to extract content from attachments',
          content: null,
        };
      }

      // Format results
      const extractedContent = results
        .map((r) => `## ${r.filename}\n\n${r.text}`)
        .join('\n\n---\n\n');

      return {
        success: true,
        emailId,
        emailSubject: email.subject,
        extractedCount: results.length,
        totalAttachments: attachments.length,
        attachments: results.map((r) => ({
          id: r.attachmentId,
          filename: r.filename,
          charCount: r.text.length,
        })),
        content: extractedContent,
      };
    },
  });
}

/**
 * Check if MIME type is supported for OCR extraction
 */
function isSupportedForOcr(mimeType: string): boolean {
  const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();

  const supported = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
  ];

  return supported.includes(normalizedMimeType);
}

/**
 * Create all attachment tools
 */
export function createAttachmentTools(options: AttachmentToolsOptions) {
  return [
    createListAttachmentsTool(options),
    createGetAttachmentContentTool(options),
  ];
}
