import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AiModule } from '../ai/ai.module';
import { ReminderModule } from '../reminder/reminder.module';
import { EmailSyncModule } from '../email-sync/email-sync.module';
import { NBAModule } from '../crm/nba/nba.module';
import { ForecastingModule } from '../crm/forecasting/forecasting.module';
import { GovernanceModule } from '../crm/governance/governance.module';
import { AiChatController } from './controllers/ai-chat.controller';
import { AiChatService } from './services/ai-chat.service';
import { ConversationService } from './services/conversation.service';
import { PiiDetectionService } from '../ai/guards/pii-detection-sentinel.service';
import { PiiResolutionService } from '../ai/guards/pii-resolution.service';
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';
import {
  EmailToolsService,
  CalendarToolsService,
  ContactToolsService,
  FolderToolsService,
  RagToolsService,
  ConversationToolsService,
  SandboxToolsService,
  EmailProductivityToolsService,
  FollowUpToolsService,
  ReminderToolsService,
  CrmToolsService,
  CrmIntelligenceToolsService,
} from './tools/index';
import { ChatEnrichmentService } from './services/chat-enrichment.service';
import { SandboxService } from './services/sandbox.service';
import { MemoryService } from './services/memory.service';
import { HybridSearchService } from './services/hybrid-search.service';
import { QueryRouterService } from './services/query-router.service';
import { RerankingService } from './services/reranking.service';
import { GraphExpansionService } from './services/graph-expansion.service';
import { EntityGraphService } from './services/entity-graph.service';
import { ContextAssemblyService } from './services/context-assembly.service';

/**
 * AiChatModule -- Streaming AI chat with conversation persistence.
 *
 * AI chat module (VoltAgent pipeline removed in Phase 23).
 * OpenRouterModule is @Global() so no import needed for OpenRouterProviderService.
 * CacheModule is @Global() so no import needed for CacheService (used by PiiResolutionService).
 * ToolRegistryModule is @Global() so no import needed for TOOL_REGISTRY_SERVICE.
 *
 * Phase 32: Removed circular-ref wrappers from domain module imports.
 *           Tools are now discovered via ToolRegistryService (domain modules
 *           self-register via OnModuleInit). Direct imports kept for DI resolution.
 */
@Module({
  imports: [
    PrismaModule,
    ComplianceModule, // ConsentGuard, ConsentEnforcementService
    SubscriptionModule, // QuotaGuard, UsageTrackingService, CostProtectionService
    AuditModule, // AuditService
    // Phase 32: Direct imports (no circular-ref wrappers) -- domain modules for ToolsService DI
    EmailModule, // EmailSearchService, EmailCrudService, EmailSendService, etc.
    EmailSyncModule, // FolderOperationsQueueService for provider-backed folder mutations
    CalendarModule, // CalendarEventsService
    ContactsModule, // ContactsService
    AiModule, // EmbeddingsService, KnowledgeBaseService
    ReminderModule, // ReminderService (for AI reminder tools)
    NBAModule, // Sprint 13: NBAService for AI chat tool
    ForecastingModule, // Sprint 14.1: ForecastService for AI forecast tool
    GovernanceModule, // Sprint 14.1: GovernanceService + ModelRetrainService for AI tools
  ],
  controllers: [AiChatController],
  providers: [
    AiChatService,
    ConversationService,
    // PII services not in any module yet -- registered directly
    PiiDetectionService,
    PiiResolutionService,
    RedisRateLimiterService,
    // Phase 25: Tool services (AI SDK adapter layer with PII closures)
    EmailToolsService,
    CalendarToolsService,
    ContactToolsService,
    FolderToolsService,
    RagToolsService,
    // Phase AI-AUDIT: Conversation + sandbox tools
    ConversationToolsService,
    SandboxToolsService,
    // Phase 87: Split productivity tools into focused services
    EmailProductivityToolsService,
    FollowUpToolsService,
    // Phase REMINDER: Smart follow-up reminder tools
    ReminderToolsService,
    // Sprint 10: CRM deal tools (getDealsByPipeline, moveDealStage, getDealTimeline)
    CrmToolsService,
    // Sprint 14.1: CRM intelligence tools (lead scoring, forecast, churn, governance)
    CrmIntelligenceToolsService,
    // Phase 87: Extracted enrichment service (title, summary, runtime context)
    ChatEnrichmentService,
    SandboxService,
    MemoryService,
    // Phase 25 Plan 03: Hybrid search (vector + FTS)
    HybridSearchService,
    // Graph RAG Step 1: Query complexity router
    QueryRouterService,
    // Graph RAG Step 2: Heuristic reranking
    RerankingService,
    // Graph RAG Step 3: Graph-aware context expansion
    GraphExpansionService,
    // Phase 109: Entity graph + context assembly (Graph RAG pipeline)
    EntityGraphService,
    ContextAssemblyService,
  ],
  exports: [AiChatService, ConversationService, PiiResolutionService],
})
export class AiChatModule {}
