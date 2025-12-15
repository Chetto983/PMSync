/**
 * Unified Knowledge Service
 *
 * NestJS service that provides unified search across all knowledge sources.
 * Used by VoltAgentController for API endpoints.
 *
 * @see docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md P1.6
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LongTermMemoryService } from '../memory/long-term-memory.service';
import { Mem0EnhancedMemoryService } from '../memory/mem0-enhanced-memory.service';
import { MistralService } from '../../services/mistral.service';
import { EmbeddingsService } from '../../services/embeddings.service';
import { DeadlineExtractorService } from './deadline-extractor.service';
import { FollowUpService } from './follow-up.service';
import { ActionItemService } from './action-item.service';
import { UnifiedRetriever, SearchSource } from '../rag/unified-retriever';
import { getLocale} from '../locales';

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
    private readonly longTermMemory: LongTermMemoryService,
    private readonly mem0Memory: Mem0EnhancedMemoryService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly deadlineService: DeadlineExtractorService,
    private readonly followUpService: FollowUpService,
    private readonly actionItemService: ActionItemService,
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
        longTermMemory: this.longTermMemory,
        mem0Memory: this.mem0Memory,
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
   */
  async remember(
    tenantId: string,
    userId: string,
    content: string,
    options: RememberOptions = {},
  ): Promise<{ success: boolean; memoryId?: string }> {
    if (!this.enabled) {
      return { success: false };
    }

    try {
      const categoryMap: Record<string, string> = {
        preference: 'PREFERENCE',
        fact: 'FACT',
        contact: 'CONTACT',
        project: 'PROJECT',
        general: 'GENERAL',
      };

      const memoryId = await this.longTermMemory.addFact(tenantId, userId, content, {
        category: (categoryMap[options.category ?? 'general'] ?? 'GENERAL') as any,
      });

      return { success: true, memoryId: memoryId ?? undefined };
    } catch (error) {
      this.logger.error(`Remember failed: ${error}`);
      return { success: false };
    }
  }

  /**
   * Get knowledge base statistics
   */
  async getStats(tenantId: string, userId: string): Promise<{
    memoryCount: number;
    deadlineCount: number;
    followupCount: number;
    actionCount: number;
  }> {
    const [memoryStats, deadlineStats, followupStats, actionStats] = await Promise.all([
      this.longTermMemory.getStats(tenantId, userId).catch(() => ({ totalMemories: 0 })),
      this.deadlineService.getDeadlineStats(tenantId, userId).catch(() => ({ upcoming: 0, dueSoon: 0 })),
      this.followUpService.getStats(tenantId, userId).catch(() => ({ pending: 0, overdue: 0 })),
      this.actionItemService.getStats(tenantId, userId).catch(() => ({ total: 0, done: 0 })),
    ]);

    return {
      memoryCount: memoryStats.totalMemories,
      deadlineCount: deadlineStats.upcoming + deadlineStats.dueSoon,
      followupCount: followupStats.pending + followupStats.overdue,
      actionCount: actionStats.total - actionStats.done,
    };
  }
}
