import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { DealAggregationService } from './deal-aggregation.service';

@Module({
  imports: [PrismaModule],
  providers: [DealAggregationService],
  exports: [DealAggregationService],
})
export class ForecastingModule {}
