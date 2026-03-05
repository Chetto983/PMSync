// Mock ESM modules that Jest cannot transform
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('@simplewebauthn/server', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthRegistrationService } from '../services/auth-registration.service';
import { AuthPasswordResetService } from '../services/auth-password-reset.service';
import { PasswordHashingService } from '../services/password-hashing.service';
import { PasswordPolicyService } from '../services/password-policy.service';

// Bypass withoutTenantScopingAsync
jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: (fn: () => any) => fn(),
}));

describe('AuthRegistrationService - Hardening', () => {
  let service: AuthRegistrationService;
  let mockPrisma: any;
  let mockPasswordHashing: any;
  let mockPasswordPolicy: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      tenant: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    mockPasswordHashing = {
      hashPassword: jest.fn().mockResolvedValue('$argon2id$new-hash'),
      verifyPassword: jest.fn(),
      dummyHash: jest.fn().mockResolvedValue(undefined),
    };
    mockPasswordPolicy = {
      validate: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      checkBreached: jest.fn().mockResolvedValue({ breached: false, count: 0 }),
    };

    const { PrismaService } = await import('../../../prisma/prisma.service');
    const { EmailService } = await import('../../email/services/email.service');
    const { OtpSecurityService } = await import('../services/otp-security.service');
    const { LegalAcceptanceService } = await import('../../compliance/services/legal-acceptance.service');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRegistrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: { sendOtp: jest.fn() } },
        { provide: OtpSecurityService, useValue: { createOtp: jest.fn().mockResolvedValue({ code: '123456' }) } },
        { provide: LegalAcceptanceService, useValue: { accept: jest.fn() } },
        { provide: PasswordHashingService, useValue: mockPasswordHashing },
        { provide: PasswordPolicyService, useValue: mockPasswordPolicy },
      ],
    }).compile();

    service = module.get<AuthRegistrationService>(AuthRegistrationService);
  });

  const TENANT = { id: 'tenant-1', slug: 'test@example.com', isActive: true };

  describe('Password policy validation on registration', () => {
    it('should validate password policy before creating user', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', tenantId: TENANT.id });

      await service.register({
        email: 'new@example.com',
        password: 'a-secure-password-that-is-long',
      });

      expect(mockPasswordPolicy.validate).toHaveBeenCalledWith('a-secure-password-that-is-long');
    });

    it('should throw BadRequestException when policy fails', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPasswordPolicy.validate.mockResolvedValue({
        valid: false,
        errors: ['Password must be at least 8 characters'],
      });

      await expect(
        service.register({ email: 'new@example.com', password: 'short' }),
      ).rejects.toThrow(BadRequestException);

      // User should NOT have been created
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('Argon2id hashing via PasswordHashingService', () => {
    it('should use PasswordHashingService.hashPassword instead of bcrypt.hash', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', tenantId: TENANT.id });

      await service.register({
        email: 'new@example.com',
        password: 'a-secure-password-that-is-long',
      });

      expect(mockPasswordHashing.hashPassword).toHaveBeenCalledWith('a-secure-password-that-is-long');
    });
  });

  describe('Registration enumeration protection', () => {
    it('should return identical message for existing and new users', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);

      // Case 1: User already exists
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user', email: 'test@example.com' });
      const existingResult = await service.register({
        email: 'test@example.com',
        password: 'a-secure-password-that-is-long',
      });

      // Case 2: New user
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'new-user', tenantId: TENANT.id });
      const newResult = await service.register({
        email: 'new@example.com',
        password: 'a-secure-password-that-is-long',
      });

      expect(existingResult.message).toBe(newResult.message);
    });

    it('should call dummyHash when user already exists (timing protection)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user', email: 'test@example.com' });

      await service.register({
        email: 'test@example.com',
        password: 'a-secure-password-that-is-long',
      });

      expect(mockPasswordHashing.dummyHash).toHaveBeenCalled();
    });
  });

  describe('OTP fake delay for non-existent user', () => {
    it('should take at least 100ms when user not found in sendOtpCode', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const start = Date.now();
      await service.sendOtpCode('nonexist@example.com');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow 10ms tolerance
    });
  });
});

