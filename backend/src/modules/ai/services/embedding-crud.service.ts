import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// ============================================================================
// INTERFACES (Internal to service - not exported)
// ============================================================================

/**
 * Parameters for listing embeddings
 */
interface ListEmbeddingsParams {
  limit?: number;
  offset?: number;
}

/**
 * Result from listing embeddings
 */
interface ListEmbeddingsResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * EmbeddingCrudService - CRUD operations for embedding management
 *
 * Extracted from KnowledgeBaseService (Phase 7-01).
 * Responsibilities:
 * - List embeddings with pagination
 * - Delete single embedding
 * - Delete embeddings by email ID (single or multiple)
 * - Delete embeddings by contact ID (single or multiple)
 * - Bulk delete with batching
 *
 * CRITICAL: All queries use indexed emailId/contactId fields, NOT JSONB metadata paths.
 * Anti-pattern avoided: `metadata.path['emailId']` = O(n) full scan
 * Correct pattern: `emailId` field with @@index = O(log n)
 *
 * @see knowledge-base.service.ts lines 484-569, 1096-1127, 1321-1370 (original implementation)
 */
@Injectable()
export class EmbeddingCrudService {
  private readonly logger = new Logger(EmbeddingCrudService.name);

  /**
   * Default batch size for bulk delete operations
   */
  private static readonly DEFAULT_BATCH_SIZE = 50;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================================
  // LIST OPERATIONS
  // ============================================================================

  /**
   * List embeddings for a tenant with pagination.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param params - Pagination parameters (limit: 1-200, offset: 0+)
   * @returns Paginated list of embeddings
   */
  async listEmbeddings<T = any>(
    tenantId: string,
    params: ListEmbeddingsParams = {},
  ): Promise<ListEmbeddingsResult<T>> {
    // Validate and constrain parameters
    const limit = params.limit && params.limit > 0 && params.limit < 200 ? params.limit : 25;
    const offset = params.offset && params.offset >= 0 ? params.offset : 0;

    const embeddings = await this.prisma.embedding.findMany({
      where: { tenantId },
      select: {
        id: true,
        documentName: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    const total = await this.prisma.embedding.count({
      where: { tenantId },
    });

    return {
      items: embeddings as unknown as T[],
      total,
      limit,
      offset,
    };
  }

  // ============================================================================
  // SINGLE DELETE OPERATIONS
  // ============================================================================

  /**
   * Delete a single embedding by ID.
   * Verifies tenant ownership before deletion.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param embeddingId - Embedding ID to delete
   * @throws Error if embedding not found for this tenant
   */
  async deleteEmbedding(tenantId: string, embeddingId: string): Promise<void> {
    const existing = await this.prisma.embedding.findFirst({
      where: {
        id: embeddingId,
        tenantId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new Error('Embedding not found for this tenant');
    }

    await this.prisma.embedding.deleteMany({
      where: { id: embeddingId, tenantId },
    });
  }

  // ============================================================================
  // EMAIL EMBEDDING DELETE OPERATIONS
  // ============================================================================

  /**
   * Delete all embeddings for a single email.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param emailId - Email ID to delete embeddings for
   * @returns Number of embeddings deleted
   */
  async deleteEmbeddingsForEmail(tenantId: string, emailId: string): Promise<number> {
    if (!emailId) {
      return 0;
    }
    return this.deleteEmbeddingsForEmails(tenantId, [emailId]);
  }

  /**
   * Delete embeddings for multiple emails with batching.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param emailIds - Array of email IDs to delete embeddings for
   * @returns Total number of embeddings deleted
   */
  async deleteEmbeddingsForEmails(tenantId: string, emailIds: string[]): Promise<number> {
    if (!emailIds || emailIds.length === 0) {
      return 0;
    }

    const batchSize = EmbeddingCrudService.DEFAULT_BATCH_SIZE;
    let totalDeleted = 0;

    for (let i = 0; i < emailIds.length; i += batchSize) {
      const batch = emailIds.slice(i, i + batchSize).filter(Boolean);
      if (batch.length === 0) {
        continue;
      }

      // CORRECT: Use indexed emailId field instead of slow JSONB metadata path
      // Before: metadata.path['emailId'] = O(n) full scan
      // After:  emailId field with @@index = O(log n)
      const result = await this.prisma.embedding.deleteMany({
        where: {
          tenantId,
          emailId: { in: batch },
        },
      });

      totalDeleted += result.count;
    }

    return totalDeleted;
  }

  /**
   * Bulk delete embeddings by email IDs with configurable batching.
   * More efficient than individual deletes for large cleanups.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param emailIds - Array of email IDs to delete embeddings for
   * @param batchSize - Size of each delete batch (default: 50)
   * @returns Total number of embeddings deleted
   */
  async bulkDeleteEmbeddingsByEmailIds(
    tenantId: string,
    emailIds: string[],
    batchSize: number = EmbeddingCrudService.DEFAULT_BATCH_SIZE,
  ): Promise<number> {
    if (!emailIds || emailIds.length === 0) {
      return 0;
    }

    let totalDeleted = 0;

    for (let i = 0; i < emailIds.length; i += batchSize) {
      const batch = emailIds.slice(i, i + batchSize).filter(Boolean);
      if (batch.length === 0) continue;

      // CORRECT: Use indexed emailId field
      const result = await this.prisma.embedding.deleteMany({
        where: { tenantId, emailId: { in: batch } },
      });

      totalDeleted += result.count;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Bulk deleted ${totalDeleted} embeddings for ${emailIds.length} emails (tenant: ${tenantId})`,
      );
    }

    return totalDeleted;
  }

  // ============================================================================
  // CONTACT EMBEDDING DELETE OPERATIONS
  // ============================================================================

  /**
   * Delete all embeddings for a single contact.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param contactId - Contact ID to delete embeddings for
   * @returns Number of embeddings deleted
   */
  async deleteEmbeddingsForContact(tenantId: string, contactId: string): Promise<number> {
    if (!contactId) {
      return 0;
    }

    // CORRECT: Use indexed contactId field
    const result = await this.prisma.embedding.deleteMany({
      where: { tenantId, contactId },
    });

    return result.count;
  }

  /**
   * Bulk delete embeddings by contact IDs with configurable batching.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param contactIds - Array of contact IDs to delete embeddings for
   * @param batchSize - Size of each delete batch (default: 50)
   * @returns Total number of embeddings deleted
   */
  async bulkDeleteEmbeddingsByContactIds(
    tenantId: string,
    contactIds: string[],
    batchSize: number = EmbeddingCrudService.DEFAULT_BATCH_SIZE,
  ): Promise<number> {
    if (!contactIds || contactIds.length === 0) {
      return 0;
    }

    let totalDeleted = 0;

    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batch = contactIds.slice(i, i + batchSize).filter(Boolean);
      if (batch.length === 0) continue;

      // CORRECT: Use indexed contactId field
      const result = await this.prisma.embedding.deleteMany({
        where: { tenantId, contactId: { in: batch } },
      });

      totalDeleted += result.count;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Bulk deleted ${totalDeleted} embeddings for ${contactIds.length} contacts (tenant: ${tenantId})`,
      );
    }

    return totalDeleted;
  }
}
