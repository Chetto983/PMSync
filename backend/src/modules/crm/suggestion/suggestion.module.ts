import { Module } from '@nestjs/common';
import { SuggestionController } from './controllers/suggestion.controller';
import { CrmSuggestionService } from './services/crm-suggestion.service';
import { CrmSuggestionTriggerService } from './services/crm-suggestion-trigger.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuggestionController],
  providers: [CrmSuggestionService, CrmSuggestionTriggerService],
  exports: [CrmSuggestionService, CrmSuggestionTriggerService],
})
export class SuggestionModule {}
