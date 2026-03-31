import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../../prisma/prisma.service';
import { validateEmbeddingVector } from '../../../common/utils/vector-validation';

/**
 * GDPR-compliant embedding storage.
 * Content is NOT stored - use emailId/contactId to fetch from source tables.
 * Vectors are NOT reversible, so they're safe to store.
 */
interface SaveEmbeddingOptions {
  tenantId: string;
  embedding: number[];
  model: string;
  documentName?: string | null;
  metadata?: Record<string, any>;
  /** Direct indexed field - DO NOT store only in metadata */
  emailId?: string | null;
  /** Direct indexed field - DO NOT store only in metadata */
  contactId?: string | null;
}

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  /** KB-H1: Current embedding model version — search excludes stale vectors from other models */
  readonly currentModelVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.currentModelVersion = this.configService.get<string>('AI_EMBEDDING_MODEL', 'mistral-embed');
  }

  /**
   * Persist an embedding vector into the knowledge base.
   *
   * GDPR-compliant: NO content stored. Use emailId/contactId to fetch from source.
   * SECURITY: Validates embedding vector to prevent SQL injection via Prisma.raw()
   */
  async saveEmbedding(options: SaveEmbeddingOptions): Promise<void> {
    const {
      tenantId,
      embedding,
      model,
      documentName = null,
      metadata,
      emailId = null,
      contactId = null,
    } = options;

    // SECURITY: Validate embedding vector before using in raw SQL
    let validatedEmbedding: number[];
    try {
      validatedEmbedding = validateEmbeddingVector(embedding);
    } catch (error) {
      this.logger.warn(`Skipping embedding save: ${error instanceof Error ? error.message : 'Invalid embedding'}`);
      return;
    }

    // Safe to use: validated array contains only finite numbers
    const vectorLiteral = Prisma.raw(`'[${validatedEmbedding.join(',')}]'::vector`);
    const metadataString = metadata ? JSON.stringify(metadata) : null;
    const metadataFragment = metadataString
      ? Prisma.sql`${metadataString}::jsonb`
      : Prisma.sql`NULL::jsonb`;

    try {
      // GDPR-compliant: No content column - just vector + entity IDs
      // Use emailId/contactId to fetch content from source tables when needed
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "embeddings"
            ("id", "tenantId", "documentName", "vector", "embeddingModel", "metadata", "createdAt", "emailId", "contactId")
          VALUES
            (${nanoid()}, ${tenantId}, ${documentName}, ${vectorLiteral}, ${model}, ${metadataFragment}, NOW(), ${emailId}, ${contactId});
        `,
      );
    } catch (error) {
      this.logger.error('Failed to save embedding to database', error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Persist multiple embedding vectors in a single multi-row INSERT.
   * BULK FIX: Replaces N individual saveEmbedding() calls with 1 SQL statement.
   *
   * @param options Array of embedding options
   * @returns Number of embeddings saved
   */
  async saveBulkEmbeddings(options: SaveEmbeddingOptions[]): Promise<number> {
    if (!options.length) return 0;

    // Validate all embeddings first — skip invalid ones
    const valid: Array<SaveEmbeddingOptions & { validated: number[] }> = [];
    for (const opt of options) {
      try {
        const validated = validateEmbeddingVector(opt.embedding);
        valid.push({ ...opt, validated });
      } catch {
        this.logger.warn(`Skipping invalid embedding in bulk save (emailId=${opt.emailId}, contactId=${opt.contactId})`);
      }
    }

    if (!valid.length) return 0;

    // Build multi-row INSERT with raw SQL for pgvector compatibility
    // Process in batches of 100 to avoid query size limits
    const BATCH_SIZE = 100;
    let totalSaved = 0;

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);

      // Build VALUES clause fragments
      const valueFragments = batch.map((opt) => {
        const id = nanoid();
        const vectorLiteral = Prisma.raw(`'[${opt.validated.join(',')}]'::vector`);
        const metadataString = opt.metadata ? JSON.stringify(opt.metadata) : null;
        const metadataFragment = metadataString
          ? Prisma.sql`${metadataString}::jsonb`
          : Prisma.sql`NULL::jsonb`;

        return Prisma.sql`(${id}, ${opt.tenantId}, ${opt.documentName ?? null}, ${vectorLiteral}, ${opt.model}, ${metadataFragment}, NOW(), ${opt.emailId ?? null}, ${opt.contactId ?? null})`;
      });

      // Join all value fragments with commas
      const valuesClause = Prisma.join(valueFragments, ',\n');

      try {
        const result = await this.prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO "embeddings"
              ("id", "tenantId", "documentName", "vector", "embeddingModel", "metadata", "createdAt", "emailId", "contactId")
            VALUES
              ${valuesClause}
          `,
        );
        totalSaved += result;
      } catch (error) {
        this.logger.error(`Bulk embedding save failed for batch ${i / BATCH_SIZE + 1}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    return totalSaved;
  }

  /**
   * Batch check which emailIds already have embeddings.
   * BULK FIX: Replaces N individual hasEmbeddingForEmail() calls with 1 query.
   *
   * @returns Set of emailIds that already have embeddings
   */
  async getExistingEmailIds(tenantId: string, emailIds: string[]): Promise<Set<string>> {
    if (!emailIds.length) return new Set();

    const results = await this.prisma.embedding.findMany({
      where: {
        tenantId,
        emailId: { in: emailIds },
      },
      select: { emailId: true },
      distinct: ['emailId'],
    });

    return new Set(results.map((r) => r.emailId).filter(Boolean) as string[]);
  }

  /**
   * Perform similarity search using pgvector <-> operator.
   *
   * CRITICAL: Uses CTE to ensure tenant isolation at query level.
   * PostgreSQL will filter by tenantId FIRST (using B-tree index),
   * THEN calculate vector distances only for that tenant's embeddings.
   *
   * SECURITY: Validates embedding vector to prevent SQL injection via Prisma.raw()
   */
  async findSimilarContent<
    T extends { id: string; documentName: string | null; metadata: any; distance?: number; emailId?: string | null; contactId?: string | null }
  >(
    tenantId: string,
    embedding: number[],
    limit: number,
    options?: {
      /**
       * Maximum cosine distance threshold (0.0 = identical, 2.0 = opposite)
       * Recommended: 0.3-0.5 for semantic similarity
       * Default: no threshold (returns all results up to limit)
       */
      maxDistance?: number;
      /** KB-H1: If true, skip model version filter (e.g. for migration/admin queries) */
      includeAllVersions?: boolean;
    },
  ): Promise<T[]> {
    // SECURITY: Validate embedding vector before using in raw SQL
    let validatedEmbedding: number[];
    try {
      validatedEmbedding = validateEmbeddingVector(embedding);
    } catch (error) {
      this.logger.warn(`Invalid embedding for similarity search: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }

    // Safe to use: validated array contains only finite numbers
    const vectorLiteral = Prisma.raw(`'[${validatedEmbedding.join(',')}]'::vector`);

    const t0 = Date.now();
    try {
      // OPTIMIZATION: Set ef_search for better recall in production RAG
      // Higher values = more accurate but slower (default: 40, recommended: 100 for RAG)
      // Uses SET LOCAL to only affect this transaction
      await this.prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;

      // Use CTE to force PostgreSQL to filter by tenantId FIRST
      // This ensures tenant isolation and prevents scanning vectors from other tenants
      const maxDistance = options?.maxDistance;

      // KB-H1: Filter to current model version by default (exclude stale vectors from old models)
      const includeAllVersions = options?.includeAllVersions ?? false;
      const versionFilter = includeAllVersions
        ? Prisma.sql``
        : Prisma.sql`AND "embeddingModel" = ${this.currentModelVersion}`;

      // GDPR-compliant: No content column - just vector + entity IDs
      // FIX H2: Include emailId and contactId for proper entity lookup (not embedding ID)
      const results = maxDistance !== undefined
        ? await this.prisma.$queryRaw<T[]>(
            Prisma.sql`
              WITH tenant_embeddings AS (
                SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
                FROM "embeddings"
                WHERE "tenantId" = ${tenantId} ${versionFilter}
              )
              SELECT "id", "documentName", "metadata", "emailId", "contactId", ("vector" <-> ${vectorLiteral}) AS "distance"
              FROM tenant_embeddings
              WHERE ("vector" <-> ${vectorLiteral}) <= ${maxDistance}
              ORDER BY "vector" <-> ${vectorLiteral}
              LIMIT ${limit};
            `,
          )
        : await this.prisma.$queryRaw<T[]>(
            Prisma.sql`
              WITH tenant_embeddings AS (
                SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
                FROM "embeddings"
                WHERE "tenantId" = ${tenantId} ${versionFilter}
              )
              SELECT "id", "documentName", "metadata", "emailId", "contactId", ("vector" <-> ${vectorLiteral}) AS "distance"
              FROM tenant_embeddings
              ORDER BY "vector" <-> ${vectorLiteral}
              LIMIT ${limit};
            `,
          );

      const elapsed = Date.now() - t0;
      if (elapsed > 500) {
        this.logger.warn(`Slow pgvector search: ${elapsed}ms (limit=${limit}, tenant=${tenantId}, results=${results.length})`);
      }

      return results;
    } catch (error) {
      this.logger.error(`Failed similarity search after ${Date.now() - t0}ms`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if an embedding already exists for an email.
   * Uses direct indexed `emailId` field for O(log n) lookup.
   * DO NOT use JSONB metadata queries - they are O(n) full table scans!
   */
  async hasEmbeddingForEmail(tenantId: string, emailId: string): Promise<boolean> {
    if (!emailId) {
      return false;
    }

    // ✅ FIXED: Use indexed emailId field instead of slow JSONB metadata path
    // Before: metadata.path['emailId'] = O(n) full scan
    // After:  emailId field with @@index = O(log n)
    const count = await this.prisma.embedding.count({
      where: {
        tenantId,
        emailId,
      },
    });

    return count > 0;
  }

  /**
   * KB-H1: Count embeddings with a stale model version (not matching current).
   * Used by migration endpoint to show progress.
   */
  async countStaleEmbeddings(tenantId?: string): Promise<number> {
    const where: Prisma.EmbeddingWhereInput = {
      embeddingModel: { not: this.currentModelVersion },
    };
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.embedding.count({ where });
  }

  /**
   * KB-H1: Delete stale embeddings (wrong model version) in batches.
   * After deletion, the backfill scheduler will re-embed with the current model.
   * @returns Number of embeddings deleted
   */
  async deleteStaleEmbeddings(tenantId: string, batchSize = 500): Promise<number> {
    const stale = await this.prisma.embedding.findMany({
      where: {
        tenantId,
        embeddingModel: { not: this.currentModelVersion },
      },
      select: { id: true },
      take: batchSize,
    });
    if (!stale.length) return 0;

    const { count } = await this.prisma.embedding.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    return count;
  }

  /**
   * Check if an embedding already exists for a contact.
   * Uses direct indexed `contactId` field for O(log n) lookup.
   */
  async hasEmbeddingForContact(tenantId: string, contactId: string): Promise<boolean> {
    if (!contactId) {
      return false;
    }

    const count = await this.prisma.embedding.count({
      where: {
        tenantId,
        contactId,
      },
    });

    return count > 0;
  }
}
