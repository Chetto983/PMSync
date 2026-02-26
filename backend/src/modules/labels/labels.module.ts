import { Module, forwardRef } from '@nestjs/common';
import { LabelsController } from './controllers/labels.controller';
import { LabelsService } from './services/labels.service';
import { EmailModule } from '../email/email.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [forwardRef(() => EmailModule), RealtimeModule],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
