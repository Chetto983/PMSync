import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiChatController } from './controllers/ai-chat.controller';
import { AiChatService } from './services/ai-chat.service';
import { ConversationService } from './services/conversation.service';

/**
 * AiChatModule -- Streaming AI chat with conversation persistence.
 *
 * Replaces the old VoltAgent chat pipeline (deleted in Phase 23).
 * MistralModule is @Global() so no import needed for MistralProviderService.
 *
 * Phase 24: Backend Core Pipeline
 */
@Module({
  imports: [PrismaModule],
  controllers: [AiChatController],
  providers: [AiChatService, ConversationService],
  exports: [AiChatService, ConversationService],
})
export class AiChatModule {}
