import { Module } from '@nestjs/common';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';
import { EmailDriverFactory } from './driver.factory';

// Gmail sub-services (Phase 5 Waves 1-3)
import { GmailMessageService } from './google/services/gmail-message.service';
import { GmailSendService } from './google/services/gmail-send.service';
import { GmailSyncService } from './google/services/gmail-sync.service';

// Microsoft sub-services (Phase 5 Waves 1-3)
import { MicrosoftMessageService } from './microsoft/services/microsoft-message.service';
import { MicrosoftSendService } from './microsoft/services/microsoft-send.service';
import { MicrosoftSyncService } from './microsoft/services/microsoft-sync.service';

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
 * - GoogleDriver: Gmail API driver (facade pattern - will use sub-services in Phase 5 Plan 04)
 * - MicrosoftDriver: Microsoft Graph API driver (facade pattern - will use sub-services in Phase 5 Plan 04)
 * - IMAPDriver: Generic IMAP/SMTP driver (facade over sub-services)
 *
 * Sub-services (Phase 5 Waves 1-3 - extracted, not yet wired to drivers):
 * - GmailMessageService: Gmail message operations (Wave 1)
 * - GmailSendService: Gmail send/draft/move/delete operations (Wave 2)
 * - GmailSyncService: Gmail delta sync operations (Wave 3)
 * - MicrosoftMessageService: Microsoft Graph message operations (Wave 1)
 * - MicrosoftSendService: Microsoft Graph send/draft/move/delete operations (Wave 2)
 * - MicrosoftSyncService: Microsoft Graph delta sync operations (Wave 3)
 *
 * Note: Rate limiting and circuit breaker are handled by:
 * - RedisCircuitBreakerService (common/services)
 * - RedisRateLimitService (common/services)
 */
@Module({
  providers: [
    // Gmail sub-services (Phase 5 Waves 1-3 - must be registered before GoogleDriver)
    GmailMessageService,
    GmailSendService,
    GmailSyncService,

    // Microsoft sub-services (Phase 5 Waves 1-3 - must be registered before MicrosoftDriver)
    MicrosoftMessageService,
    MicrosoftSendService,
    MicrosoftSyncService,

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
    GmailMessageService,
    GmailSendService,
    GmailSyncService,
    MicrosoftMessageService,
    MicrosoftSendService,
    MicrosoftSyncService,
    ImapConnectionPoolService,
    ImapFolderService,
    ImapMessageService,
    ImapIdleService,
    ImapSendService,
  ],
})
export class DriversModule {}
