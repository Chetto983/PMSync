import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DataCleanupService } from './data-cleanup.service';

function createMockPrisma() {
  return {
    agentActionFeedback: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    agentLearningProfile: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    aIMemory: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    aiConversation: {
      deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
      count: vi.fn().mockResolvedValue(3),
    },
  } as any;
}

describe('DataCleanupService AI chat retention', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: DataCleanupService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DataCleanupService(prisma);
  });

  it('deletes AI chat conversations older than 30 days during cleanup', async () => {
    const result = await service.cleanupExpiredData();

    expect(result.conversations).toBe(7);
    expect(prisma.aiConversation.deleteMany).toHaveBeenCalledTimes(1);

    const call = prisma.aiConversation.deleteMany.mock.calls[0][0];
    expect(call.where.updatedAt.lt).toBeInstanceOf(Date);
  });

  it('includes AI chat conversations in expired counts', async () => {
    const result = await service.getExpiredCounts();

    expect(result.conversations).toBe(3);
    expect(result.total).toBe(3);
    expect(prisma.aiConversation.count).toHaveBeenCalledTimes(1);
  });
});
