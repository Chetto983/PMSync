import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { DealAggregationService } from './deal-aggregation.service';
import { ForecastService } from './forecast.service';
import { ForecastController } from './forecast.controller';
import { ForecastRefreshCron } from './forecast-refresh.cron';

@Module({
  imports: [PrismaModule],
  controllers: [ForecastController],
  providers: [DealAggregationService, ForecastService, ForecastRefreshCron],
  exports: [DealAggregationService, ForecastService],
})
export class ForecastingModule {}
