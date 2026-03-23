import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { validateEmbeddingVector } from '../../../common/utils/vector-validation';
import { MistralEmbeddingService } from '../../ai/services/mistral-embedding.service';

// ─── Result types ───────────────────────────────────────────

export interface EmailSearchResult {
  source: 'email';
  emailId: string;
  subject: string | null;
  from: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  rrfScore: number;
}

export interface ContactSearchResult {
  source: 'contact';
  contactId: string;
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  rrfScore: number;
}

export interface CalendarSearchResult {
  source: 'calendar';
  eventId: string;
  title: string | null;
  description: string | null;
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
  rrfScore: number;
}

export type UnifiedSearchResult =
  | EmailSearchResult
  | ContactSearchResult
  | CalendarSearchResult;

// ─── Raw SQL row types ──────────────────────────────────────

interface RawEmailRow {
  email_id: string;
  subject: string | null;
  from: string | null;
  snippet: string | null;
  received_at: Date | null;
  rrf_score: number;
}

interface RawContactRow {
  contact_id: string;
  display_name: string | null;
  company: string | null;
  job_title: string | null;
  rrf_score: number;
}

interface RawCalendarRow {
  id: string;
  title: string | null;
  description: string | null;
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
  fts_rank: number;
}

// ─── Service ────────────────────────────────────────────────

/**
 * HybridSearchService -- Combines pgvector semantic search with
 * tsvector full-text search via Reciprocal Rank Fusion (RRF).
 *
 * - Email + Contact: Hybrid (vector + FTS) via SQL functions
 * - Calendar: FTS-only (no embeddings, short structured data)
 *
 * Falls back gracefully if hybrid SQL functions are missing
 * (migration not applied): returns empty results, does not crash.
 *
 * Phase 25 Plan 03: Hybrid Search & RAG
 */
@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralEmbeddingService: MistralEmbeddingService,
  ) {}

  /**
   * Unified search across multiple sources.
   *
   * @param tenantId - Tenant isolation
   * @param query - Natural language query
   * @param sources - Sources to search: 'emails', 'contacts', 'calendar'
   * @param limit - Max results per source (default 10)
   */
  async search(
    tenantId: string,
    query: string,
    sources: string[],
    limit: number = 10,
  ): Promise<UnifiedSearchResult[]> {
    const effectiveSources =
      sources.length > 0 ? sources : ['emails', 'contacts', 'calendar'];

    const promises: Promise<UnifiedSearchResult[]>[] = [];

    if (effectiveSources.includes('emails')) {
      promises.push(this.searchEmails(tenantId, query, limit));
    }
    if (effectiveSources.includes('contacts')) {
      promises.push(this.searchContacts(tenantId, query, limit));
    }
    if (effectiveSources.includes('calendar')) {
      promises.push(this.searchCalendar(tenantId, query, limit));
    }

    const results = await Promise.all(promises);
    const merged = results.flat();

    // Sort by rrfScore descending, limit to requested count
    merged.sort((a, b) => b.rrfScore - a.rrfScore);
    return merged.slice(0, limit);
  }

  /**
   * Hybrid email search: vector + FTS with RRF fusion.
   * Calls hybrid_email_search SQL function via $queryRaw.
   */
  async searchEmails(
    tenantId: string,
    query: string,
    limit: number = 10,
  ): Promise<EmailSearchResult[]> {
    try {
      const embeddingVector = await this.generateEmbedding(query, tenantId);
      // SECURITY: Validate embedding vector before using in raw SQL
      const validatedVector = validateEmbeddingVector(embeddingVector);
      const vectorLiteral = Prisma.raw(
        `'[${validatedVector.join(',')}]'::vector`,
      );

      const t0 = Date.now();
      const rows = await this.prisma.$queryRaw<RawEmailRow[]>(
        Prisma.sql`SELECT * FROM hybrid_email_search(
          ${tenantId}, ${query}, ${vectorLiteral}, ${limit}
        )`,
      );

      const elapsed = Date.now() - t0;
      if (elapsed > 500) {
        this.logger.warn(`Slow hybrid email search: ${elapsed}ms (limit=${limit}, results=${rows.length})`);
      }

      return rows.map((row) => ({
        source: 'email' as const,
        emailId: row.email_id,
        subject: row.subject,
        from: row.from,
        snippet: row.snippet,
        receivedAt: row.received_at,
        rrfScore: Number(row.rrf_score) || 0,
      }));
    } catch (error) {
      this.logger.warn(
        `Hybrid email search failed, returning empty: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Hybrid contact search: vector + FTS with RRF fusion.
   * Calls hybrid_contact_search SQL function via $queryRaw.
   */
  async searchContacts(
    tenantId: string,
    query: string,
    limit: number = 10,
  ): Promise<ContactSearchResult[]> {
    try {
      const embeddingVector = await this.generateEmbedding(query, tenantId);
      // SECURITY: Validate embedding vector before using in raw SQL
      const validatedVector = validateEmbeddingVector(embeddingVector);
      const vectorLiteral = Prisma.raw(
        `'[${validatedVector.join(',')}]'::vector`,
      );

      const t0 = Date.now();
      const rows = await this.prisma.$queryRaw<RawContactRow[]>(
        Prisma.sql`SELECT * FROM hybrid_contact_search(
          ${tenantId}, ${query}, ${vectorLiteral}, ${limit}
        )`,
      );

      const elapsed = Date.now() - t0;
      if (elapsed > 500) {
        this.logger.warn(`Slow hybrid contact search: ${elapsed}ms (limit=${limit}, results=${rows.length})`);
      }

      return rows.map((row) => ({
        source: 'contact' as const,
        contactId: row.contact_id,
        displayName: row.display_name,
        company: row.company,
        jobTitle: row.job_title,
        rrfScore: Number(row.rrf_score) || 0,
      }));
    } catch (error) {
      this.logger.warn(
        `Hybrid contact search failed, returning empty: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Calendar search: FTS-only (no embeddings per research recommendation).
   * Direct tsvector query -- no hybrid needed for short structured data.
   */
  async searchCalendar(
    tenantId: string,
    query: string,
    limit: number = 10,
  ): Promise<CalendarSearchResult[]> {
    try {
      const rows = await this.prisma.$queryRaw<RawCalendarRow[]>(
        Prisma.sql`
          SELECT
            id,
            title,
            description,
            "startTime",
            "endTime",
            location,
            ts_rank_cd(fts, websearch_to_tsquery('simple', ${query})) AS fts_rank
          FROM calendar_events
          WHERE "tenantId" = ${tenantId}
            AND fts @@ websearch_to_tsquery('simple', ${query})
          ORDER BY fts_rank DESC
          LIMIT ${limit}
        `,
      );

      return rows.map((row) => ({
        source: 'calendar' as const,
        eventId: row.id,
        title: row.title,
        description: row.description,
        startTime: row.startTime,
        endTime: row.endTime,
        location: row.location,
        rrfScore: Number(row.fts_rank) || 0,
      }));
    } catch (error) {
      this.logger.warn(
        `Calendar FTS search failed, returning empty: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Generate embedding vector for a query string.
   * Routes through MistralEmbeddingService for cost protection checks.
   */
  private async generateEmbedding(query: string, tenantId?: string): Promise<number[]> {
    return this.mistralEmbeddingService.generateEmbedding(
      query,
      undefined,
      tenantId ? { tenantId } : undefined,
    );
  }
}
