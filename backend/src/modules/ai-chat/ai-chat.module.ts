import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuditModule } from '../audit/audit.module';
import { AiChatController } from './controllers/ai-chat.controller';
import { HitlController } from './controllers/hitl.controller';
import { AiChatService } from './services/ai-chat.service';
import { ConversationService } from './services/conversation.service';
import { HitlService } from './services/hitl.service';
import { PiiDetectionService } from '../ai/guards/pii-detection-sentinel.service';
import { PiiResolutionService } from '../ai/guards/pii-resolution.service';
import { RedisRateLimiterService } from '../../common/services/redis-rate-limiter.service';

/**
 * AiChatModule -- Streaming AI chat with conversation persistence.
 *
 * Replaces the old VoltAgent chat pipeline (deleted in Phase 23).
 * MistralModule is @Global() so no import needed for MistralProviderService.
 * CacheModule is @Global() so no import needed for CacheService (used by PiiResolutionService).
 *
 * Plan 02: Added cross-cutting concerns (PII, audit, consent, rate limiting, HITL).
 *
 * Phase 24: Backend Core Pipeline
 */
@Module({
  imports: [
    PrismaModule,
    ComplianceModule, // ConsentGuard, ConsentEnforcementService
    SubscriptionModule, // QuotaGuard, UsageTrackingService, CostProtectionService
    AuditModule, // AuditService
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
  ],
  exports: [AiChatService, ConversationService, HitlService],
})
export class AiChatModule {}
