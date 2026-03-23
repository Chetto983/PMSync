import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRunsQueryDto } from '../dto/ai-runs-query.dto';
import { AiAnalyticsQueryDto } from '../dto/ai-analytics-query.dto';
import { AiAnalyticsService } from '../services/ai-analytics.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

/**
 * AI Observability Controller
 *
 * Phase 35 Plan 02 -- Exposes AI run ledger data via REST endpoints.
 * GET /ai/runs -- paginated run records filtered by tenant, date range, runType.
 * GET /ai/runs/cost-summary -- aggregate cost/token summary.
 */
@ApiTags('AI Observability')
@Controller('ai')
@UseGuards(TenantGuard, RolesGuard)
@Roles('admin')
export class AiObservabilityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AiAnalyticsService,
  ) {}

  @Get('runs')
  @ApiOperation({ summary: 'List AI run records' })
  async getRuns(
    @Query() query: AiRunsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(req.user.tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.aiRunLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.aiRunLedger.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  @Get('runs/cost-summary')
  @ApiOperation({ summary: 'Aggregate AI run cost summary' })
  async getCostSummary(
    @Query() query: AiRunsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const where = this.buildWhere(req.user.tenantId, query);

    const result = await this.prisma.aiRunLedger.aggregate({
      where,
      _sum: {
        estimatedCostUsd: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: true,
    });

    return {
      totalCost: result._sum.estimatedCostUsd ?? 0,
      totalPromptTokens: result._sum.promptTokens ?? 0,
      totalCompletionTokens: result._sum.completionTokens ?? 0,
      totalTokens: result._sum.totalTokens ?? 0,
      runCount: result._count,
    };
  }

  @Get('runs/analytics')
  @ApiOperation({ summary: 'AI analytics: time-series, model breakdown, burn rate' })
  async getAnalytics(
    @Query() query: AiAnalyticsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.analyticsService.getAnalytics(
      req.user.tenantId,
      query.days ?? 30,
    );
  }

  @Post('runs/score-recent')
  @ApiOperation({ summary: 'Score recent un-scored AI runs for quality tracking' })
  async scoreRecentRuns(@Req() req: AuthenticatedRequest) {
    return this.analyticsService.scoreRecentRuns(req.user.tenantId);
  }

  private buildWhere(
    tenantId: string,
    query: AiRunsQueryDto,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { tenantId };

    if (query.startDate || query.endDate) {
      const createdAt: Record<string, Date> = {};
      if (query.startDate) createdAt.gte = new Date(query.startDate);
      if (query.endDate) createdAt.lte = new Date(query.endDate);
      where.createdAt = createdAt;
    }

    if (query.runType) {
      where.runType = query.runType;
    }

    return where;
  }
}
