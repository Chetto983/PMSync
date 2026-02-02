import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { HtmlContentExtractor } from './html-content-extractor';

// ============================================================================
// INTERFACES (Internal to service - not exported)
// ============================================================================

/**
 * Input for composing email embedding content
 */
interface EmailContentInput {
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
}

/**
 * Input for composing email content with attachment metadata query
 */
interface EmailWithIdInput extends EmailContentInput {
  id: string;
}

/**
 * Input for composing contact embedding content
 */
interface ContactContentInput {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  notes?: string | null;
  tags?: string[];
  emails?: { value: string; type?: string }[] | null;
  phoneNumbers?: { value: string; type?: string }[] | null;
}

/**
 * Result from chunking content for embedding
 */
interface ChunkResult {
  content: string;
  index: number;
}

/**
 * Result from composing email content with attachment metadata
 */
interface EmailContentResult {
  /** Email body content (without attachment content) */
  content: string | null;
  /** Whether the email has attachments */
  hasAttachments: boolean;
  /** Number of attachments */
  attachmentCount: number;
  /** Attachment IDs for on-demand extraction */
  attachmentIds: string[];
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * EmbeddingComposerService - Content composition and chunking for embeddings
 *
 * Extracted from KnowledgeBaseService (Phase 7-01).
 * Responsibilities:
 * - Compose email content for embedding (priority: bodyHtml > bodyText > snippet)
 * - Compose contact content for embedding
 * - Chunk content at sentence boundaries with configurable overlap
 * - Query attachment metadata for on-demand OCR
 *
 * @see knowledge-base.service.ts lines 843-983, 1260-1319 (original implementation)
 */
@Injectable()
export class EmbeddingComposerService {
  private readonly logger = new Logger(EmbeddingComposerService.name);

  /**
   * Maximum characters per embedding chunk.
   * Configurable via AI_EMBEDDING_CHUNK_SIZE env var (default: 6000)
   *
   * Note: Mistral's mistral-embed model has an 8192 token limit.
   * Since tokens != characters (worst case ~1 token per 2-3 chars for code/special chars),
   * we use 6000 chars as a safe default to stay well under the limit.
   */
  private readonly maxCharsPerChunk: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxCharsPerChunk = this.configService.get<number>('AI_EMBEDDING_CHUNK_SIZE', 6000);
  }

  // ============================================================================
  // EMAIL CONTENT COMPOSITION
  // ============================================================================

  /**
   * Compose email content for embedding.
   * Priority: bodyHtml > bodyText > snippet
   *
   * @param email - Email content input
   * @returns Composed content string or null if empty
   */
  composeEmailEmbeddingContent(email: EmailContentInput): string | null {
    const pieces: string[] = [];

    // Subject with Italian prefix (preserved from original)
    if (email.subject) {
      pieces.push(`Oggetto: ${email.subject}`);
    }

    // Priority: bodyHtml > bodyText > snippet
    // If HTML is available, use it (it's usually more complete)
    // bodyText is often a plain-text duplicate of bodyHtml
    if (email.bodyHtml) {
      // Use Readability to extract clean content from HTML
      const extracted = HtmlContentExtractor.extractMainContent(email.bodyHtml);
      if (extracted) {
        pieces.push(extracted);
      }
    } else if (email.bodyText?.trim()) {
      pieces.push(email.bodyText.trim());
    } else if (email.snippet) {
      pieces.push(email.snippet);
    }

    const combined = pieces.join('\n\n').trim();
    return combined.length > 0 ? combined : null;
  }

