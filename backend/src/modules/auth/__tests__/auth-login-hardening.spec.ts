// Mock ESM modules that Jest cannot transform
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('@simplewebauthn/server', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AuthLoginService } from '../services/auth-login.service';
import { PasswordHashingService } from '../services/password-hashing.service';
import { PasswordPolicyService } from '../services/password-policy.service';

// Minimal mocks
const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  session: { create: jest.fn() },
};
const mockJwtService = { sign: jest.fn().mockReturnValue('jwt-token'), verify: jest.fn() };
const mockOtpSecurity = { verifyOtp: jest.fn() };
const mockTotpService = { isEnabled: jest.fn(), verifyCode: jest.fn() };
const mockBackupCodesService = { getRemainingCount: jest.fn(), verify: jest.fn() };
const mockTrustedDeviceService = { verifyDevice: jest.fn(), trustDevice: jest.fn() };
const mockWebauthnService = { verifyLogin: jest.fn(), generateLoginOptions: jest.fn() };
const mockRateLimiter = {
  isLockedOut: jest.fn().mockResolvedValue({ isLockedOut: false, retryAfterSeconds: 0 }),
  recordFailedAttempt: jest.fn().mockResolvedValue({ isLockedOut: false, retryAfterSeconds: 0 }),
  clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date(), retryAfterSeconds: 0 }),
};
const mockPasswordHashing = {
  verifyPassword: jest.fn(),
  hashPassword: jest.fn().mockResolvedValue('$argon2id$new-hash'),
  dummyHash: jest.fn().mockResolvedValue(undefined),
};
const mockPasswordPolicy = {
  validate: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  checkBreached: jest.fn().mockResolvedValue({ breached: false, count: 0 }),
};

// Bypass withoutTenantScopingAsync so we can test the private methods directly
jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: (fn: () => any) => fn(),
}));

describe('AuthLoginService - Hardening', () => {
  let service: AuthLoginService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { PrismaService } = await import('../../../prisma/prisma.service');
    const { JwtService } = await import('@nestjs/jwt');
    const { OtpSecurityService } = await import('../services/otp-security.service');
    const { TotpService } = await import('../services/totp.service');
    const { BackupCodesService } = await import('../services/backup-codes.service');
    const { TrustedDeviceService } = await import('../services/trusted-device.service');
    const { WebAuthnService } = await import('../services/webauthn.service');
    const { RedisRateLimiterService } = await import('../../../common/services/redis-rate-limiter.service');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthLoginService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: OtpSecurityService, useValue: mockOtpSecurity },
        { provide: TotpService, useValue: mockTotpService },
        { provide: BackupCodesService, useValue: mockBackupCodesService },
        { provide: TrustedDeviceService, useValue: mockTrustedDeviceService },
        { provide: WebAuthnService, useValue: mockWebauthnService },
        { provide: RedisRateLimiterService, useValue: mockRateLimiter },
        { provide: PasswordHashingService, useValue: mockPasswordHashing },
        { provide: PasswordPolicyService, useValue: mockPasswordPolicy },
      ],
    }).compile();

    service = module.get<AuthLoginService>(AuthLoginService);
  });

  const TENANT = { id: 'tenant-1', slug: 'test@example.com', isActive: true };
  const USER = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$somebcrypthash',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    tenantId: 'tenant-1',
    isActive: true,
    isMfaEnabled: false,
    lastLogin: null,
  };

  describe('Dual-algo verify + rehash', () => {
    it('should use PasswordHashingService.verifyPassword instead of bcrypt.compare', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      await service.login('test@example.com', 'password123456789', undefined, '1.2.3.4');

      expect(mockPasswordHashing.verifyPassword).toHaveBeenCalledWith(
        'password123456789',
        USER.passwordHash,
      );
    });

    it('should rehash bcrypt password to Argon2id on successful login', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: true });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });
      mockPrisma.user.update.mockResolvedValue(USER);

      await service.login('test@example.com', 'password123456789', undefined, '1.2.3.4');

      expect(mockPasswordHashing.hashPassword).toHaveBeenCalledWith('password123456789');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER.id },
          data: expect.objectContaining({ passwordHash: '$argon2id$new-hash' }),
        }),
      );
    });

    it('should NOT rehash when Argon2id password verified (needsRehash=false)', async () => {
      const argon2User = { ...USER, passwordHash: '$argon2id$existing-hash' };
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(argon2User);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      await service.login('test@example.com', 'password123456789', undefined, '1.2.3.4');

      expect(mockPasswordHashing.hashPassword).not.toHaveBeenCalled();
    });
  });

  describe('Dummy hash for user-not-found', () => {
    it('should call dummyHash() when user not found before throwing', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nonexist@example.com', 'password123456789', undefined, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPasswordHashing.dummyHash).toHaveBeenCalled();
    });
  });

  describe('Unified error messages', () => {
    it('should throw UnauthorizedException (not BadRequestException) for missing tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.login('test@example.com', 'password123456789', undefined, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);

      // Must NOT throw BadRequestException with 'Tenant not found'
      await expect(
        service.login('test@example.com', 'password123456789', undefined, '1.2.3.4'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw "Invalid credentials" for wrong password', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });

      await expect(
        service.login('test@example.com', 'wrongpassword12345', undefined, '1.2.3.4'),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Per-email rate limiting', () => {
    it('should check both IP and email lockout in parallel', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      await service.login('test@example.com', 'password123456789', undefined, '1.2.3.4');

      // isLockedOut should be called for both IP and email keys
      expect(mockRateLimiter.isLockedOut).toHaveBeenCalledWith('login:1.2.3.4');
      expect(mockRateLimiter.isLockedOut).toHaveBeenCalledWith('login:email:test@example.com');
    });

    it('should block when email is locked out', async () => {
      mockRateLimiter.isLockedOut
        .mockResolvedValueOnce({ isLockedOut: false, retryAfterSeconds: 0 }) // IP OK
        .mockResolvedValueOnce({ isLockedOut: true, lockoutEndsAt: new Date(), retryAfterSeconds: 300 }); // Email locked

      await expect(
        service.login('test@example.com', 'password123456789', undefined, '1.2.3.4'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should record failed attempt on both IP and email dimensions', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });

      await expect(
        service.login('test@example.com', 'wrongpassword12345', undefined, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith('login:1.2.3.4', 5, 900);
      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith('login:email:test@example.com', 10, 900);
    });

    it('should clear both IP and email rate limits on successful login', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      await service.login('test@example.com', 'password123456789', undefined, '1.2.3.4');

      expect(mockRateLimiter.clearFailedAttempts).toHaveBeenCalledWith('login:1.2.3.4');
      expect(mockRateLimiter.clearFailedAttempts).toHaveBeenCalledWith('login:email:test@example.com');
    });
  });

  describe('Password policy warning', () => {
    it('should include passwordPolicyWarning=true when password fails new 15-char policy', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      // Simulate short password (< 15 chars)
      const result = await service.login('test@example.com', 'short1234567', undefined, '1.2.3.4');

      // Should include warning flag
      expect(result).toHaveProperty('passwordPolicyWarning', true);
    });

    it('should include passwordPolicyWarning=false when password meets policy', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      const result = await service.login('test@example.com', 'a-very-long-password-that-is-secure', undefined, '1.2.3.4');

      expect(result).toHaveProperty('passwordPolicyWarning', false);
    });
  });
});
