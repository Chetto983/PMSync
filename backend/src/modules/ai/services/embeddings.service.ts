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
      content,
      embedding,
      model,
      documentName = null,
      metadata,
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
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "embeddings"
            ("id", "tenantId", "documentName", "content", "vector", "embeddingModel", "metadata", "createdAt")
          VALUES
            (${nanoid()}, ${tenantId}, ${documentName}, ${content}, ${vectorLiteral}, ${model}, ${metadataFragment}, NOW());
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
      const results = await this.prisma.$queryRaw<T[]>(
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

  async hasEmbeddingForEmail(tenantId: string, emailId: string): Promise<boolean> {
    if (!emailId) {
      return false;
    }

    const count = await this.prisma.embedding.count({
      where: {
        tenantId,
        metadata: {
          path: ['emailId'],
          equals: emailId,
        },
      },
    });

    return count > 0;
  }
}
