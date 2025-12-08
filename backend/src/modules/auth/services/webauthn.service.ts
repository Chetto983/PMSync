import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { getRedisConnectionOptions } from '../../../config/configuration';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';

// Types from @simplewebauthn/server (re-exported from @simplewebauthn/types)
type AuthenticatorTransportFuture = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';
type PublicKeyCredentialCreationOptionsJSON = Awaited<ReturnType<typeof generateRegistrationOptions>>;
type PublicKeyCredentialRequestOptionsJSON = Awaited<ReturnType<typeof generateAuthenticationOptions>>;

interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData?: string;
    transports?: AuthenticatorTransportFuture[];
    publicKeyAlgorithm?: number;
    publicKey?: string;
  };
  authenticatorAttachment?: 'cross-platform' | 'platform';
  clientExtensionResults: Record<string, unknown>;
  type: 'public-key';
}

interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  authenticatorAttachment?: 'cross-platform' | 'platform';
  clientExtensionResults: Record<string, unknown>;
  type: 'public-key';
}

/**
 * WebAuthn credential info for display
 */
export interface WebAuthnCredentialInfo {
  id: string;
  deviceName: string;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports: string[];
  lastUsedAt: Date;
  createdAt: Date;
}

/**
 * Challenge storage for WebAuthn operations (Redis)
 */
interface ChallengeSession {
  challenge: string;
  userId: string;
  createdAt: number;
}

/**
 * WebAuthnService - Passwordless authentication using biometrics and security keys
 *
 * SCALABLE: Uses Redis for challenge storage (works across multiple instances)
 *
 * Supports:
 * - Face ID / Touch ID (Apple devices)
 * - Windows Hello (Windows facial/fingerprint)
 * - Android Biometric (fingerprint sensors)
 * - Security Keys (YubiKey, Titan)
 *
 * Implements W3C WebAuthn Level 3 Specification (October 2024)
 * Uses @simplewebauthn/server v10+
 *
 * @see https://webauthn.guide/
 * @see https://simplewebauthn.dev/
 * @see MFA_ENHANCEMENT_ROADMAP.md Phase 8
 */
