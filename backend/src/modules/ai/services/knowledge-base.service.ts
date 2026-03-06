import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { EmbeddingsService } from './embeddings.service';
import { EMAIL_EMBEDDING_QUEUE, IEmailEmbeddingQueue, type CreateEmailEmbeddingOptions } from '../../../common/interfaces/embedding-queue.interface';
import { AiError } from '../errors';
// Phase 7: Extracted sub-services
import { EmbeddingComposerService } from './embedding-composer.service';
import { EmbeddingCrudService, ListEmbeddingsResult } from './embedding-crud.service';
import { EmbeddingSearchService, SearchOptions, SearchResult, KnowledgeBaseSearchHit } from './embedding-search.service';
// Re-export for backward compatibility with controllers
export type { KnowledgeBaseSearchHit };
import { EmbeddingBackfillService, BackfillOptions, BackfillResult, EmbeddingStats } from './embedding-backfill.service';

// Re-export for backward compatibility
export type { CreateEmailEmbeddingOptions } from '../../../common/interfaces/embedding-queue.interface';

/**
 * KnowledgeBaseService - FACADE for RAG operations
 *
 * Phase 7 Refactor: This service now delegates to specialized sub-services:
 * - EmbeddingComposerService: Content composition and chunking
 * - EmbeddingCrudService: CRUD operations (list, delete)
 * - EmbeddingSearchService: Vector search with GDPR-compliant hydration
 * - EmbeddingBackfillService: Batch backfill and retention management
 *
 * KEPT in facade: Creation methods that orchestrate multiple services
 * - createEmbeddingForEmail()
 * - createBulkEmbeddingsForEmails()
 * - createEmbeddingForContact()
 */
