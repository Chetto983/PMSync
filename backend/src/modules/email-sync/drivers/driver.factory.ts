import { Injectable, Logger } from '@nestjs/common';
import { IEmailDriver, DriverCredentials } from './interfaces/email-driver.interface';
import { ProviderType } from './interfaces/canonical.types';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';

/**
 * Email Driver Factory
 *
 * Creates and manages email driver instances for different providers.
 * Provides a unified way to get connected drivers for email operations.
 *
 * Usage:
 * ```typescript
 * // Get a new driver instance
 * const driver = factory.createDriver('google');
 * await driver.connect(credentials);
 *
 * // Or get a connected driver directly
 * const connectedDriver = await factory.createConnectedDriver('microsoft', credentials);
 * ```
 */
@Injectable()
export class EmailDriverFactory {
  private readonly logger = new Logger(EmailDriverFactory.name);

  constructor(
    private readonly googleDriver: GoogleDriver,
    private readonly microsoftDriver: MicrosoftDriver,
  ) {}

  /**
   * Create a new driver instance for the given provider type.
   * Note: The driver is NOT connected - call connect() manually.
   *
   * @param providerType Provider type (google, microsoft, imap)
   * @returns New driver instance
   */
  createDriver(providerType: ProviderType): IEmailDriver {
    switch (providerType) {
      case 'google':
        // Return a new instance to avoid state conflicts
        return new GoogleDriver();

      case 'microsoft':
        return new MicrosoftDriver();

      case 'imap':
        throw new Error('IMAP driver not yet implemented');

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

  /**
   * Get the singleton driver instance for a provider type.
   * Use this when you want to reuse the same driver instance.
   * Note: You must call connect() if not already connected.
   *
   * @param providerType Provider type
   * @returns Singleton driver instance
   */
  getDriver(providerType: ProviderType): IEmailDriver {
    switch (providerType) {
      case 'google':
        return this.googleDriver;

      case 'microsoft':
        return this.microsoftDriver;

      case 'imap':
        throw new Error('IMAP driver not yet implemented');

      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  /**
   * Check if a provider type is supported.
   *
   * @param providerType Provider type to check
   * @returns true if supported
   */
  isSupported(providerType: string): boolean {
    return ['google', 'microsoft'].includes(providerType);
  }

  /**
   * Get list of supported provider types.
   *
   * @returns Array of supported provider types
   */
  getSupportedProviders(): ProviderType[] {
    return ['google', 'microsoft'];
  }
}