@Injectable()
export class WebAuthnService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebAuthnService.name);
  private redis!: Redis;

  // Relying Party configuration
  private readonly rpName: string;
  private readonly rpID: string;
  private readonly origin: string;

  // Redis key prefixes
  private readonly KEY_PREFIX_REG_CHALLENGE = 'webauthn:reg:';
  private readonly KEY_PREFIX_AUTH_CHALLENGE = 'webauthn:auth:';

  // Challenge expiry (5 minutes in seconds)
  private readonly challengeExpirySeconds = 5 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // Configure Relying Party (RP) settings
    this.rpName = this.config.get<string>('WEBAUTHN_RP_NAME') || 'PMSync';
    this.rpID = this.config.get<string>('WEBAUTHN_RP_ID') || 'localhost';
    this.origin = this.config.get<string>('WEBAUTHN_ORIGIN') || 'http://localhost:3000';
  }

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'webauthn',
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis WebAuthn service error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis WebAuthn service connected');
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {
        // Ignore quit errors during shutdown
      });
    }
  }

  /**
   * Generate registration options for creating a new passkey
   *
   * @param userId - User ID
   * @param userEmail - User email (used as user identifier)
   * @param userName - Display name for the passkey
   */
  async generateRegistrationOptions(
    userId: string,
    userEmail: string,
    userName?: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    // Get existing credentials to exclude (prevent duplicate registrations)
    const existingCredentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        credentialId: true,
        transports: true,
      },
    });

    const excludeCredentials = existingCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports as AuthenticatorTransportFuture[],
    }));

    // Generate options
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: userEmail,
      userDisplayName: userName || userEmail,
      // Don't prompt users for additional information about the authenticator
      attestationType: 'none',
      // Prevent users from re-registering existing authenticators
      excludeCredentials,
      authenticatorSelection: {
        // Prefer platform authenticators (Face ID, Windows Hello) over roaming (USB keys)
        authenticatorAttachment: 'platform',
        // Require user verification (biometric/PIN)
        userVerification: 'required',
        // Create a discoverable credential (passkey)
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      // Support for ECDSA with P-256 (preferred) and RSA
      supportedAlgorithmIDs: [-7, -257],
    });

    // Store challenge in Redis with TTL
    const challengeSession: ChallengeSession = {
      challenge: options.challenge,
      userId,
      createdAt: Date.now(),
    };
    await this.redis.setex(
      `${this.KEY_PREFIX_REG_CHALLENGE}${userId}`,
      this.challengeExpirySeconds,
      JSON.stringify(challengeSession),
    );

    this.logger.log(
      JSON.stringify({
        event: 'webauthn_registration_options_generated',
        userId,
        excludedCredentialsCount: excludeCredentials.length,
      }),
    );

    return options;
  }

  /**
   * Verify registration response and save the credential
   *
   * @param userId - User ID
   * @param response - Registration response from browser
   * @param deviceName - Optional user-friendly name for the credential
   */
  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    deviceName?: string,
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    // Retrieve stored challenge from Redis
    const challengeJson = await this.redis.get(`${this.KEY_PREFIX_REG_CHALLENGE}${userId}`);

    this.logger.debug(
      JSON.stringify({
        event: 'webauthn_verify_start',
        userId,
        hasChallengeForUser: !!challengeJson,
        responseId: response?.id,
      }),
    );

    if (!challengeJson) {
      this.logger.warn(
        JSON.stringify({
          event: 'webauthn_no_challenge_found',
          userId,
        }),
      );
      return { success: false, error: 'No registration challenge found. Please try again.' };
    }

    const challengeSession: ChallengeSession = JSON.parse(challengeJson);

    // Check challenge expiry (Redis TTL handles this, but double-check)
    if (Date.now() - challengeSession.createdAt > this.challengeExpirySeconds * 1000) {
      await this.redis.del(`${this.KEY_PREFIX_REG_CHALLENGE}${userId}`);
      return { success: false, error: 'Registration challenge expired. Please try again.' };
    }

    try {
      this.logger.debug(
        JSON.stringify({
          event: 'webauthn_verify_attempt',
          userId,
          expectedOrigin: this.origin,
          expectedRPID: this.rpID,
          challengeExists: !!challengeSession.challenge,
        }),
      );

      const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeSession.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return { success: false, error: 'Verification failed' };
      }

      const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
        verification.registrationInfo;

      // Use the original credential ID from the browser response (already base64url)
      // Note: Don't re-encode from credential.id Uint8Array as it may not match
      const credentialIdBase64 = response.id;
      const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

      // Store credential in database
      const savedCredential = await this.prisma.webAuthnCredential.create({
        data: {
          userId,
          credentialId: credentialIdBase64,
          credentialPublicKey: publicKeyBase64,
          counter: credential.counter,
          credentialDeviceType: credentialDeviceType,
          credentialBackedUp: credentialBackedUp,
          transports: (response.response.transports || []) as string[],
          aaguid: aaguid || undefined,
          deviceName: deviceName || this.generateDeviceName(response),
        },
      });

      // Cleanup challenge
      await this.redis.del(`${this.KEY_PREFIX_REG_CHALLENGE}${userId}`);

      this.logger.log(
        JSON.stringify({
          event: 'webauthn_credential_registered',
          userId,
          credentialId: savedCredential.id,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        }),
      );

      return { success: true, credentialId: savedCredential.id };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'webauthn_registration_verification_failed',
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          expectedOrigin: this.origin,
          expectedRPID: this.rpID,
        }),
      );

      return { success: false, error: error instanceof Error ? error.message : 'Verification failed. Please try again.' };
    }
  }

  /**
   * Generate authentication options for signing in with a passkey
   *
   * @param userId - User ID (optional for discoverable credentials)
   */
  async generateAuthenticationOptions(
    userId?: string,
  ): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; sessionId: string }> {
    let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];

    // If userId provided, get user's credentials for allowCredentials
    if (userId) {
      const credentials = await this.prisma.webAuthnCredential.findMany({
        where: { userId },
        select: {
          credentialId: true,
          transports: true,
        },
      });

      allowCredentials = credentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      // If no userId, allow any discoverable credential (conditional UI)
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'required',
    });

    // Generate session ID for challenge tracking
    const sessionId = crypto.randomUUID();

    // Store challenge in Redis (use sessionId for unauthenticated requests)
    const challengeKey = userId || sessionId;
    const challengeSession: ChallengeSession = {
      challenge: options.challenge,
      userId: userId || '',
      createdAt: Date.now(),
    };
    await this.redis.setex(
      `${this.KEY_PREFIX_AUTH_CHALLENGE}${challengeKey}`,
      this.challengeExpirySeconds,
      JSON.stringify(challengeSession),
    );

    this.logger.log(
      JSON.stringify({
        event: 'webauthn_authentication_options_generated',
        userId: userId || 'discoverable',
        credentialsCount: allowCredentials.length,
      }),
    );

    return { options, sessionId };
  }

  /**
   * Verify authentication response
   *
   * @param response - Authentication response from browser
   * @param sessionId - Session ID from generateAuthenticationOptions
   * @param userId - User ID (optional, will be looked up from credential)
   */
  async verifyAuthentication(
    response: AuthenticationResponseJSON,
    sessionId: string,
    userId?: string,
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    // Look up credential to get user
    const credentialIdBase64 = response.id;
    const credential = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: credentialIdBase64 },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    const actualUserId = credential.userId;
    const challengeKey = userId || sessionId;

    // Retrieve stored challenge from Redis
    const challengeJson = await this.redis.get(`${this.KEY_PREFIX_AUTH_CHALLENGE}${challengeKey}`);
    if (!challengeJson) {
      return { success: false, error: 'No authentication challenge found. Please try again.' };
    }

    const challengeSession: ChallengeSession = JSON.parse(challengeJson);

    // Check challenge expiry
    if (Date.now() - challengeSession.createdAt > this.challengeExpirySeconds * 1000) {
      await this.redis.del(`${this.KEY_PREFIX_AUTH_CHALLENGE}${challengeKey}`);
      return { success: false, error: 'Authentication challenge expired. Please try again.' };
    }

    try {
      const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeSession.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId, // Base64URL string
          publicKey: new Uint8Array(Buffer.from(credential.credentialPublicKey, 'base64url')),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
      });

      if (!verification.verified) {
        return { success: false, error: 'Authentication verification failed' };
      }

      // Update credential counter and last used timestamp (prevents replay attacks)
      await this.prisma.webAuthnCredential.update({
        where: { id: credential.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
        },
      });

      // Cleanup challenge
      await this.redis.del(`${this.KEY_PREFIX_AUTH_CHALLENGE}${challengeKey}`);

      this.logger.log(
        JSON.stringify({
          event: 'webauthn_authentication_verified',
          userId: actualUserId,
          credentialId: credential.id,
        }),
      );

      return { success: true, userId: actualUserId };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'webauthn_authentication_verification_failed',
          userId: actualUserId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );

      return { success: false, error: 'Authentication failed. Please try again.' };
    }
  }

  /**
   * List all WebAuthn credentials for a user
   */
  async listCredentials(userId: string): Promise<WebAuthnCredentialInfo[]> {
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });

    return credentials.map((cred) => ({
      id: cred.id,
      deviceName: cred.deviceName || 'Unknown Device',
      credentialDeviceType: cred.credentialDeviceType,
      credentialBackedUp: cred.credentialBackedUp,
      transports: cred.transports,
      lastUsedAt: cred.lastUsedAt,
      createdAt: cred.createdAt,
    }));
  }

  /**
   * Delete a WebAuthn credential
   */
  async deleteCredential(userId: string, credentialId: string): Promise<boolean> {
    const credential = await this.prisma.webAuthnCredential.findFirst({
      where: {
        id: credentialId,
        userId,
      },
    });

    if (!credential) {
      return false;
    }

    await this.prisma.webAuthnCredential.delete({
      where: { id: credentialId },
    });

    this.logger.log(
      JSON.stringify({
        event: 'webauthn_credential_deleted',
        userId,
        credentialId,
      }),
    );

    return true;
  }

  /**
   * Check if user has any WebAuthn credentials
   */
  async hasCredentials(userId: string): Promise<boolean> {
    const count = await this.prisma.webAuthnCredential.count({
      where: { userId },
    });
    return count > 0;
  }

  /**
   * Update credential device name
   */
  async updateCredentialName(
    userId: string,
    credentialId: string,
    deviceName: string,
  ): Promise<boolean> {
    const credential = await this.prisma.webAuthnCredential.findFirst({
      where: {
        id: credentialId,
        userId,
      },
    });

    if (!credential) {
      return false;
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: credentialId },
      data: { deviceName },
    });

    return true;
  }

  /**
   * Generate a device name from the registration response
   */
  private generateDeviceName(response: RegistrationResponseJSON): string {
    const transports = response.response.transports || [];

    // Determine device type based on transports
    if (transports.includes('internal')) {
      // Platform authenticator - try to identify
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (ua.includes('Mac')) return 'Mac Touch ID';
      if (ua.includes('iPhone')) return 'iPhone Face ID';
      if (ua.includes('iPad')) return 'iPad Face ID';
      if (ua.includes('Windows')) return 'Windows Hello';
      if (ua.includes('Android')) return 'Android Biometric';
      return 'Platform Authenticator';
    }

    if (transports.includes('usb')) return 'USB Security Key';
    if (transports.includes('nfc')) return 'NFC Security Key';
    if (transports.includes('ble')) return 'Bluetooth Security Key';
    if (transports.includes('hybrid')) return 'Phone as Security Key';

    return 'Security Key';
  }

  // ==================== PUBLIC LOGIN METHODS ====================

  /**
   * Generate authentication options for passwordless login by email
   * This is a PUBLIC endpoint - no authentication required
   *
   * @param email - User email address
   * @param tenantSlug - Optional tenant slug for multi-tenant support
   */
  async generateLoginOptions(
    email: string,
    tenantSlug?: string,
  ): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; sessionId: string } | null> {
    // Find user by email (with optional tenant)
    const whereClause: { email: string; tenant?: { slug: string } } = { email };
    if (tenantSlug) {
      whereClause.tenant = { slug: tenantSlug };
    }

    const user = await this.prisma.user.findFirst({
      where: whereClause,
      select: { id: true, email: true },
    });

    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'webauthn_login_user_not_found',
          email,
        }),
      );
      return null;
    }

    // Check if user has any passkeys
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: {
        credentialId: true,
        transports: true,
      },
    });

    if (credentials.length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'webauthn_login_no_credentials',
          userId: user.id,
        }),
      );
      return null;
    }

    const allowCredentials = credentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports as AuthenticatorTransportFuture[],
    }));

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials,
      userVerification: 'required',
    });

    // Generate session ID and store challenge with user context in Redis
    const sessionId = crypto.randomUUID();

    const challengeSession: ChallengeSession = {
      challenge: options.challenge,
      userId: user.id,
      createdAt: Date.now(),
    };
    await this.redis.setex(
      `${this.KEY_PREFIX_AUTH_CHALLENGE}${sessionId}`,
      this.challengeExpirySeconds,
      JSON.stringify(challengeSession),
    );

    this.logger.log(
      JSON.stringify({
        event: 'webauthn_login_options_generated',
        userId: user.id,
        credentialsCount: credentials.length,
        sessionId,
        allowCredentials: allowCredentials.map((c) => ({
          id: c.id.substring(0, 20) + '...',
          transports: c.transports,
        })),
        rpID: this.rpID,
      }),
    );

    return { options, sessionId };
  }

  /**
   * Verify authentication for passwordless login
   * Returns full user info for session creation
   *
   * @param response - Authentication response from browser
   * @param sessionId - Session ID from generateLoginOptions
   */
  async verifyLogin(
    response: AuthenticationResponseJSON,
    sessionId: string,
  ): Promise<{
    success: boolean;
    user?: { id: string; email: string; tenantId: string };
    error?: string;
  }> {
    // Look up credential to get user
    const credentialIdBase64 = response.id;
    const credential = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: credentialIdBase64 },
    });

    if (!credential) {
      this.logger.warn(
        JSON.stringify({
          event: 'webauthn_login_credential_not_found',
          credentialId: credentialIdBase64,
        }),
      );
      return { success: false, error: 'Credential not found' };
    }

    // Get user data
    const user = await this.prisma.user.findUnique({
      where: { id: credential.userId },
      select: {
        id: true,
        email: true,
        tenantId: true,
        isActive: true,
      },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Verify user is active
    if (!user.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'webauthn_login_user_not_active',
          userId: credential.userId,
          isActive: user.isActive,
        }),
      );
      return { success: false, error: 'Account is not active' };
    }

    // Retrieve stored challenge from Redis
    const challengeJson = await this.redis.get(`${this.KEY_PREFIX_AUTH_CHALLENGE}${sessionId}`);
    if (!challengeJson) {
      return { success: false, error: 'No authentication challenge found. Please try again.' };
    }

    const challengeSession: ChallengeSession = JSON.parse(challengeJson);

    // Check challenge expiry
    if (Date.now() - challengeSession.createdAt > this.challengeExpirySeconds * 1000) {
      await this.redis.del(`${this.KEY_PREFIX_AUTH_CHALLENGE}${sessionId}`);
      return { success: false, error: 'Authentication challenge expired. Please try again.' };
    }

    // Verify the challenge is for this user
    if (challengeSession.userId !== credential.userId) {
      this.logger.warn(
        JSON.stringify({
          event: 'webauthn_login_user_mismatch',
          sessionUserId: challengeSession.userId,
          credentialUserId: credential.userId,
        }),
      );
      return { success: false, error: 'Credential mismatch' };
    }

    try {
      const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeSession.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(Buffer.from(credential.credentialPublicKey, 'base64url')),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
      });

      if (!verification.verified) {
        return { success: false, error: 'Authentication verification failed' };
      }

      // Update credential counter and last used timestamp
      await this.prisma.webAuthnCredential.update({
        where: { id: credential.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
        },
      });

      // Cleanup challenge
      await this.redis.del(`${this.KEY_PREFIX_AUTH_CHALLENGE}${sessionId}`);

      this.logger.log(
        JSON.stringify({
          event: 'webauthn_login_verified',
          userId: credential.userId,
          credentialId: credential.id,
        }),
      );

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
        },
      };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'webauthn_login_verification_failed',
          userId: credential.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );

      return { success: false, error: 'Authentication failed. Please try again.' };
    }
  }

  /**
   * Clear all challenge data for a user (for testing/admin)
   */
  async clearUserChallenges(userId: string): Promise<void> {
    await this.redis.del(`${this.KEY_PREFIX_REG_CHALLENGE}${userId}`);
    await this.redis.del(`${this.KEY_PREFIX_AUTH_CHALLENGE}${userId}`);
  }
}
