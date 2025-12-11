import { Module } from '@nestjs/common';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';
import { EmailDriverFactory } from './driver.factory';
import { ResilienceModule } from './resilience/resilience.module';

/**
 * Email Drivers Module
 *
 * Provides email driver implementations for different providers.
 * All drivers implement the IEmailDriver interface for unified operations.
 *
 * Includes:
 * - ResilienceModule: Retry, rate limiting, circuit breaker for >1000 users
 *
 * Exports:
 * - EmailDriverFactory: Factory to create/get driver instances
 * - GoogleDriver: Gmail API driver
 * - MicrosoftDriver: Microsoft Graph API driver
 * - IMAPDriver: Generic IMAP/SMTP driver
 * - ResilienceModule: Re-exports ResilienceService
 */
@Module({
  imports: [ResilienceModule],
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
    ResilienceModule, // Re-export the module so ResilienceService is available to consumers
  ],
})
export class DriversModule {}
