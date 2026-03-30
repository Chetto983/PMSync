import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';
import { LabelConsistencyService } from './services/label-consistency.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { CalendarModule } from '../calendar/calendar.module';
import { QueueHealthService } from '../../common/services/queue-health.service';

@Module({
  imports: [PrismaModule, EmailSyncModule, CalendarModule],
  providers: [HealthService, QueueHealthService, LabelConsistencyService],
  controllers: [HealthController],
  exports: [QueueHealthService],
})
export class HealthModule {}
