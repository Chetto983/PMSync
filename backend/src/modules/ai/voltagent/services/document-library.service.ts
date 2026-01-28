/**
 * Document Library Service
 *
 * Manages document libraries using Mistral's beta.libraries API.
 * Provides library CRUD operations and document upload/query functionality.
 *
 * Features:
 * - Create/list/delete document libraries (via Mistral Libraries API)
 * - Upload documents to libraries (automatic RAG processing)
 * - Query documents with RAG and citations
 * - Per-tenant library isolation
 *
 * Architecture (using Mistral Libraries API):
 * - client.beta.libraries.create() - Create a library
 * - client.beta.libraries.documents.upload() - Upload documents
 * - Agent with document_library tool for RAG queries
 * - Redis + memory fallback caching
 *
 * @see https://docs.mistral.ai/agents/tools/built-in/document_library
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { StorageService } from '../../../email/services/storage.service';

// =============================================================================
// Types
// =============================================================================

export interface DocumentLibrary {
  id: string;
  name: string;
  description?: string;
  tenantId: string;
  mistralLibraryId?: string; // Mistral's library ID
  documentCount: number;
  totalSize: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface LibraryDocument {
  id: string;
  libraryId: string;
  mistralDocumentId?: string; // Mistral's document ID
  filename: string;
  mimeType?: string;
  size: number;
  status: 'processing' | 'ready' | 'failed';
  createdAt: Date;
}

export interface DocumentQueryResult {
  answer: string;
  sources: Array<{
    documentName: string;
    documentId?: string;
    snippet: string;
    relevanceScore?: number;
  }>;
  citations: string[];
  fromCache: boolean;
}

export interface CreateLibraryDto {
  name: string;
  description?: string;
}

export interface UploadDocumentDto {
  libraryId: string;
  filename: string;
  content: string | Buffer;
  mimeType?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** TTL for library list cache: 5 minutes */
const LIBRARY_LIST_TTL_SEC = 5 * 60;
/** TTL for query results: 15 minutes */
const QUERY_CACHE_TTL_SEC = 15 * 60;
/** TTL for Mistral agents: 1 hour */
const AGENT_TTL_SEC = 60 * 60;

// =============================================================================
// Service Implementation
// =============================================================================

@Injectable()
export class DocumentLibraryService {
  private readonly logger = new Logger(DocumentLibraryService.name);
  private readonly CACHE_PREFIX = 'doclib';

  // In-memory fallback caches (when Redis unavailable)
  private readonly fallbackLibraryCache = new Map<string, { libraries: DocumentLibrary[]; timestamp: number }>();
  private readonly fallbackAgentPool = new Map<string, { agentId: string; createdAt: number }>();
  private readonly fallbackQueryCache = new Map<string, { result: DocumentQueryResult; timestamp: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
  ) { }

  /**
   * Check if S3 backup is enabled
   */
  private isS3BackupEnabled(): boolean {
    return this.configService.get<boolean>('DOCUMENT_LIBRARY_S3_BACKUP', false) && !!this.storageService;
  }

  /**
   * Get S3 key for document backup
   */
  private getS3Key(tenantId: string, libraryId: string, filename: string): string {
    return `document-library/${tenantId}/${libraryId}/${Date.now()}-${filename}`;
  }

  // ===========================================================================
  // Mistral Client & Agent Management
  // ===========================================================================

