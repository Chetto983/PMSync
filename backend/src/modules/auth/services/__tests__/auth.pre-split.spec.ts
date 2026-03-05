/**
 * Pre-split characterization tests for AuthService
 *
 * These tests document CURRENT behavior before the god-file split.
 * They must pass BEFORE and AFTER the split to prove zero behavior change.
 */

jest.mock('nanoid', () => ({
  nanoid: jest.fn().mockReturnValue('mock-nanoid-id'),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock ESM modules that Jest can't transform
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('mock-secret'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/test'),
  verify: jest.fn().mockReturnValue(true),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

jest.mock('@scure/base', () => ({
  utils: {},
  base32: { encode: jest.fn(), decode: jest.fn() },
}));

import { AuthService } from '../auth.service';
import { AuthRegistrationService } from '../auth-registration.service';
import { AuthLoginService } from '../auth-login.service';
import { AuthTokenService } from '../auth-token.service';
import { AuthPasswordResetService } from '../auth-password-reset.service';

describe('AuthService (Pre-Split Characterization)', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;
  let mockEmailService: any;
  let mockOtpSecurity: any;
  let mockTotpService: any;
  let mockBackupCodesService: any;
  let mockTrustedDeviceService: any;
  let mockWebauthnService: any;
  let mockRateLimiter: any;
  let mockCacheService: any;
  let mockLegalAcceptanceService: any;
  let mockAuthConfigService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'admin',
    tenantId: 'tenant-1',
    passwordHash: 'hashed-password',
    isMfaEnabled: false,
    isActive: true,
    lastLogin: null,
  };

  const mockTenant = {
    id: 'tenant-1',
    slug: 'test@example.com',
    name: 'Test Workspace',
    isActive: true,
  };

  beforeEach(() => {
    // Set env vars for constructor
    process.env.PASSWORD_RESET_SECRET = 'a'.repeat(32);
    process.env.JWT_SECRET = 'b'.repeat(32);
    process.env.NODE_ENV = 'test';

    mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(mockTenant),
        create: jest.fn().mockResolvedValue(mockTenant),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        create: jest.fn().mockResolvedValue(mockUser),
        update: jest.fn().mockResolvedValue(mockUser),
      },
      session: {
        create: jest.fn().mockResolvedValue({ id: 'session-1', token: 'jwt-token' }),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'session-1' }]),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('jwt-token'),
      verify: jest.fn().mockReturnValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        type: 'mfa-challenge',
      }),
    };

    mockEmailService = {
      sendOtp: jest.fn().mockResolvedValue(undefined),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };

    mockOtpSecurity = {
      createOtp: jest.fn().mockResolvedValue({ code: '123456' }),
      verifyOtp: jest.fn().mockResolvedValue({ success: true }),
    };

    mockTotpService = {
      isEnabled: jest.fn().mockResolvedValue(false),
      verifyCode: jest.fn().mockResolvedValue({ success: true }),
    };

    mockBackupCodesService = {
      getRemainingCount: jest.fn().mockResolvedValue(0),
      verify: jest.fn().mockResolvedValue({ success: true }),
    };

    mockTrustedDeviceService = {
      verifyDevice: jest.fn().mockResolvedValue(false),
      trustDevice: jest.fn().mockResolvedValue('device-token'),
    };

    mockWebauthnService = {
      verifyLogin: jest.fn().mockResolvedValue({ success: true, user: mockUser }),
      generateLoginOptions: jest.fn().mockResolvedValue({ challenge: 'test' }),
    };

    mockRateLimiter = {
      isLockedOut: jest.fn().mockResolvedValue({ isLockedOut: false }),
      checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
      recordFailedAttempt: jest.fn().mockResolvedValue({ isLockedOut: false }),
      clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
    };

    mockCacheService = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockLegalAcceptanceService = {
      accept: jest.fn().mockResolvedValue(undefined),
    };

    mockAuthConfigService = {
      refreshTokenSecret: 'c'.repeat(32),
      maxSessionsPerUser: 5,
      accessTokenExpiresIn: '15m',
      accessTokenTtlMs: 900_000,
      sessionTtlMs: 86_400_000,
      idleTimeoutMs: 1_800_000,
      lastActivityDebounceMs: 60_000,
    };

    const mockPasswordHashingService = {
      hashPassword: jest.fn().mockResolvedValue('hashed-password'),
      verifyPassword: jest.fn().mockResolvedValue({ valid: true, needsRehash: false }),
      dummyHash: jest.fn().mockResolvedValue(undefined),
    };

    const mockPasswordPolicyService = {
      validate: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      checkBreached: jest.fn().mockResolvedValue({ breached: false, count: 0 }),
    };

    // Create real sub-services with shared mocks
    const registrationService = new AuthRegistrationService(
      mockPrisma, mockEmailService, mockOtpSecurity, mockLegalAcceptanceService,
      mockPasswordHashingService as any, mockPasswordPolicyService as any,
    );
    const loginService = new AuthLoginService(
      mockPrisma, mockJwtService, mockOtpSecurity, mockTotpService,
      mockBackupCodesService, mockTrustedDeviceService, mockWebauthnService, mockRateLimiter,
      mockPasswordHashingService as any, mockPasswordPolicyService as any, mockAuthConfigService as any,
    );
    const tokenService = new AuthTokenService(
      mockPrisma, mockJwtService, mockCacheService, mockAuthConfigService,
    );
    const passwordResetService = new AuthPasswordResetService(
      mockPrisma, mockJwtService, mockEmailService,
      mockPasswordHashingService as any, mockPasswordPolicyService as any,
    );

    service = new AuthService(
      registrationService, loginService, tokenService, passwordResetService,
    );
  });

  // ===== REGISTRATION =====
  describe('register', () => {
    it('should create tenant and user when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue(mockTenant);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.register({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
      });

      expect(result.success).toBe(true);
      expect(result.requiresOtp).toBe(true);
      expect(mockPrisma.tenant.create).toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should return success (no reveal) when user already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.requiresOtp).toBe(true);
    });

    it('should throw when tenant is inactive', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...mockTenant, isActive: false });

      await expect(
        service.register({ email: 'test@example.com', password: 'pass' }),
      ).rejects.toThrow('Registration is not available');
    });
  });

  // ===== OTP =====
  describe('sendOtpCode', () => {
    it('should return generic message even when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      const result = await service.sendOtpCode('unknown@example.com');
      expect(result.success).toBe(true);
      expect(result.message).toContain('If the email exists');
    });

    it('should send OTP when user exists', async () => {
      const result = await service.sendOtpCode('test@example.com');
      expect(result.success).toBe(true);
      expect(mockOtpSecurity.createOtp).toHaveBeenCalled();
    });
  });

  describe('verifyOtpCode', () => {
    it('should verify and return access token', async () => {
      const result = await service.verifyOtpCode('test@example.com', '123456');
      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });

    it('should throw on inactive tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...mockTenant, isActive: false });
      await expect(
        service.verifyOtpCode('test@example.com', '123456'),
      ).rejects.toThrow('Invalid email or code');
    });

    it('should throw on failed OTP verification', async () => {
      mockOtpSecurity.verifyOtp.mockResolvedValue({
        success: false,
        reason: 'invalid',
        attemptsRemaining: 3,
      });
      await expect(
        service.verifyOtpCode('test@example.com', '000000'),
      ).rejects.toThrow('Invalid or expired OTP code');
    });
  });

  // ===== LOGIN =====
  describe('login', () => {
    it('should return session when MFA is disabled', async () => {
      const result = await service.login('test@example.com', 'password123');
      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
    });

    it('should request MFA when user has MFA enabled and TOTP set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isMfaEnabled: true });
      mockTotpService.isEnabled.mockResolvedValue(true);

      const result = await service.login('test@example.com', 'password123');
      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBeDefined();
    });

    it('should throw on lockout', async () => {
      mockRateLimiter.isLockedOut.mockResolvedValue({
        isLockedOut: true,
        retryAfterSeconds: 900,
      });
      await expect(
        service.login('test@example.com', 'password123'),
      ).rejects.toThrow('Account temporarily locked');
    });

    it('should throw on rate limit', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 60,
        resetAt: new Date(),
      });
      await expect(
        service.login('test@example.com', 'password123'),
      ).rejects.toThrow('Too many login attempts');
    });
  });

  // ===== PASSKEY =====
  describe('loginWithPasskey', () => {
    it('should create session on successful passkey login', async () => {
      const result = await service.loginWithPasskey({}, 'session-1');
      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
    });

    it('should throw on failed passkey verification', async () => {
      mockWebauthnService.verifyLogin.mockResolvedValue({
        success: false,
        error: 'Invalid passkey',
      });
      await expect(
        service.loginWithPasskey({}, 'session-1'),
      ).rejects.toThrow('Invalid passkey');
    });
  });

  // ===== MFA =====
  describe('verifyMfaChallenge', () => {
    it('should verify TOTP and create session', async () => {
      const result = await service.verifyMfaChallenge('mfa-token', 'totp', '123456');
      expect(result.success).toBe(true);
    });

    it('should throw on invalid MFA token', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('expired'); });
      await expect(
        service.verifyMfaChallenge('bad-token', 'totp', '123456'),
      ).rejects.toThrow('Invalid or expired MFA token');
    });
  });

  // ===== PASSWORD RESET =====
  describe('requestPasswordReset', () => {
    it('should return generic message for unknown tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      const result = await service.requestPasswordReset('unknown@example.com');
      expect(result.success).toBe(true);
      expect(result.message).toContain('If an account exists');
    });

    it('should create reset token and send email', async () => {
      const result = await service.requestPasswordReset('test@example.com');
      expect(result.success).toBe(true);
      expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should throw on invalid JWT', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(
        service.resetPassword('bad-token', 'newpassword'),
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });

  // ===== LOGOUT =====
  describe('logout', () => {
    it('should delete session and invalidate cache', async () => {
      await service.logout('session-1', 'tenant-1', 'user-1');
      expect(mockCacheService.del).toHaveBeenCalled();
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: 'session-1' } });
    });

    it('should handle missing sessionId gracefully', async () => {
      await service.logout(null, null, null);
      expect(mockPrisma.session.delete).not.toHaveBeenCalled();
    });
  });

  // ===== REFRESH TOKENS =====
  describe('createRefreshToken', () => {
    it('should create and return token with familyId', async () => {
      const result = await service.createRefreshToken('user-1', 'tenant-1');
      expect(result.token).toBeDefined();
      expect(result.familyId).toBeDefined();
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('rotateRefreshToken', () => {
    it('should throw on invalid token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(
        service.rotateRefreshToken('bad-token'),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should throw on expired token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        isUsed: false,
        userId: 'user-1',
        tenantId: 'tenant-1',
        familyId: 'family-1',
        user: mockUser,
      });
      await expect(
        service.rotateRefreshToken('some-token'),
      ).rejects.toThrow('Refresh token expired');
    });
  });

  describe('deleteAllRefreshTokens', () => {
    it('should delete all tokens for user', async () => {
      const count = await service.deleteAllRefreshTokens('user-1', 'tenant-1');
      expect(count).toBe(0);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', tenantId: 'tenant-1' },
      });
    });
  });

  // ===== PROFILE =====
  describe('getCurrentUserProfile', () => {
    it('should return user profile with tenantId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        avatarUrl: null,
        role: 'admin',
        isMfaEnabled: false,
        lastLogin: null,
        createdAt: new Date(),
      });
      const result = await service.getCurrentUserProfile('user-1', 'tenant-1');
      expect(result.id).toBe('user-1');
      expect(result.tenantId).toBe('tenant-1');
    });

    it('should throw when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.getCurrentUserProfile('bad-id', 'tenant-1'),
      ).rejects.toThrow('User not found');
    });
  });

  // ===== PUBLIC API SURFACE =====
  describe('public API surface', () => {
    const publicMethods = [
      'register',
      'sendOtpCode',
      'verifyOtpCode',
      'login',
      'loginWithPasskey',
      'getWebAuthnLoginOptions',
      'verifyMfaChallenge',
      'requestPasswordReset',
      'resetPassword',
      'logout',
      'createRefreshToken',
      'rotateRefreshToken',
      'deleteAllRefreshTokens',
      'getCurrentUserProfile',
    ];

    for (const method of publicMethods) {
      it(`should expose ${method} as public method`, () => {
        expect(typeof (service as any)[method]).toBe('function');
      });
    }
  });
});
