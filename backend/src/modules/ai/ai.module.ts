import { Module, forwardRef } from '@nestjs/common';
import { MistralService } from './services/mistral.service';
import { AiController } from './controllers/ai.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmbeddingsService } from './services/embeddings.service';
import { KnowledgeBaseService } from './services/knowledge-base.service';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller';
import { PersonalizationController } from './controllers/personalization.controller';
import { EmailEmbeddingQueueService } from './services/email-embedding.queue';
import { AgentService } from './services/agent.service';
import { ChatSessionService } from './services/chat-session.service';
import { EmailInsightsService } from './services/email-insights.service';
import { QueryEmbeddingCacheService } from './services/query-embedding-cache.service';
import { AttachmentContentExtractorService } from './services/attachment-content-extractor.service';
import { PersonalizationService } from './services/personalization.service';
import { EmailModule } from '../email/email.module';
import { MultiAgentModule } from './multi-agent/multi-agent.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => EmailModule), // For StorageService (attachment downloads)
    forwardRef(() => MultiAgentModule), // Intelligent Secretary multi-agent system
  ],
  providers: [
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    AgentService,
    ChatSessionService,
    EmailInsightsService,
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    PersonalizationService,
  ],
  controllers: [AiController, KnowledgeBaseController, PersonalizationController],
  exports: [
    MistralService,
    EmbeddingsService,
    KnowledgeBaseService,
    EmailEmbeddingQueueService,
    AgentService,
    ChatSessionService,
    EmailInsightsService,
    QueryEmbeddingCacheService,
    AttachmentContentExtractorService,
    PersonalizationService,
    MultiAgentModule, // Export for other modules to use multi-agent services
  ],
})
export class AiModule {}
