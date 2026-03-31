 

// --- jest.mock calls MUST come before the import of PushDispatchWorker ---

jest.mock('../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

const mockWorkerInstance = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockRedis = {
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => mockWorkerInstance),
}));

jest.mock('../../common/config', () => ({
  QUEUE_NAMES: { PUSH_DISPATCH: 'push-dispatch' },
  getRedisConnectionOptions: jest.fn(() => ({})),
  getSharedRedisConnection: jest.fn(() => mockRedis),
  releaseSharedRedisConnection: jest.fn(),
}));

import { PushDispatchWorker } from './push-dispatch.worker';

const mockPushService = {
  getSubscriptionsForUser: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
  deleteStaleSubscription: jest.fn().mockResolvedValue(undefined),
} as any;

const makeJob = (name: string, data: Record<string, unknown>) =>
  ({ name, data }) as any;

const sub1 = {
  id: 'sub-1',
  endpoint: 'https://push1.example.com',
  p256dh: 'key1',
  auth: 'auth1',
};
const sub2 = {
  id: 'sub-2',
  endpoint: 'https://push2.example.com',
  p256dh: 'key2',
  auth: 'auth2',
};

describe('PushDispatchWorker', () => {
  let worker: PushDispatchWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    worker = new PushDispatchWorker(mockPushService);
    await worker.onModuleInit();
  });

  describe('process', () => {
    it('should call sendNotification for each user subscription (PUSH-02)', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1, sub2]);

      const job = makeJob('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-1',
        subject: 'Test',
        from: 'sender@example.com',
        threadId: null,
        category: 'email',
      });

      await (worker as any).process(job);

      expect(mockPushService.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should fan out to all subscriptions for multi-device delivery (PUSH-04)', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1, sub2]);

      const job = makeJob('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-1',
        subject: 'Test',
        from: 'sender@example.com',
        threadId: null,
        category: 'email',
      });

      await (worker as any).process(job);

      expect(mockPushService.sendNotification).toHaveBeenNthCalledWith(
        1,
        { endpoint: 'https://push1.example.com', p256dh: 'key1', auth: 'auth1' },
        expect.any(String),
      );
      expect(mockPushService.sendNotification).toHaveBeenNthCalledWith(
        2,
        { endpoint: 'https://push2.example.com', p256dh: 'key2', auth: 'auth2' },
        expect.any(String),
      );
    });

    it('should delete stale subscription on 410 response (PUSH-03)', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1]);
      mockPushService.sendNotification.mockRejectedValue({ statusCode: 410 });

      const job = makeJob('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-1',
        subject: 'Test',
        from: 'sender@example.com',
        threadId: null,
        category: 'email',
      });

      await (worker as any).process(job);

      expect(mockPushService.deleteStaleSubscription).toHaveBeenCalledWith(
        'sub-1',
        'tenant-1',
      );
    });

    it('should delete stale subscription on 404 response (PUSH-03)', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1]);
      mockPushService.sendNotification.mockRejectedValue({ statusCode: 404 });

      const job = makeJob('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-1',
        subject: 'Test',
        from: 'sender@example.com',
        threadId: null,
        category: 'email',
      });

      await (worker as any).process(job);

      expect(mockPushService.deleteStaleSubscription).toHaveBeenCalledWith(
        'sub-1',
        'tenant-1',
      );
    });

    it('should build grouped notification payload with count for push-email-grouped jobs', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1]);
      mockRedis.get.mockResolvedValue('3');

      const job = makeJob('push-email-grouped', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-1',
        subject: 'Thread Subject',
        from: 'sender@example.com',
        threadId: 'thread-1',
        category: 'email',
      });

      await (worker as any).process(job);

      const payloadStr =
        mockPushService.sendNotification.mock.calls[0][1] as string;
      const payload = JSON.parse(payloadStr);

      expect(payload.title).toBe('3 new emails in "Thread Subject"');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'push:thread:tenant-1:user-1:thread-1',
      );
    });

    it('should include /dashboard/email/thread/{threadId} URL in payload data (PUSH-06)', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1]);

      const job = makeJob('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-42',
        subject: 'Test',
        from: 'sender@example.com',
        threadId: 'thread-99',
        category: 'email',
      });

      await (worker as any).process(job);

      const payloadStr =
        mockPushService.sendNotification.mock.calls[0][1] as string;
      const payload = JSON.parse(payloadStr);

      expect(payload.data.url).toBe('/dashboard/email/thread/thread-99');
    });

    it('should fallback to /dashboard/email when threadId is null (PUSH-06)', async () => {
      mockPushService.getSubscriptionsForUser.mockResolvedValue([sub1]);

      const job = makeJob('push-email', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        emailId: 'email-42',
        subject: 'Test',
        from: 'sender@example.com',
        threadId: null,
        category: 'email',
      });

      await (worker as any).process(job);

      const payloadStr =
        mockPushService.sendNotification.mock.calls[0][1] as string;
      const payload = JSON.parse(payloadStr);

      expect(payload.data.url).toBe('/dashboard/email');
    });
  });
});