  /**
   * Create Mistral client
   */
  private createMistralClient(): Mistral {
    const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }
    return new Mistral({ apiKey });
  }

  /**
   * Get or create a reusable Mistral document library agent.
   * Agents are cached for 1 hour (Redis + memory fallback).
   */
  private async getOrCreateAgent(
    libraryIds: string[],
    locale: string = 'en',
  ): Promise<string> {
    const libKey = libraryIds.sort().join(',');
    const cacheKey = `${this.CACHE_PREFIX}:agent:${locale}:${libKey}`;
    const now = Date.now();

    // Try Redis first
    if (this.cacheService.isHealthy()) {
      const cached = await this.cacheService.get<{ agentId: string }>(cacheKey, {
        namespace: CacheNamespace.AI_ANALYTICS,
      });
      if (cached) {
        this.logger.debug(`Redis cache hit for document agent: ${locale}`);
        return cached.agentId;
      }
    }

    // Try memory fallback
    const memCached = this.fallbackAgentPool.get(cacheKey);
    if (memCached && now - memCached.createdAt < AGENT_TTL_SEC * 1000) {
      this.logger.debug(`Memory cache hit for document agent: ${locale}`);
      return memCached.agentId;
    }

    // Create new agent
    this.logger.log(`Creating new document library agent for locale: ${locale}`);
    const startTime = Date.now();
    const client = this.createMistralClient();

    const model = this.configService.get<string>('AI_MODEL_MEDIUM') || 'mistral-small-latest';

    const agent = await client.beta.agents.create({
      model,
      name: `MailAgent Document Library (${locale})`,
      description: 'Agent for searching and querying documents using RAG',
      instructions: `You are a document assistant with access to document libraries. When asked questions:
1. Use the document_library tool to search for relevant information
2. Provide accurate answers based on the documents
3. Always cite your sources with document names
4. If the information is not in the documents, clearly state that
5. Respond in ${locale === 'it' ? 'Italian' : 'English'}`,
      tools: libraryIds.length > 0 ? [{ type: 'document_library' as const, libraryIds }] : [],
      completionArgs: {
        temperature: 0.3,
        topP: 0.95,
      },
    });

    const createTime = Date.now() - startTime;
    this.logger.log(`Document agent created in ${createTime}ms for locale: ${locale}`);

    // Cache in Redis
    if (this.cacheService.isHealthy()) {
      await this.cacheService.set(cacheKey, { agentId: agent.id }, {
        ttl: AGENT_TTL_SEC,
        namespace: CacheNamespace.AI_ANALYTICS,
      });
    }

    // Cache in memory fallback
    this.fallbackAgentPool.set(cacheKey, {
      agentId: agent.id,
      createdAt: now,
    });

    return agent.id;
  }

  // ===========================================================================
  // Library Management (using Mistral Libraries API)
  // ===========================================================================

  /**
   * Create a new document library
   */
  async createLibrary(
    tenantId: string,
    dto: CreateLibraryDto,
  ): Promise<DocumentLibrary> {
    this.logger.log(`Creating document library "${dto.name}" for tenant ${tenantId}`);

    const client = this.createMistralClient();

    // Create library in Mistral first
    const mistralLibrary = await client.beta.libraries.create({
      name: `${tenantId}_${dto.name}`,
      description: dto.description || undefined,
    });

    this.logger.log(`Mistral library created: ${mistralLibrary.id}`);

    // Store library metadata in our database with Mistral library ID
    const library = await this.prisma.documentLibrary.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        mistralLibraryId: mistralLibrary.id,
        documentCount: 0,
        totalSize: 0,
      },
    });

    // Invalidate cache
    await this.invalidateLibraryCache(tenantId);

    return {
      id: library.id,
      name: library.name,
      description: library.description ?? undefined,
      tenantId: library.tenantId,
      mistralLibraryId: library.mistralLibraryId ?? undefined,
      documentCount: library.documentCount,
      totalSize: library.totalSize,
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
    };
  }

  /**
   * List all libraries for a tenant
   */
  async listLibraries(tenantId: string): Promise<DocumentLibrary[]> {
    const cacheKey = `${this.CACHE_PREFIX}:list:${tenantId}`;

    // Try cache first
    if (this.cacheService.isHealthy()) {
      const cached = await this.cacheService.get<DocumentLibrary[]>(cacheKey, {
        namespace: CacheNamespace.AI_ANALYTICS,
      });
      if (cached) {
        return cached;
      }
    }

    const memCached = this.fallbackLibraryCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < LIBRARY_LIST_TTL_SEC * 1000) {
      return memCached.libraries;
    }

    // Fetch from database
    const libraries = await this.prisma.documentLibrary.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    const result = libraries.map((lib: typeof libraries[0]) => ({
      id: lib.id,
      name: lib.name,
      description: lib.description ?? undefined,
      tenantId: lib.tenantId,
      mistralLibraryId: lib.mistralLibraryId ?? undefined,
      documentCount: lib.documentCount,
      totalSize: lib.totalSize,
      createdAt: lib.createdAt,
      updatedAt: lib.updatedAt,
    }));

    // Cache result
    if (this.cacheService.isHealthy()) {
      await this.cacheService.set(cacheKey, result, {
        ttl: LIBRARY_LIST_TTL_SEC,
        namespace: CacheNamespace.AI_ANALYTICS,
      });
    }
    this.fallbackLibraryCache.set(cacheKey, { libraries: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Get a specific library
   */
  async getLibrary(tenantId: string, libraryId: string): Promise<DocumentLibrary | null> {
    const library = await this.prisma.documentLibrary.findFirst({
      where: { id: libraryId, tenantId, isDeleted: false },
    });

    if (!library) return null;

    return {
      id: library.id,
      name: library.name,
      description: library.description ?? undefined,
      tenantId: library.tenantId,
      mistralLibraryId: library.mistralLibraryId ?? undefined,
      documentCount: library.documentCount,
      totalSize: library.totalSize,
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
    };
  }

  /**
   * Delete a library (soft delete locally, delete from Mistral)
   */
  async deleteLibrary(tenantId: string, libraryId: string): Promise<void> {
    this.logger.log(`Deleting document library ${libraryId} for tenant ${tenantId}`);

    const library = await this.prisma.documentLibrary.findFirst({
      where: { id: libraryId, tenantId, isDeleted: false },
    });

    if (!library) {
      throw new Error('Library not found');
    }

    // Delete from Mistral if we have the Mistral library ID
    if (library.mistralLibraryId) {
      try {
        const client = this.createMistralClient();
        await client.beta.libraries.delete({ libraryId: library.mistralLibraryId });
        this.logger.log(`Deleted Mistral library: ${library.mistralLibraryId}`);
      } catch (error) {
        this.logger.warn(`Failed to delete Mistral library ${library.mistralLibraryId}:`, error);
      }
    }

    // Soft delete in database
    await this.prisma.documentLibrary.updateMany({
      where: { id: libraryId, tenantId },
      data: { isDeleted: true },
    });

    // Also delete associated documents
    await this.prisma.libraryDocument.updateMany({
      where: { libraryId, library: { tenantId } },
      data: { isDeleted: true },
    });

    // Invalidate cache
    await this.invalidateLibraryCache(tenantId);
    await this.invalidateAgentCache(tenantId);
  }

  // ===========================================================================
  // Document Management (using Mistral Libraries Documents API)
  // ===========================================================================

  /**
   * Upload a document to a library
   */
  async uploadDocument(
    tenantId: string,
    dto: UploadDocumentDto,
  ): Promise<LibraryDocument> {
    this.logger.log(`Uploading document "${dto.filename}" to library ${dto.libraryId}`);

    // Verify library exists and belongs to tenant
    const library = await this.getLibrary(tenantId, dto.libraryId);
    if (!library) {
      throw new Error('Library not found');
    }

    if (!library.mistralLibraryId) {
      throw new Error('Library has no Mistral library ID. Please recreate the library.');
    }

    const client = this.createMistralClient();
    const content = typeof dto.content === 'string' ? Buffer.from(dto.content) : dto.content;
    const size = content.length;

    // Upload to Mistral using Libraries Documents API
    // Convert Buffer to fresh ArrayBuffer for Blob compatibility (avoids SharedArrayBuffer type issues)
    const arrayBuffer = new ArrayBuffer(content.length);
    new Uint8Array(arrayBuffer).set(content);
    const mistralDocument = await client.beta.libraries.documents.upload({
      libraryId: library.mistralLibraryId,
      requestBody: {
        file: new Blob([arrayBuffer], { type: dto.mimeType || 'application/octet-stream' }),
      },
    });

    this.logger.log(`Mistral document uploaded: ${mistralDocument.id}`);

    // Store document metadata in our database
    const document = await this.prisma.libraryDocument.create({
      data: {
        tenantId,
        libraryId: dto.libraryId,
        mistralDocumentId: mistralDocument.id,
        filename: dto.filename,
        mimeType: dto.mimeType,
        size,
        status: 'processing', // Mistral will process the document
      },
    });

    // Update library stats
    await this.prisma.documentLibrary.updateMany({
      where: { id: dto.libraryId, tenantId },
      data: {
        documentCount: { increment: 1 },
        totalSize: { increment: size },
      },
    });

    // Backup to S3 if enabled
    if (this.isS3BackupEnabled() && this.storageService) {
      try {
        const s3Key = this.getS3Key(tenantId, dto.libraryId, dto.filename);
        await this.storageService.putObject(s3Key, content, dto.mimeType || 'application/octet-stream');
        this.logger.debug(`Document backed up to S3: ${s3Key}`);
      } catch (error) {
        this.logger.warn(`Failed to backup document to S3:`, error);
      }
    }

    // Invalidate caches
    await this.invalidateLibraryCache(tenantId);
    await this.invalidateAgentCache(tenantId);

    return {
      id: document.id,
      libraryId: document.libraryId,
      mistralDocumentId: document.mistralDocumentId ?? undefined,
      filename: document.filename,
      mimeType: document.mimeType ?? undefined,
      size: document.size,
      status: document.status as 'processing' | 'ready' | 'failed',
      createdAt: document.createdAt,
    };
  }

  /**
   * List documents in a library
   */
  async listDocuments(tenantId: string, libraryId: string): Promise<LibraryDocument[]> {
    // Verify library exists and belongs to tenant
    const library = await this.getLibrary(tenantId, libraryId);
    if (!library) {
      throw new Error('Library not found');
    }

    const documents = await this.prisma.libraryDocument.findMany({
      where: { libraryId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    return documents.map((doc: typeof documents[0]) => ({
      id: doc.id,
      libraryId: doc.libraryId,
      mistralDocumentId: doc.mistralDocumentId ?? undefined,
      filename: doc.filename,
      mimeType: doc.mimeType ?? undefined,
      size: doc.size,
      status: doc.status as 'processing' | 'ready' | 'failed',
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Delete a document from a library
   */
  async deleteDocument(
    tenantId: string,
    libraryId: string,
    documentId: string,
  ): Promise<void> {
    // Verify library exists and belongs to tenant
    const library = await this.getLibrary(tenantId, libraryId);
    if (!library) {
      throw new Error('Library not found');
    }

    const document = await this.prisma.libraryDocument.findFirst({
      where: { id: documentId, libraryId, isDeleted: false, library: { tenantId } },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Delete from Mistral
    if (document.mistralDocumentId && library.mistralLibraryId) {
      try {
        const client = this.createMistralClient();
        await client.beta.libraries.documents.delete({
          libraryId: library.mistralLibraryId,
          documentId: document.mistralDocumentId,
        });
        this.logger.log(`Deleted Mistral document: ${document.mistralDocumentId}`);
      } catch (error) {
        this.logger.warn(`Failed to delete Mistral document ${document.mistralDocumentId}:`, error);
      }
    }

    // Soft delete in database
    await this.prisma.libraryDocument.updateMany({
      where: { id: documentId, libraryId, library: { tenantId } },
      data: { isDeleted: true },
    });

    // Update library stats
    await this.prisma.documentLibrary.updateMany({
      where: { id: libraryId, tenantId },
      data: {
        documentCount: { decrement: 1 },
        totalSize: { decrement: document.size },
      },
    });

    // Invalidate caches
    await this.invalidateLibraryCache(tenantId);
    await this.invalidateAgentCache(tenantId);
  }

  // ===========================================================================
  // Document Query
  // ===========================================================================

  /**
   * Query documents using Mistral's document_library RAG
   */
  async queryDocuments(
    tenantId: string,
    query: string,
    libraryIds?: string[],
    locale: string = 'en',
  ): Promise<DocumentQueryResult> {
    // Get library IDs if not provided
    let searchLibraryIds = libraryIds;
    if (!searchLibraryIds || searchLibraryIds.length === 0) {
      const libraries = await this.listLibraries(tenantId);
      searchLibraryIds = libraries.map((l) => l.id);
    }

    if (searchLibraryIds.length === 0) {
      return {
        answer: 'No document libraries found. Please create a library and upload documents first.',
        sources: [],
        citations: [],
        fromCache: false,
      };
    }

    // Check cache
    const cacheKey = this.getQueryCacheKey(query, searchLibraryIds);
    const cached = await this.getCachedQuery(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // Get Mistral library IDs for the local library IDs
    const libraries = await this.prisma.documentLibrary.findMany({
      where: {
        id: { in: searchLibraryIds },
        isDeleted: false,
      },
      select: { mistralLibraryId: true },
    });

    const mistralLibraryIds = libraries
      .map((lib: { mistralLibraryId: string | null }) => lib.mistralLibraryId)
      .filter((id: string | null): id is string => !!id);

    if (mistralLibraryIds.length === 0) {
      return {
        answer: 'No documents available for search. Please upload documents to your libraries.',
        sources: [],
        citations: [],
        fromCache: false,
      };
    }

    // Get or create agent with document library access
    const agentId = await this.getOrCreateAgent(mistralLibraryIds, locale);

    // Query using the agent
    const client = this.createMistralClient();
    const response = await client.beta.conversations.start({
      agentId,
      inputs: query,
    });

    // Parse response
    const result = this.parseQueryResponse(response);

    // Cache result
    await this.setCachedQuery(cacheKey, result);

    return { ...result, fromCache: false };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getQueryCacheKey(query: string, libraryIds: string[]): string {
    const libHash = libraryIds.sort().join(',');
    return `${this.CACHE_PREFIX}:query:${query.toLowerCase().trim().slice(0, 100)}:${libHash}`;
  }

  private async getCachedQuery(cacheKey: string): Promise<DocumentQueryResult | null> {
    // Try Redis
    if (this.cacheService.isHealthy()) {
      const cached = await this.cacheService.get<DocumentQueryResult>(cacheKey, {
        namespace: CacheNamespace.AI_ANALYTICS,
      });
      if (cached) return cached;
    }

    // Try memory
    const memCached = this.fallbackQueryCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < QUERY_CACHE_TTL_SEC * 1000) {
      return memCached.result;
    }

    return null;
  }

  private async setCachedQuery(cacheKey: string, result: DocumentQueryResult): Promise<void> {
    // Cache in Redis
    if (this.cacheService.isHealthy()) {
      await this.cacheService.set(cacheKey, result, {
        ttl: QUERY_CACHE_TTL_SEC,
        namespace: CacheNamespace.AI_ANALYTICS,
      });
    }

    // Cache in memory
    if (this.fallbackQueryCache.size > 50) {
      const entries = Array.from(this.fallbackQueryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 15; i++) {
        this.fallbackQueryCache.delete(entries[i][0]);
      }
    }
    this.fallbackQueryCache.set(cacheKey, { result, timestamp: Date.now() });
  }

  private parseQueryResponse(response: unknown): DocumentQueryResult {
    const sources: DocumentQueryResult['sources'] = [];
    let answer = '';

    if (!response || typeof response !== 'object') {
      return { answer: 'No response received', sources: [], citations: [], fromCache: false };
    }

    const resp = response as Record<string, unknown>;

    if ('outputs' in resp && Array.isArray(resp.outputs)) {
      for (const output of resp.outputs) {
        if (output && typeof output === 'object') {
          const entry = output as Record<string, unknown>;

          if (entry.type === 'message.output' && 'content' in entry) {
            const content = entry.content;
            if (Array.isArray(content)) {
              for (const chunk of content) {
                if (chunk && typeof chunk === 'object') {
                  const c = chunk as Record<string, unknown>;
                  if (c.type === 'text' && typeof c.text === 'string') {
                    answer += c.text;
                  }
                  if (c.type === 'tool_reference' && typeof c.document_name === 'string') {
                    sources.push({
                      documentName: c.document_name,
                      documentId: typeof c.document_id === 'string' ? c.document_id : undefined,
                      snippet: typeof c.snippet === 'string' ? c.snippet : '',
                      relevanceScore: typeof c.score === 'number' ? c.score : undefined,
                    });
                  }
                }
              }
            } else if (typeof content === 'string') {
              answer = content;
            }
          }
        }
      }
    }

    return {
      answer: answer || 'No relevant information found in the documents.',
      sources,
      citations: sources.map((s) => s.documentName).filter(Boolean),
      fromCache: false,
    };
  }

  private async invalidateLibraryCache(tenantId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}:list:${tenantId}`;
    this.fallbackLibraryCache.delete(cacheKey);
    if (this.cacheService.isHealthy()) {
      await this.cacheService.del(cacheKey, { namespace: CacheNamespace.AI_ANALYTICS });
    }
  }

  private async invalidateAgentCache(tenantId: string): Promise<void> {
    // Clear all agents for this tenant (simplest approach)
    const keysToDelete: string[] = [];
    for (const key of this.fallbackAgentPool.keys()) {
      if (key.includes(tenantId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.fallbackAgentPool.delete(key));
  }
}