describe('AuthPasswordResetService - Hardening', () => {
  let service: AuthPasswordResetService;
  let mockPrisma: any;
  let mockPasswordHashing: any;
  let mockPasswordPolicy: any;
  let mockJwtService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Set env for password reset constructor
    process.env.PASSWORD_RESET_SECRET = 'a'.repeat(32);
    process.env.JWT_SECRET = 'test-jwt-secret-long-enough-for-min';

    mockPrisma = {
      tenant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: {
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };
    mockJwtService = {
      sign: jest.fn().mockReturnValue('reset-jwt-token'),
      verify: jest.fn(),
    };
    mockPasswordHashing = {
      hashPassword: jest.fn().mockResolvedValue('$argon2id$new-hash'),
      verifyPassword: jest.fn(),
      dummyHash: jest.fn(),
    };
    mockPasswordPolicy = {
      validate: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
      checkBreached: jest.fn(),
    };

    const { PrismaService } = await import('../../../prisma/prisma.service');
    const { JwtService } = await import('@nestjs/jwt');
    const { EmailService } = await import('../../email/services/email.service');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthPasswordResetService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: { sendPasswordReset: jest.fn() } },
        { provide: PasswordHashingService, useValue: mockPasswordHashing },
        { provide: PasswordPolicyService, useValue: mockPasswordPolicy },
      ],
    }).compile();

    service = module.get<AuthPasswordResetService>(AuthPasswordResetService);
  });

  const TENANT = { id: 'tenant-1', slug: 'test@example.com', isActive: true };
  const USER = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$oldhash',
    tenantId: 'tenant-1',
    isActive: true,
  };

  describe('Password reset uses PasswordHashingService', () => {
    it('should use PasswordHashingService.verifyPassword for same-password check', async () => {
      mockJwtService.verify.mockReturnValue({
        email: USER.email,
        type: 'password-reset',
        userId: USER.id,
        tenantId: TENANT.id,
      });
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userEmail: USER.email,
        tenantId: TENANT.id,
        isUsed: false,
        expiresAt: new Date(Date.now() + 60000),
      });
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });
      mockPrisma.user.update.mockResolvedValue(USER);
      mockPrisma.passwordResetToken.update.mockResolvedValue({});

      await service.resetPassword('token', 'new-long-password-secure-123');

      expect(mockPasswordHashing.verifyPassword).toHaveBeenCalledWith(
        'new-long-password-secure-123',
        USER.passwordHash,
      );
    });

    it('should use PasswordHashingService.hashPassword for new password', async () => {
      mockJwtService.verify.mockReturnValue({
        email: USER.email,
        type: 'password-reset',
        userId: USER.id,
        tenantId: TENANT.id,
      });
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userEmail: USER.email,
        tenantId: TENANT.id,
        isUsed: false,
        expiresAt: new Date(Date.now() + 60000),
      });
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });
      mockPrisma.user.update.mockResolvedValue(USER);
      mockPrisma.passwordResetToken.update.mockResolvedValue({});

      await service.resetPassword('token', 'new-long-password-secure-123');

      expect(mockPasswordHashing.hashPassword).toHaveBeenCalledWith('new-long-password-secure-123');
    });

    it('should validate password policy before saving new password', async () => {
      mockJwtService.verify.mockReturnValue({
        email: USER.email,
        type: 'password-reset',
        userId: USER.id,
        tenantId: TENANT.id,
      });
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-1',
        userEmail: USER.email,
        tenantId: TENANT.id,
        isUsed: false,
        expiresAt: new Date(Date.now() + 60000),
      });
      mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPasswordHashing.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });
      mockPasswordPolicy.validate.mockResolvedValue({
        valid: false,
        errors: ['Password must be at least 8 characters'],
      });

      await expect(
        service.resetPassword('token', 'short'),
      ).rejects.toThrow(BadRequestException);

      // hashPassword should NOT have been called
      expect(mockPasswordHashing.hashPassword).not.toHaveBeenCalled();
    });
  });
});
