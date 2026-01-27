import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../../prisma/prisma.service';

interface SaveEmbeddingOptions {
  tenantId: string;
  content: string;
  embedding: number[];
  model: string;
  documentName?: string | null;
  metadata?: Record<string, any>;
  /** Direct indexed field - DO NOT store only in metadata */
  emailId?: string | null;
  /** Direct indexed field - DO NOT store only in metadata */
  contactId?: string | null;
}

/**
 * Sanitize content for PostgreSQL UTF8 encoding.
 * Removes null bytes (0x00) and other invalid UTF8 sequences that cause:
 * "invalid byte sequence for encoding UTF8: 0x00"
 *
 * @param content - Raw content string
 * @returns Sanitized content safe for PostgreSQL
 */
function sanitizeContentForPostgres(content: string): string {
  if (!content) return content;
  // Remove null bytes and other control characters except newlines/tabs
   
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Validates and sanitizes an embedding vector for safe SQL usage.
 * Prevents SQL injection by ensuring all values are finite numbers.
 *
 * @throws Error if embedding contains invalid values
 */
function validateEmbeddingVector(embedding: unknown): number[] {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }

  if (embedding.length === 0) {
    throw new Error('Embedding array cannot be empty');
  }

  if (embedding.length > 4096) {
    throw new Error('Embedding array exceeds maximum dimension (4096)');
  }

  const validated: number[] = [];
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid embedding value at index ${i}: expected finite number`);
    }
    validated.push(value);
  }

  return validated;
}

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist an embedding vector into the knowledge base.
   *
   * SECURITY: Validates embedding vector to prevent SQL injection via Prisma.raw()
   */
  async saveEmbedding(options: SaveEmbeddingOptions): Promise<void> {
    const {
      tenantId,
      content: rawContent,
      embedding,
      model,
      documentName = null,
      metadata,
      emailId = null,
      contactId = null,
    } = options;

    // SECURITY: Sanitize content to prevent PostgreSQL UTF8 encoding errors
    // Removes null bytes (0x00) and other control characters
    const content = sanitizeContentForPostgres(rawContent);

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
      // ✅ FIXED: Include emailId and contactId as direct indexed columns
      // These fields have @@index in schema for O(log n) lookups
      // DO NOT rely only on metadata JSONB - it's O(n) full table scan!
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "embeddings"
            ("id", "tenantId", "documentName", "content", "vector", "embeddingModel", "metadata", "createdAt", "emailId", "contactId")
          VALUES
            (${nanoid()}, ${tenantId}, ${documentName}, ${content}, ${vectorLiteral}, ${model}, ${metadataFragment}, NOW(), ${emailId}, ${contactId});
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
    T extends { id: string; content: string; documentName: string | null; metadata: any; distance?: number }
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
      // Use CTE to force PostgreSQL to filter by tenantId FIRST
      // This ensures tenant isolation and prevents scanning vectors from other tenants
      const maxDistance = options?.maxDistance;

      // Build query with optional distance threshold
      // Note: Using HAVING instead of WHERE on distance alias since it's a calculated column
      const results = maxDistance !== undefined
        ? await this.prisma.$queryRaw<T[]>(
            Prisma.sql`
              WITH tenant_embeddings AS (
                SELECT "id", "content", "documentName", "metadata", "vector"
                FROM "embeddings"
                WHERE "tenantId" = ${tenantId}
              )
              SELECT "id", "content", "documentName", "metadata", ("vector" <-> ${vectorLiteral}) AS "distance"
              FROM tenant_embeddings
              WHERE ("vector" <-> ${vectorLiteral}) <= ${maxDistance}
              ORDER BY "vector" <-> ${vectorLiteral}
              LIMIT ${limit};
            `,
          )
        : await this.prisma.$queryRaw<T[]>(
            Prisma.sql`
              WITH tenant_embeddings AS (
                SELECT "id", "content", "documentName", "metadata", "vector"
                FROM "embeddings"
                WHERE "tenantId" = ${tenantId}
              )
              SELECT "id", "content", "documentName", "metadata", ("vector" <-> ${vectorLiteral}) AS "distance"
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
