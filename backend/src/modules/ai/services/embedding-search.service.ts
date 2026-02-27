import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { EmbeddingsService } from './embeddings.service';
import { HtmlContentExtractor } from './html-content-extractor';

/**
 * Options for knowledge base search
 */
export interface SearchOptions {
  tenantId: string;
  query?: string;
  emailId?: string;
  limit?: number;
}

/**
 * Result from knowledge base search
 */
export interface SearchResult {
  usedQuery: string;
  items: KnowledgeBaseSearchHit[];
}

/**
 * A single hit from knowledge base search
 * GDPR-compliant: snippet is fetched from Email table, not embedding metadata
 */
export interface KnowledgeBaseSearchHit {
  id: string;
  subject: string | null;
  /** Snippet from Email table (GDPR compliance - not from embedding metadata) */
  snippet: string | null;
  source: string | null;
  emailId: string | null;
  from: string | null;
  receivedAt: string | null;
  distance: number | null;
  score: number | null;
  metadata: Record<string, any> | null;
}

/**
 * Email hydration data for search result enrichment
 */
interface EmailHydrationData {
  subject: string | null;
  from: string | null;
  receivedAt: string | null;
  snippet: string | null;
}

/**
 * EmbeddingSearchService - Vector search and GDPR-compliant result hydration
 *
 * Extracted from KnowledgeBaseService to separate search/hydration concerns.
 *
 * GDPR COMPLIANCE:
 * - Hydrates snippet from Email table, NOT from embedding metadata
 * - Embedding metadata may contain outdated content; always fetch fresh
 *
 * SEARCH LIMITS:
 * - Maximum 10 results per search (hard cap)
 * - Default 5 results if not specified
 *
 * SCORE CALCULATION:
 * - score = 1 - distance (where distance is 0-1 normalized)
 * - Higher score = more similar content
 */
@Injectable()
export class EmbeddingSearchService {
  private readonly logger = new Logger(EmbeddingSearchService.name);

  /** Maximum results per search (hard cap for performance) */
  private static readonly MAX_SEARCH_LIMIT = 10;

  /** Default results if limit not specified */
  private static readonly DEFAULT_SEARCH_LIMIT = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Search the knowledge base for similar content
   *
   * @param options - Search options including tenantId, query, emailId, limit
   * @returns Search results with used query and hydrated items
   *
   * Query resolution:
   * 1. If query provided, use it directly
   * 2. If only emailId, compose search text from email content
   * 3. If neither, throw BadRequestException
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const limit = this.resolveLimit(options.limit);
    const trimmedQuery = options.query?.trim() ?? '';
    let searchText = trimmedQuery;

    // If no query but emailId provided, compose search text from email
    if (!searchText && options.emailId) {
      searchText = await this.composeSearchTextFromEmail(options.tenantId, options.emailId);
    }

    if (!searchText) {
      throw new BadRequestException(
        'Provide a free-text query or an email with content to search the knowledge base.',
      );
    }

    // Generate embedding for search query (tenant-isolated for GDPR)
    const embedding = await this.mistralService.generateEmbedding(searchText, undefined, {
      tenantId: options.tenantId,
    });

    // Find similar content via vector search
    const matches = await this.embeddingsService.findSimilarContent(
      options.tenantId,
      embedding,
      limit,
    );

    if (!matches.length) {
      return {
        usedQuery: searchText,
        items: [],
      };
    }

    // Hydrate results from source tables (GDPR-compliant)
    const items = await this.hydrateKnowledgeHits(matches, options.tenantId);

