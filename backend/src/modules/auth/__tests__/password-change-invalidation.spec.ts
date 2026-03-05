/**
 * Password Change Session/Token Invalidation Tests (AUTH-05)
 *
 * Verifies that resetPassword:
 * 1. Deletes all sessions for the user from DB
 * 2. Invalidates all session caches (tenant-isolated keys)
 * 3. Does NOT affect other users' sessions
 *
 * Also tests the standalone deleteAllRefreshTokens method (AUTH-05)
 * which will be wired into resetPassword once plan 42-03 completes.
 */

// Mock ESM modules that Jest cannot transform
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));
jest.mock('@simplewebauthn/server', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../services/auth.service';
import { AuthRegistrationService } from '../services/auth-registration.service';
import { AuthLoginService } from '../services/auth-login.service';
import { AuthTokenService } from '../services/auth-token.service';
import { AuthPasswordResetService } from '../services/auth-password-reset.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/services/email.service';
import { OtpSecurityService } from '../services/otp-security.service';
import { TotpService } from '../services/totp.service';
import { BackupCodesService } from '../services/backup-codes.service';
import { TrustedDeviceService } from '../services/trusted-device.service';
import { WebAuthnService } from '../services/webauthn.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { LegalAcceptanceService } from '../../compliance/services/legal-acceptance.service';
import { AuthConfigService } from '../services/auth-config.service';
import { PasswordHashingService } from '../services/password-hashing.service';
import { PasswordPolicyService } from '../services/password-policy.service';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-new-password'),
  compare: jest.fn().mockResolvedValue(false), // Not same password
}));

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: jest.fn().mockReturnValue('mock-nanoid-id'),
}));

// Test data
const TENANT_A_ID = 'tenant-aaa-111';
const USER_A_ID = 'user-aaa-111';
const USER_B_ID = 'user-bbb-222';
const USER_A_EMAIL = 'alice@example.com';

