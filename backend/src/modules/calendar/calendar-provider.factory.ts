import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ICalendarProvider, CalendarProviderConfig } from '../providers/interfaces/calendar-provider.interface';
import { ProviderTokenService } from '../email-sync/services/provider-token.service';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { MicrosoftCalendarProvider } from './providers/microsoft-calendar.provider';

/**
 * Supported calendar provider implementations
 */
const CALENDAR_PROVIDER_CLASSES = {
  google: GoogleCalendarProvider,
  microsoft: MicrosoftCalendarProvider,
} as const;

/**
 * CalendarProviderFactory - Factory for creating calendar provider instances
 *
 * Now supports Google and Microsoft Calendar providers through unified provider pattern.
 * Part of the unified provider pattern implementation.
 */
@Injectable()
export class CalendarProviderFactory {
  private readonly logger = new Logger(CalendarProviderFactory.name);

  constructor(private readonly moduleRef: ModuleRef) { }

  /**
   * Create a calendar provider instance
   *
   * @param providerType - Type of calendar provider (google, microsoft)
   * @param config - Calendar provider configuration
   * @returns Calendar provider instance
   * @throws Error if provider type is not supported
   */
  async create(providerType: string, config: CalendarProviderConfig): Promise<ICalendarProvider> {
    this.logger.debug(`Creating calendar provider instance: ${providerType} for ${config.email}`);

    // Validate configuration
    CalendarProviderFactory.validateConfig(config);

    switch (providerType.toLowerCase()) {
      case 'google':
        return this.createGoogleProvider(config);

      case 'microsoft':
        return this.createMicrosoftProvider(config);

      default:
        throw new Error(
          `Calendar provider "${providerType}" not supported. Supported providers: ${CalendarProviderFactory.getSupportedProviders().join(', ')}`,
        );
    }
  }

  /**
   * Create Google Calendar provider instance
   */
  private async createGoogleProvider(config: CalendarProviderConfig): Promise<ICalendarProvider> {
    const providerClass = CALENDAR_PROVIDER_CLASSES.google;

    try {
      // Get dependencies from module container
      const [prisma, crypto, googleOAuth, googleCalendarSync, providerTokenService] = await Promise.all([
        this.moduleRef.get('PrismaService'),
        this.moduleRef.get('CryptoService'),
        this.moduleRef.get('GoogleOAuthService'),
        this.moduleRef.get('GoogleCalendarSyncService'),
        this.moduleRef.get(ProviderTokenService),
      ]);

      // Create and return provider instance
      const provider = new providerClass(
        config,
        prisma as any,
        crypto as any,
        googleOAuth as any,
        googleCalendarSync as any,
        providerTokenService as any,
      );

      this.logger.log(`Google Calendar provider created for ${config.email}`);
      return provider;
    } catch (error) {
      this.logger.error(`Failed to create Google Calendar provider:`, error);
      throw new Error('Google Calendar provider initialization failed');
    }
  }

  /**
   * Create Microsoft Calendar provider instance
   */
  private async createMicrosoftProvider(config: CalendarProviderConfig): Promise<ICalendarProvider> {
    const providerClass = CALENDAR_PROVIDER_CLASSES.microsoft;

    try {
      // Get dependencies from module container
      const [prisma, crypto, microsoftOAuth, microsoftCalendarSync, providerTokenService] = await Promise.all([
        this.moduleRef.get('PrismaService'),
        this.moduleRef.get('CryptoService'),
        this.moduleRef.get('MicrosoftOAuthService'),
        this.moduleRef.get('MicrosoftCalendarSyncService'),
        this.moduleRef.get(ProviderTokenService),
      ]);

      // Create and return provider instance
      const provider = new providerClass(
        config,
        prisma as any,
        crypto as any,
        microsoftOAuth as any,
        microsoftCalendarSync as any,
        providerTokenService as any,
      );

      this.logger.log(`Microsoft Calendar provider created for ${config.email}`);
      return provider;
    } catch (error) {
      this.logger.error(`Failed to create Microsoft Calendar provider:`, error);
      throw new Error('Microsoft Calendar provider initialization failed');
    }
  }

  /**
   * Check if a calendar provider type is supported
   */
  static isSupported(providerType: string): boolean {
    return Object.keys(CALENDAR_PROVIDER_CLASSES).includes(providerType.toLowerCase());
  }

  /**
   * Get list of supported calendar provider types
   */
  static getSupportedProviders(): string[] {
    return Object.keys(CALENDAR_PROVIDER_CLASSES);
  }

  /**
   * Validate calendar provider configuration
   */
  static validateConfig(config: CalendarProviderConfig): void {
    const required = ['userId', 'tenantId', 'providerId', 'providerType', 'email', 'accessToken'];
    const missing = required.filter((field) => !config[field as keyof CalendarProviderConfig]);

    if (missing.length > 0) {
      throw new Error(`Invalid calendar provider config. Missing fields: ${missing.join(', ')}`);
    }

    if (!this.isSupported(config.providerType)) {
      throw new Error(`Unsupported calendar provider type: ${config.providerType}`);
    }
  }
}

/**
 * Calendar providers can be created by injecting CalendarProviderFactory
 * and calling factory.create(providerType, config)
 */
