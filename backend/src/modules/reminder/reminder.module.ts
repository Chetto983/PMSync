import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ReminderController } from './controllers/reminder.controller';
import { ReminderService } from './services/reminder.service';
import { ReminderAiParserService } from './services/reminder-ai-parser.service';

@Module({
  imports: [PrismaModule, AiModule, forwardRef(() => TelegramModule)],
  controllers: [ReminderController],
  providers: [ReminderAiParserService, ReminderService],
  exports: [ReminderService],
})
export class ReminderModule {}
