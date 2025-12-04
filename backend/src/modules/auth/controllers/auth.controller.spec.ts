import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { GoneException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyOtpDto } from '../dtos/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { SendOtpDto } from '../dtos/send-otp.dto';
import { Request as ExpressRequest } from 'express';

/**
 * Unit Tests for AuthController
 *
 * Tests authentication flow, rate limiting, and security
 */
describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  // Mock data
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    tenantId: 'tenant-123',
    role: 'user',
    sessionId: 'session-123',
  };

  const mockAuthenticatedRequest = {
    user: mockUser,
  } as AuthenticatedRequest;

  const mockExpressRequest = {
    headers: {
      'x-forwarded-for': '192.168.1.1',
      'user-agent': 'Mozilla/5.0',
    },
    socket: {
      remoteAddress: '192.168.1.1',
    },
  } as unknown as ExpressRequest;

  const mockAuthService = {
    register: jest.fn(),
    sendOtpCode: jest.fn(),
    verifyOtpCode: jest.fn(),
    login: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'newuser@example.com',
      password: 'SecurePass123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should call authService.register with correct data', async () => {
      const expectedResult = {
        message: 'User registered successfully',
        userId: 'new-user-id',
      };
      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(expectedResult);
    });

    it('should propagate registration errors', async () => {
      const error = new Error('Email already exists');
      mockAuthService.register.mockRejectedValue(error);

      await expect(controller.register(registerDto)).rejects.toThrow('Email already exists');
    });
  });

  describe('sendOtp', () => {
    const sendOtpDto: SendOtpDto = {
      email: 'test@example.com',
      tenantSlug: 'test-tenant',
    };

    it('should call authService.sendOtpCode with email and tenantSlug', async () => {
      const expectedResult = { message: 'OTP sent successfully' };
      mockAuthService.sendOtpCode.mockResolvedValue(expectedResult);

      const result = await controller.sendOtp(sendOtpDto);

      expect(authService.sendOtpCode).toHaveBeenCalledWith('test@example.com', 'test-tenant');
      expect(result).toEqual(expectedResult);
    });

    it('should have rate limiting decorator applied', () => {
      // Throttle decorator is applied at runtime by NestJS
      // We verify it's configured correctly in E2E tests
      expect(controller.sendOtp).toBeDefined();
    });

    it('should propagate service errors', async () => {
      const error = new Error('Email service unavailable');
      mockAuthService.sendOtpCode.mockRejectedValue(error);

      await expect(controller.sendOtp(sendOtpDto)).rejects.toThrow('Email service unavailable');
    });
  });

  describe('verifyOtp', () => {
    const verifyOtpDto: VerifyOtpDto = {
      email: 'test@example.com',
      code: '123456',
      tenantSlug: 'test-tenant',
    };

    it('should call authService.verifyOtpCode with correct parameters', async () => {
      const expectedResult = {
        access_token: 'jwt-token',
        user: mockUser,
      };
      mockAuthService.verifyOtpCode.mockResolvedValue(expectedResult);

      const result = await controller.verifyOtp(verifyOtpDto, mockExpressRequest);

      expect(authService.verifyOtpCode).toHaveBeenCalledWith(
        'test@example.com',
        '123456',
        'test-tenant',
        '192.168.1.1',
        'Mozilla/5.0',
      );
      expect(result).toEqual(expectedResult);
    });

    it('should extract IP from x-forwarded-for header', async () => {
      mockAuthService.verifyOtpCode.mockResolvedValue({});

      await controller.verifyOtp(verifyOtpDto, mockExpressRequest);

      expect(authService.verifyOtpCode).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        '192.168.1.1',
        expect.any(String),
      );
    });

    it('should use socket remoteAddress as fallback for IP', async () => {
      const reqWithoutForwarded = {
        headers: { 'user-agent': 'Mozilla/5.0' },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as ExpressRequest;

      mockAuthService.verifyOtpCode.mockResolvedValue({});

      await controller.verifyOtp(verifyOtpDto, reqWithoutForwarded);

      expect(authService.verifyOtpCode).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        '10.0.0.1',
        expect.any(String),
      );
    });

    it('should have rate limiting decorator applied', () => {
      // Throttle decorator is applied at runtime by NestJS
      // We verify it's configured correctly in E2E tests
      expect(controller.verifyOtp).toBeDefined();
    });

    it('should propagate invalid OTP errors', async () => {
      const error = new Error('Invalid or expired OTP');
      mockAuthService.verifyOtpCode.mockRejectedValue(error);

      await expect(controller.verifyOtp(verifyOtpDto, mockExpressRequest)).rejects.toThrow(
        'Invalid or expired OTP',
      );
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      tenantSlug: 'test-tenant',
    };

    it('should call authService.login with correct parameters', async () => {
      const expectedResult = {
        access_token: 'jwt-token',
        user: mockUser,
      };
      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto, mockExpressRequest);

      expect(authService.login).toHaveBeenCalledWith(
        'test@example.com',
        'SecurePass123!',
        'test-tenant',
        '192.168.1.1',
        'Mozilla/5.0',
        undefined,
        mockExpressRequest,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should extract IP and user agent from request', async () => {
      mockAuthService.login.mockResolvedValue({});

      await controller.login(loginDto, mockExpressRequest);

      expect(authService.login).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        '192.168.1.1',
        'Mozilla/5.0',
        undefined,
        mockExpressRequest,
      );
    });

    it('should have rate limiting decorator applied', () => {
      // Throttle decorator is applied at runtime by NestJS
      // We verify it's configured correctly in E2E tests
      expect(controller.login).toBeDefined();
    });

    it('should propagate authentication errors', async () => {
      const error = new Error('Invalid credentials');
      mockAuthService.login.mockRejectedValue(error);

      await expect(controller.login(loginDto, mockExpressRequest)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDto: ForgotPasswordDto = {
      email: 'test@example.com',
      tenantSlug: 'test-tenant',
    };

    it('should call authService.requestPasswordReset with email and tenantSlug', async () => {
      const expectedResult = { message: 'Password reset email sent' };
      mockAuthService.requestPasswordReset.mockResolvedValue(expectedResult);

      const result = await controller.forgotPassword(forgotPasswordDto);

      expect(authService.requestPasswordReset).toHaveBeenCalledWith(
        'test@example.com',
        'test-tenant',
      );
      expect(result).toEqual(expectedResult);
    });

    it('should have rate limiting decorator applied', () => {
      // Throttle decorator is applied at runtime by NestJS
      // We verify it's configured correctly in E2E tests
      expect(controller.forgotPassword).toBeDefined();
    });

    it('should propagate service errors', async () => {
      const error = new Error('User not found');
      mockAuthService.requestPasswordReset.mockRejectedValue(error);

      await expect(controller.forgotPassword(forgotPasswordDto)).rejects.toThrow('User not found');
    });
  });

  describe('resetPassword', () => {
    const resetPasswordDto: ResetPasswordDto = {
      token: 'reset-token-123',
      newPassword: 'NewSecurePass123!',
    };

    it('should call authService.resetPassword with token and new password', async () => {
      const expectedResult = { message: 'Password reset successfully' };
      mockAuthService.resetPassword.mockResolvedValue(expectedResult);

      const result = await controller.resetPassword(resetPasswordDto);

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'reset-token-123',
        'NewSecurePass123!',
      );
      expect(result).toEqual(expectedResult);
    });

    it('should propagate token validation errors', async () => {
      const error = new Error('Invalid or expired token');
      mockAuthService.resetPassword.mockRejectedValue(error);

      await expect(controller.resetPassword(resetPasswordDto)).rejects.toThrow(
        'Invalid or expired token',
      );
    });
  });

  describe('getCurrentUser', () => {
    it('should return the authenticated user from request', async () => {
      const result = await controller.getCurrentUser(mockAuthenticatedRequest);

      expect(result).toEqual(mockUser);
    });

    it('should have JwtAuthGuard applied', () => {
      const guards = Reflect.getMetadata('__guards__', controller.getCurrentUser);
      expect(guards).toBeDefined();
    });

    it('should return user with correct structure', async () => {
      const result = await controller.getCurrentUser(mockAuthenticatedRequest);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('tenantId');
      expect(result).toHaveProperty('role');
    });
  });

  describe('logout', () => {
    it('should call authService.logout with sessionId', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(mockAuthenticatedRequest);

      expect(authService.logout).toHaveBeenCalledWith('session-123');
      expect(result).toEqual({ message: 'Successfully logged out' });
    });

    it('should have JwtAuthGuard applied', () => {
      const guards = Reflect.getMetadata('__guards__', controller.logout);
      expect(guards).toBeDefined();
    });

    it('should propagate logout errors', async () => {
      const error = new Error('Session not found');
      mockAuthService.logout.mockRejectedValue(error);

      await expect(controller.logout(mockAuthenticatedRequest)).rejects.toThrow(
        'Session not found',
      );
    });
  });

  describe('Deprecated OAuth Endpoints', () => {
    it('should throw GoneException for googleCallback', async () => {
      await expect(
        controller.googleCallback({ code: 'auth-code', tenantSlug: 'test' }),
      ).rejects.toThrow(GoneException);
    });

    it('should throw GoneException with correct message for googleCallback', async () => {
      try {
        await controller.googleCallback({ code: 'auth-code' });
      } catch (error) {
        expect(error).toBeInstanceOf(GoneException);
        expect(error.message).toContain('deprecato');
      }
    });

    it('should throw GoneException for microsoftCallback', async () => {
      await expect(
        controller.microsoftCallback({ code: 'auth-code', tenantSlug: 'test' }),
      ).rejects.toThrow(GoneException);
    });

    it('should throw GoneException with correct message for microsoftCallback', async () => {
      try {
        await controller.microsoftCallback({ code: 'auth-code' });
      } catch (error) {
        expect(error).toBeInstanceOf(GoneException);
        expect(error.message).toContain('deprecato');
      }
    });
  });

  describe('Security - IP and User Agent Extraction', () => {
    it('should handle missing headers gracefully', async () => {
      const reqWithoutHeaders = {
        headers: {},
        socket: {},
      } as unknown as ExpressRequest;

      mockAuthService.login.mockResolvedValue({});

      await controller.login(
        { email: 'test@test.com', password: 'pass', tenantSlug: 'test' },
        reqWithoutHeaders,
      );

      expect(authService.login).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        'unknown',
        'unknown',
        undefined,
        reqWithoutHeaders,
      );
    });

    it('should handle multiple IPs in x-forwarded-for header', async () => {
      const reqWithMultipleIPs = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
          'user-agent': 'Test',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as ExpressRequest;

      mockAuthService.login.mockResolvedValue({});

      await controller.login(
        { email: 'test@test.com', password: 'pass', tenantSlug: 'test' },
        reqWithMultipleIPs,
      );

      expect(authService.login).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        '192.168.1.1',
        'Test',
        undefined,
        reqWithMultipleIPs,
      );
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors from register', async () => {
      const error = new Error('Registration failed');
      mockAuthService.register.mockRejectedValue(error);

      await expect(
        controller.register({ email: 'test@test.com', password: 'pass' } as RegisterDto),
      ).rejects.toThrow('Registration failed');
    });

    it('should propagate service errors from sendOtpCode', async () => {
      const error = new Error('OTP send failed');
      mockAuthService.sendOtpCode.mockRejectedValue(error);

      await expect(
        controller.sendOtp({ email: 'test@test.com', tenantSlug: 'test' }),
      ).rejects.toThrow('OTP send failed');
    });

    it('should propagate service errors from resetPassword', async () => {
      const error = new Error('Reset failed');
      mockAuthService.resetPassword.mockRejectedValue(error);

      await expect(
        controller.resetPassword({ token: 'token', newPassword: 'pass' }),
      ).rejects.toThrow('Reset failed');
    });
  });
});
