import { Test, TestingModule } from '@nestjs/testing';
import { TelegramSettingsController } from '../telegram-settings.controller';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';

describe('TelegramSettingsController', () => {
  let controller: TelegramSettingsController;
  let prisma: jest.Mocked<PrismaService>;
  let cacheService: jest.Mocked<CacheService>;

  const mockReq = {
    user: { id: 'user-1', tenantId: 'tenant-1' },
  } as any;

  const mockSettings = {
    id: 'setting-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    telegramChatId: '12345',
    isActive: true,
    slotMattina: '08:30',
    slotPomeriggio: '14:00',
    slotSera: '18:00',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramSettingsController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            telegramSettings: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: CacheService,
          useValue: {
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn(),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(TelegramSettingsController);
    prisma = module.get(PrismaService);
    cacheService = module.get(CacheService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('get', () => {
    it('should return settings wrapped in data envelope', async () => {
      (prisma.telegramSettings.findUnique as jest.Mock).mockResolvedValue(mockSettings);

      const result = await controller.get(mockReq);

      expect(prisma.telegramSettings.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toEqual({ data: mockSettings });
    });

    it('should return { data: null } when no settings exist', async () => {
      (prisma.telegramSettings.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await controller.get(mockReq);

      expect(result).toEqual({ data: null });
    });
  });

  describe('update', () => {
    it('should upsert settings with DTO fields', async () => {
      const dto = { isActive: true, slotMattina: '09:00' };
      (prisma.telegramSettings.upsert as jest.Mock).mockResolvedValue(mockSettings);

      const result = await controller.update(mockReq, dto as any);

      expect(prisma.telegramSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({
            tenantId: 'tenant-1',
            userId: 'user-1',
          }),
        }),
      );
      expect(result).toEqual({ data: mockSettings });
    });
  });

  describe('generateLinkToken', () => {
    it('should create token, store in cache, and return deepLink', async () => {
      const result = await controller.generateLinkToken(mockReq);

      // Returns { data: { token, deepLink, expiresIn } }
      expect(result.data).toHaveProperty('token');
      expect(result.data).toHaveProperty('deepLink');
      expect(result.data).toHaveProperty('expiresIn', 300);
      expect(typeof result.data.token).toBe('string');
      expect(result.data.token).toHaveLength(32); // 16 bytes hex
      expect(result.data.deepLink).toContain(result.data.token);
      expect(result.data.deepLink).toContain('t.me/');

      expect(cacheService.set).toHaveBeenCalledWith(
        result.data.token,
        { tenantId: 'tenant-1', userId: 'user-1' },
        { namespace: CacheNamespace.TELEGRAM_LINK, ttl: 300 },
      );
    });
  });

  describe('checkLinkStatus', () => {
    it('should return linked: true when chatId exists', async () => {
      (prisma.telegramSettings.findUnique as jest.Mock).mockResolvedValue({
        telegramChatId: '12345',
        isActive: true,
      });

      const result = await controller.checkLinkStatus(mockReq);

      expect(result).toEqual({
        data: { linked: true, active: true },
      });
    });

    it('should return linked: false when no settings', async () => {
      (prisma.telegramSettings.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await controller.checkLinkStatus(mockReq);

      expect(result).toEqual({
        data: { linked: false, active: false },
      });
    });
  });

  describe('disconnect', () => {
    it('should delete settings and return { data: null }', async () => {
      (prisma.telegramSettings.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await controller.disconnect(mockReq);

      expect(prisma.telegramSettings.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toEqual({ data: null });
    });
  });
});
