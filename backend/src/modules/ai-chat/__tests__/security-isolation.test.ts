/**
 * Security Isolation Tests -- RED phase (Wave 0)
 *
 * Tests for BUG-2 (userId check on getConversation/deleteConversation)
 * and RULE-1 (tenantId relation filter on message queries).
 *
 * These tests MUST FAIL until Plan 01 implements the fixes.
 * They verify that security invariants are enforced at the data layer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationService } from '../services/conversation.service';

describe('Security Isolation (BUG-2 + RULE-1)', () => {
  // Shared mock primitives
  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';
  const OTHER_USER_ID = 'user-2';
  const CONV_ID = 'conv-1';

  const mockConversation = {
    id: CONV_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    title: 'Test Conversation',
    summary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: Record<string, any>;
  let service: ConversationService;

  beforeEach(() => {
    prisma = {
      aiConversation: {
        findFirst: vi.fn().mockResolvedValue(mockConversation),
        findUnique: vi.fn().mockResolvedValue(mockConversation),
        delete: vi.fn().mockResolvedValue(mockConversation),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      aiMessage: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn(async (callback: (trx: any) => unknown) =>
        callback(prisma),
      ),
    };

    service = new ConversationService(prisma as any);
  });

  // ---- BUG-2: userId rejection on getConversation ----

  describe('BUG-2: getConversation userId check', () => {
    it('should include userId in the where clause when loading a conversation', async () => {
      await service.getConversation(CONV_ID, TENANT_ID, USER_ID);

      const call = prisma.aiConversation.findFirst.mock.calls[0][0];
      expect(call.where).toHaveProperty('userId', USER_ID);
    });

    it('should return null when userId does not match the conversation owner', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      const result = await service.getConversation(CONV_ID, TENANT_ID, OTHER_USER_ID);
      expect(result).toBeNull();

      const call = prisma.aiConversation.findFirst.mock.calls[0][0];
      expect(call.where).toHaveProperty('userId', OTHER_USER_ID);
    });
  });

  // ---- BUG-2: userId rejection on deleteConversation ----

  describe('BUG-2: deleteConversation userId check', () => {
    it('should include userId in the where clause when deleting a conversation', async () => {
      await service.deleteConversation(CONV_ID, TENANT_ID, USER_ID);

      // deleteMany should be called with userId in the where clause
      const call = prisma.aiConversation.deleteMany.mock.calls[0][0];
      expect(call.where).toHaveProperty('userId', USER_ID);
      expect(call.where).toHaveProperty('tenantId', TENANT_ID);
    });

    it('should return false when userId does not match', async () => {
      // deleteMany returns count=0 when no matching rows
      prisma.aiConversation.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteConversation(CONV_ID, TENANT_ID, OTHER_USER_ID);
      expect(result).toBe(false);

      const call = prisma.aiConversation.deleteMany.mock.calls[0][0];
      expect(call.where).toHaveProperty('userId', OTHER_USER_ID);
    });
  });

  // ---- RULE-1: tenantId on message queries ----

  describe('RULE-1: tenantId relation filter on getMessagesForContext', () => {
    it('should include tenantId in the where clause via conversation relation', async () => {
      await service.getMessagesForContext(CONV_ID, 10, TENANT_ID);

      const call = prisma.aiMessage.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(call.where);
      expect(whereStr).toContain('tenantId');
    });
  });

  describe('RULE-1: tenantId relation filter on getRecentMessages', () => {
    it('should include tenantId in the where clause via conversation relation', async () => {
      await service.getRecentMessages(CONV_ID, 10, TENANT_ID);

      const call = prisma.aiMessage.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(call.where);
      expect(whereStr).toContain('tenantId');
    });
  });

  describe('RULE-1: tenantId relation filter on getMessageCount', () => {
    it('should include tenantId in the where clause via conversation relation', async () => {
      await service.getMessageCount(CONV_ID, TENANT_ID);

      const call = prisma.aiMessage.count.mock.calls[0][0];
      const whereStr = JSON.stringify(call.where);
      expect(whereStr).toContain('tenantId');
    });
  });

  describe('RULE-1: tenantId relation filter on getOlderMessages', () => {
    it('should include tenantId in the where clause via conversation relation', async () => {
      prisma.aiMessage.count.mockResolvedValue(20);
      prisma.aiMessage.findMany.mockResolvedValue([]);

      await service.getOlderMessages(CONV_ID, 10, TENANT_ID);

      const findManyCall = prisma.aiMessage.findMany.mock.calls[0][0];
      const whereStr = JSON.stringify(findManyCall.where);
      expect(whereStr).toContain('tenantId');
    });
  });
});
