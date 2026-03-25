import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { StageAutomationService } from './stage-automation.service';
import { StageAutomationWorker } from './stage-automation.worker';

@Module({
  imports: [PrismaModule, RealtimeModule],
  providers: [StageAutomationService, StageAutomationWorker],
  exports: [StageAutomationService],
})
export class AutomationModule {}
