/* eslint-disable @typescript-eslint/no-explicit-any */

// --- jest.mock calls MUST come before the import of PushDispatchHandler ---

jest.mock('../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
};

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
}));

jest.mock('../../common/config', () => ({
  QUEUE_NAMES: { PUSH_DISPATCH: 'push-dispatch' },
  getRedisConnectionOptions: jest.fn(() => ({})),
  getDefaultJobOptions: jest.fn(() => ({})),
  getSharedRedisConnection: jest.fn(() => mockRedis),
  releaseSharedRedisConnection: jest.fn(),
}));

import { PushDispatchHandler } from './push-dispatch.handler';
import { EmailIndexedEvent } from '../../common/events/email.events';

const mockPrisma = {
  providerConfig: { findUnique: jest.fn() },
  email: { findFirst: jest.fn() },
} as any;

const mockPushService = {
  getUserPushPreferences: jest.fn(),
} as any;

const makeEvent = () =>
  new EmailIndexedEvent(
    'email-1',
    'tenant-1',
    'provider-1',
    'Test Subject',
    'snippet',
    'body',
    '<p>body</p>',
    'sender@example.com',
    ['recipient@example.com'],
    new Date(),
  );

describe('PushDispatchHandler', () => {
  let handler: PushDispatchHandler;

  beforeEach(async () => {
    jest.clearAllMocks();
    handler = new PushDispatchHandler(mockPrisma, mockPushService);
    await handler.onModuleInit();
  });

  describe('handleEmailIndexed', () => {
    it('should enqueue a BullMQ job when email.indexed fires (PUSH-01)', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
      });
      mockPushService.getUserPushPreferences.mockResolvedValue({
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
      mockPrisma.email.findFirst.mockResolvedValue({ threadId: null });

      await handler.handleEmailIndexed(makeEvent());

      expect(mockQueue.add).toHaveBeenCalledWith('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-1',
        subject: 'Test Subject',
        from: 'sender@example.com',
        threadId: null,
        category: 'email',
      });
    });

    it('should skip push when user has pushEmailEnabled=false', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
      });
      mockPushService.getUserPushPreferences.mockResolvedValue({
        pushEmailEnabled: false,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });

      await handler.handleEmailIndexed(makeEvent());

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should look up userId from providerId via ProviderConfig', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
      });
      mockPushService.getUserPushPreferences.mockResolvedValue({
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
      mockPrisma.email.findFirst.mockResolvedValue({ threadId: null });

      await handler.handleEmailIndexed(makeEvent());

      expect(mockPrisma.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 'provider-1' },
        select: { userId: true },
      });
    });
  });

  describe('thread grouping (PUSH-07)', () => {
    it('should use Redis INCR for dedup key on first email in thread', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
      });
      mockPushService.getUserPushPreferences.mockResolvedValue({
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
      mockPrisma.email.findFirst.mockResolvedValue({ threadId: 'thread-1' });
      mockRedis.incr.mockResolvedValue(1);

      await handler.handleEmailIndexed(makeEvent());

      expect(mockRedis.incr).toHaveBeenCalledWith(
        'push:thread:tenant-1:user-1:thread-1',
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'push:thread:tenant-1:user-1:thread-1',
        60,
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'push-email-grouped',
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          threadId: 'thread-1',
        }),
        expect.objectContaining({ delay: 60000 }),
      );
    });

    it('should skip dispatch for subsequent emails in same thread within 60s window', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
      });
      mockPushService.getUserPushPreferences.mockResolvedValue({
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
      mockPrisma.email.findFirst.mockResolvedValue({ threadId: 'thread-1' });
      mockRedis.incr.mockResolvedValue(2);

      await handler.handleEmailIndexed(makeEvent());

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should dispatch immediately when email has no threadId', async () => {
      mockPrisma.providerConfig.findUnique.mockResolvedValue({
        userId: 'user-1',
      });
      mockPushService.getUserPushPreferences.mockResolvedValue({
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
      mockPrisma.email.findFirst.mockResolvedValue({ threadId: null });

      await handler.handleEmailIndexed(makeEvent());

      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'push-email',
        expect.objectContaining({ threadId: null }),
      );
    });
  });
});
