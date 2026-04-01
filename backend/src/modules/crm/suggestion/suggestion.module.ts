import { Module } from '@nestjs/common';
import { SuggestionController } from './controllers/suggestion.controller';
import { CrmSuggestionService } from './services/crm-suggestion.service';
import { CrmSuggestionTriggerService } from './services/crm-suggestion-trigger.service';
import { ContactAccountLinkerService } from './services/contact-account-linker.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuggestionController],
  providers: [CrmSuggestionService, CrmSuggestionTriggerService, ContactAccountLinkerService],
  exports: [CrmSuggestionService, CrmSuggestionTriggerService, ContactAccountLinkerService],
})
export class SuggestionModule {}
