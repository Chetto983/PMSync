/**
 * Knowledge Base Retriever for VoltAgent RAG
 *
 * Implements VoltAgent's BaseRetriever to provide semantic search
 * capabilities using pgvector embeddings.
 *
 * @see https://voltagent.dev/blog/rag-chatbot/
 */
import { Logger } from '@nestjs/common';
import { BaseRetriever, type BaseMessage } from '@voltagent/core';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { SupportedLocale } from '../locales';

export interface KnowledgeBaseRetrieverOptions {
  tenantId: string;
  locale: SupportedLocale;
  mistralService: MistralService;
  embeddingsService: EmbeddingsService;
  prisma: PrismaService;
  /** Maximum number of results to return (default: 5) */
  maxResults?: number;
  /** Minimum similarity score (0-1) to include in results (default: 0.7) */
  minSimilarity?: number;
}

interface EmbeddingResult {
  id: string;
  content: string;
  documentName: string | null;
  metadata: any;
  distance?: number;
}

/**
 * RAG Retriever that fetches relevant context from the knowledge base
 * before each LLM call. Uses Mistral embeddings + pgvector similarity search.
 */
export class KnowledgeBaseRetriever extends BaseRetriever {
  private readonly nestLogger = new Logger(KnowledgeBaseRetriever.name);
  private readonly tenantId: string;
  private readonly locale: SupportedLocale;
  private readonly mistralService: MistralService;
  private readonly embeddingsService: EmbeddingsService;
  private readonly prisma: PrismaService;
  private readonly maxResults: number;
  private readonly minSimilarity: number;

  constructor(options: KnowledgeBaseRetrieverOptions) {
    super();
    this.tenantId = options.tenantId;
    this.locale = options.locale;
    this.mistralService = options.mistralService;
    this.embeddingsService = options.embeddingsService;
    this.prisma = options.prisma;
    this.maxResults = options.maxResults ?? 5;
    this.minSimilarity = options.minSimilarity ?? 0.7;
  }

  /**
   * Retrieve relevant context from the knowledge base.
   * Called automatically by VoltAgent before each LLM call.
   */
  async retrieve(input: string | BaseMessage[]): Promise<string> {
    // Extract query from input
    const query = this.extractQuery(input);
    if (!query || query.trim().length < 3) {
      return '';
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.mistralService.generateEmbedding(query);
      if (!queryEmbedding || queryEmbedding.length === 0) {
        return '';
      }

      // Perform similarity search
      const results = await this.embeddingsService.findSimilarContent<EmbeddingResult>(
        this.tenantId,
        queryEmbedding,
        this.maxResults,
      );

      if (!results || results.length === 0) {
        return '';
      }

      // Filter by similarity threshold (distance is 0-2, lower is better)
      // Convert distance to similarity: similarity = 1 - (distance / 2)
      const relevantResults = results.filter((r) => {
        if (r.distance === undefined) return true;
        const similarity = 1 - r.distance / 2;
        return similarity >= this.minSimilarity;
      });

      if (relevantResults.length === 0) {
        return '';
      }

      // Format results as context for the LLM
      return this.formatContext(relevantResults);
    } catch (error) {
      // Log but don't fail - RAG is optional enrichment
      this.nestLogger.warn(`Error retrieving context (RAG optional): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Extract the query string from various input formats.
   */
  private extractQuery(input: string | BaseMessage[]): string {
    if (typeof input === 'string') {
      return input;
    }

    // Get the last user message
    for (let i = input.length - 1; i >= 0; i--) {
      const message = input[i];
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          return message.content;
        }
        // Handle array content (multimodal)
        if (Array.isArray(message.content)) {
          const textPart = message.content.find(
            (part) => typeof part === 'object' && 'type' in part && part.type === 'text',
          );
          if (textPart && 'text' in textPart) {
            return textPart.text;
          }
        }
      }
    }

    return '';
  }

  /**
   * Format retrieved documents as context for the LLM.
   */
  private formatContext(results: EmbeddingResult[]): string {
    const header =
      this.locale === 'it'
        ? '📚 Informazioni rilevanti dalla knowledge base:'
        : '📚 Relevant information from knowledge base:';

    const formattedDocs = results.map((doc, index) => {
      const source = doc.documentName || this.getSourceFromMetadata(doc.metadata);
      const similarity = doc.distance !== undefined ? Math.round((1 - doc.distance / 2) * 100) : null;

      let entry = `${index + 1}. `;
      if (source) {
        entry += `[${source}] `;
      }
      entry += doc.content.substring(0, 500); // Truncate long content
      if (doc.content.length > 500) {
        entry += '...';
      }
      if (similarity !== null) {
        entry += ` (${similarity}% ${this.locale === 'it' ? 'pertinente' : 'relevant'})`;
      }
      return entry;
    });

    return `${header}\n\n${formattedDocs.join('\n\n')}`;
  }

  /**
   * Extract source information from metadata.
   */
  private getSourceFromMetadata(metadata: any): string | null {
    if (!metadata) return null;

    // Email source
    if (metadata.emailId) {
      const from = metadata.from || metadata.sender;
      return from ? `Email from ${from}` : 'Email';
    }

    // Document source
    if (metadata.documentType) {
      return metadata.documentType;
    }

    return null;
  }
}
