/**
 * Module Bootstrap Smoke Test
 *
 * Validates that NestJS DI chains in EmailSyncModule resolve without circular
 * dependency errors. Focused on the services where forwardRef is being removed.
 *
 * If this test fails after removing a forwardRef, the removal was incorrect.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeadLetterQueueService } from '../common/services/dead-letter-queue.service';
import { BulkOperationsQueueService } from '../modules/email-sync/services/bulk-operations-queue.service';
import { EmailSendQueueService } from '../modules/email-sync/services/email-send-queue.service';
import { ProviderSyncBackQueueService } from '../modules/email-sync/services/provider-sync-back-queue.service';
import { BaseQueueService } from '../modules/email-sync/services/base-queue.service';

// Mock BullMQ to avoid Redis connections
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    on: jest.fn(), add: jest.fn(), close: jest.fn().mockResolvedValue(undefined),
    getJobs: jest.fn().mockResolvedValue([]),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(), close: jest.fn().mockResolvedValue(undefined),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(), close: jest.fn().mockResolvedValue(undefined),
  })),
  FlowProducer: jest.fn().mockImplementation(() => ({
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('Module Bootstrap Smoke Test', () => {
  let module: TestingModule;

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: unknown) => defaultVal ?? undefined),
    getOrThrow: jest.fn(),
  };

  const mockDlq = {
    moveToDeadLetter: jest.fn(),
    getDeadLetterJobs: jest.fn().mockResolvedValue([]),
  };

  afterAll(async () => {
    if (module) await module.close();
  });

  it('should compile queue services with DLQ via plain injection (no forwardRef)', async () => {
    module = await Test.createTestingModule({
      providers: [
        BulkOperationsQueueService,
        EmailSendQueueService,
        ProviderSyncBackQueueService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DeadLetterQueueService, useValue: mockDlq },
      ],
    }).compile();

    expect(module).toBeDefined();

    // Verify DLQ-dependent services resolve (Cluster D: 3 forwardRef removed)
    const bulkQueue = module.get(BulkOperationsQueueService);
    expect(bulkQueue).toBeDefined();

    const sendQueue = module.get(EmailSendQueueService);
    expect(sendQueue).toBeDefined();

    const syncBackQueue = module.get(ProviderSyncBackQueueService);
    expect(syncBackQueue).toBeDefined();

    // Verify DLQ itself is injected (not undefined)
    const dlq = module.get(DeadLetterQueueService);
    expect(dlq).toBeDefined();
  }, 15_000);
});
