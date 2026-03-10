import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService) {}

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

    try {
      // OPTIMIZATION: Set ef_search for better recall in production RAG
      // Higher values = more accurate but slower (default: 40, recommended: 100 for RAG)
      // Uses SET LOCAL to only affect this transaction
      await this.prisma.$executeRaw`SET LOCAL hnsw.ef_search = 100`;

      // Use CTE to force PostgreSQL to filter by tenantId FIRST
      // This ensures tenant isolation and prevents scanning vectors from other tenants
      const maxDistance = options?.maxDistance;

      // GDPR-compliant: No content column - just vector + entity IDs
      // FIX H2: Include emailId and contactId for proper entity lookup (not embedding ID)
      const results = maxDistance !== undefined
        ? await this.prisma.$queryRaw<T[]>(
            Prisma.sql`
              WITH tenant_embeddings AS (
                SELECT "id", "documentName", "metadata", "vector", "emailId", "contactId"
                FROM "embeddings"
                WHERE "tenantId" = ${tenantId}
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
                WHERE "tenantId" = ${tenantId}
              )
              SELECT "id", "documentName", "metadata", "emailId", "contactId", ("vector" <-> ${vectorLiteral}) AS "distance"
              FROM tenant_embeddings
              ORDER BY "vector" <-> ${vectorLiteral}
              LIMIT ${limit};
            `,
          );

      return results;
    } catch (error) {
      this.logger.error('Failed to execute similarity search', error instanceof Error ? error.stack : error);
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
