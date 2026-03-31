import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForecastService } from './forecast.service';
import { ForecastQueryDto } from './dto/forecast.dto';

@ApiTags('CRM - Forecasting')
@ApiCookieAuth()
@Controller('crm/forecast')
@UseGuards(TenantGuard, RolesGuard)
export class ForecastController {
  constructor(
    private readonly forecastService: ForecastService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get revenue forecast for a pipeline' })
  @ApiResponse({ status: 200, description: 'Forecast returned' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  async getForecast(@Req() req: any, @Query() query: ForecastQueryDto) {
    const tenantId = req.user.tenantId;
    const pipelineId = query.pipelineId;

    if (!pipelineId) {
      const defaultPipeline = await this.prisma.crmPipeline.findFirst({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!defaultPipeline) {
        return { forecasts: [], history: [], method: 'none', mae: 0 };
      }

      return this.forecastService.getForecast(
        tenantId,
        defaultPipeline.id,
        query.period ?? 'quarter',
      );
    }

    return this.forecastService.getForecast(
      tenantId,
      pipelineId,
      query.period ?? 'quarter',
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh forecast and save snapshots' })
  @ApiResponse({ status: 200, description: 'Forecast refreshed' })
  async refresh(@Req() req: any, @Query() query: ForecastQueryDto) {
    const tenantId = req.user.tenantId;
    const period = query.period ?? 'quarter';

    const where: any = { tenantId, isActive: true, deletedAt: null };
    if (query.pipelineId) where.id = query.pipelineId;

    const pipelines = await this.prisma.crmPipeline.findMany({
      where,
      select: { id: true },
    });

    let totalSnapshots = 0;
    let totalActualsUpdated = 0;

    for (const pipeline of pipelines) {
      // Update actuals on past snapshots
      const actualsUpdated = await this.forecastService.updateActuals(
        tenantId,
        pipeline.id,
      );

      // Generate new forecast and save
      const result = await this.forecastService.getForecast(
        tenantId,
        pipeline.id,
        period,
      );

      const saved = await this.forecastService.saveSnapshot(
        tenantId,
        pipeline.id,
        period,
        result.forecasts,
      );

      totalSnapshots += saved;
      totalActualsUpdated += actualsUpdated;
    }

    return {
      pipelinesProcessed: pipelines.length,
      snapshotsSaved: totalSnapshots,
      actualsUpdated: totalActualsUpdated,
    };
  }

  @Get('accuracy')
  @ApiOperation({ summary: 'Get forecast accuracy metrics for a pipeline' })
  @ApiResponse({ status: 200, description: 'Accuracy data returned' })
  async getAccuracy(@Req() req: any, @Query() query: ForecastQueryDto) {
    const tenantId = req.user.tenantId;
    const pipelineId = query.pipelineId;

    if (!pipelineId) {
      return { snapshots: [], avgMape: null };
    }

    return this.forecastService.getAccuracy(tenantId, pipelineId);
  }
}
