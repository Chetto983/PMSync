import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiRunsQueryDto } from '../dto/ai-runs-query.dto';
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
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
export class AiObservabilityController {
  constructor(private readonly prisma: PrismaService) {}

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
