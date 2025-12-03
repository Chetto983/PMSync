import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException, GoneException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/services/email.service';
import { OtpSecurityService } from './otp-security.service';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-session-id-12345'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let emailService: jest.Mocked<EmailService>;
  let otpSecurityService: jest.Mocked<OtpSecurityService>;

  // Mock data
  const mockTenant = {
    id: 'tenant-id-123',
    name: 'test@example.com',
    slug: 'test@example.com',
    description: 'Workspace for test@example.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-id-123',
    tenantId: 'tenant-id-123',
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedPassword',
    firstName: 'Test',
    lastName: 'User',
    isMfaEnabled: true,
    isActive: true,
    role: 'admin',
    lastLogin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOtpRecord = {
    id: 'otp-id-123',
    userId: 'user-id-123',
    code: '123456',
    type: 'email' as const,
    isUsed: false,
    expiresAt: new Date(Date.now() + 900000), // 15 minutes from now
    createdAt: new Date(),
  };

  const mockSession = {
    id: 'mock-session-id-12345',
    userId: 'user-id-123',
    token: 'mock-jwt-token',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    ipAddress: '127.0.0.1',
    userAgent: 'unknown',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    // Create mock implementations
    const mockPrismaService = {
      tenant: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      mfaCode: {
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockEmailService = {
      sendOtp: jest.fn(),
      sendPasswordReset: jest.fn(),
    };

    const mockOtpSecurityService = {
      createOtp: jest.fn().mockResolvedValue({ code: '123456', expiresAt: new Date(Date.now() + 300000) }),
      verifyOtp: jest.fn().mockResolvedValue({ success: true, reason: 'valid' }),
      generateOtp: jest.fn().mockReturnValue('123456'),
      hashOtp: jest.fn(),
      verifyOtpHash: jest.fn(),
      checkRateLimit: jest.fn().mockReturnValue({ allowed: true, attemptsRemaining: 3 }),
      cleanupExpiredEntries: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: OtpSecurityService, useValue: mockOtpSecurityService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);
    emailService = module.get(EmailService);
    otpSecurityService = module.get(OtpSecurityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('register', () => {
    it('should register a new user with existing tenant', async () => {
      // Setup - tenant must exist (no auto-creation)
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('$2b$10$hashedPassword' as never);
      prismaService.user.create.mockResolvedValue(mockUser);
      otpSecurityService.createOtp.mockResolvedValue({ code: '123456', expiresAt: new Date() });
      emailService.sendOtp.mockResolvedValue(undefined);

      // Execute
      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        tenantSlug: 'test@example.com',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.requiresOtp).toBe(true);
      // No tenant auto-creation
      expect(prismaService.tenant.create).not.toHaveBeenCalled();
    });

    it('should return generic response when tenant not found (prevent enumeration)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(null);

      // Execute
      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
      });

      // Assert - Generic response to prevent enumeration
      expect(result.success).toBe(true);
      expect(result.message).toContain('If the tenant exists');
    });

    it('should return generic response when user already exists (prevent enumeration)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      // Execute
      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
      });

      // Assert - Generic response to prevent enumeration
      expect(result.success).toBe(true);
      expect(result.message).toContain('If the tenant exists');
    });

    it('should throw ForbiddenException if tenant is inactive', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue({ ...mockTenant, isActive: false });

      // Execute & Assert
      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should normalize email by trimming and lowercasing', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('$2b$10$hashedPassword' as never);
      prismaService.user.create.mockResolvedValue(mockUser);
      otpSecurityService.createOtp.mockResolvedValue({ code: '123456', expiresAt: new Date() });
      emailService.sendOtp.mockResolvedValue(undefined);

      // Execute
      await service.register({
        email: '  TEST@Example.COM  ',
        password: 'Password123!',
      });

      // Assert
      expect(prismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com', // Trimmed and lowercased
          }),
        }),
      );
    });

    it('should hash password with bcrypt salt rounds of 12', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('$2b$12$hashedPassword' as never);
      prismaService.user.create.mockResolvedValue(mockUser);
      otpSecurityService.createOtp.mockResolvedValue({ code: '123456', expiresAt: new Date() });
      emailService.sendOtp.mockResolvedValue(undefined);

      // Execute
      await service.register({
        email: 'test@example.com',
        password: 'MySecurePassword123!',
      });

      // Assert - Updated to bcrypt salt rounds of 12
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('MySecurePassword123!', 12);
    });
  });

  describe('sendOtpCode', () => {
    it('should generate and send OTP code to user via OtpSecurityService', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      otpSecurityService.createOtp.mockResolvedValue({ code: '123456', expiresAt: new Date() });
      emailService.sendOtp.mockResolvedValue(undefined);

      // Execute
      const result = await service.sendOtpCode('test@example.com', 'test@example.com');

      // Assert - Generic response for security
      expect(result).toEqual({
        success: true,
        message: 'If the email exists, an OTP has been sent',
      });
      expect(otpSecurityService.createOtp).toHaveBeenCalledWith('user-id-123', 'email');
      expect(emailService.sendOtp).toHaveBeenCalledWith('test@example.com', '123456');
    });

    it('should return generic success if tenant not found (prevent enumeration)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(null);

      // Execute
      const result = await service.sendOtpCode('test@example.com', 'nonexistent');

      // Assert - Generic response to prevent enumeration
      expect(result.success).toBe(true);
      expect(result.message).toContain('If the email exists');
    });

    it('should return success without sending OTP if user not found (security)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);

      // Execute
      const result = await service.sendOtpCode('nonexistent@example.com', 'test@example.com');

      // Assert - Should not reveal that user doesn't exist
      expect(result.success).toBe(true);
      expect(result.message).toContain('If the email exists');
      expect(otpSecurityService.createOtp).not.toHaveBeenCalled();
    });

    it('should return generic success if user is inactive', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      // Execute
      const result = await service.sendOtpCode('test@example.com', 'test@example.com');

      // Assert
      expect(result.success).toBe(true);
      expect(otpSecurityService.createOtp).not.toHaveBeenCalled();
    });

    it('should continue even if email sending fails', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      otpSecurityService.createOtp.mockResolvedValue({ code: '123456', expiresAt: new Date() });
      emailService.sendOtp.mockRejectedValue(new Error('SMTP server unavailable'));

      // Execute
      const result = await service.sendOtpCode('test@example.com', 'test@example.com');

      // Assert - Should still succeed
      expect(result.success).toBe(true);
    });
  });

  describe('verifyOtpCode', () => {
    it('should verify valid OTP and return access token', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      otpSecurityService.verifyOtp.mockResolvedValue({ success: true, reason: 'valid' });
      jwtService.sign.mockReturnValue('mock-jwt-token');
      prismaService.session.create.mockResolvedValue(mockSession);
      prismaService.user.update.mockResolvedValue({ ...mockUser, lastLogin: new Date() });

      // Execute
      const result = await service.verifyOtpCode('test@example.com', '123456', 'test@example.com');

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'OTP verified successfully',
        accessToken: 'mock-jwt-token',
        sessionId: 'mock-session-id-12345',
        user: {
          id: 'user-id-123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'admin',
          tenantId: 'tenant-id-123',
        },
      });
      expect(otpSecurityService.verifyOtp).toHaveBeenCalledWith('user-id-123', '123456', 'email');
    });

    it('should throw UnauthorizedException if tenant not found or inactive', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.verifyOtpCode('test@example.com', '123456', 'nonexistent'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.verifyOtpCode('nonexistent@example.com', '123456', 'test@example.com'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user is inactive', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      // Execute & Assert
      await expect(
        service.verifyOtpCode('test@example.com', '123456', 'test@example.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException if OTP is invalid', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      otpSecurityService.verifyOtp.mockResolvedValue({ success: false, reason: 'invalid', attemptsRemaining: 4 });

      // Execute & Assert
      await expect(
        service.verifyOtpCode('test@example.com', '999999', 'test@example.com'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user is locked out', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      otpSecurityService.verifyOtp.mockResolvedValue({
        success: false,
        reason: 'locked_out',
        lockoutEndsAt: new Date(Date.now() + 900000)
      });

      // Execute & Assert
      await expect(
        service.verifyOtpCode('test@example.com', '123456', 'test@example.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create session with 24-hour expiration', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      otpSecurityService.verifyOtp.mockResolvedValue({ success: true, reason: 'valid' });
      jwtService.sign.mockReturnValue('mock-jwt-token');
      prismaService.session.create.mockResolvedValue(mockSession);
      prismaService.user.update.mockResolvedValue({ ...mockUser, lastLogin: new Date() });

      // Execute
      await service.verifyOtpCode(
        'test@example.com',
        '123456',
        'test@example.com',
        '127.0.0.1',
        'JestTest',
      );

      // Assert
      expect(prismaService.session.create).toHaveBeenCalledWith({
        data: {
          id: 'mock-session-id-12345',
          userId: 'user-id-123',
          token: 'mock-jwt-token',
          expiresAt: expect.any(Date),
          ipAddress: '127.0.0.1',
          userAgent: 'JestTest',
        },
      });
    });
  });

  describe('login', () => {
    it('should login user without MFA and return access token', async () => {
      // Setup
      const userWithoutMfa = { ...mockUser, isMfaEnabled: false };
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(userWithoutMfa);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('mock-jwt-token');
      prismaService.session.create.mockResolvedValue(mockSession);
      prismaService.user.update.mockResolvedValue({ ...userWithoutMfa, lastLogin: new Date() });

      // Execute
      const result = await service.login('test@example.com', 'Password123!', 'test@example.com');

      // Assert
      expect(result).toEqual({
        success: true,
        accessToken: 'mock-jwt-token',
        sessionId: 'mock-session-id-12345',
        user: {
          id: 'user-id-123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'admin',
          tenantId: 'tenant-id-123',
        },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith('Password123!', '$2b$10$hashedPassword');
    });

    it('should login user with MFA and request OTP', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser); // MFA enabled
      mockedBcrypt.compare.mockResolvedValue(true as never);
      prismaService.mfaCode.deleteMany.mockResolvedValue({ count: 0 });
      prismaService.mfaCode.create.mockResolvedValue(mockOtpRecord);
      emailService.sendOtp.mockResolvedValue(undefined);

      // Execute
      const result = await service.login('test@example.com', 'Password123!', 'test@example.com');

      // Assert
      expect(result).toEqual({
        mfaRequired: true,
        message: 'OTP code has been sent to your email',
      });
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(prismaService.session.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if tenant not found', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.login('test@example.com', 'Password123!', 'nonexistent'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);

      // Execute & Assert
      await expect(
        service.login('nonexistent@example.com', 'Password123!', 'test@example.com'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login('nonexistent@example.com', 'Password123!', 'test@example.com'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      // Execute & Assert
      await expect(
        service.login('test@example.com', 'WrongPassword', 'test@example.com'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login('test@example.com', 'WrongPassword', 'test@example.com'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('should normalize email by trimming whitespace', async () => {
      // Setup
      const userWithoutMfa = { ...mockUser, isMfaEnabled: false };
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(userWithoutMfa);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('mock-jwt-token');
      prismaService.session.create.mockResolvedValue(mockSession);
      prismaService.user.update.mockResolvedValue({ ...userWithoutMfa, lastLogin: new Date() });

      // Execute
      await service.login('  test@example.com  ', 'Password123!', 'test@example.com');

      // Assert
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { tenantId_email: { tenantId: 'tenant-id-123', email: 'test@example.com' } },
      });
    });

    it('should update lastLogin timestamp on successful login', async () => {
      // Setup
      const userWithoutMfa = { ...mockUser, isMfaEnabled: false };
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(userWithoutMfa);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('mock-jwt-token');
      prismaService.session.create.mockResolvedValue(mockSession);
      prismaService.user.update.mockResolvedValue({ ...userWithoutMfa, lastLogin: new Date() });

      // Execute
      await service.login('test@example.com', 'Password123!', 'test@example.com');

      // Assert
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-123' },
        data: { lastLogin: expect.any(Date) },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate reset token and send email', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      jwtService.sign.mockReturnValue('mock-reset-token');
      prismaService.passwordResetToken.create.mockResolvedValue({
        id: 'reset-token-id-123',
        userEmail: 'test@example.com',
        token: 'hashed-token', // Token is now hashed
        tenantId: 'tenant-id-123',
        isUsed: false,
        expiresAt: new Date(Date.now() + 900000),
        createdAt: new Date(),
      });
      emailService.sendPasswordReset.mockResolvedValue(undefined);

      // Execute
      const result = await service.requestPasswordReset('test@example.com', 'test@example.com');

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      });
      // JWT sign now includes secret option and more fields
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          type: 'password-reset',
          userId: 'user-id-123',
          tenantId: 'tenant-id-123',
        }),
        expect.objectContaining({
          expiresIn: '15m',
          secret: expect.any(String),
        }),
      );
      // Token stored is hashed (not the plaintext JWT)
      expect(prismaService.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          userEmail: 'test@example.com',
          token: expect.any(String), // Hashed token
          tenantId: 'tenant-id-123',
          expiresAt: expect.any(Date),
        },
      });
      // Email is sent with the actual token (not hash)
      expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
        'test@example.com',
        'mock-reset-token',
      );
    });

    it('should return generic success if tenant not found (security)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(null);

      // Execute
      const result = await service.requestPasswordReset('test@example.com', 'nonexistent');

      // Assert - Returns success to prevent tenant enumeration
      expect(result).toEqual({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      });
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should return success without sending email if user not found (security)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);

      // Execute
      const result = await service.requestPasswordReset(
        'nonexistent@example.com',
        'test@example.com',
      );

      // Assert - Should not reveal that user doesn't exist
      expect(result).toEqual({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      });
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('should delete previous tokens before creating new one (single active token)', async () => {
      // Setup
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      jwtService.sign.mockReturnValue('mock-reset-token');
      prismaService.passwordResetToken.create.mockResolvedValue({
        id: 'reset-token-id-123',
        userEmail: 'test@example.com',
        token: 'hashed-token',
        tenantId: 'tenant-id-123',
        isUsed: false,
        expiresAt: new Date(Date.now() + 900000),
        createdAt: new Date(),
      });
      emailService.sendPasswordReset.mockResolvedValue(undefined);

      // Execute
      await service.requestPasswordReset('test@example.com', 'test@example.com');

      // Assert - Previous tokens deleted
      expect(prismaService.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userEmail: 'test@example.com',
          tenantId: 'tenant-id-123',
        },
      });
    });
  });

  describe('resetPassword', () => {
    const mockResetToken = {
      id: 'reset-token-id-123',
      userEmail: 'test@example.com',
      token: 'hashed-token-value', // Token is now stored as hash
      tenantId: 'tenant-id-123',
      isUsed: false,
      expiresAt: new Date(Date.now() + 900000), // 15 minutes from now
      createdAt: new Date(),
    };

    it('should reset password with valid token and invalidate sessions', async () => {
      // Setup
      jwtService.verify.mockReturnValue({ email: 'test@example.com', type: 'password-reset' });
      prismaService.passwordResetToken.findUnique.mockResolvedValue(mockResetToken);
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockedBcrypt.hash.mockResolvedValue('$2b$12$newHashedPassword' as never);
      prismaService.user.update.mockResolvedValue({
        ...mockUser,
        passwordHash: '$2b$12$newHashedPassword',
      });
      prismaService.passwordResetToken.update.mockResolvedValue({
        ...mockResetToken,
        isUsed: true,
      });
      prismaService.session.deleteMany.mockResolvedValue({ count: 2 }); // Mock session invalidation

      // Execute
      const result = await service.resetPassword('valid-reset-token', 'NewPassword123!');

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'Password has been reset successfully. Please log in with your new password.',
      });
      // Verify uses separate secret
      expect(jwtService.verify).toHaveBeenCalledWith('valid-reset-token', {
        secret: expect.any(String),
      });
      // Bcrypt cost factor is now 12 for 2025 standards
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 12);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-123' },
        data: { passwordHash: '$2b$12$newHashedPassword' },
      });
      expect(prismaService.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-token-id-123' },
        data: { isUsed: true },
      });
      // Sessions should be invalidated
      expect(prismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-id-123' },
      });
    });

    it('should throw UnauthorizedException if JWT token is invalid', async () => {
      // Setup
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Execute & Assert
      await expect(service.resetPassword('invalid-token', 'NewPassword123!')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.resetPassword('invalid-token', 'NewPassword123!')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('should throw UnauthorizedException if token type is wrong', async () => {
      // Setup - token type is not password-reset
      jwtService.verify.mockReturnValue({ email: 'test@example.com', type: 'access' });

      // Execute & Assert
      await expect(service.resetPassword('wrong-type-token', 'NewPassword123!')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.resetPassword('wrong-type-token', 'NewPassword123!')).rejects.toThrow(
        'Invalid token type',
      );
    });

    it('should throw UnauthorizedException if reset token not found in database', async () => {
      // Setup
      jwtService.verify.mockReturnValue({ email: 'test@example.com', type: 'password-reset' });
      prismaService.passwordResetToken.findUnique.mockResolvedValue(null);

      // Execute & Assert
      await expect(service.resetPassword('unknown-token', 'NewPassword123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if reset token is already used', async () => {
      // Setup
      jwtService.verify.mockReturnValue({ email: 'test@example.com', type: 'password-reset' });
      prismaService.passwordResetToken.findUnique.mockResolvedValue({
        ...mockResetToken,
        isUsed: true,
      });

      // Execute & Assert
      await expect(service.resetPassword('used-token', 'NewPassword123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if reset token is expired', async () => {
      // Setup
      jwtService.verify.mockReturnValue({ email: 'test@example.com', type: 'password-reset' });
      prismaService.passwordResetToken.findUnique.mockResolvedValue({
        ...mockResetToken,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      // Execute & Assert
      await expect(service.resetPassword('expired-token', 'NewPassword123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException if user not found', async () => {
      // Setup
      jwtService.verify.mockReturnValue({ email: 'test@example.com', type: 'password-reset' });
      prismaService.passwordResetToken.findUnique.mockResolvedValue(mockResetToken);
      prismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      prismaService.user.findUnique.mockResolvedValue(null);

      // Execute & Assert
      await expect(service.resetPassword('valid-token', 'NewPassword123!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('logout', () => {
    it('should delete session on logout', async () => {
      // Setup
      prismaService.session.delete.mockResolvedValue(mockSession);

      // Execute
      await service.logout('mock-session-id-12345');

      // Assert
      expect(prismaService.session.delete).toHaveBeenCalledWith({
        where: { id: 'mock-session-id-12345' },
      });
    });

    it('should handle logout without sessionId gracefully', async () => {
      // Execute
      await service.logout(null);

      // Assert
      expect(prismaService.session.delete).not.toHaveBeenCalled();
    });

    it('should handle logout when session is already deleted', async () => {
      // Setup
      prismaService.session.delete.mockRejectedValue(new Error('Session not found'));

      // Execute & Assert - Should not throw
      await expect(service.logout('non-existent-session')).resolves.not.toThrow();
    });
  });

  describe('Deprecated OAuth Methods', () => {
    it('should throw GoneException for handleGoogleOAuth', async () => {
      // Execute & Assert
      await expect(service.handleGoogleOAuth('auth-code', 'tenant')).rejects.toThrow(
        GoneException,
      );
      await expect(service.handleGoogleOAuth('auth-code', 'tenant')).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('deprecated'),
        }),
      );
    });

    it('should throw GoneException for handleMicrosoftOAuth', async () => {
      // Execute & Assert
      await expect(service.handleMicrosoftOAuth('auth-code', 'tenant')).rejects.toThrow(
        GoneException,
      );
      await expect(service.handleMicrosoftOAuth('auth-code', 'tenant')).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('deprecated'),
        }),
      );
    });
  });
});
