import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AiModule } from '../ai/ai.module';
import { AiChatController } from './controllers/ai-chat.controller';
import { HitlController } from './controllers/hitl.controller';
import { AiChatService } from './services/ai-chat.service';
import { ConversationService } from './services/conversation.service';
import { HitlService } from './services/hitl.service';
import { PiiDetectionService } from '../ai/guards/pii-detection-sentinel.service';
import { PiiResolutionService } from '../ai/guards/pii-resolution.service';
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';
import {
  EmailToolsService,
  CalendarToolsService,
  ContactToolsService,
  FolderToolsService,
  RagToolsService,
} from './tools/index';
import { IntentRouterService } from './tools/intent-router.service';
import { MemoryService } from './services/memory.service';
import { HybridSearchService } from './services/hybrid-search.service';

/**
 * AiChatModule -- Streaming AI chat with conversation persistence.
 *
 * Replaces the old VoltAgent chat pipeline (deleted in Phase 23).
 * MistralModule is @Global() so no import needed for MistralProviderService.
 * CacheModule is @Global() so no import needed for CacheService (used by PiiResolutionService).
 *
 * Phase 25: Added domain module imports (forwardRef for circular deps)
 *           and 5 ToolsService classes for tool execution.
 */
@Module({
  imports: [
    PrismaModule,
    ComplianceModule, // ConsentGuard, ConsentEnforcementService
    SubscriptionModule, // QuotaGuard, UsageTrackingService, CostProtectionService
    AuditModule, // AuditService
    // Phase 25: Domain modules for tool execution
    forwardRef(() => EmailModule), // EmailSearchService, EmailCrudService, EmailSendService, etc.
    forwardRef(() => CalendarModule), // CalendarEventsService
    forwardRef(() => ContactsModule), // ContactsService
    forwardRef(() => AiModule), // EmbeddingsService, KnowledgeBaseService
  ],
  controllers: [AiChatController, HitlController],
  providers: [
    AiChatService,
    ConversationService,
    HitlService,
    // PII services not in any module yet -- registered directly
    PiiDetectionService,
    PiiResolutionService,
    RedisRateLimiterService,
    // Phase 25: Tool services
    EmailToolsService,
    CalendarToolsService,
    ContactToolsService,
    FolderToolsService,
    RagToolsService,
    // Phase 25 Plan 02: Intent routing + memory
    IntentRouterService,
    MemoryService,
    // Phase 25 Plan 03: Hybrid search (vector + FTS)
    HybridSearchService,
  ],
  exports: [AiChatService, ConversationService, HitlService],
})
export class AiChatModule {}
