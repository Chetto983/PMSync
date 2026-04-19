import { Test } from '@nestjs/testing';
import { EmailCrudService } from '../email-crud.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailSyncBackService } from '../email-sync-back.service';
import { KnowledgeBaseService } from '../../../ai/services/knowledge-base.service';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { TriageFeedbackService } from '../../../ai/services/triage-feedback.service';
import { TriagePromotionQueueService } from '../../../ai/services/triage-promotion.queue';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { StorageService } from '../storage.service';
import { EmailFolderService } from '../email-folder.service';
import { ProviderTokenService } from '../../../email-sync/services/provider-token.service';
import { EmailDriverFactory } from '../../../email-sync/drivers/driver.factory';
import { CryptoService } from '../../../../common/services/crypto.service';

describe('EmailCrudService.updateEmail — Phase 147 D-01 triage feedback capture', () => {
  let service: EmailCrudService;
  let feedbackMock: { captureLabelDiff: jest.Mock };
  let queueMock: { enqueueDebounced: jest.Mock };
  let prismaMock: any;
  let syncBackSpy: jest.Mock;
  let folderServiceMock: any;
  let realtimeMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    feedbackMock = { captureLabelDiff: jest.fn().mockResolvedValue(undefined) };
    queueMock = { enqueueDebounced: jest.fn().mockResolvedValue(undefined) };
    syncBackSpy = jest.fn().mockResolvedValue(undefined);

    // $transaction mock returns the shape the updateEmail method expects.
    // Tests can override per-it by reassigning prismaMock.$transaction.
    prismaMock = {
      $transaction: jest.fn(),
      email: {},
      provider: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', isActive: true, disabledReason: null }]),
      },
    };

    folderServiceMock = {
      buildEmailWhere: jest.fn(),
      updateFolderCounts: jest.fn().mockResolvedValue(undefined),
    };
    realtimeMock = { emitEmailUpdate: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        EmailCrudService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: EmailSyncBackService,
          useValue: {},
        },
        { provide: KnowledgeBaseService, useValue: {} },
        { provide: EmailEmbeddingQueueService, useValue: {} },
        { provide: RealtimeEventsService, useValue: realtimeMock },
        { provide: StorageService, useValue: {} },
        { provide: EmailFolderService, useValue: folderServiceMock },
        { provide: ProviderTokenService, useValue: {} },
        { provide: EmailDriverFactory, useValue: {} },
        { provide: CryptoService, useValue: {} },
        { provide: TriageFeedbackService, useValue: feedbackMock },
        { provide: TriagePromotionQueueService, useValue: queueMock },
      ],
    }).compile();
    service = mod.get(EmailCrudService);

    // Stub the private syncChangesToProvider so tests don't hit external drivers.
    (service as unknown as { syncChangesToProvider: jest.Mock }).syncChangesToProvider = syncBackSpy;
  });

  const primeTransaction = (params: {
    oldAiLabels: string[];
    updatedId?: string;
    updatedProviderId?: string;
  }) => {
    prismaMock.$transaction.mockImplementation(async () => ({
      updated: {
        id: params.updatedId ?? 'e1',
        providerId: params.updatedProviderId ?? 'p1',
        threadId: 'thr-1',
      },
      originalFolder: 'inbox',
      oldAiLabels: params.oldAiLabels,
    }));
  };

  // Microtask flush so post-commit fire-and-forget promises settle.
  const flush = () => new Promise((r) => setImmediate(r));

  it('fires captureLabelDiff when aiLabels change', async () => {
    primeTransaction({ oldAiLabels: ['Work'] });
    await service.updateEmail('e1', 't1', { aiLabels: ['Work', 'Important'] });
    await flush();
    expect(feedbackMock.captureLabelDiff).toHaveBeenCalledWith(
      't1',
      'e1',
      ['Work'],
      ['Work', 'Important'],
    );
  });

  it('does NOT fire captureLabelDiff when aiLabels not in PATCH', async () => {
    primeTransaction({ oldAiLabels: ['Work'] });
    await service.updateEmail('e1', 't1', { isRead: true });
    await flush();
    expect(feedbackMock.captureLabelDiff).not.toHaveBeenCalled();
  });

  it('swallows capture errors and still returns the updated email', async () => {
    primeTransaction({ oldAiLabels: ['Work'] });
    feedbackMock.captureLabelDiff.mockRejectedValue(new Error('db down'));
    const result = await service.updateEmail('e1', 't1', { aiLabels: ['X'] });
    expect(result).toBeDefined();
    await flush();
    // Email update itself succeeded; failure was logged but not thrown.
  });

  it('enqueues promotion job after aiLabels PATCH', async () => {
    primeTransaction({ oldAiLabels: ['Work'] });
    await service.updateEmail('e1', 't1', { aiLabels: ['X'] });
    await flush();
    expect(queueMock.enqueueDebounced).toHaveBeenCalledWith('t1');
  });

  it('does NOT enqueue promotion when aiLabels not in PATCH', async () => {
    primeTransaction({ oldAiLabels: ['Work'] });
    await service.updateEmail('e1', 't1', { isStarred: true });
    await flush();
    expect(queueMock.enqueueDebounced).not.toHaveBeenCalled();
  });

  describe('correctTriage — D-01 explicit path', () => {
    beforeEach(() => {
      prismaMock.email = {
        findFirst: jest.fn().mockResolvedValue({ id: 'e1' }),
      };
      (feedbackMock as any).recordFeedback = jest.fn().mockResolvedValue({});
    });

    it('records signal=correction and awaits enqueue', async () => {
      const result = await service.correctTriage('e1', 't1', {
        type: 'label_correction',
        oldValue: 'Newsletter',
        newValue: 'Work',
      });
      expect(result).toEqual({ ok: true });
      expect((feedbackMock as any).recordFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          emailId: 'e1',
          signal: 'correction',
          type: 'label_correction',
          oldValue: 'Newsletter',
          newValue: 'Work',
        }),
      );
      expect(queueMock.enqueueDebounced).toHaveBeenCalledWith('t1');
    });

    it('throws NotFoundException when email missing', async () => {
      prismaMock.email.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.correctTriage('e-missing', 't1', {
          type: 'label_correction',
          newValue: 'Work',
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
