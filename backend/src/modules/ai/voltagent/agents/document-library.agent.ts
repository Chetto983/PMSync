/**
 * Document Library Agent for VoltAgent
 *
 * Specialized agent for document search and Q&A using Mistral's document_library tool.
 * Uses built-in RAG without custom implementation.
 *
 * Features:
 * - Document search and retrieval
 * - Q&A with citation support
 * - Multi-library search
 * - Cache for repeated queries
 *
 * Architecture:
 * - Delegates to DocumentLibraryService (uses Mistral Libraries API)
 * - Service handles caching, tenant isolation, and API calls
 * - VoltAgent tool integration
 */
import { Agent, type AgentHooks, type Memory } from '@voltagent/core';
import type { LanguageModel } from 'ai';
import { getAgentTranslations, type SupportedLocale } from '../locales';
import { createDocumentLibraryTools } from '../tools/document-library.tools';
import { DocumentLibraryService } from '../services/document-library.service';

export interface DocumentLibraryAgentOptions {
  model: LanguageModel;
  documentLibraryService: DocumentLibraryService;
  locale: SupportedLocale;
  tenantId: string;
  userId?: string;
  hooks?: AgentHooks;
  /** VoltAgent memory for conversation persistence */
  memory?: Memory;
}

/**
 * Creates a Document Library Agent for document search and Q&A.
 *
 * This agent uses Mistral's beta Agents API with built-in document_library tool
 * to search documents and answer questions with citations.
 */
export function createDocumentLibraryAgent(options: DocumentLibraryAgentOptions): Agent {
  const { model, documentLibraryService, locale, tenantId, userId, hooks, memory } = options;
  // Always use English prompts - locale only affects response language
  const t = getAgentTranslations('en');
  const localeInstruction = locale !== 'en' ? `\n\nIMPORTANT: Respond in ${locale === 'it' ? 'Italian' : locale}.` : '';

  // Create document library tools - delegates to DocumentLibraryService
  const documentLibraryTools = createDocumentLibraryTools({
    documentLibraryService,
    locale,
    tenantId,
    userId,
  });

  const baseInstructions = t.documentLibrary?.instructions || `You are a document assistant with access to the user's document libraries.

Your capabilities:
- Search documents for relevant information
- Answer questions based on document content
- Always cite your sources with document names
- Clearly indicate when information is not found in documents

Guidelines:
- Be accurate and only state what is in the documents
- Quote relevant passages when helpful
- If asked about something not in the documents, say so clearly
- Provide document names as sources for your answers`;

  return new Agent({
    name: 'DocumentLibraryAgent',
    purpose: 'Search uploaded PDFs/documents and answer questions with citations. Use for: document Q&A, file search, uploaded content.',
    model,
    instructions: baseInstructions + localeInstruction,
    tools: documentLibraryTools,
    hooks,
    memory,
    maxSteps: 5, // Allow more steps for complex document searches
  });
}