  /**
   * Compose email content for embedding WITH attachment metadata (no upfront extraction)
   *
   * COST-SAVING APPROACH:
   * - Only embeds email body (subject, body, snippet)
   * - Stores attachment metadata (hasAttachments, attachmentCount, attachmentIds)
   * - Agent uses on-demand Mistral OCR when it needs attachment content
   *
   * @param email - Email with ID for attachment query
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @returns EmailContentResult with content and attachment metadata
   */
  async composeEmailEmbeddingContentWithAttachments(
    email: EmailWithIdInput,
    tenantId: string,
  ): Promise<EmailContentResult> {
    const pieces: string[] = [];

    // Subject with Italian prefix
    if (email.subject) {
      pieces.push(`Oggetto: ${email.subject}`);
    }

    // Email body (same as composeEmailEmbeddingContent)
    if (email.bodyHtml) {
      const extracted = HtmlContentExtractor.extractMainContent(email.bodyHtml);
      if (extracted) pieces.push(extracted);
    } else if (email.bodyText?.trim()) {
      pieces.push(email.bodyText.trim());
    } else if (email.snippet) {
      pieces.push(email.snippet);
    }

    // Query attachment metadata (NO content extraction - on-demand via agent tool)
    let hasAttachments = false;
    let attachmentCount = 0;
    let attachmentIds: string[] = [];

    try {
      const attachments = await this.prisma.emailAttachment.findMany({
        where: {
          emailId: email.id,
          isInline: false, // Skip inline images
          email: { tenantId },
        },
        select: {
          id: true,
        },
      });

      attachmentCount = attachments.length;
      hasAttachments = attachmentCount > 0;
      attachmentIds = attachments.map((att: { id: string }) => att.id);

      if (hasAttachments) {
        this.logger.debug(
          `Email ${email.id} has ${attachmentCount} attachments (on-demand OCR available via agent tool)`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to query attachment metadata for email ${email.id}: ${message}`,
      );
      // Continue without attachment metadata (graceful degradation)
    }

    const combined = pieces.join('\n\n').trim();
    return {
      content: combined.length > 0 ? combined : null,
      hasAttachments,
      attachmentCount,
      attachmentIds,
    };
  }

  // ============================================================================
  // CONTACT CONTENT COMPOSITION
  // ============================================================================

  /**
   * Compose content string for contact embedding.
   * Prioritizes: name, company, job, notes, tags, contact info.
   *
   * @param contact - Contact content input
   * @returns Composed content string
   */
  composeContactEmbeddingContent(contact: ContactContentInput): string {
    const parts: string[] = [];

    // Name (most important for semantic search)
    const name = contact.displayName
      || [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      || null;
    if (name) {
      parts.push(`Name: ${name}`);
    }

    // Professional context
    if (contact.company) {
      parts.push(`Company: ${contact.company}`);
    }
    if (contact.jobTitle) {
      parts.push(`Job Title: ${contact.jobTitle}`);
    }
    if (contact.department) {
      parts.push(`Department: ${contact.department}`);
    }

    // Notes (rich context for semantic search)
    if (contact.notes) {
      parts.push(`Notes: ${contact.notes}`);
    }

    // Tags (categorical context)
    if (contact.tags && contact.tags.length > 0) {
      parts.push(`Tags: ${contact.tags.join(', ')}`);
    }

    // Contact info (for exact matching)
    if (contact.emails && Array.isArray(contact.emails)) {
      const emailList = contact.emails.map((e) => e.value).filter(Boolean).join(', ');
      if (emailList) {
        parts.push(`Emails: ${emailList}`);
      }
    }

    if (contact.phoneNumbers && Array.isArray(contact.phoneNumbers)) {
      const phoneList = contact.phoneNumbers.map((p) => p.value).filter(Boolean).join(', ');
      if (phoneList) {
        parts.push(`Phones: ${phoneList}`);
      }
    }

    return parts.join('\n').trim();
  }

  // ============================================================================
  // CHUNKING
  // ============================================================================

  /**
   * Chunk content for embedding at sentence boundaries.
   * Uses configurable max chars with 50% overlap at sentence boundaries.
   *
   * @param content - Content to chunk
   * @returns Array of chunks with index
   */
  chunkContentForEmbedding(content: string): ChunkResult[] {
    const maxChars = this.maxCharsPerChunk;

    if (content.length <= maxChars) {
      return [{ content, index: 0 }];
    }

    const chunks: ChunkResult[] = [];
    let start = 0;
    let index = 0;

    while (start < content.length) {
      let end = Math.min(start + maxChars, content.length);

      // Try to break at sentence boundary (newline) if not at end
      if (end < content.length) {
        const lastBreak = content.lastIndexOf('\n', end);
        // Only use sentence break if it's in the latter half (0.5 overlap)
        if (lastBreak > start + maxChars * 0.5) {
          end = lastBreak;
        }
      }

      const chunkContent = content.slice(start, end).trim();
      if (chunkContent.length > 0) {
        chunks.push({ content: chunkContent, index });
        index += 1;
      }

      start = end;
    }

    return chunks;
  }

  // ============================================================================
  // GETTERS (for testing/inspection)
  // ============================================================================

  /**
   * Get the configured max chars per chunk
   */
  getMaxCharsPerChunk(): number {
    return this.maxCharsPerChunk;
  }
}