describe('Password Change Invalidation (AUTH-05)', () => {
  let authService: AuthService;
  let prisma: any;
  let jwtService: any;
  let cacheService: any;

  const validResetToken = 'valid-reset-jwt-token';

  beforeEach(async () => {
    prisma = {
      passwordResetToken: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      session: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('new-jwt-token'),
      verify: jest.fn(),
    };

    cacheService = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    const mockPasswordHashing = {
      hashPassword: jest.fn().mockResolvedValue('hashed-new-password'),
      verifyPassword: jest.fn().mockResolvedValue({ valid: false, needsRehash: false }),
      dummyHash: jest.fn().mockResolvedValue(undefined),
    };

    const mockPasswordPolicy = {
      validate: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      checkBreached: jest.fn().mockResolvedValue({ breached: false, count: 0 }),
    };

    const mockAuthConfig = {
      accessTokenExpiresIn: '15m',
      accessTokenTtlMs: 900_000,
      refreshTokenSecret: 'x'.repeat(32),
      maxSessionsPerUser: 5,
      sessionTtlMs: 86_400_000,
      idleTimeoutMs: 1_800_000,
      lastActivityDebounceMs: 60_000,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthRegistrationService,
        AuthLoginService,
        AuthTokenService,
        AuthPasswordResetService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailService, useValue: {} },
        { provide: CacheService, useValue: cacheService },
        { provide: AuthConfigService, useValue: mockAuthConfig },
        { provide: PasswordHashingService, useValue: mockPasswordHashing },
        { provide: PasswordPolicyService, useValue: mockPasswordPolicy },
        // Sub-service deps not exercised in these tests but required for DI
        { provide: OtpSecurityService, useValue: {} },
        { provide: TotpService, useValue: {} },
        { provide: BackupCodesService, useValue: {} },
        { provide: TrustedDeviceService, useValue: {} },
        { provide: WebAuthnService, useValue: {} },
        { provide: RedisRateLimiterService, useValue: {} },
        { provide: LegalAcceptanceService, useValue: {} },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  function setupSuccessfulReset() {
    jwtService.verify.mockReturnValue({
      email: USER_A_EMAIL,
      type: 'password-reset',
      userId: USER_A_ID,
      tenantId: TENANT_A_ID,
    });

    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-token-1',
      userEmail: USER_A_EMAIL,
      token: 'hashed-token',
      tenantId: TENANT_A_ID,
      isUsed: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    prisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_A_ID,
      slug: 'tenant-a',
      isActive: true,
    });

    prisma.user.findUnique.mockResolvedValue({
      id: USER_A_ID,
      email: USER_A_EMAIL,
      firstName: 'Alice',
      lastName: 'Test',
      role: 'admin',
      tenantId: TENANT_A_ID,
      passwordHash: 'old-hashed-password',
      isActive: true,
    });

    prisma.session.findMany.mockResolvedValue([
      { id: 'session-1' },
      { id: 'session-2' },
    ]);

    prisma.session.deleteMany.mockResolvedValue({ count: 2 });
  }

  it('should delete all sessions for the user on password reset', async () => {
    setupSuccessfulReset();

    await authService.resetPassword(validResetToken, 'NewSecureP@ss123');

    expect(prisma.session.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A_ID },
      select: { id: true },
    });

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_A_ID },
    });
  });

  it('should invalidate all session caches with tenant-isolated keys', async () => {
    setupSuccessfulReset();

    await authService.resetPassword(validResetToken, 'NewSecureP@ss123');

    // Each session cache invalidated with {tenantId}:{sessionId} format
    expect(cacheService.del).toHaveBeenCalledWith(
      `${TENANT_A_ID}:session-1`,
      { namespace: CacheNamespace.USER_SESSION },
    );
    expect(cacheService.del).toHaveBeenCalledWith(
      `${TENANT_A_ID}:session-2`,
      { namespace: CacheNamespace.USER_SESSION },
    );

    // User-level cache invalidated
    expect(cacheService.del).toHaveBeenCalledWith(
      `${TENANT_A_ID}:user:${USER_A_ID}`,
      { namespace: CacheNamespace.USER_SESSION },
    );
  });

  it('should scope session deletion to the specific user only', async () => {
    setupSuccessfulReset();

    await authService.resetPassword(validResetToken, 'NewSecureP@ss123');

    // Session query was scoped to User A only
    const sessionQueryCall = prisma.session.findMany.mock.calls[0][0];
    expect(sessionQueryCall.where.userId).toBe(USER_A_ID);
    expect(sessionQueryCall.where.userId).not.toBe(USER_B_ID);

    // Session deletion was scoped to User A only
    const sessionDeleteCall = prisma.session.deleteMany.mock.calls[0][0];
    expect(sessionDeleteCall.where.userId).toBe(USER_A_ID);
    expect(sessionDeleteCall.where.userId).not.toBe(USER_B_ID);
  });

  it('should update password hash before deleting sessions', async () => {
    setupSuccessfulReset();

    await authService.resetPassword(validResetToken, 'NewSecureP@ss123');

    // Password was updated
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_A_ID },
      data: { passwordHash: 'hashed-new-password' },
    });

    // Reset token was marked as used
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'reset-token-1' },
      data: { isUsed: true },
    });
  });

  describe('deleteAllRefreshTokens (AUTH-05 standalone)', () => {
    it('should delete all refresh tokens scoped to userId and tenantId', async () => {
      const count = await authService.deleteAllRefreshTokens(USER_A_ID, TENANT_A_ID);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_A_ID, tenantId: TENANT_A_ID },
      });
      expect(count).toBe(3);
    });

    it('should not affect other users tokens (scoped by userId)', async () => {
      await authService.deleteAllRefreshTokens(USER_A_ID, TENANT_A_ID);

      const call = prisma.refreshToken.deleteMany.mock.calls[0][0];
      expect(call.where.userId).toBe(USER_A_ID);
      expect(call.where.userId).not.toBe(USER_B_ID);
    });
  });
});
