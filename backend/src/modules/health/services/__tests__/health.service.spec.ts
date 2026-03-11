// Step 1: Declare mock objects before jest.mock calls (jest.mock hoists, so these must be at file scope)
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
};

// Step 2: Mock 'redis' and config BEFORE importing HealthService (jest hoists these)
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../../../config/configuration', () => ({
  getConfiguration: jest.fn(() => ({ redis: { host: 'localhost', port: 6380 } })),
  getRedisNodeConnectionOptions: jest.fn(() => ({})),
}));

// Step 3: Import HealthService AFTER mocks are declared
import { HealthService } from '../health.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  const mockConfigService = { get: jest.fn().mockReturnValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure MISTRAL_API_KEY is not in env so Mistral probe returns 'disabled'
    delete process.env.MISTRAL_API_KEY;
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.ping.mockResolvedValue('PONG');
    prisma = getTestPrismaClient();
    service = new HealthService(prisma as any, mockConfigService as any);
  });

  describe('getSystemHealth - healthy', () => {
    it('returns healthy status when DB and Redis are up', async () => {
      const result = await service.getSystemHealth();
      expect(result.status).toBe('healthy');
      expect(result.services.database.status).toBe('up');
      expect(result.services.redis.status).toBe('up');
      expect(result.services.mistral.status).toBe('disabled');
    });
  });

  describe('getSystemHealth - Redis degraded', () => {
    it('returns degraded when Redis ping fails', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await service.getSystemHealth();
      expect(result.status).toBe('degraded');
      expect(result.services.redis.status).toBe('down');
      expect(result.services.redis.error).toContain('ECONNREFUSED');
    });
  });

  describe('getSystemHealth - DB degraded', () => {
    it('returns degraded when $queryRaw throws', async () => {
      jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('DB connection refused'));
      const result = await service.getSystemHealth();
      expect(result.status).toBe('degraded');
      expect(result.services.database.status).toBe('down');
      expect(result.services.database.error).toContain('DB connection refused');
      jest.restoreAllMocks();
    });
  });

  describe('getSystemHealth - BullMQ optional', () => {
    it('omits emailSyncQueue when queueService is absent', async () => {
      const result = await service.getSystemHealth();
      expect(result.services.emailSyncQueue).toBeUndefined();
    });
  });

  describe('getSystemHealth - Mistral disabled', () => {
    it('returns mistral.status=disabled when MISTRAL_API_KEY not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      delete process.env.MISTRAL_API_KEY;
      const result = await service.getSystemHealth();
      expect(result.services.mistral.status).toBe('disabled');
    });
  });
});
