/**
 * VoltAgent Document Library Tools
 *
 * AI-powered document RAG using Mistral's Agents API with document_library tool.
 * Delegates to DocumentLibraryService for all operations.
 *
 * Features:
 * - document_library: Built-in RAG with automatic chunking and embedding
 * - Library management: Create, list, delete libraries
 * - Document upload: Add documents to libraries
 * - Citation support: Transparent source attribution
 *
 * Based on Mistral Agents API: https://docs.mistral.ai/agents/tools/built-in/document_library
 *
 * Architecture:
 * - Tools delegate to DocumentLibraryService (uses Mistral Libraries API)
 * - Service handles caching, tenant isolation, and API calls
 * - VoltAgent tool integration
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Logger } from '@nestjs/common';
import { getToolTranslations, type SupportedLocale } from '../locales';
import {
  DocumentLibraryService,
} from '../services/document-library.service';

const logger = new Logger('DocumentLibraryTools');

// =============================================================================
// Types (re-export for compatibility)
// =============================================================================

/**
 * Document library metadata
 */
export interface DocumentLibrary {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Document in a library
 */
export interface LibraryDocument {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  status: 'processing' | 'ready' | 'failed';
  createdAt: string;
}

/**
 * Document search result
 */
export interface DocumentSearchResult {
  answer: string;
  sources: Array<{
    documentName: string;
    documentId?: string;
    snippet: string;
    relevanceScore?: number;
  }>;
  citations?: string[];
}

/**
 * Tool options for document library
 */
export interface DocumentLibraryToolOptions {
  documentLibraryService: DocumentLibraryService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
}

// =============================================================================
// VoltAgent Tool Creation
// =============================================================================

/**
 * Create document query tool for VoltAgent
 *
 * Enables document Q&A using Mistral's Agents API with document_library tool.
 * Delegates to DocumentLibraryService which uses the correct Mistral Libraries API.
 */
export function createDocumentQueryTool(options: DocumentLibraryToolOptions) {
  const { documentLibraryService, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'query_documents',
    description: t.documentLibrary?.queryDescription || 'Search and query documents in your document libraries. Use this to find information from uploaded documents, PDFs, and text files.',
    parameters: z.object({
      query: z
        .string()
        .min(5)
        .max(1000)
        .describe('The question or search query to find information in documents'),
      libraryIds: z
        .array(z.string())
        .optional()
        .describe('Specific library IDs to search (searches all if not provided)'),
    }),
    execute: async ({ query, libraryIds }) => {
      logger.log(`[${tenantId}] Document query: "${query.substring(0, 50)}..."`);

      try {
        // Delegate to service which uses correct Mistral Libraries API
        const result = await documentLibraryService.queryDocuments(
          tenantId,
          query,
          libraryIds,
          locale,
        );

        return {
          success: true,
          answer: result.answer,
          sources: result.sources,
          citations: result.citations,
          fromCache: result.fromCache,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Document query failed for "${query}": ${errorMsg}`);

        return {
          success: false,
          error: t.documentLibrary?.queryFailed?.(errorMsg) || `Document query failed: ${errorMsg}`,
          answer: null,
          sources: [],
        };
      }
    },
  });
}

/**
 * Create document library list tool for VoltAgent
 */
export function createListLibrariesTool(options: DocumentLibraryToolOptions) {
  const { documentLibraryService, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'list_document_libraries',
    description: t.documentLibrary?.listDescription || 'List all available document libraries and their contents',
    parameters: z.object({}),
    execute: async () => {
      logger.log(`[${tenantId}] Listing document libraries`);

      try {
        const libraries = await documentLibraryService.listLibraries(tenantId);

        // Map service type to tool type for compatibility
        const mappedLibraries: DocumentLibrary[] = libraries.map(lib => ({
          id: lib.id,
          name: lib.name,
          description: lib.description,
          documentCount: lib.documentCount,
          createdAt: lib.createdAt.toISOString(),
          updatedAt: lib.updatedAt?.toISOString(),
        }));

        return {
          success: true,
          libraries: mappedLibraries,
          count: mappedLibraries.length,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`List libraries failed: ${errorMsg}`);

        return {
          success: false,
          error: t.documentLibrary?.listFailed?.(errorMsg) || `Failed to list libraries: ${errorMsg}`,
          libraries: [],
          count: 0,
        };
      }
    },
  });
}

/**
 * Create document library create tool for VoltAgent
 */
export function createCreateLibraryTool(options: DocumentLibraryToolOptions) {
  const { documentLibraryService, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'create_document_library',
    description: t.documentLibrary?.createDescription || 'Create a new document library for organizing and searching documents',
    parameters: z.object({
      name: z
        .string()
        .min(1)
        .max(100)
        .describe('Name for the new document library'),
      description: z
        .string()
        .max(500)
        .optional()
        .describe('Optional description of the library contents'),
    }),
    execute: async ({ name, description }) => {
      logger.log(`[${tenantId}] Creating document library: "${name}"`);

      try {
        const library = await documentLibraryService.createLibrary(tenantId, {
          name,
          description,
        });

        return {
          success: true,
          library: {
            id: library.id,
            name: library.name,
            description: library.description,
            documentCount: library.documentCount,
            createdAt: library.createdAt.toISOString(),
          },
          message: `Library "${name}" created successfully`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Create library failed: ${errorMsg}`);

        return {
          success: false,
          error: `Failed to create library: ${errorMsg}`,
          library: null,
        };
      }
    },
  });
}

/**
 * Create all document library tools
 */
export function createDocumentLibraryTools(options: DocumentLibraryToolOptions) {
  return [
    createDocumentQueryTool(options),
    createListLibrariesTool(options),
    createCreateLibraryTool(options),
  ];
}

/**
 * Clear document library cache (delegates to service)
 * Note: Service handles its own caching, this is for testing compatibility
 */
export function clearDocumentLibraryCache(): void {
  logger.log('Document library cache clear requested (service handles caching)');
}

/**
 * Clear document library agent pool (delegates to service)
 * Note: Service handles its own agent pooling, this is for testing compatibility
 */
export function clearDocumentLibraryAgentPool(): void {
  logger.log('Document library agent pool clear requested (service handles pooling)');
}
