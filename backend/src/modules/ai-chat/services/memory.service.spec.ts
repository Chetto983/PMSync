import { MemoryService } from './memory.service';

describe('MemoryService', () => {
  let service: MemoryService;
  let mockPrisma: any;
  let mockEmbeddingService: any;

  beforeEach(() => {
    mockPrisma = {
      aIMemory: {
        count: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest.fn(),
    };
    mockEmbeddingService = {
      generateEmbedding: jest.fn(),
    };
    service = new MemoryService(mockPrisma, mockEmbeddingService);
  });

  describe('getMemoriesByEntity', () => {
    it('should query by contactId for contact entity type', async () => {
      const mockMemories = [
        { id: 'm1', content: 'Prefers Italian', category: 'preference', createdAt: new Date() },
      ];
      mockPrisma.aIMemory.findMany.mockResolvedValue(mockMemories);

      const result = await service.getMemoriesByEntity('t1', 'u1', 'contact-123', 'contact', 5);

      expect(mockPrisma.aIMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', userId: 'u1', contactId: 'contact-123' },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Prefers Italian');
    });

    it('should query by emailId for email entity type', async () => {
      mockPrisma.aIMemory.findMany.mockResolvedValue([]);

      await service.getMemoriesByEntity('t1', 'u1', 'email-456', 'email', 5);

      expect(mockPrisma.aIMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', userId: 'u1', emailId: 'email-456' },
        }),
      );
    });

    it('should return MemoryResult with correct shape for direct matches', async () => {
      const now = new Date();
      mockPrisma.aIMemory.findMany.mockResolvedValue([
        { id: 'm1', content: 'Payment net 30', category: 'fact', createdAt: now },
        { id: 'm2', content: 'Key contact', category: null, createdAt: now },
      ]);

      const result = await service.getMemoriesByEntity('t1', 'u1', 'c1', 'contact');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'm1',
        content: 'Payment net 30',
        category: 'fact',
        createdAt: now,
      });
      expect(result[1].category).toBeNull();
    });
  });

  describe('getRelevantMemories', () => {
    it('should return memories via direct load for small sets', async () => {
      mockPrisma.aIMemory.count.mockResolvedValue(3);
      const mockMemories = [
        { id: 'm1', content: 'Test memory', category: 'fact', createdAt: new Date() },
      ];
      mockPrisma.aIMemory.findMany.mockResolvedValue(mockMemories);

      const result = await service.getRelevantMemories('t1', 'u1', 'test query', 5);

      expect(result).toHaveLength(1);
      expect(mockPrisma.aIMemory.count).toHaveBeenCalledWith({
        where: { tenantId: 't1', userId: 'u1' },
      });
    });

    it('should return empty array on error (non-blocking)', async () => {
      mockPrisma.aIMemory.count.mockRejectedValue(new Error('DB error'));

      const result = await service.getRelevantMemories('t1', 'u1', 'test', 5);

      expect(result).toEqual([]);
    });
  });

  describe('formatMemoriesForPrompt', () => {
    it('should return empty string for no memories', () => {
      expect(service.formatMemoriesForPrompt([])).toBe('');
    });

    it('should format memories with category and date', () => {
      const memories = [
        { content: 'Prefers Italian', category: 'preference', createdAt: new Date('2026-03-25') },
      ];
      const result = service.formatMemoriesForPrompt(memories);
      expect(result).toContain('Known Facts');
      expect(result).toContain('[preference]');
      expect(result).toContain('Prefers Italian');
    });
  });
});
