import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { validate } from './config/env.validation';
import aiConfig from './config/ai.config';
import { pinoLoggerConfig } from './config/logger.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { AuditLogInterceptor } from './modules/audit/interceptors/audit-log.interceptor';
import { LogRotationService } from './common/services/log-rotation.service';
import { CacheModule } from './common/services/cache.module';
import { ScheduledJobsModule } from './common/services/scheduled-jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { EmailModule } from './modules/email/email.module';
import { TransactionalEmailModule } from './modules/email/transactional-email.module';
import { AiModule } from './modules/ai/ai.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { EmailSyncModule } from './modules/email-sync/email-sync.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { LegalAcceptanceGuard } from './modules/compliance/guards/legal-acceptance.guard';
import { ConsentGuard } from './modules/compliance/guards/consent.guard';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { LabelsModule } from './modules/labels/labels.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { MistralModule } from './modules/mistral/mistral.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
import { ToolRegistryModule } from './common/modules/tool-registry/tool-registry.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { HttpMetricsInterceptor } from './common/metrics/http-metrics.interceptor';
// NOTE: AnalyticsModule removed - unused, voltagent analytics.service.ts is the active one

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
      load: [aiConfig], // P11: Load namespaced AI config (ai.batch.*, ai.mistral.*, etc.)
      validate, // Validate environment variables at startup
    }),
    // Pino Logger - Structured logging con rotazione FIFO 2 giorni
    LoggerModule.forRoot(pinoLoggerConfig),
    // Schedule Module - Per cron job di rotazione log
    ScheduleModule.forRoot(),
    // Phase 31: In-process event bus for domain event decoupling (Phase 32)
    EventEmitterModule.forRoot(),
    // Rate limiting: dual tiers for read (100/min) and write (30/min) operations (SEC-05)
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',
          ttl: 60000, // 1 minute
          limit: 100, // 100 req/min for read operations (default)
        },
        {
          name: 'write',
          ttl: 60000, // 1 minute
          limit: 30, // 30 req/min for write operations
        },
      ],
    }),
    MistralModule, // @Global() - provides MistralProviderService to all modules
    CacheModule, // Redis-based caching for horizontal scaling
    ScheduledJobsModule, // BullMQ-based scheduled jobs for horizontal scaling
    PrismaModule,
    // Phase 46: @Global() Prometheus metrics -- /metrics endpoint + metric providers
    MetricsModule,
    // Phase 32: @Global() tool registry -- must load before domain modules
    ToolRegistryModule,
    TransactionalEmailModule, // Phase 45-03: @Global() nodemailer service (before AuthModule)
    AuthModule,
    UsersModule,
    TenantsModule,
    EmailModule,
    AiModule,
    AiChatModule, // Phase 24: Streaming AI chat with conversation persistence
    HealthModule,
    AuditModule,
    ProvidersModule,
    EmailSyncModule,
    ComplianceModule,
    CalendarModule,
    ContactsModule,
    RealtimeModule, // WebSocket Gateway per eventi realtime multi-tenant
    LabelsModule,
    SubscriptionModule, // P10: Billing & subscription management with Autumn
  ],
  providers: [
    // Apply throttler globally to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // LEGAL-01/02: Block users who haven't accepted TOS/Privacy Policy
    {
      provide: APP_GUARD,
      useClass: LegalAcceptanceGuard,
    },
    // CONS-02: Block AI processing without consent
    {
      provide: APP_GUARD,
      useClass: ConsentGuard,
    },
    // Phase 33: Wrap all responses in { data, meta } envelope (outermost interceptor)
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    // Apply response time logging globally
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTimeInterceptor,
    },
    // AUDIT-01: Auto-log all authenticated HTTP data access events
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    // Phase 46: Record HTTP request duration and in-flight count for Prometheus
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
    // Phase 33: ThrottlerExceptionFilter absorbed into ApiExceptionFilter (registered globally in main.ts)
    // Log rotation service - gestione FIFO 2 giorni
    LogRotationService,
  ],
  controllers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply request ID middleware to all routes
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
