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
 * Create consolidated document library tool for VoltAgent
 *
 * CONSOLIDATED TOOL: Combines query_documents, list_document_libraries, create_document_library
 * into a single tool with action modes.
 */
export function createDocumentLibraryTool(options: DocumentLibraryToolOptions) {
  const { documentLibraryService, locale, tenantId } = options;
  const t = getToolTranslations(locale);

  return createTool({
    name: 'manage_document_library',
    description: `Manage document libraries. CONSOLIDATED TOOL - handles query, list, and create operations.

Actions:
- "query": Search documents for information (requires query; optional libraryIds)
- "list": List all available document libraries (no params required)
- "create": Create new document library (requires name; optional description)

Use "query" to find information in uploaded documents, PDFs, and text files.`,
    parameters: z.object({
      action: z.enum(['query', 'list', 'create']).describe('Action to perform'),
      // Query params
      query: z.string().optional().describe('Search query (for action="query")'),
      libraryIds: z.array(z.string()).optional().describe('Library IDs to search (for action="query")'),
      // Create params
      name: z.string().optional().describe('Library name (for action="create")'),
      description: z.string().optional().describe('Library description (for action="create")'),
    }),
    execute: async (params) => {
      const { action, query, libraryIds, name, description } = params;

      switch (action) {
        case 'query': {
          if (!query || query.length < 5) {
            return { success: false, error: 'query action requires query parameter (min 5 chars)' };
          }

          logger.log(`[${tenantId}] Document query: "${query.substring(0, 50)}..."`);

          try {
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
        }

        case 'list': {
          logger.log(`[${tenantId}] Listing document libraries`);

          try {
            const libraries = await documentLibraryService.listLibraries(tenantId);

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
        }

        case 'create': {
          if (!name || name.length < 1) {
            return { success: false, error: 'create action requires name parameter' };
          }

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
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    },
  });
}

/**
 * Create all document library tools (now returns single consolidated tool)
 */
export function createDocumentLibraryTools(options: DocumentLibraryToolOptions) {
  return [createDocumentLibraryTool(options)];
}

