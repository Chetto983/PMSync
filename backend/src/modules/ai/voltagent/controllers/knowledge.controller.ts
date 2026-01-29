/**
 * Knowledge Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles unified knowledge search with memory-first RAG.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../../subscription/guards/quota.guard';
import { UnifiedKnowledgeService } from '../services/unified-knowledge.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent Knowledge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);

  constructor(private readonly unifiedKnowledgeService: UnifiedKnowledgeService) {}

  /**
   * Search across all knowledge sources with memory-first RAG.
   */
  @Post('knowledge/search')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Unified knowledge search',
    description: `Performs memory-first RAG search across all knowledge sources:
    - **Memories**: User's long-term memories and preferences (searched first)
    - **Emails**: Semantic + keyword search (excluding spam/trash)
    - **Deadlines**: Upcoming and pending deadlines
    - **Follow-ups**: Pending follow-up items
    - **Action items**: Tasks and action items`,
  })
  async unifiedKnowledgeSearch(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      query: string;
      sources?: Array<'emails' | 'deadlines' | 'followups' | 'actions'>;
      limit?: number;
    },
  ): Promise<{
    success: boolean;
    context: string;
    sources: string[];
    itemCount: number;
  }> {
    const { tenantId, userId } = req.user;
    const locale = (req as unknown as Request).headers?.['accept-language'] || 'en';

    return this.unifiedKnowledgeService.search(tenantId, userId, body.query, {
      sources: body.sources,
      limit: body.limit,
      locale: typeof locale === 'string' ? locale : 'en',
    });
  }

  /**
   * Store information in long-term memory via unified knowledge service.
   */
  @Post('knowledge/remember')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Remember information',
    description: `Store information in long-term memory for future retrieval.
    Categories: preference, fact, contact, project, general`,
  })
  async rememberKnowledge(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      content: string;
      category?: 'preference' | 'fact' | 'contact' | 'project' | 'general';
    },
  ): Promise<{
    success: boolean;
    memoryId?: string;
  }> {
    const { tenantId, userId } = req.user;
    const locale = (req as unknown as Request).headers?.['accept-language'] || 'en';

    return this.unifiedKnowledgeService.remember(tenantId, userId, body.content, {
      category: body.category,
      locale: typeof locale === 'string' ? locale : 'en',
    });
  }

  /**
   * Get unified knowledge base statistics.
   */
  @Get('knowledge/stats')
  @ApiOperation({
    summary: 'Get knowledge base statistics',
    description: `Returns counts of items across all knowledge sources.`,
  })
  async getKnowledgeStats(@Req() req: AuthenticatedRequest): Promise<{
    success: boolean;
    memoryCount: number;
    deadlineCount: number;
    followupCount: number;
    actionCount: number;
  }> {
    const { tenantId, userId } = req.user;
    const stats = await this.unifiedKnowledgeService.getStats(tenantId, userId);

    return {
      success: true,
      ...stats,
    };
  }
}
