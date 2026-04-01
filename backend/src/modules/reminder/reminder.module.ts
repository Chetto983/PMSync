import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ReminderController } from './controllers/reminder.controller';
import { ReminderService } from './services/reminder.service';
import { ReminderAiParserService } from './services/reminder-ai-parser.service';
import { ReminderAlertSchedulerService } from './services/reminder-alert-scheduler.service';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [ReminderController],
  providers: [ReminderAiParserService, ReminderService, ReminderAlertSchedulerService],
  exports: [ReminderService],
})
export class ReminderModule {}
