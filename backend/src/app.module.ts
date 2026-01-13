import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { getConfiguration } from './config/configuration';
import { validate } from './config/env.validation';
import aiConfig from './config/ai.config';
import { pinoLoggerConfig } from './config/logger.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { LogRotationService } from './common/services/log-rotation.service';
import { CacheModule } from './common/services/cache.module';
import { ScheduledJobsModule } from './common/services/scheduled-jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { EmailModule } from './modules/email/email.module';
import { AiModule } from './modules/ai/ai.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { EmailSyncModule } from './modules/email-sync/email-sync.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { LabelsModule } from './modules/labels/labels.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
// NOTE: AnalyticsModule removed - unused, voltagent analytics.service.ts is the active one

const config = getConfiguration();

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
    // Rate limiting: configurable defaults to keep protection but avoid false positives
    ThrottlerModule.forRoot([
      {
        ttl: config.rateLimit.ttlMs,
        limit: config.rateLimit.limit,
      },
    ]),
    CacheModule, // Redis-based caching for horizontal scaling
    ScheduledJobsModule, // BullMQ-based scheduled jobs for horizontal scaling
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    EmailModule,
    AiModule,
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
    // Apply response time logging globally
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTimeInterceptor,
    },
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
