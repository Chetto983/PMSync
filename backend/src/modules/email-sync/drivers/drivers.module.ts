import { Module } from '@nestjs/common';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';
import { EmailDriverFactory } from './driver.factory';

/**
 * Email Drivers Module
 *
 * Provides email driver implementations for different providers.
 * All drivers implement the IEmailDriver interface for unified operations.
 *
 * Exports:
 * - EmailDriverFactory: Factory to create/get driver instances
 * - GoogleDriver: Gmail API driver
 * - MicrosoftDriver: Microsoft Graph API driver
 * - IMAPDriver: Generic IMAP/SMTP driver
 *
 * Note: Rate limiting and circuit breaker are handled by:
 * - RedisCircuitBreakerService (common/services)
 * - RedisRateLimitService (common/services)
 */
@Module({
  providers: [
    GoogleDriver,
    MicrosoftDriver,
    IMAPDriver,
    EmailDriverFactory,
  ],
  exports: [
    EmailDriverFactory,
    GoogleDriver,
    MicrosoftDriver,
    IMAPDriver,
  ],
})
export class DriversModule {}
