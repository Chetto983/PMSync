import { Test, TestingModule } from '@nestjs/testing';
import { TrustedDeviceService, TrustedDeviceInfo } from './trusted-device.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Request } from 'express';

describe('TrustedDeviceService', () => {
  let service: TrustedDeviceService;

  const mockPrismaService = {
    trustedDevice: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'x-forwarded-for': '192.168.1.100',
      },
      ip: '192.168.1.100',
      socket: {
        remoteAddress: '192.168.1.100',
      },
      ...overrides,
    } as unknown as Request;
  };

  beforeEach(async () => {
    process.env.TRUSTED_DEVICE_MAX = '10';
    process.env.TRUSTED_DEVICE_EXPIRY_DAYS = '30';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustedDeviceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TrustedDeviceService>(TrustedDeviceService);

    jest.clearAllMocks();
  });

  describe('trustDevice', () => {
    it('should create a trusted device token', async () => {
      const userId = 'user-123';
      const request = createMockRequest();

      mockPrismaService.trustedDevice.count.mockResolvedValue(0);
      mockPrismaService.trustedDevice.create.mockResolvedValue({
        id: 'device-123',
        userId,
        deviceToken: 'generated-uuid',
        deviceName: 'Chrome on Windows',
        deviceHash: 'hash',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const token = await service.trustDevice(userId, request);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(mockPrismaService.trustedDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            deviceName: 'Chrome on Windows',
          }),
        }),
      );
    });

    it('should remove oldest device when at max limit', async () => {
      const userId = 'user-123';
      const request = createMockRequest();

      mockPrismaService.trustedDevice.count.mockResolvedValue(10); // At max
      mockPrismaService.trustedDevice.findFirst.mockResolvedValue({
        id: 'oldest-device',
        userId,
        lastUsedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });
      mockPrismaService.trustedDevice.delete.mockResolvedValue({});
      mockPrismaService.trustedDevice.create.mockResolvedValue({
        id: 'new-device',
        userId,
        deviceToken: 'new-token',
      });

      await service.trustDevice(userId, request);

      expect(mockPrismaService.trustedDevice.delete).toHaveBeenCalledWith({
        where: { id: 'oldest-device' },
      });
    });

    it('should parse device name from user agent', async () => {
      const userId = 'user-123';
      const firefoxRequest = createMockRequest({
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/120.0',
        },
      } as any);

      mockPrismaService.trustedDevice.count.mockResolvedValue(0);
      mockPrismaService.trustedDevice.create.mockImplementation(({ data }) => {
        return Promise.resolve({ ...data, id: 'device-123' });
      });

      await service.trustDevice(userId, firefoxRequest);

      expect(mockPrismaService.trustedDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deviceName: 'Firefox on macOS',
          }),
        }),
      );
    });
  });

  describe('verifyDevice', () => {
    it('should verify a valid device token', async () => {
      const userId = 'user-123';
      const token = 'valid-token';
      const request = createMockRequest();

      mockPrismaService.trustedDevice.findUnique.mockResolvedValue({
        id: 'device-123',
        userId,
        deviceToken: token,
        deviceHash: service['hashDeviceFingerprint'](
          request.headers['user-agent'] as string,
          '192.168.1.100',
        ),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Future
      });

      mockPrismaService.trustedDevice.update.mockResolvedValue({});

      const result = await service.verifyDevice(userId, token, request);

      expect(result).toBe(true);
      expect(mockPrismaService.trustedDevice.update).toHaveBeenCalled();
    });

    it('should return false for expired token', async () => {
      const userId = 'user-123';
      const token = 'expired-token';
      const request = createMockRequest();

      mockPrismaService.trustedDevice.findUnique.mockResolvedValue({
        id: 'device-123',
        userId,
        deviceToken: token,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Past
      });

      mockPrismaService.trustedDevice.delete.mockResolvedValue({});

      const result = await service.verifyDevice(userId, token, request);

      expect(result).toBe(false);
      expect(mockPrismaService.trustedDevice.delete).toHaveBeenCalled();
    });

    it('should return false for non-existent token', async () => {
      const userId = 'user-123';
      const request = createMockRequest();

      mockPrismaService.trustedDevice.findUnique.mockResolvedValue(null);

      const result = await service.verifyDevice(userId, 'non-existent', request);

      expect(result).toBe(false);
    });

    it('should return false for user mismatch', async () => {
      const userId = 'user-123';
      const token = 'valid-token';
      const request = createMockRequest();

      mockPrismaService.trustedDevice.findUnique.mockResolvedValue({
        id: 'device-123',
        userId: 'different-user', // Different user
        deviceToken: token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const result = await service.verifyDevice(userId, token, request);

      expect(result).toBe(false);
    });

    it('should return false for empty token', async () => {
      const userId = 'user-123';
      const request = createMockRequest();

      const result = await service.verifyDevice(userId, '', request);

      expect(result).toBe(false);
    });
  });

  describe('listDevices', () => {
    it('should list all trusted devices for a user', async () => {
      const userId = 'user-123';
      const currentToken = 'current-token';

      mockPrismaService.trustedDevice.findMany.mockResolvedValue([
        {
          id: 'device-1',
          deviceToken: currentToken,
          deviceName: 'Chrome on Windows',
          location: 'Rome, Italy',
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: 'device-2',
          deviceToken: 'other-token',
          deviceName: 'Safari on macOS',
          location: 'Milan, Italy',
          lastUsedAt: new Date(Date.now() - 86400000),
          createdAt: new Date(Date.now() - 86400000),
        },
      ]);

      const devices: TrustedDeviceInfo[] = await service.listDevices(userId, currentToken);

      expect(devices).toHaveLength(2);
      expect(devices[0].isCurrent).toBe(true);
      expect(devices[1].isCurrent).toBe(false);
    });
  });

  describe('revokeDevice', () => {
    it('should revoke a specific device', async () => {
      const userId = 'user-123';
      const deviceId = 'device-123';

      mockPrismaService.trustedDevice.findFirst.mockResolvedValue({
        id: deviceId,
        userId,
      });
      mockPrismaService.trustedDevice.delete.mockResolvedValue({});

      await service.revokeDevice(userId, deviceId);

      expect(mockPrismaService.trustedDevice.delete).toHaveBeenCalledWith({
        where: { id: deviceId },
      });
    });

    it('should throw error if device not found', async () => {
      const userId = 'user-123';

      mockPrismaService.trustedDevice.findFirst.mockResolvedValue(null);

      await expect(service.revokeDevice(userId, 'non-existent')).rejects.toThrow('Device not found');
    });
  });

  describe('revokeAllDevices', () => {
    it('should revoke all devices for a user', async () => {
      const userId = 'user-123';

      mockPrismaService.trustedDevice.deleteMany.mockResolvedValue({ count: 5 });

      await service.revokeAllDevices(userId);

      expect(mockPrismaService.trustedDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  describe('cleanupExpiredDevices', () => {
    it('should delete all expired devices', async () => {
      mockPrismaService.trustedDevice.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.cleanupExpiredDevices();

      expect(count).toBe(3);
      expect(mockPrismaService.trustedDevice.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });
  });

  describe('device fingerprinting', () => {
    it('should hash device fingerprint consistently', () => {
      const userAgent = 'Mozilla/5.0 Chrome/120.0.0.0';
      const ip = '192.168.1.100';

      const hash1 = service['hashDeviceFingerprint'](userAgent, ip);
      const hash2 = service['hashDeviceFingerprint'](userAgent, ip);

      expect(hash1).toBe(hash2);
    });

    it('should use partial IP for flexibility', () => {
      const userAgent = 'Mozilla/5.0 Chrome/120.0.0.0';

      const hash1 = service['hashDeviceFingerprint'](userAgent, '192.168.1.100');
      const hash2 = service['hashDeviceFingerprint'](userAgent, '192.168.1.200');

      // Same first 3 octets should produce same hash
      expect(hash1).toBe(hash2);
    });
  });
});
