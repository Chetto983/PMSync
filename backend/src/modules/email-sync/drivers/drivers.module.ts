import { Module } from '@nestjs/common';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
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
 */
@Module({
  providers: [
    GoogleDriver,
    MicrosoftDriver,
    EmailDriverFactory,
  ],
  exports: [
    EmailDriverFactory,
    GoogleDriver,
    MicrosoftDriver,
  ],
})
export class DriversModule {}
