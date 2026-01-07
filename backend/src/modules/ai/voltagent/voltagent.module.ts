/**
 * VoltAgent Module - AI Agent orchestration with RAG and memory
 */
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../../../common/services/cache.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CalendarModule } from '../../calendar/calendar.module';
import { EmailModule } from '../../email/email.module';
import { EmailSyncModule } from '../../email-sync/email-sync.module';
import { RealtimeModule } from '../../realtime/realtime.module';

// Controllers
import { VoltAgentController } from './voltagent.controller';
import { DocumentLibraryController } from './controllers/document-library.controller';

// Core services
import { VoltAgentService } from './voltagent.service';
import { HitlService } from './services/hitl.service';
import { ActionExecutorService } from './services/action-executor.service';
import { MistralService } from '../services/mistral.service';
import { EmbeddingsService } from '../services/embeddings.service';

// AI services
import { WritingStyleService } from './services/writing-style.service';
import { ModelRouterService } from './services/model-router.service';
import { AiQueueService } from './services/ai-queue.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { MistralBatchService } from './services/mistral-batch.service';
import { DailyBriefingService } from './services/daily-briefing.service';
import { FollowUpService } from './services/follow-up.service';
import { AnalyticsService } from './services/analytics.service';
import { UnifiedKnowledgeService } from './services/unified-knowledge.service';
import { DocumentLibraryService } from './services/document-library.service';

// CRM & Scheduling
import { RelationshipIntelligenceService } from './services/relationship-intelligence.service';
import { CrmBackfillProcessor, ReconnectReminderProcessor } from './jobs';
import { CalendarConflictService } from './services/calendar-conflict.service';
import { FocusTimeService } from './services/focus-time.service';
import { MeetingPrepService } from './services/meeting-prep.service';

// Security & Memory
import { PromptGuardService, PiiDetectionService } from '../guards';
import { AIMemoryService } from './services/ai-memory.service';
import { EpisodicMemoryService } from './services/episodic-memory.service';
import { ConversationCompactionService } from './services/conversation-compaction.service';
import { ConversationManagementService } from './services/conversation-management.service';
import { MemoryIntelligenceService } from './services/memory-intelligence.service';
import { AlertingService } from '../../../common/services/alerting.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CacheModule,
    RealtimeModule,
    forwardRef(() => EmailModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => EmailSyncModule),
  ],
  controllers: [VoltAgentController, DocumentLibraryController],
  providers: [
    // Core
    VoltAgentService,
    HitlService,
    ActionExecutorService,
    MistralService,
    EmbeddingsService,
    // AI
    WritingStyleService,
    ModelRouterService,
    AiQueueService,
    RateLimiterService,
    MistralBatchService,
    DailyBriefingService,
    FollowUpService,
    AnalyticsService,
    UnifiedKnowledgeService,
    DocumentLibraryService,
    // CRM & Scheduling
    RelationshipIntelligenceService,
    CrmBackfillProcessor,
    ReconnectReminderProcessor,
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
    // Security & Memory
    PromptGuardService,
    PiiDetectionService,
    AIMemoryService,
    EpisodicMemoryService,
    ConversationCompactionService,
    ConversationManagementService,
    MemoryIntelligenceService,
    AlertingService,
  ],
  exports: [
    VoltAgentService,
    HitlService,
    ActionExecutorService,
    WritingStyleService,
    ModelRouterService,
    AiQueueService,
    DailyBriefingService,
    FollowUpService,
    AnalyticsService,
    UnifiedKnowledgeService,
    RelationshipIntelligenceService,
    CrmBackfillProcessor,
    ReconnectReminderProcessor,
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
    DocumentLibraryService,
    PromptGuardService,
    PiiDetectionService,
    AIMemoryService,
    EpisodicMemoryService,
    ConversationCompactionService,
    ConversationManagementService,
    MemoryIntelligenceService,
  ],
})
export class VoltAgentModule { }
