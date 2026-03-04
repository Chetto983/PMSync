/**
 * BriefingService Ledger Integration Test
 *
 * Phase 35 Plan 01 -- Task 2 (TDD)
 * Tests: ledger wiring in generateWithFallback for success, failure, retry, and fire-and-forget.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock generateText from 'ai' module
const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
  Output: { object: vi.fn((opts: any) => opts) },
  NoObjectGeneratedError: {
    isInstance: (err: any) => err?._tag === 'NoObjectGeneratedError',
  },
}));

import { BriefingService } from '../briefing.service';
import { AiRunLedgerService } from '../ai-run-ledger.service';
import { AiRunStatus } from '@prisma/client';

describe('BriefingService ledger wiring', () => {
  let briefingService: BriefingService;
  let mockLedger: { recordRun: ReturnType<typeof vi.fn> };
  let mockMistralProvider: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockLedger = { recordRun: vi.fn().mockResolvedValue(undefined) };
    mockMistralProvider = { getChatModel: vi.fn(() => 'mock-model') };
    mockPrisma = {
      email: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      calendarEvent: { findMany: vi.fn().mockResolvedValue([]) },
      emailFollowUp: { findMany: vi.fn().mockResolvedValue([]) },
      contact: { findMany: vi.fn().mockResolvedValue([]) },
    };
    mockGenerateText.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  function createService() {
    return new BriefingService(
      mockMistralProvider,
      mockPrisma,
      undefined, // usageTrackingService
      mockLedger as unknown as AiRunLedgerService,
    );
  }

  it('calls ledgerService.recordRun with runType=briefing on success', async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        priorityEmails: [],
        calendarSnapshot: [],
        pendingFollowUps: [],
        executiveSummary: 'All clear.',
        staleContactsAlert: [],
        draftSuggestions: [],
        emailVolumeTrends: { todayReceived: 0, todaySent: 0, weeklyAvgReceived: 0, weeklyAvgSent: 0, trend: 'stable' },
        focusTimeRecommendations: [],
      },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    briefingService = createService();
    await briefingService.generateBriefing('tenant-1');

    expect(mockLedger.recordRun).toHaveBeenCalledOnce();
    const call = mockLedger.recordRun.mock.calls[0][0];
    expect(call.runType).toBe('briefing');
    expect(call.tenantId).toBe('tenant-1');
    expect(call.promptTokens).toBe(100);
    expect(call.completionTokens).toBe(50);
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('calls ledgerService.recordRun with status=FAILED on error', async () => {
    const err = new Error('API down');
    mockGenerateText.mockRejectedValue(err);

    briefingService = createService();
    await briefingService.generateBriefing('tenant-1');

    expect(mockLedger.recordRun).toHaveBeenCalledOnce();
    const call = mockLedger.recordRun.mock.calls[0][0];
    expect(call.status).toBe(AiRunStatus.FAILED);
    expect(call.errorMessage).toContain('API down');
  });

  it('creates separate ledger entries for both attempts on retry path', async () => {
    // First call: schema validation error triggering retry
    const schemaErr: any = new Error('Schema failed');
    schemaErr._tag = 'NoObjectGeneratedError';

    mockGenerateText
      .mockRejectedValueOnce(schemaErr)
      .mockResolvedValueOnce({
        output: {
          priorityEmails: [],
          calendarSnapshot: [],
          pendingFollowUps: [],
          executiveSummary: 'Retried successfully.',
          staleContactsAlert: [],
          draftSuggestions: [],
          emailVolumeTrends: { todayReceived: 0, todaySent: 0, weeklyAvgReceived: 0, weeklyAvgSent: 0, trend: 'stable' },
          focusTimeRecommendations: [],
        },
        usage: { inputTokens: 120, outputTokens: 60, totalTokens: 180 },
      });

    briefingService = createService();
    await briefingService.generateBriefing('tenant-1');

    // Two ledger entries: first attempt (FAILED) + retry (SUCCESS)
    expect(mockLedger.recordRun).toHaveBeenCalledTimes(2);
    const firstCall = mockLedger.recordRun.mock.calls[0][0];
    expect(firstCall.status).toBe(AiRunStatus.FAILED);
    const retryCall = mockLedger.recordRun.mock.calls[1][0];
    expect(retryCall.runType).toBe('briefing');
    expect(retryCall.promptTokens).toBe(120);
  });

  it('maps usage.inputTokens -> promptTokens and usage.outputTokens -> completionTokens', async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        priorityEmails: [],
        calendarSnapshot: [],
        pendingFollowUps: [],
        executiveSummary: 'Test.',
        staleContactsAlert: [],
        draftSuggestions: [],
        emailVolumeTrends: { todayReceived: 0, todaySent: 0, weeklyAvgReceived: 0, weeklyAvgSent: 0, trend: 'stable' },
        focusTimeRecommendations: [],
      },
      usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    });

    briefingService = createService();
    await briefingService.generateBriefing('tenant-1');

    const call = mockLedger.recordRun.mock.calls[0][0];
    expect(call.promptTokens).toBe(200);
    expect(call.completionTokens).toBe(80);
    expect(call.totalTokens).toBe(280);
  });

  it('ledger write failure does NOT cause generateWithFallback to throw (fire-and-forget)', async () => {
    mockLedger.recordRun.mockRejectedValue(new Error('DB down'));
    mockGenerateText.mockResolvedValue({
      output: {
        priorityEmails: [],
        calendarSnapshot: [],
        pendingFollowUps: [],
        executiveSummary: 'Fine.',
        staleContactsAlert: [],
        draftSuggestions: [],
        emailVolumeTrends: { todayReceived: 0, todaySent: 0, weeklyAvgReceived: 0, weeklyAvgSent: 0, trend: 'stable' },
        focusTimeRecommendations: [],
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    briefingService = createService();
    const result = await briefingService.generateBriefing('tenant-1');

    // Should NOT throw -- result is valid
    expect(result.data.executiveSummary).toBe('Fine.');
    expect(result.error).toBeUndefined();
  });
});
