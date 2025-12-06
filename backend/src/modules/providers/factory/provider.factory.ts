/**
 * Provider Factory
 *
 * Factory pattern for creating email provider instances
 * Inspired by Zero's createDriver function
 *
 * @see Repo_Esempio/Zero-main/Zero-main/apps/server/src/lib/driver/index.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import type { IEmailProvider, ProviderConfig } from '../interfaces/email-provider.interface';
import { GoogleEmailProvider } from '../providers/google-email.provider';
import { MicrosoftEmailProvider } from '../providers/microsoft-email.provider';
import { ImapEmailProvider } from '../providers/imap-email.provider';
/**
 * Registry of supported providers
 * Maps provider type to provider class constructor
 */
const SUPPORTED_PROVIDERS = {
  google: GoogleEmailProvider,
  microsoft: MicrosoftEmailProvider,
  imap: ImapEmailProvider,
  generic: ImapEmailProvider, // 'generic' is an alias for IMAP providers
} as const;

export type SupportedProviderType = keyof typeof SUPPORTED_PROVIDERS;

/**
 * ProviderFactory - Factory for creating email provider instances
 *
 * Usage:
 * ```typescript
 * const provider = ProviderFactory.create('google', config);
 * const emails = await provider.listThreads({ folder: 'INBOX' });
 * ```
 */
@Injectable()
export class ProviderFactory {
  private static readonly logger = new Logger(ProviderFactory.name);

  /**
   * Create a provider instance
   *
   * @param providerType - Type of provider (google, microsoft, imap)
   * @param config - Provider configuration
   * @returns Provider instance
   * @throws Error if provider type is not supported
   */
  static create(providerType: string, config: ProviderConfig): IEmailProvider {
    this.logger.debug(`Creating provider instance: ${providerType}`);

    // Validate provider type
    if (!this.isSupported(providerType)) {
      throw new Error(
        `Provider "${providerType}" not supported. Supported providers: ${this.getSupportedProviders().join(', ')}`,
      );
    }

    const ProviderClass = SUPPORTED_PROVIDERS[providerType];

    try {
      const provider = new ProviderClass(config);
      this.logger.log(`Provider created successfully: ${providerType} for user ${config.userId}`);
      return provider;
    } catch (error) {
      this.logger.error(`Failed to create provider ${providerType}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create provider ${providerType}: ${message}`);
    }
  }

  /**
   * Check if a provider type is supported
   *
   * @param providerType - Provider type to check
   * @returns True if provider is supported
   */
  static isSupported(providerType: string): providerType is SupportedProviderType {
    return providerType in SUPPORTED_PROVIDERS;
  }

  /**
   * Get list of supported provider types
   *
   * @returns Array of supported provider types
   */
  static getSupportedProviders(): SupportedProviderType[] {
    return Object.keys(SUPPORTED_PROVIDERS) as SupportedProviderType[];
  }

  /**
   * Get provider class constructor
   *
   * @param providerType - Provider type
   * @returns Provider class constructor or undefined if not found
   */
  static getProviderClass(
    providerType: SupportedProviderType,
  ): typeof GoogleEmailProvider | typeof MicrosoftEmailProvider | typeof ImapEmailProvider {
    return SUPPORTED_PROVIDERS[providerType];
  }

  /**
   * Validate provider configuration
   *
   * @param config - Provider configuration to validate
   * @throws Error if configuration is invalid
   */
  static validateConfig(config: ProviderConfig): void {
    const required = ['userId', 'providerId', 'providerType', 'email', 'accessToken'];
    const missing = required.filter((field) => !config[field as keyof ProviderConfig]);

    if (missing.length > 0) {
      throw new Error(`Invalid provider config. Missing fields: ${missing.join(', ')}`);
    }

    if (!this.isSupported(config.providerType)) {
      throw new Error(`Unsupported provider type: ${config.providerType}`);
    }
  }

  /**
   * Create provider with validation
   *
   * @param providerType - Type of provider
   * @param config - Provider configuration
   * @returns Provider instance
   */
  static createWithValidation(providerType: string, config: ProviderConfig): IEmailProvider {
    this.validateConfig(config);
    return this.create(providerType, config);
  }
}

/**
 * Helper function to create provider (functional style)
 * For use in places where dependency injection is not available
 *
 * @param providerType - Provider type
 * @param config - Provider configuration
 * @returns Provider instance
 */
export function createEmailProvider(
  providerType: string,
  config: ProviderConfig,
): IEmailProvider {
  return ProviderFactory.create(providerType, config);
}

/**
 * Type guard to check if a provider is a Google provider
 */
export function isGoogleProvider(provider: IEmailProvider): provider is GoogleEmailProvider {
  return provider.config.providerType === 'google';
}

/**
 * Type guard to check if a provider is a Microsoft provider
 */
export function isMicrosoftProvider(
  provider: IEmailProvider,
): provider is MicrosoftEmailProvider {
  return provider.config.providerType === 'microsoft';
}

/**
 * Type guard to check if a provider is an IMAP provider
 * Note: IMAP provider not yet implemented, this is a placeholder
 */
export function isImapProvider(provider: IEmailProvider): provider is any {
  return provider.config.providerType === 'imap';
}