@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
    @Inject(EMAIL_EMBEDDING_QUEUE)
    private readonly emailEmbeddingQueue: IEmailEmbeddingQueue,
    private readonly configService: ConfigService,
    // Phase 7: Extracted sub-services
    private readonly composerService: EmbeddingComposerService,
    private readonly crudService: EmbeddingCrudService,
    private readonly searchService: EmbeddingSearchService,
    private readonly backfillService: EmbeddingBackfillService,
  ) {}

  // ============================================================================
  // BACKFILL - Delegates to EmbeddingBackfillService
  // ============================================================================

  async backfillEmailEmbeddingsForTenant(
    tenantId: string,
    options: BackfillOptions = {},
  ): Promise<BackfillResult> {
    return this.backfillService.backfillEmailEmbeddingsForTenant(tenantId, options);
  }

  async cleanupOldEmbeddings(tenantId?: string, retentionDays?: number): Promise<number> {
    return this.backfillService.cleanupOldEmbeddings(tenantId, retentionDays);
  }

  async getEmbeddingStats(tenantId: string): Promise<EmbeddingStats> {
    return this.backfillService.getEmbeddingStats(tenantId);
  }

  // ============================================================================
  // CREATION - Orchestration methods (kept in facade)
  // ============================================================================

  /**
   * Create embeddings for multiple emails in a single batch operation
   * This is more efficient than calling createEmbeddingForEmail multiple times
   * @param emailOptions Array of email options to create embeddings for
   * @returns Array of results indicating success/failure for each email
   */
  async createBulkEmbeddingsForEmails(
    emailOptions: CreateEmailEmbeddingOptions[],
  ): Promise<Array<{ emailId: string; success: boolean; error?: string }>> {
    if (!emailOptions || emailOptions.length === 0) {
      return [];
    }

    const results: Array<{ emailId: string; success: boolean; error?: string }> = [];

    // Prepare all chunks from all emails
    const allChunksData: Array<{
      emailId: string;
      tenantId: string;
      subject: string;
      from: string | null;
      receivedAt: string | undefined;
      chunkIndex: number;
      chunkCount: number;
      content: string;
      hasAttachments: boolean;
      attachmentCount: number;
      attachmentIds: string[];
    }> = [];

    for (const options of emailOptions) {
      if (options.emailId && (await this.embeddingsService.hasEmbeddingForEmail(options.tenantId, options.emailId))) {
        results.push({ emailId: options.emailId, success: false, error: 'Already exists' });
        continue;
      }

      const contentResult = await this.composerService.composeEmailEmbeddingContentWithAttachments(
        { id: options.emailId, subject: options.subject, snippet: options.snippet ?? null, bodyText: options.bodyText ?? null, bodyHtml: options.bodyHtml ?? null },
        options.tenantId,
      );

      if (!contentResult.content) {
        results.push({ emailId: options.emailId, success: false, error: 'Empty content' });
        continue;
      }

      const chunks = this.composerService.chunkContentForEmbedding(contentResult.content);
      const receivedAtIso = options.receivedAt instanceof Date ? options.receivedAt.toISOString() : options.receivedAt || undefined;
      // NOTE: old embeddings are deleted after successful batch generation below — not here

      for (const chunk of chunks) {
        allChunksData.push({
          emailId: options.emailId,
          tenantId: options.tenantId,
          subject: options.subject,
          from: options.from ?? null,
          receivedAt: receivedAtIso,
          chunkIndex: chunk.index,
          chunkCount: chunks.length,
          content: chunk.content,
          hasAttachments: contentResult.hasAttachments,
          attachmentCount: contentResult.attachmentCount,
          attachmentIds: contentResult.attachmentIds,
        });
      }
    }

    if (allChunksData.length === 0) return results;

    try {
      const allContents = allChunksData.map((c) => c.content);
      // Generate ALL embeddings first — if this throws, no old data is deleted
      const embeddings = await this.mistralService.generateBulkEmbeddings(allContents);

      // Track which emails have had their old embeddings deleted (swap pattern)
      const deletedEmailIds = new Set<string>();

      for (let i = 0; i < allChunksData.length; i++) {
        const chunkData = allChunksData[i];
        const embedding = embeddings[i];

        try {
          // Delete old embeddings for this email once, right before saving new ones
          if (!deletedEmailIds.has(chunkData.emailId)) {
            await this.crudService.deleteEmbeddingsForEmail(chunkData.tenantId, chunkData.emailId);
            deletedEmailIds.add(chunkData.emailId);
          }

          await this.embeddingsService.saveEmbedding({
            tenantId: chunkData.tenantId,
            embedding,
            model: this.mistralService.getEmbeddingModel(),
            documentName: chunkData.subject,
            emailId: chunkData.emailId,
            metadata: {
              source: 'email',
              emailId: chunkData.emailId,
              subject: chunkData.subject,
              from: chunkData.from,
              receivedAt: chunkData.receivedAt ?? null,
              chunkIndex: chunkData.chunkIndex,
              chunkCount: chunkData.chunkCount,
              hasAttachments: chunkData.hasAttachments,
              attachmentCount: chunkData.attachmentCount,
              attachmentIds: chunkData.attachmentIds,
            },
          });
        } catch (saveError) {
          this.logger.warn(`Failed to save embedding for email ${chunkData.emailId}: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
        }
      }

      const processedEmailIds = new Set(allChunksData.map((c) => c.emailId));
      for (const emailId of processedEmailIds) {
        if (!results.find((r) => r.emailId === emailId)) {
          results.push({ emailId, success: true });
        }
      }

      this.logger.log(`Created embeddings for ${processedEmailIds.size} emails (${allChunksData.length} chunks)`);
    } catch (bulkError) {
      this.logger.error(`Bulk embedding failed: ${bulkError instanceof Error ? bulkError.message : String(bulkError)}`);

      for (const options of emailOptions) {
        if (!results.find((r) => r.emailId === options.emailId)) {
          try {
            const success = await this.createEmbeddingForEmail(options);
            results.push({ emailId: options.emailId, success });
          } catch (error) {
            const errorMsg = AiError.fromError(error).message;
            results.push({ emailId: options.emailId, success: false, error: errorMsg });
          }
        }
      }
    }

    return results;
  }

  async createEmbeddingForEmail(options: CreateEmailEmbeddingOptions): Promise<boolean> {
    if (options.emailId && (await this.embeddingsService.hasEmbeddingForEmail(options.tenantId, options.emailId))) {
      return false;
    }

    const contentResult = await this.composerService.composeEmailEmbeddingContentWithAttachments(
      { id: options.emailId, subject: options.subject, snippet: options.snippet ?? null, bodyText: options.bodyText ?? null, bodyHtml: options.bodyHtml ?? null },
      options.tenantId,
    );
    if (!contentResult.content) return false;

    try {
      const chunks = this.composerService.chunkContentForEmbedding(contentResult.content);
      // Generate embeddings BEFORE deleting old ones — prevents data loss on API failure
      const receivedAtIso = options.receivedAt instanceof Date ? options.receivedAt.toISOString() : options.receivedAt || undefined;

      let successfulChunks = 0;

      try {
        const chunkContents = chunks.map((chunk) => chunk.content);
        const embeddings = await this.mistralService.generateBulkEmbeddings(chunkContents);
        // Only delete old embeddings after successful generation
        await this.crudService.deleteEmbeddingsForEmail(options.tenantId, options.emailId);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];

          try {
            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.subject,
              emailId: options.emailId,
              metadata: {
                source: 'email',
                emailId: options.emailId,
                subject: options.subject,
                from: options.from ?? null,
                receivedAt: receivedAtIso ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
                hasAttachments: contentResult.hasAttachments,
                attachmentCount: contentResult.attachmentCount,
                attachmentIds: contentResult.attachmentIds,
              },
            });

            successfulChunks += 1;
          } catch (saveError) {
            this.logger.warn(`Failed to save chunk for email ${options.emailId}: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
          }
        }
      } catch (bulkError) {
        this.logger.warn(`Bulk failed for ${options.emailId}, fallback: ${bulkError instanceof Error ? bulkError.message : String(bulkError)}`);

        // Swap pattern: generate first chunk to prove the API works before deleting old data
        let deletedOld = false;
        for (const chunk of chunks) {
          try {
            const embedding = await this.mistralService.generateEmbedding(chunk.content, undefined, { tenantId: options.tenantId });

            // Only delete old embeddings when the first new one is ready
            if (!deletedOld) {
              await this.crudService.deleteEmbeddingsForEmail(options.tenantId, options.emailId);
              deletedOld = true;
            }

            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.subject,
              emailId: options.emailId,
              metadata: {
                source: 'email',
                emailId: options.emailId,
                subject: options.subject,
                from: options.from ?? null,
                receivedAt: receivedAtIso ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
                hasAttachments: contentResult.hasAttachments,
                attachmentCount: contentResult.attachmentCount,
                attachmentIds: contentResult.attachmentIds,
              },
            });

            successfulChunks += 1;
          } catch (chunkError) {
            const chunkMessage = chunkError instanceof Error ? chunkError.message : String(chunkError);
            this.logger.warn(
              `Failed embedding chunk ${chunk.index + 1}/${chunks.length} for email ${options.emailId} (tenant ${options.tenantId}): ${chunkMessage}`,
            );
          }
        }
      }

      return successfulChunks > 0;
    } catch (error) {
      const message = AiError.fromError(error).message;
      this.logger.warn(
        `Failed to create embedding for email ${options.emailId} (tenant ${options.tenantId}): ${message}`,
      );
      return false;
    }
  }

  // ============================================================================
  // CRUD - Delegates to EmbeddingCrudService
  // ============================================================================

  async listEmbeddings<T = any>(
    tenantId: string,
    params: { limit?: number; offset?: number } = {},
  ) {
    return this.crudService.listEmbeddings<T>(tenantId, params);
  }

  async deleteEmbedding(tenantId: string, embeddingId: string): Promise<void> {
    return this.crudService.deleteEmbedding(tenantId, embeddingId);
  }

  async deleteEmbeddingsForEmail(tenantId: string, emailId: string): Promise<number> {
    return this.crudService.deleteEmbeddingsForEmail(tenantId, emailId);
  }

  async deleteEmbeddingsForEmails(tenantId: string, emailIds: string[]): Promise<number> {
    return this.crudService.deleteEmbeddingsForEmails(tenantId, emailIds);
  }

  async bulkDeleteEmbeddingsByEmailIds(
    tenantId: string,
    emailIds: string[],
    batchSize?: number,
  ): Promise<number> {
    return this.crudService.bulkDeleteEmbeddingsByEmailIds(tenantId, emailIds, batchSize);
  }

  async deleteEmbeddingsForContact(tenantId: string, contactId: string): Promise<number> {
    return this.crudService.deleteEmbeddingsForContact(tenantId, contactId);
  }

  async bulkDeleteEmbeddingsByContactIds(
    tenantId: string,
    contactIds: string[],
    batchSize?: number,
  ): Promise<number> {
    return this.crudService.bulkDeleteEmbeddingsByContactIds(tenantId, contactIds, batchSize);
  }

  // ============================================================================
  // SEARCH - Delegates to EmbeddingSearchService
  // ============================================================================

  async searchKnowledgeBase(options: SearchOptions): Promise<SearchResult> {
    return this.searchService.search(options);
  }

  // ============================================================================
  // CONTACT EMBEDDINGS - Orchestration method (kept in facade)
  // ============================================================================

  /**
   * Create embedding for a contact.
   * Content includes: displayName, company, jobTitle, notes, tags, emails, phones.
   */
  async createEmbeddingForContact(options: {
    tenantId: string;
    contactId: string;
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
  }): Promise<boolean> {
    if (await this.embeddingsService.hasEmbeddingForContact(options.tenantId, options.contactId)) {
      this.logger.verbose(
        `Embedding already exists for contact ${options.contactId} (tenant ${options.tenantId}), skipping.`,
      );
      return false;
    }

    // Delegate to composerService
    const content = this.composerService.composeContactEmbeddingContent(options);

    if (!content) {
      this.logger.debug(
        `Skipping embedding for contact ${options.contactId} (tenant ${options.tenantId}): empty content`,
      );
      return false;
    }

    try {
      // Delegate chunking to composerService
      const chunks = this.composerService.chunkContentForEmbedding(content);

      if (chunks.length > 1) {
        this.logger.debug(
          `Contact ${options.contactId} split into ${chunks.length} chunks for embedding.`,
        );
      }

      let successfulChunks = 0;

      try {
        const chunkContents = chunks.map((chunk) => chunk.content);
        // Generate embeddings BEFORE deleting old ones — prevents data loss on API failure
        const embeddings = await this.mistralService.generateBulkEmbeddings(chunkContents);
        // Only delete old embeddings after successful generation
        await this.crudService.deleteEmbeddingsForContact(options.tenantId, options.contactId);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];

          try {
            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.displayName || `Contact ${options.contactId}`,
              contactId: options.contactId,
              metadata: {
                source: 'contact',
                contactId: options.contactId,
                displayName: options.displayName ?? null,
                company: options.company ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
              },
            });

            successfulChunks += 1;
          } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : String(saveError);
            this.logger.warn(
              `Failed to save embedding for contact chunk ${chunk.index + 1}/${chunks.length}: ${message}`,
            );
          }
        }
      } catch (_bulkError) {
        // Swap pattern: generate first chunk to prove API works before deleting old data
        let deletedOld = false;
        for (const chunk of chunks) {
          try {
            const embedding = await this.mistralService.generateEmbedding(
              chunk.content,
              undefined,
              { tenantId: options.tenantId },
            );

            // Only delete old embeddings when the first new one is ready
            if (!deletedOld) {
              await this.crudService.deleteEmbeddingsForContact(options.tenantId, options.contactId);
              deletedOld = true;
            }

            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.displayName || `Contact ${options.contactId}`,
              contactId: options.contactId,
              metadata: {
                source: 'contact',
                contactId: options.contactId,
                displayName: options.displayName ?? null,
                company: options.company ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
              },
            });

            successfulChunks += 1;
          } catch (chunkError) {
            const chunkMessage = chunkError instanceof Error ? chunkError.message : String(chunkError);
            this.logger.warn(`Failed embedding chunk for contact: ${chunkMessage}`);
          }
        }
      }

      return successfulChunks > 0;
    } catch (error) {
      const message = AiError.fromError(error).message;
      this.logger.warn(`Failed to create embedding for contact ${options.contactId}: ${message}`);
      return false;
    }
  }
}
