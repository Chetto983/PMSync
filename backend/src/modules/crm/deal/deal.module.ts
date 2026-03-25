import { Module } from '@nestjs/common';
import { DealController } from './controllers/deal.controller';
import { DealService } from './services/deal.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [PrismaModule, RealtimeModule, AutomationModule],
  controllers: [DealController],
  providers: [DealService],
  exports: [DealService],
})
export class DealModule {}
