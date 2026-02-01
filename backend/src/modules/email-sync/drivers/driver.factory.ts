import { Injectable } from '@nestjs/common';
import { IEmailDriver, DriverCredentials } from './interfaces/email-driver.interface';
import { ProviderType } from './interfaces/canonical.types';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';

/**
 * Email Driver Factory
 *
 * Creates and manages email driver instances for different providers.
 * Provides a unified way to get connected drivers for email operations.
 *
 * Usage:
 * ```typescript
 * const driver = await factory.createConnectedDriver('google', credentials);
 * ```
 */
@Injectable()
export class EmailDriverFactory {
  constructor(
    private readonly googleDriver: GoogleDriver,
    private readonly microsoftDriver: MicrosoftDriver,
    private readonly imapDriver: IMAPDriver,
  ) {}

  /**
   * Create a new driver instance for the given provider type.
   * Note: The driver is NOT connected - call connect() manually.
   *
   * All drivers (Google, Microsoft, IMAP) are now facades requiring
   * DI-injected sub-services. Return the injected instances - state
   * is managed per-connection (credentials stored, services initialized).
   *
   * @param providerType Provider type (google, microsoft, imap)
   * @returns Driver instance
   */
  createDriver(providerType: ProviderType): IEmailDriver {
    switch (providerType) {
      case 'google':
        // GoogleDriver facade requires DI-injected sub-services
        // (GmailMessageService, GmailSendService, GmailSyncService)
        return this.googleDriver;

      case 'microsoft':
        // MicrosoftDriver facade requires DI-injected sub-services
        // (MicrosoftMessageService, MicrosoftSendService, MicrosoftSyncService)
        return this.microsoftDriver;

      case 'imap':
        // IMAP driver is a facade requiring DI-injected sub-services
        // Return the injected instance - state is managed per-connection
        return this.imapDriver;

      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  /**
   * Create and connect a driver in one step.
   *
   * @param providerType Provider type
   * @param credentials Authentication credentials
   * @returns Connected driver instance
   */
  async createConnectedDriver(
    providerType: ProviderType,
    credentials: DriverCredentials,
  ): Promise<IEmailDriver> {
    const driver = this.createDriver(providerType);
    await driver.connect(credentials);
    return driver;
  }
}
