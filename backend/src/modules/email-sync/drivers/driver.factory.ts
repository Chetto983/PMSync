import { Injectable } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { IEmailDriver, DriverCredentials } from './interfaces/email-driver.interface';
import { ProviderType } from './interfaces/canonical.types';
import { GoogleDriver } from './google/google.driver';
import { MicrosoftDriver } from './microsoft/microsoft.driver';
import { IMAPDriver } from './imap/imap.driver';

/**
 * Email Driver Factory
 *
 * Creates isolated, per-call email driver instances for different providers.
 *
 * SECURITY: Each call to createDriver() / createConnectedDriver() receives a
 * completely independent driver object graph (driver + all sub-services).
 * This eliminates the cross-tenant credential leak that existed when singletons
 * were reused across concurrent sync jobs: Job B can no longer overwrite
 * Job A's OAuth tokens or API clients.
 *
 * Implementation: NestJS ModuleRef.resolve() with a unique ContextIdFactory
 * context per call. Because all drivers and their sub-services are marked
 * Scope.TRANSIENT, each contextId produces a fresh, isolated instance tree.
 *
 * The factory itself is DEFAULT (singleton) scope - only the instances it
 * creates per call are transient.
 *
 * Usage:
 * ```typescript
 * const driver = await factory.createConnectedDriver('google', credentials);
 * try {
 *   // use driver ...
 * } finally {
 *   await driver.disconnect();
 * }
 * ```
 */
@Injectable()
export class EmailDriverFactory {
  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Create a new, isolated driver instance for the given provider type.
   *
   * Each invocation resolves a fresh transient instance of the driver and
   * all its injected sub-services (message service, send service, sync service,
   * connection pool, etc.). No state is shared with any prior or concurrent call.
   *
   * The caller is responsible for calling driver.disconnect() when finished
   * to release connections and clear per-instance state.
   *
   * @param providerType Provider type (google, microsoft, imap)
   * @returns New isolated driver instance (NOT connected)
   */
  async createDriver(providerType: ProviderType): Promise<IEmailDriver> {
    // A unique context ID ensures this resolve() call gets its own instance
    // graph, independent of any other concurrent or past resolve() calls.
    const contextId = ContextIdFactory.create();

    switch (providerType) {
      case 'google':
        return this.moduleRef.resolve(GoogleDriver, contextId, { strict: false });

      case 'microsoft':
        return this.moduleRef.resolve(MicrosoftDriver, contextId, { strict: false });

      case 'imap':
        return this.moduleRef.resolve(IMAPDriver, contextId, { strict: false });

      default:
        throw new Error(`Unknown provider type: ${providerType as string}`);
    }
  }

  /**
   * Create and connect a driver in one step.
   *
   * Equivalent to createDriver() followed by driver.connect(credentials).
   * Throws if credentials are invalid or the provider rejects authentication.
   *
   * Always call driver.disconnect() when finished to free resources.
   *
   * @param providerType Provider type
   * @param credentials Authentication credentials
   * @returns Connected driver instance
   */
  async createConnectedDriver(
    providerType: ProviderType,
    credentials: DriverCredentials,
  ): Promise<IEmailDriver> {
    const driver = await this.createDriver(providerType);
    await driver.connect(credentials);
    return driver;
  }
}