    return {
      usedQuery: searchText,
      items,
    };
  }

  /**
   * GDPR-compliant: Hydrate knowledge hits by fetching content from source tables.
   * Embeddings no longer store content - use emailId/contactId to JOIN.
   *
   * @param matches - Raw matches from vector search
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @returns Hydrated search hits with content from source tables
   */
  async hydrateKnowledgeHits(
    matches: Array<{
      id: string;
      documentName: string | null;
      metadata: any;
      distance?: number;
      emailId?: string | null;
      contactId?: string | null;
    }>,
    tenantId: string,
  ): Promise<KnowledgeBaseSearchHit[]> {
    const metadataList = matches.map((match) => this.normaliseMetadata(match.metadata));

    // Extract unique email IDs for batch hydration
    const emailIds = Array.from(
      new Set(
        metadataList
          .map((meta) => (this.isString(meta.emailId) ? meta.emailId : null))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    // Batch fetch email data for hydration (GDPR-compliant)
    const emailMap = await this.fetchEmailHydrationMap(tenantId, emailIds);

    return matches.map((match, index) => {
      const metadata = metadataList[index];
      const emailId = this.isString(metadata.emailId) ? metadata.emailId : null;
      const emailDetails = emailId ? emailMap.get(emailId) : undefined;

      // Subject resolution: metadata > email > documentName
      const subject =
        (this.isString(metadata.subject) && metadata.subject.trim()) ||
        emailDetails?.subject ||
        match.documentName ||
        null;

      // From resolution: metadata > email
      const from =
        (this.isString(metadata.from) && metadata.from.trim()) || emailDetails?.from || null;

      // ReceivedAt resolution: metadata > email
      const receivedAt =
        (this.isString(metadata.receivedAt) && metadata.receivedAt) ||
        emailDetails?.receivedAt ||
        null;

      // Source resolution: metadata > infer from emailId
      const source =
        (this.isString(metadata.source) && metadata.source) || (emailId ? 'email' : null);

      // Distance and score calculation
      const distance =
        typeof match.distance === 'number' && Number.isFinite(match.distance)
          ? match.distance
          : null;

      // Score = 1 - distance (higher = more similar)
      // Distance is clamped to [0, 1] range
      const score =
        distance === null
          ? null
          : Number((1 - Math.min(Math.max(distance, 0), 1)).toFixed(3));

      // GDPR-compliant: Get snippet from source table (Email), not from embedding
      const snippet = emailDetails?.snippet
        ? this.truncateMemorySnippet(emailDetails.snippet)
        : null;

      return {
        id: match.id,
        subject,
        snippet,
        source,
        emailId,
        from,
        receivedAt,
        distance,
        score,
        metadata: Object.keys(metadata).length ? metadata : null,
      };
    });
  }

  /**
   * GDPR-compliant: Fetch email details including snippet for hydration.
   * Since embeddings no longer store content, we fetch it from the Email table.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param emailIds - List of email IDs to fetch
   * @returns Map of emailId -> hydration data
   */
  private async fetchEmailHydrationMap(
    tenantId: string,
    emailIds: string[],
  ): Promise<Map<string, EmailHydrationData>> {
    if (!emailIds.length) {
      return new Map();
    }

    const rows = await this.prisma.email.findMany({
      where: {
        tenantId,
        id: {
          in: emailIds,
        },
      },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        snippet: true, // GDPR-compliant: Fetch content from source table
      },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          subject: row.subject,
          from: row.from,
          receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
          snippet: row.snippet, // GDPR-compliant: Content from source table
        },
      ]),
    );
  }

  /**
   * Compose search text from email content when no query is provided.
   * Uses the same composition logic as embedding creation.
   *
   * @param tenantId - Tenant ID
   * @param emailId - Email ID to compose from
   * @returns Composed search text or empty string if email not found
   */
  private async composeSearchTextFromEmail(tenantId: string, emailId: string): Promise<string> {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: {
        subject: true,
        snippet: true,
        bodyText: true,
        bodyHtml: true,
      },
    });

    if (!email) {
      return '';
    }

    return this.composeEmailContent({
      subject: email.subject ?? null,
      snippet: email.snippet,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
    }) ?? '';
  }

  /**
   * Compose email content for search query generation.
   * Mirrors the composition logic from embedding creation.
   *
   * Priority: bodyHtml > bodyText > snippet
   *
   * @param email - Email data
   * @returns Composed content or null if empty
   */
  private composeEmailContent(email: {
    subject: string | null;
    snippet: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
  }): string | null {
    const pieces: string[] = [];

    if (email.subject) {
      pieces.push(`Oggetto: ${email.subject}`);
    }

    // Priority: bodyHtml > bodyText > snippet
    if (email.bodyHtml) {
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
   * Resolve search limit with hard cap
   *
   * @param requestedLimit - User-requested limit
   * @returns Capped limit (max 10)
   */
  private resolveLimit(requestedLimit?: number): number {
    if (!requestedLimit || requestedLimit <= 0) {
      return EmbeddingSearchService.DEFAULT_SEARCH_LIMIT;
    }
    return Math.min(requestedLimit, EmbeddingSearchService.MAX_SEARCH_LIMIT);
  }

  /**
   * Normalize metadata from JSONB to plain object
   *
   * @param value - Raw metadata value
   * @returns Normalized record
   */
  private normaliseMetadata(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, any>;
  }

  /**
   * Truncate snippet for display
   *
   * @param value - Raw snippet
   * @param limit - Max characters (default 320)
   * @returns Truncated snippet
   */
  private truncateMemorySnippet(value: string, limit = 320): string {
    if (!value) {
      return '';
    }

    const normalised = value.replace(/\s+/g, ' ').trim();
    return normalised.length > limit ? `${normalised.slice(0, limit)}...` : normalised;
  }

  /**
   * Type guard for non-empty strings
   *
   * @param value - Value to check
   * @returns True if value is a non-empty string
   */
  private isString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }
}
