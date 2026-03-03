import { Module } from '@nestjs/common';
import { LabelsController } from './controllers/labels.controller';
import { LabelsService } from './services/labels.service';
import { EmailModule } from '../email/email.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * LabelsModule - Email label management.
 *
 * Phase 32: Changed forwardRef(() => EmailModule) to direct import.
 * EmailModule does NOT import LabelsModule, so no circular dependency exists.
 */
@Module({
  imports: [EmailModule, RealtimeModule],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
