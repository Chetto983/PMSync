import { Injectable, Logger, Optional } from '@nestjs/common';
import { IEmailDriver, DriverCredentials } from './interfaces/email-driver.interface';
import { ProviderType } from './interfaces/canonical.types';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';
import { ResilienceService } from './resilience/resilience.service';
import { ResilientDriverWrapper } from './resilience/resilient-driver.wrapper';
import { ResilienceConfig } from './resilience/resilience.types';

/**
 * Email Driver Factory
 *
 * Creates and manages email driver instances for different providers.
 * Provides a unified way to get connected drivers for email operations.
 *
 * Features:
 * - Standard drivers for direct API access
 * - Resilient drivers with retry, rate limiting, and circuit breaker (recommended for production)
 *
 * Usage:
 * ```typescript
 * // Get a new driver instance (basic)
 * const driver = factory.createDriver('google');
 * await driver.connect(credentials);
 *
 * // Get a resilient driver (recommended for production)
 * const driver = await factory.createResilientDriver('google', 'account-123', credentials);
 * // Includes: retry with backoff, rate limiting, circuit breaker
 * ```
 */
@Injectable()
export class EmailDriverFactory {
  private readonly logger = new Logger(EmailDriverFactory.name);

  constructor(
    private readonly googleDriver: GoogleDriver,
    private readonly microsoftDriver: MicrosoftDriver,
    private readonly imapDriver: IMAPDriver,
    @Optional() private readonly resilienceService?: ResilienceService,
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
        return new IMAPDriver();

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
        return this.imapDriver;

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
    return ['google', 'microsoft', 'imap'].includes(providerType);
  }

  /**
   * Get list of supported provider types.
   *
   * @returns Array of supported provider types
   */
  getSupportedProviders(): ProviderType[] {
    return ['google', 'microsoft', 'imap'];
  }

  // ============================================
  // Resilient Driver Methods (Production-Ready)
  // ============================================

  /**
   * Create a resilient driver with retry, rate limiting, and circuit breaker.
   * This is the RECOMMENDED method for production use with >1000 users.
   *
   * @param providerType Provider type (google, microsoft, imap)
   * @param accountId Unique account identifier for rate limiting/circuit breaker
   * @param credentials Authentication credentials
   * @param config Optional resilience configuration overrides
   * @returns Connected resilient driver
   */
  async createResilientDriver(
    providerType: ProviderType,
    accountId: string,
    credentials: DriverCredentials,
    config?: Partial<ResilienceConfig>,
  ): Promise<IEmailDriver> {
    if (!this.resilienceService) {
      this.logger.warn(
        'ResilienceService not available, falling back to basic driver. ' +
        'Ensure ResilienceModule is imported for production use.',
      );
      return this.createConnectedDriver(providerType, credentials);
    }

    const baseDriver = this.createDriver(providerType);
    const resilientDriver = new ResilientDriverWrapper(
      baseDriver,
      accountId,
      this.resilienceService,
      config,
    );

    await resilientDriver.connect(credentials);
    this.logger.debug(`Created resilient ${providerType} driver for account ${accountId}`);

    return resilientDriver;
  }

  /**
   * Wrap an existing driver with resilience.
   * Useful when you already have a connected driver.
   *
   * @param driver Existing driver instance
   * @param accountId Unique account identifier
   * @param config Optional resilience configuration
   * @returns Resilient wrapper around the driver
   */
  wrapWithResilience(
    driver: IEmailDriver,
    accountId: string,
    config?: Partial<ResilienceConfig>,
  ): IEmailDriver {
    if (!this.resilienceService) {
      this.logger.warn('ResilienceService not available, returning unwrapped driver');
      return driver;
    }

    return new ResilientDriverWrapper(
      driver,
      accountId,
      this.resilienceService,
      config,
    );
  }

  /**
   * Check if resilience features are available.
   * Returns false if ResilienceService is not injected.
   */
  isResilienceAvailable(): boolean {
    return !!this.resilienceService;
  }

  /**
   * Get the resilience service for direct access to metrics/status.
   * Returns null if not available.
   */
  getResilienceService(): ResilienceService | null {
    return this.resilienceService || null;
  }
}
