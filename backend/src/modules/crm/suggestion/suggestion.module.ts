import { Module } from '@nestjs/common';
import { SuggestionController } from './controllers/suggestion.controller';
import { CrmSuggestionService } from './services/crm-suggestion.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuggestionController],
  providers: [CrmSuggestionService],
  exports: [CrmSuggestionService],
})
export class SuggestionModule {}
