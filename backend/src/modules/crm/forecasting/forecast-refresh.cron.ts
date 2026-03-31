import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ForecastService } from './forecast.service';
import { ScheduledJobsQueueService, ScheduledJobType } from '../../../common/services/scheduled-jobs.queue';

/**
 * Weekly cron job to refresh forecast snapshots for all active pipelines.
 * Runs every Sunday at 02:00 UTC.
 */
@Injectable()
export class ForecastRefreshCron implements OnModuleInit {
  private readonly logger = new Logger(ForecastRefreshCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecastService: ForecastService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
  ) {}

  onModuleInit() {
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.FORECAST_REFRESH,
      async () => this.refreshAllForecasts(),
    );
  }

  async refreshAllForecasts(): Promise<void> {
    this.logger.log('Starting weekly forecast refresh...');

    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });

      let totalSnapshots = 0;
      let totalActuals = 0;

      for (const tenant of tenants) {
        const pipelines = await this.prisma.crmPipeline.findMany({
          where: {
            tenantId: tenant.id,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true },
        });

        for (const pipeline of pipelines) {
          try {
            // Update actuals on past snapshots
            const actualsUpdated = await this.forecastService.updateActuals(
              tenant.id,
              pipeline.id,
            );
            totalActuals += actualsUpdated;

            // Generate and save new forecast
            const result = await this.forecastService.getForecast(
              tenant.id,
              pipeline.id,
              'quarter',
            );

            const saved = await this.forecastService.saveSnapshot(
              tenant.id,
              pipeline.id,
              'quarter',
              result.forecasts,
            );
            totalSnapshots += saved;
          } catch (err) {
            this.logger.warn(
              `Failed to refresh forecast for pipeline ${pipeline.id} (tenant ${tenant.name}): ${err}`,
            );
          }
        }
      }

      this.logger.log(
        `Forecast refresh complete: ${totalSnapshots} snapshots saved, ${totalActuals} actuals updated across ${tenants.length} tenants`,
      );
    } catch (err) {
      this.logger.error('Forecast refresh cron failed', err);
    }
  }
}
