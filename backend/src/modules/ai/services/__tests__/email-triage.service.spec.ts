import { Test } from '@nestjs/testing';
import { EmailTriageService } from '../email-triage.service';
import { EmailInsightsService } from '../email-insights.service';
import { TriageActionService } from '../triage-action.service';
import { TriageOverrideService } from '../triage-override.service';
import { CrmSuggestionTriggerService } from '../../../crm/suggestion/services/crm-suggestion-trigger.service';
import { SubscriptionService } from '../../../subscription/services/subscription.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisConnectionService } from '../../../../common/services/redis-connection.service';

describe('EmailTriageService.triageEmail — Phase 147 D-07 override application', () => {
  let service: EmailTriageService;
  let insightsMock: { analyzeEmailUnified: jest.Mock };
  let overrideServiceMock: { applyOverrides: jest.Mock };
  let actionServiceMock: { processTriageSignals: jest.Mock };
  let prismaMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    insightsMock = {
      analyzeEmailUnified: jest.fn().mockResolvedValue({
        priority: 3,
        labels: [],
        summary: '',
        sentiment: 'neutral',
        urgency: 'medium',
        keyTopics: [],
        escalationRisk: false,
        hasDeadline: false,
        needsFollowUp: false,
        lane: 'review-later',
        intent: 'fyi',
        actionability: 'none',
      }),
    };
    overrideServiceMock = { applyOverrides: jest.fn().mockResolvedValue({ matched: false }) };
    actionServiceMock = { processTriageSignals: jest.fn().mockResolvedValue(undefined) };

    prismaMock = {
      email: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          from: 'sender@example.com',
          threadId: 'thr-1',
          subject: 'Test',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailAnalysis: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const redisStub = {
      eval: jest.fn().mockResolvedValue(1),
    };
    const redisConnectionStub = {
      client: redisStub,
    };

    const mod = await Test.createTestingModule({
      providers: [
        EmailTriageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailInsightsService, useValue: insightsMock },
        { provide: SubscriptionService, useValue: {} },
        { provide: RedisConnectionService, useValue: redisConnectionStub },
        { provide: TriageActionService, useValue: actionServiceMock },
        { provide: CrmSuggestionTriggerService, useValue: null },
        { provide: TriageOverrideService, useValue: overrideServiceMock },
      ],
    }).compile();

    service = mod.get(EmailTriageService);
    // Simulate onModuleInit since we're not calling it in isolated tests
    (service as unknown as { redis: unknown }).redis = redisStub;
  });

  it('muting override short-circuits the LLM and writes triageSource=rule', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({
      matched: true,
      override: { action: 'always-system-alert', pattern: 'noreply@x.com', type: 'sender' },
      suppressFollowUp: false,
    });

    const result = await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(insightsMock.analyzeEmailUnified).not.toHaveBeenCalled();
    expect(prismaMock.email.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1', tenantId: 't1' },
        data: expect.objectContaining({
          aiLane: 'system-alerts',
          aiLabels: [],
          isAutoTriaged: true,
        }),
      }),
    );
    expect(prismaMock.emailAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ triageSource: 'rule' }),
        create: expect.objectContaining({ triageSource: 'rule' }),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.lane).toBe('system-alerts');
  });

  it('visible override runs LLM with hint + matchedOverrideAction passed through', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({
      matched: true,
      override: { action: 'always-important', pattern: 'boss@x.com', type: 'sender' },
      suppressFollowUp: false,
    });

    await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(insightsMock.analyzeEmailUnified).toHaveBeenCalledTimes(1);
    const optsArg = insightsMock.analyzeEmailUnified.mock.calls[0][3];
    expect(optsArg.overrideHint).toContain('always-important');
    expect(optsArg.overrideHint).toContain('boss@x.com');
    expect(optsArg.matchedOverrideAction).toBe('always-important');
  });

  it('never-follow-up suppresses follow-up creation', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({
      matched: true,
      override: { action: 'never-follow-up', pattern: 'x@y.com', type: 'sender' },
      suppressFollowUp: true,
    });
    // This is a muting action, so it short-circuits before the follow-up path anyway.
    // The expectation is that processTriageSignals is not called.

    await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(actionServiceMock.processTriageSignals).not.toHaveBeenCalled();
  });

  it('no override match: pure-LLM path, no hint, no matchedOverrideAction', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({ matched: false });

    await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(insightsMock.analyzeEmailUnified).toHaveBeenCalledTimes(1);
    const optsArg = insightsMock.analyzeEmailUnified.mock.calls[0][3];
    expect(optsArg.overrideHint).toBeNull();
    expect(optsArg.matchedOverrideAction).toBeNull();
  });
});
