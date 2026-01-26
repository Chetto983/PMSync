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
import { SubscriptionModule } from '../../subscription/subscription.module';

// Controllers
import { VoltAgentController } from './voltagent.controller';
import {
  MemoryController,
  FollowUpController,
  AnalyticsController,
  KnowledgeController,
  CrmController,
  SchedulingController,
  ConversationController,
  DocumentLibraryController,
} from './controllers';

// Core services
import { VoltAgentService } from './voltagent.service';
import { HitlService } from './services/hitl.service';
import { ActionExecutorService } from './services/action-executor.service';
import { MistralService } from '../services/mistral.service';
import { EmbeddingsService } from '../services/embeddings.service';

// AI services
import { WritingStyleService } from './services/writing-style.service';
// ModelRouterService removed - VoltAgent 2.x handles model routing natively
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
import { AttentionScoreService } from './services/attention-score.service';
import { CrmBackfillProcessor, ReconnectReminderProcessor } from './jobs';
import { CalendarConflictService } from './services/calendar-conflict.service';
import { FocusTimeService } from './services/focus-time.service';
import { MeetingPrepService } from './services/meeting-prep.service';

// Security & Memory
import { PromptGuardService, PiiDetectionService, PiiResolutionService } from '../guards';
import { AIMemoryService } from './services/ai-memory.service';
import { EpisodicMemoryService } from './services/episodic-memory.service';
import { ConversationManagementService } from './services/conversation-management.service';
import { MemoryIntelligenceService } from './services/memory-intelligence.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { LearningService } from './services/learning.service';

// Chat Processing (Refactored from VoltAgentService 2026-01-22)
import { ChatRequestProcessorService } from './services/chat-request-processor.service';
import { ChatContextBuilderService } from './services/chat-context-builder.service';
import { ChatResponseProcessorService } from './services/chat-response-processor.service';

// Phase 6: Extracted Services (VoltAgentService refactoring)
import { AgentPoolService } from './services/agent-pool.service';
import { AgentMetricsService } from './services/agent-metrics.service';
import { ApprovalWorkflowService } from './services/approval-workflow.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CacheModule,
    RealtimeModule,
    forwardRef(() => EmailModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => EmailSyncModule),
    forwardRef(() => SubscriptionModule),
  ],
  controllers: [
    VoltAgentController,
    MemoryController,
    FollowUpController,
    AnalyticsController,
    KnowledgeController,
    CrmController,
    SchedulingController,
    ConversationController,
    DocumentLibraryController,
  ],
  providers: [
    // Core
    VoltAgentService,
    HitlService,
    ActionExecutorService,
    MistralService,
    EmbeddingsService,
    // AI
    WritingStyleService,
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
    AttentionScoreService,
    CrmBackfillProcessor,
    ReconnectReminderProcessor,
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
    // Security & Memory
    PromptGuardService,
    PiiDetectionService,
    PiiResolutionService,
    AIMemoryService,
    EpisodicMemoryService,
    ConversationManagementService,
    MemoryIntelligenceService,
    AlertingService,
    LearningService,
    // Chat Processing (Refactored from VoltAgentService)
    ChatRequestProcessorService,
    ChatContextBuilderService,
    ChatResponseProcessorService,
    // Phase 6: Extracted Services (VoltAgentService refactoring)
    AgentPoolService,
    AgentMetricsService,
    ApprovalWorkflowService,
  ],
  exports: [
    VoltAgentService,
    HitlService,
    ActionExecutorService,
    WritingStyleService,
    AiQueueService,
    DailyBriefingService,
    FollowUpService,
    AnalyticsService,
    UnifiedKnowledgeService,
    RelationshipIntelligenceService,
    AttentionScoreService,
    CrmBackfillProcessor,
    ReconnectReminderProcessor,
    CalendarConflictService,
    FocusTimeService,
    MeetingPrepService,
    DocumentLibraryService,
    PromptGuardService,
    PiiDetectionService,
    PiiResolutionService,
    AIMemoryService,
    EpisodicMemoryService,
    ConversationManagementService,
    MemoryIntelligenceService,
    LearningService,
    // Phase 6: Extracted Services
    AgentPoolService,
    AgentMetricsService,
    ApprovalWorkflowService,
  ],
})
export class VoltAgentModule { }
