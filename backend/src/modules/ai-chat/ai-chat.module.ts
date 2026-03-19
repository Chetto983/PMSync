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
  ProductivityToolsService,
  ReminderToolsService,
} from './tools/index';
import { SandboxService } from './services/sandbox.service';
import { MemoryService } from './services/memory.service';
import { HybridSearchService } from './services/hybrid-search.service';

/**
 * AiChatModule -- Streaming AI chat with conversation persistence.
 *
 * Replaces the old VoltAgent chat pipeline (deleted in Phase 23).
 * MistralModule is @Global() so no import needed for MistralProviderService.
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
    CalendarModule, // CalendarEventsService
    ContactsModule, // ContactsService
    AiModule, // EmbeddingsService, KnowledgeBaseService
    ReminderModule, // ReminderService (for AI reminder tools)
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
    // Phase CONSOLIDATION: Follow-up, label, star, email index tools
    ProductivityToolsService,
    // Phase REMINDER: Smart follow-up reminder tools
    ReminderToolsService,
    SandboxService,
    MemoryService,
    // Phase 25 Plan 03: Hybrid search (vector + FTS)
    HybridSearchService,
  ],
  exports: [AiChatService, ConversationService],
})
export class AiChatModule {}
