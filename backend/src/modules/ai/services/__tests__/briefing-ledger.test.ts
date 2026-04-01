/**
 * BriefingService Ledger Integration Test
 *
 * Phase 35 Plan 01 -- Task 2 (TDD)
 * Tests: ledger wiring in generateWithFallback for success, failure, and fire-and-forget.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock generateObject/generateText from 'ai' module
const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
  generateObject: (...args: any[]) => mockGenerateObject(...args),
  generateText: (...args: any[]) => mockGenerateText(...args),
}));

import { BriefingService } from '../briefing.service';
import { AiRunLedgerService } from '../ai-run-ledger.service';
import { AiRunStatus } from '@prisma/client';

const validBriefingOutput = {
  priorityEmails: [],
  calendarSnapshot: [],
  pendingFollowUps: [],
  executiveSummary: 'All clear.',
  staleContactsAlert: [],
  draftSuggestions: [],
  emailVolumeTrends: { todayReceived: 0, todaySent: 0, weeklyAvgReceived: 0, weeklyAvgSent: 0, trend: 'stable' },
  focusTimeRecommendations: [],
};

describe('BriefingService ledger wiring', () => {
  let briefingService: BriefingService;
  let mockLedger: { recordRun: ReturnType<typeof vi.fn> };
  let mockMistralProvider: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockLedger = { recordRun: vi.fn().mockResolvedValue(undefined) };
    mockMistralProvider = { getChatModel: vi.fn(() => 'mock-model'), getChatModelName: vi.fn(() => 'mistral-small-latest') };
    mockPrisma = {
      email: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      calendarEvent: { findMany: vi.fn().mockResolvedValue([]) },
      emailFollowUp: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      contact: { findMany: vi.fn().mockResolvedValue([]) },
    };
    mockGenerateObject.mockReset();
    mockGenerateText.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  function createService() {
    const mockConfig = { get: (key: string, def?: string) => def } as any;
    return new BriefingService(
      mockMistralProvider,
      mockPrisma,
      mockConfig,
      undefined, // usageTrackingService
      mockLedger as unknown as AiRunLedgerService,
    );
  }

  it('calls ledgerService.recordRun with runType=briefing on success', async () => {
    mockGenerateObject.mockResolvedValue({
      object: validBriefingOutput,
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
    mockGenerateObject.mockRejectedValue(err);
    mockGenerateText.mockRejectedValue(err);

    briefingService = createService();
    await briefingService.generateBriefing('tenant-1');

    const failedCalls = mockLedger.recordRun.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.status === AiRunStatus.FAILED);

    expect(failedCalls.length).toBeGreaterThan(0);
    expect(failedCalls[0].errorMessage).toContain('API down');
  });

  it('maps usage.inputTokens -> promptTokens and usage.outputTokens -> completionTokens', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { ...validBriefingOutput, executiveSummary: 'Test.' },
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
    mockGenerateObject.mockResolvedValue({
      object: { ...validBriefingOutput, executiveSummary: 'Fine.' },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    briefingService = createService();
    const result = await briefingService.generateBriefing('tenant-1');

    // Should NOT throw -- result is valid
    expect(result.data.executiveSummary).toBe('Fine.');
    expect(result.error).toBeUndefined();
  });
});
