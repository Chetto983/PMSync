import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

/**
 * OAuth state metadata stored in Redis
 */
export interface OAuthStateData {
  /** User ID initiating the OAuth flow */
  userId?: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** OAuth provider (google, microsoft) */
  provider: 'google' | 'microsoft';
  /** PKCE code_verifier for secure token exchange */
  codeVerifier: string;
  /** Timestamp when state was created */
  createdAt: number;
  /** Optional: redirect URL after OAuth completion */
  redirectUrl?: string;
}

/**
 * PKCE (Proof Key for Code Exchange) data
 */
export interface PKCEData {
  /** Random code verifier (43-128 chars) */
  codeVerifier: string;
  /** SHA256 hash of verifier, base64url encoded */
  codeChallenge: string;
  /** Always S256 for security */
  codeChallengeMethod: 'S256';
}

/**
 * OAuthStateService
 *
 * Manages OAuth state tokens with PKCE support for secure OAuth 2.0 flows.
 *
 * Security features:
 * - Cryptographically secure state generation (crypto.randomBytes)
 * - PKCE support (code_verifier/code_challenge with S256)
 * - State validation with short TTL (5 minutes)
 * - State metadata storage in Redis for CSRF protection
 * - One-time use: state is deleted after validation
 *
 * Best practices implemented:
 * - Google OAuth Best Practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
 * - Microsoft OAuth PKCE: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
 * - RFC 7636 PKCE: https://tools.ietf.org/html/rfc7636
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  /** State TTL: 5 minutes (OAuth flow should complete quickly) */
  private readonly STATE_TTL_SECONDS = 300;

  /** Code verifier length (RFC 7636 recommends 43-128 chars) */
  private readonly CODE_VERIFIER_LENGTH = 64;

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Generate cryptographically secure random state
   * Uses crypto.randomBytes for true randomness
   */
  generateSecureState(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate PKCE code_verifier and code_challenge
   *
   * PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks.
   * Even for confidential clients, PKCE is now recommended by OAuth 2.1.
   *
   * @returns PKCEData with verifier, challenge, and method
   */
  generatePKCE(): PKCEData {
    // Generate random code_verifier (43-128 chars, URL-safe)
    // Using 48 random bytes = 64 base64url chars
    const codeVerifier = this.base64UrlEncode(randomBytes(48));

    // code_challenge = base64url(sha256(code_verifier))
    const hash = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.base64UrlEncode(hash);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Base64url encoding (RFC 4648)
   * Replaces + with -, / with _, removes = padding
   */
  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Create and store OAuth state with PKCE
   *
   * @param provider OAuth provider (google, microsoft)
   * @param options Optional metadata (userId, tenantId, redirectUrl)
   * @returns State token and PKCE data for authorization URL
   */
  async createState(
    provider: 'google' | 'microsoft',
    options?: {
      userId?: string;
      tenantId?: string;
      redirectUrl?: string;
    },
  ): Promise<{ state: string; pkce: PKCEData }> {
    const state = this.generateSecureState();
    const pkce = this.generatePKCE();

    const stateData: OAuthStateData = {
      provider,
      codeVerifier: pkce.codeVerifier,
      createdAt: Date.now(),
      ...options,
    };

    // Store in Redis with TTL
    const stored = await this.cacheService.set(state, stateData, {
      namespace: CacheNamespace.OAUTH_STATE,
      ttl: this.STATE_TTL_SECONDS,
    });

    if (!stored) {
      this.logger.error('Failed to store OAuth state in Redis');
      throw new BadRequestException('Failed to initialize OAuth flow');
    }

    this.logger.debug(`Created OAuth state for ${provider} (TTL: ${this.STATE_TTL_SECONDS}s)`);

    return { state, pkce };
  }

  /**
   * Validate OAuth state and return stored data
   *
   * This is a ONE-TIME operation: the state is deleted after validation
   * to prevent replay attacks.
   *
   * @param state State token from OAuth callback
   * @param expectedProvider Expected OAuth provider
   * @returns OAuthStateData if valid
   * @throws BadRequestException if state is invalid, expired, or wrong provider
   */
  async validateState(
    state: string,
    expectedProvider: 'google' | 'microsoft',
  ): Promise<OAuthStateData> {
    if (!state || typeof state !== 'string' || state.length < 32) {
      this.logger.warn('Invalid state format received');
      throw new BadRequestException('Invalid OAuth state parameter');
    }

    // Get state data from Redis
    const stateData = await this.cacheService.get<OAuthStateData>(state, {
      namespace: CacheNamespace.OAUTH_STATE,
    });

    if (!stateData) {
      this.logger.warn('OAuth state not found or expired');
      throw new BadRequestException('OAuth state expired or invalid. Please try again.');
    }

    // Validate provider matches
    if (stateData.provider !== expectedProvider) {
      this.logger.warn(
        `Provider mismatch: expected ${expectedProvider}, got ${stateData.provider}`,
      );
      // Delete the state to prevent further attempts
      await this.cacheService.del(state, { namespace: CacheNamespace.OAUTH_STATE });
      throw new BadRequestException('OAuth provider mismatch');
    }

    // Delete state immediately (one-time use)
    await this.cacheService.del(state, { namespace: CacheNamespace.OAUTH_STATE });

    this.logger.debug(`Validated OAuth state for ${expectedProvider}`);

    return stateData;
  }

  /**
   * Get code_verifier for PKCE token exchange
   *
   * This retrieves the code_verifier without deleting the state,
   * useful when you need to validate state and exchange tokens separately.
   *
   * @param state State token
   * @returns code_verifier if state is valid
   */
  async getCodeVerifier(state: string): Promise<string | null> {
    const stateData = await this.cacheService.get<OAuthStateData>(state, {
      namespace: CacheNamespace.OAUTH_STATE,
    });

    return stateData?.codeVerifier ?? null;
  }

  /**
   * Check if state exists without consuming it
   */
  async stateExists(state: string): Promise<boolean> {
    return this.cacheService.exists(state, {
      namespace: CacheNamespace.OAUTH_STATE,
    });
  }

  /**
   * Manually delete a state (e.g., on error)
   */
  async deleteState(state: string): Promise<void> {
    await this.cacheService.del(state, {
      namespace: CacheNamespace.OAUTH_STATE,
    });
  }
}
