import { Module } from '@nestjs/common';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';
import { EmailDriverFactory } from './driver.factory';

// IMAP sub-services (required for facade DI)
import { ImapConnectionPoolService } from './imap/services/imap-connection-pool.service';
import { ImapFolderService } from './imap/services/imap-folder.service';
import { ImapMessageService } from './imap/services/imap-message.service';
import { ImapIdleService } from './imap/services/imap-idle.service';
import { ImapSendService } from './imap/services/imap-send.service';

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
 * - IMAPDriver: Generic IMAP/SMTP driver (facade over sub-services)
 *
 * Note: Rate limiting and circuit breaker are handled by:
 * - RedisCircuitBreakerService (common/services)
 * - RedisRateLimitService (common/services)
 */
@Module({
  providers: [
    // IMAP sub-services (must be registered before IMAPDriver)
    ImapConnectionPoolService,
    ImapFolderService,
    ImapMessageService,
    ImapIdleService,
    ImapSendService,

    // Drivers
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
    // Export sub-services for testing
    ImapConnectionPoolService,
    ImapFolderService,
    ImapMessageService,
    ImapIdleService,
    ImapSendService,
  ],
})
export class DriversModule {}
