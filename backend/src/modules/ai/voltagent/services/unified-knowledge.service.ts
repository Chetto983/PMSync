/**
 * Unified Knowledge Service
 *
 * NestJS service that provides unified search across all knowledge sources.
 * Used by VoltAgentController for API endpoints.
 *
 * AI refactor v2.0: Simplified - removed deleted service dependencies.
 * Memory services archived at archive/memory/ folder.
 *
 * @see docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md P1.6
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
// LongTermMemoryService removed - AI refactor v2.0
// DeadlineExtractorService removed - AI refactor v2.0
// ActionItemService removed - AI refactor v2.0
// These services are archived at archive/memory/ folder

import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { FollowUpService } from './follow-up.service';
import { UnifiedRetriever, SearchSource } from '../rag/unified-retriever';
import { getLocale } from '../locales';

export interface UnifiedSearchOptions {
  sources?: SearchSource[];
  limit?: number;
  locale?: string;
}

export interface UnifiedSearchResult {
  success: boolean;
  context: string;
  sources: SearchSource[];
  itemCount: number;
  fromCache?: boolean;
}

export interface RememberOptions {
  category?: 'preference' | 'fact' | 'contact' | 'project' | 'general';
  locale?: string;
}

@Injectable()
export class UnifiedKnowledgeService {
  private readonly logger = new Logger(UnifiedKnowledgeService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    // LongTermMemoryService removed - AI refactor v2.0
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
    // DeadlineExtractorService removed - AI refactor v2.0
    private readonly followUpService: FollowUpService,
    // ActionItemService removed - AI refactor v2.0
  ) {
    this.enabled = this.config.get<string>('UNIFIED_KNOWLEDGE_ENABLED', 'true') === 'true';
  }

  /**
   * Perform unified search across all knowledge sources
   */
  async search(
    tenantId: string,
    userId: string,
    query: string,
    options: UnifiedSearchOptions = {},
  ): Promise<UnifiedSearchResult> {
    if (!this.enabled) {
      return {
        success: false,
        context: 'Unified knowledge search is disabled',
        sources: [],
        itemCount: 0,
      };
    }

    const locale = getLocale(options.locale);

    try {
      const retriever = new UnifiedRetriever({
        tenantId,
        userId,
        locale,
        prisma: this.prisma,
        // longTermMemory removed - AI refactor v2.0
        mistralService: this.mistralService,
        embeddingsService: this.embeddingsService,
        emailLimit: options.limit ?? 5,
        deadlineLimit: options.limit ?? 5,
        followupLimit: options.limit ?? 5,
        actionLimit: options.limit ?? 5,
      });

      const context = await retriever.retrieve(query);

      // Count items in context
      const itemCount = context
        .split('\n')
        .filter((line) =>
          line.startsWith('- ') ||
          line.startsWith('Email:') ||
          line.startsWith('Deadline:') ||
          line.startsWith('Task:') ||
          line.startsWith('Follow-up')
        )
        .length;

      return {
        success: true,
        context,
        sources: options.sources ?? ['emails', 'deadlines', 'followups', 'actions'],
        itemCount,
      };
    } catch (error) {
      this.logger.error(`Unified search failed: ${error}`);
      return {
        success: false,
        context: '',
        sources: [],
        itemCount: 0,
      };
    }
  }

  /**
   * Store information in long-term memory
   * LongTermMemoryService removed - AI refactor v2.0
   * Returns stub response until service is restored from archive
   */
  async remember(
    _tenantId: string,
    _userId: string,
    _content: string,
    _options: RememberOptions = {},
  ): Promise<{ success: boolean; memoryId?: string }> {
    // LongTermMemoryService removed - AI refactor v2.0
    // This functionality can be restored from archive/memory folder
    this.logger.warn('remember() not available - LongTermMemoryService removed in AI refactor v2.0');
    return { success: false };
  }

  /**
   * Get knowledge base statistics
   * Simplified in AI refactor v2.0 - only follow-ups available
   */
  async getStats(tenantId: string, userId: string): Promise<{
    memoryCount: number;
    deadlineCount: number;
    followupCount: number;
    actionCount: number;
  }> {
    const followupStats = await this.followUpService.getStats(tenantId, userId).catch(() => ({ pending: 0, overdue: 0 }));

    return {
      memoryCount: 0, // LongTermMemoryService removed
      deadlineCount: 0, // DeadlineExtractorService removed
      followupCount: followupStats.pending + followupStats.overdue,
      actionCount: 0, // ActionItemService removed
    };
  }
}
