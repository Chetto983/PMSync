import { Test, TestingModule } from '@nestjs/testing';
import { MfaController } from './mfa.controller';
import { TotpService } from '../services/totp.service';
import { BackupCodesService } from '../services/backup-codes.service';
import { TrustedDeviceService } from '../services/trusted-device.service';
import { BadRequestException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { Request as ExpressRequest } from 'express';

describe('MfaController', () => {
  let controller: MfaController;

  const mockTotpService = {
    isEnabled: jest.fn(),
    generateSecret: jest.fn(),
    verifyAndActivate: jest.fn(),
    verifyCode: jest.fn(),
    disable: jest.fn(),
  };

  const mockBackupCodesService = {
    generate: jest.fn(),
    getRemainingCount: jest.fn(),
    verify: jest.fn(),
    deleteAll: jest.fn(),
  };

  const mockTrustedDeviceService = {
    listDevices: jest.fn(),
    trustDevice: jest.fn(),
    revokeDevice: jest.fn(),
    revokeAllDevices: jest.fn(),
  };

  const createMockRequest = (userId: string, email: string): AuthenticatedRequest => {
    return {
      user: { userId, email },
    } as AuthenticatedRequest;
  };

  const createMockExpressRequest = (): ExpressRequest => {
    return {
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
        'x-device-token': 'test-device-token',
      },
      cookies: {},
      ip: '192.168.1.100',
    } as unknown as ExpressRequest;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MfaController],
      providers: [
        { provide: TotpService, useValue: mockTotpService },
        { provide: BackupCodesService, useValue: mockBackupCodesService },
        { provide: TrustedDeviceService, useValue: mockTrustedDeviceService },
      ],
    }).compile();

    controller = module.get<MfaController>(MfaController);
    totpService = module.get(TotpService);
    backupCodesService = module.get(BackupCodesService);
    trustedDeviceService = module.get(TrustedDeviceService);

    jest.clearAllMocks();
  });

  // ==================== STATUS ====================

  describe('getStatus', () => {
    it('should return MFA status for user', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTotpService.isEnabled.mockResolvedValue(true);
      mockBackupCodesService.getRemainingCount.mockResolvedValue(8);
      mockTrustedDeviceService.listDevices.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const result = await controller.getStatus(req);

      expect(result).toEqual({
        totpEnabled: true,
        backupCodesRemaining: 8,
        trustedDevicesCount: 2,
      });
      expect(mockTotpService.isEnabled).toHaveBeenCalledWith('user-123');
      expect(mockBackupCodesService.getRemainingCount).toHaveBeenCalledWith('user-123');
      expect(mockTrustedDeviceService.listDevices).toHaveBeenCalledWith('user-123');
    });
  });

  // ==================== TOTP ====================

  describe('setupTotp', () => {
    it('should generate TOTP secret and QR code', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTotpService.isEnabled.mockResolvedValue(false);
      mockTotpService.generateSecret.mockResolvedValue({
        secret: 'ABCD1234',
        qrCodeDataUrl: 'data:image/png;base64,xxx',
        otpauthUrl: 'otpauth://totp/App:test@example.com?secret=ABCD1234',
      });

      const result = await controller.setupTotp(req);

      expect(result).toEqual({
        secret: 'ABCD1234',
        qrCodeDataUrl: 'data:image/png;base64,xxx',
        otpauthUrl: 'otpauth://totp/App:test@example.com?secret=ABCD1234',
      });
      expect(mockTotpService.generateSecret).toHaveBeenCalledWith('user-123', 'test@example.com');
    });

    it('should throw if TOTP already enabled', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTotpService.isEnabled.mockResolvedValue(true);

      await expect(controller.setupTotp(req)).rejects.toThrow(BadRequestException);
      await expect(controller.setupTotp(req)).rejects.toThrow('TOTP is already enabled');
    });
  });

  describe('verifyTotp', () => {
    it('should verify and activate TOTP with backup codes', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: '123456' };

      mockTotpService.verifyAndActivate.mockResolvedValue({ success: true, reason: 'valid' });
      mockBackupCodesService.generate.mockResolvedValue(['ABCD-1234', 'EFGH-5678']);

      const result = await controller.verifyTotp(req, body);

      expect(result).toEqual({
        success: true,
        message: 'TOTP enabled successfully. Save your backup codes!',
        backupCodes: ['ABCD-1234', 'EFGH-5678'],
      });
    });

    it('should throw if TOTP not set up', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: '123456' };

      mockTotpService.verifyAndActivate.mockResolvedValue({ success: false, reason: 'not_setup' });

      await expect(controller.verifyTotp(req, body)).rejects.toThrow('TOTP not set up');
    });

    it('should throw for invalid code', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: '000000' };

      mockTotpService.verifyAndActivate.mockResolvedValue({ success: false, reason: 'invalid' });

      await expect(controller.verifyTotp(req, body)).rejects.toThrow('Invalid TOTP code');
    });
  });

  describe('getTotpStatus', () => {
    it('should return TOTP enabled status', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTotpService.isEnabled.mockResolvedValue(true);

      const result = await controller.getTotpStatus(req);

      expect(result).toEqual({ enabled: true });
    });
  });

  describe('disableTotp', () => {
    it('should disable TOTP after verification', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: '123456' };

      mockTotpService.verifyCode.mockResolvedValue({ success: true, reason: 'valid' });
      mockTotpService.disable.mockResolvedValue(undefined);
      mockBackupCodesService.deleteAll.mockResolvedValue(undefined);

      const result = await controller.disableTotp(req, body);

      expect(result).toEqual({
        success: true,
        message: 'TOTP disabled. Backup codes have been deleted.',
      });
      expect(mockTotpService.disable).toHaveBeenCalledWith('user-123');
      expect(mockBackupCodesService.deleteAll).toHaveBeenCalledWith('user-123');
    });

    it('should throw for invalid code', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: '000000' };

      mockTotpService.verifyCode.mockResolvedValue({ success: false, reason: 'invalid' });

      await expect(controller.disableTotp(req, body)).rejects.toThrow('Invalid TOTP code');
    });
  });

  // ==================== BACKUP CODES ====================

  describe('generateBackupCodes', () => {
    it('should generate new backup codes when TOTP enabled', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTotpService.isEnabled.mockResolvedValue(true);
      mockBackupCodesService.generate.mockResolvedValue([
        'ABCD-1234',
        'EFGH-5678',
        'IJKL-9012',
      ]);

      const result = await controller.generateBackupCodes(req);

      expect(result.codes).toEqual(['ABCD-1234', 'EFGH-5678', 'IJKL-9012']);
      expect(result.warning).toContain('Store these codes safely');
    });

    it('should throw if TOTP not enabled', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTotpService.isEnabled.mockResolvedValue(false);

      await expect(controller.generateBackupCodes(req)).rejects.toThrow(
        'Enable TOTP first before generating backup codes',
      );
    });
  });

  describe('getBackupCodesCount', () => {
    it('should return remaining backup codes count', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockBackupCodesService.getRemainingCount.mockResolvedValue(5);

      const result = await controller.getBackupCodesCount(req);

      expect(result).toEqual({ remaining: 5 });
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify and consume backup code', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: 'ABCD-1234' };

      mockBackupCodesService.verify.mockResolvedValue({ success: true });
      mockBackupCodesService.getRemainingCount.mockResolvedValue(7);

      const result = await controller.verifyBackupCode(req, body);

      expect(result).toEqual({ success: true, remaining: 7 });
    });

    it('should throw for already used code', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: 'ABCD-1234' };

      mockBackupCodesService.verify.mockResolvedValue({ success: false, reason: 'already_used' });

      await expect(controller.verifyBackupCode(req, body)).rejects.toThrow(
        'This backup code has already been used',
      );
    });

    it('should throw for invalid code', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const body = { code: 'INVALID' };

      mockBackupCodesService.verify.mockResolvedValue({ success: false, reason: 'invalid' });

      await expect(controller.verifyBackupCode(req, body)).rejects.toThrow('Invalid backup code');
    });
  });

  // ==================== TRUSTED DEVICES ====================

  describe('listDevices', () => {
    it('should list all trusted devices', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const expressReq = createMockExpressRequest();

      mockTrustedDeviceService.listDevices.mockResolvedValue([
        {
          id: 'device-1',
          deviceName: 'Chrome on Windows',
          location: 'Rome, Italy',
          isCurrent: true,
          lastUsedAt: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'device-2',
          deviceName: 'Safari on macOS',
          location: 'Milan, Italy',
          isCurrent: false,
          lastUsedAt: new Date('2024-01-02'),
          createdAt: new Date('2024-01-02'),
        },
      ]);

      const result = await controller.listDevices(req, expressReq);

      expect(result).toHaveLength(2);
      expect(result[0].isCurrent).toBe(true);
      expect(result[1].isCurrent).toBe(false);
    });
  });

  describe('revokeDevice', () => {
    it('should revoke a specific device', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTrustedDeviceService.revokeDevice.mockResolvedValue(undefined);

      const result = await controller.revokeDevice(req, 'device-123');

      expect(result).toEqual({
        success: true,
        message: 'Device revoked successfully.',
      });
      expect(mockTrustedDeviceService.revokeDevice).toHaveBeenCalledWith('user-123', 'device-123');
    });
  });

  describe('revokeAllDevices', () => {
    it('should revoke all devices', async () => {
      const req = createMockRequest('user-123', 'test@example.com');

      mockTrustedDeviceService.revokeAllDevices.mockResolvedValue(undefined);

      const result = await controller.revokeAllDevices(req);

      expect(result).toEqual({
        success: true,
        message: 'All trusted devices revoked.',
      });
      expect(mockTrustedDeviceService.revokeAllDevices).toHaveBeenCalledWith('user-123');
    });
  });

  describe('trustCurrentDevice', () => {
    it('should trust current device', async () => {
      const req = createMockRequest('user-123', 'test@example.com');
      const expressReq = createMockExpressRequest();

      mockTrustedDeviceService.trustDevice.mockResolvedValue('new-device-token');

      const result = await controller.trustCurrentDevice(req, expressReq);

      expect(result.deviceToken).toBe('new-device-token');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
