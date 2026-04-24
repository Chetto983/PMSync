import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailTriageService } from '../email-triage.service';
import { EmailInsightsService } from '../email-insights.service';
import { InsightUtilsService } from '../insight-utils.service';
import { TriageActionService } from '../triage-action.service';
import { TriageOverrideService } from '../triage-override.service';
// Phase 150 Plan 04: graph-memory Layer 2 mock + ConfigService mock (W-2)
import { TriageGraphLookupService } from '../triage-graph-lookup.service';
import { CrmSuggestionTriggerService } from '../../../crm/suggestion/services/crm-suggestion-trigger.service';
import { SubscriptionService } from '../../../subscription/services/subscription.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisConnectionService } from '../../../../common/services/redis-connection.service';

describe('EmailTriageService.triageEmail — Phase 147 D-07 override application + Phase 150 Plan 04 graph lookup', () => {
  let service: EmailTriageService;
  let insightsMock: { analyzeEmailUnified: jest.Mock };
  // Phase 150.1 WR-01: mock InsightUtilsService.linkEmailToUserLabels so the
  // graph short-circuit assertion can check its invocation without hitting DB.
  let insightUtilsMock: { linkEmailToUserLabels: jest.Mock };
  let overrideServiceMock: { applyOverrides: jest.Mock };
  let actionServiceMock: { processTriageSignals: jest.Mock };
  // Phase 150 Plan 04 W-2: explicit ConfigService + TriageGraphLookupService mocks.
  let configMock: { get: jest.Mock };
  let graphLookupMock: { lookup: jest.Mock };
  let prismaMock: any;

  // Helper: build the testing module so individual tests can rebuild it after
  // mutating configMock.get's mockImplementation (the cutoff is read once at
  // construction time inside EmailTriageService).
  const buildModule = async () => {
    const mod = await Test.createTestingModule({
      providers: [
        EmailTriageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailInsightsService, useValue: insightsMock },
        // Phase 150.1 WR-01: InsightUtilsService is mandatory (not @Optional).
        { provide: InsightUtilsService, useValue: insightUtilsMock },
        { provide: SubscriptionService, useValue: {} },
        { provide: RedisConnectionService, useValue: { client: { eval: jest.fn().mockResolvedValue(1) } } },
        { provide: TriageActionService, useValue: actionServiceMock },
        { provide: CrmSuggestionTriggerService, useValue: null },
        { provide: TriageOverrideService, useValue: overrideServiceMock },
        // Phase 150 Plan 04 W-2: ConfigService is mandatory per B-5.
        { provide: ConfigService, useValue: configMock },
        // Phase 150 Plan 04 W-2: graph lookup is optional — useValue, not null.
        { provide: TriageGraphLookupService, useValue: graphLookupMock },
      ],
    }).compile();
    const svc = mod.get(EmailTriageService);
    (svc as unknown as { redis: unknown }).redis = { eval: jest.fn().mockResolvedValue(1) };
    return svc;
  };

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
    insightUtilsMock = { linkEmailToUserLabels: jest.fn().mockResolvedValue(undefined) };
    configMock = {
      get: jest.fn((_key: string, dflt?: string) => dflt ?? '9999'),
    };
    graphLookupMock = {
      lookup: jest.fn().mockResolvedValue(null),
    };

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

    service = await buildModule();
  });

  it('muting override short-circuits the LLM and writes triageSource=rule', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({
      matched: true,
      override: { action: 'always-system-alert', pattern: 'noreply@x.com', type: 'sender' },
      suppressFollowUp: false,
    });

    const result = await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(insightsMock.analyzeEmailUnified).not.toHaveBeenCalled();
    // CR-01: muting override sets the lane + nulls stale triage signals but
    // does NOT wipe aiLabels (the rule is lane-shaped, not label-shaped).
    expect(prismaMock.email.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1', tenantId: 't1' },
        data: expect.objectContaining({
          aiLane: 'system-alerts',
          aiPriority: null,
          aiPriorityReason: null,
          aiSentiment: null,
          aiCategory: null,
          isAutoTriaged: true,
        }),
      }),
    );
    // aiLabels must NOT appear in the update payload — preserve prior user/LLM labels.
    const updatePayload = prismaMock.email.updateMany.mock.calls[0][0].data;
    expect(Object.prototype.hasOwnProperty.call(updatePayload, 'aiLabels')).toBe(false);
    // CR-01: upsert-update branch must NOT clobber summary/keyPoints/suggestedActions.
    expect(prismaMock.emailAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ triageSource: 'rule' }),
        create: expect.objectContaining({ triageSource: 'rule' }),
      }),
    );
    const upsertArg = prismaMock.emailAnalysis.upsert.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(upsertArg.update, 'summary')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(upsertArg.update, 'keyPoints')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(upsertArg.update, 'suggestedActions')).toBe(false);
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

  // ====================================================================
  // Phase 150 Plan 04 — graph-memory Layer 2 integration (3 new it blocks)
  // ====================================================================

  it('calls graph lookup AFTER override-miss, BEFORE LLM', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({ matched: false });
    graphLookupMock.lookup.mockResolvedValue(null);

    await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(graphLookupMock.lookup).toHaveBeenCalledTimes(1);
    expect(insightsMock.analyzeEmailUnified).toHaveBeenCalledTimes(1);
    const lookupOrder = graphLookupMock.lookup.mock.invocationCallOrder[0];
    const llmOrder = insightsMock.analyzeEmailUnified.mock.invocationCallOrder[0];
    expect(lookupOrder).toBeLessThan(llmOrder);
  });

  it('SKIPS graph lookup when any override matched — Open Q2 Option A', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({
      matched: true,
      override: { action: 'always-important', pattern: 'boss@x.com', type: 'sender' },
      suppressFollowUp: false,
    });

    await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    expect(graphLookupMock.lookup).toHaveBeenCalledTimes(0);
  });

  it('short-circuits LLM when graph confidence >= cutoff', async () => {
    // Set cutoff=0.9 BEFORE rebuilding the module — constructor reads cutoff once.
    configMock.get.mockImplementation((k: string, d?: string) =>
      k === 'TRIAGE_GRAPH_CONFIDENCE_CUTOFF' ? '0.9' : (d ?? '9999'),
    );
    const svc = await buildModule();
    overrideServiceMock.applyOverrides.mockResolvedValue({ matched: false });
    graphLookupMock.lookup.mockResolvedValue({
      predictedLabelId: 'L1',
      predictedLabelName: 'Work',
      confidence: 0.95,
      source: 'sender',
    });

    const result = await svc.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    // SHORT-CIRCUIT: LLM not called.
    expect(insightsMock.analyzeEmailUnified).not.toHaveBeenCalled();
    // B-8: snake_case triageSource written to EmailAnalysis.upsert.
    expect(prismaMock.emailAnalysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ triageSource: 'graph_sender' }),
        create: expect.objectContaining({ triageSource: 'graph_sender' }),
      }),
    );
    // Phase 150.1 WR-01: junction-table write fires so label views populate.
    expect(insightUtilsMock.linkEmailToUserLabels).toHaveBeenCalledWith(
      't1',
      'e1',
      ['Work'],
    );
    expect(result.success).toBe(true);
    expect(result.aiLabels).toEqual(['Work']);
  });

  // Phase 150.1 WR-01: negative case — no short-circuit, no junction write.
  it('does NOT call linkEmailToUserLabels when graph lookup returns no edge', async () => {
    overrideServiceMock.applyOverrides.mockResolvedValue({ matched: false });
    graphLookupMock.lookup.mockResolvedValue(null);

    await service.triageEmail('e1', { tenantId: 't1', userId: 'u1' });

    // LLM path still owns the junction write via email-analysis.service.ts;
    // EmailTriageService must not double-write on the miss path.
    expect(insightUtilsMock.linkEmailToUserLabels).not.toHaveBeenCalled();
  });
});
