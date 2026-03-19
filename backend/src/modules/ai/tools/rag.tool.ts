import { Injectable, Logger } from '@nestjs/common';
import {
  IAiTool,
  IToolContext,
  ToolDomain,
  RiskLevel,
} from '../../../common/interfaces/tool-registry.interface';
import { KnowledgeBaseService } from '../services/knowledge-base.service';

/**
 * IAiTool wrapper for semantic/knowledge-base search (RAG).
 * Registered via OnModuleInit in AiModule.
 * AiChatModule discovers this through ToolRegistryService.
 *
 * Phase 32: Architecture decoupling -- domain modules own their tool metadata.
 */
@Injectable()
export class RagTool implements IAiTool {
  readonly name = 'semantic_search';
  readonly description =
    'Search across emails, contacts, and calendar events using semantic matching. ' +
    'Finds relevant content by meaning, not just exact text matches.';
  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['emails', 'contacts', 'calendar'] },
        description: 'Sources to search (omit to search all)',
      },
      limit: { type: 'number', description: 'Max results (default 10, max 20)' },
    },
    required: ['query'],
  };

  // Phase 77: Governance metadata
  readonly domain: ToolDomain = 'knowledge';
  readonly riskLevel: RiskLevel = 'LOW';
  readonly requiresApproval = false;
  readonly inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['emails', 'contacts', 'calendar'] },
      },
      limit: { type: 'number' },
    },
    required: ['query'],
  };

  private readonly logger = new Logger(RagTool.name);

  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: IToolContext,
  ): Promise<unknown> {
    const query = input.query as string;
    const limit = Math.min((input.limit as number) ?? 10, 20);

    const result = await this.knowledgeBaseService.searchKnowledgeBase({
      tenantId: context.tenantId,
      query,
      limit,
    });

    return {
      results: result,
      count: Array.isArray(result) ? result.length : 0,
    };
  }
}
