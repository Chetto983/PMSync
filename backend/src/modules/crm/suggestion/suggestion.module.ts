import { Module } from '@nestjs/common';
import { SuggestionController } from './controllers/suggestion.controller';
import { CrmSuggestionService } from './services/crm-suggestion.service';
import { CrmSuggestionTriggerService } from './services/crm-suggestion-trigger.service';
import { ContactAccountLinkerService } from './services/contact-account-linker.service';
import { CalendarActivityLoggerService } from './services/calendar-activity-logger.service';
import { EmailSuggestionGeneratorService } from './services/email-suggestion-generator.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuggestionController],
  providers: [CrmSuggestionService, CrmSuggestionTriggerService, ContactAccountLinkerService, CalendarActivityLoggerService, EmailSuggestionGeneratorService],
  exports: [CrmSuggestionService, CrmSuggestionTriggerService, ContactAccountLinkerService, CalendarActivityLoggerService, EmailSuggestionGeneratorService],
})
export class SuggestionModule {}
