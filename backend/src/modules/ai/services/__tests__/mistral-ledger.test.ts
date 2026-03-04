/**
 * MistralService Ledger Integration Test
 *
 * Phase 35 Plan 01 -- Task 3 (TDD)
 * Tests: ledger wiring in completePrompt and generateChatTitle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock generateText from 'ai' module
const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
}));

// Mock circuit breaker
vi.mock('../../utils', () => ({
  getAiCircuitBreaker: vi.fn(() => ({
    execute: vi.fn((fn: () => Promise<any>) => fn()),
    isAllowed: vi.fn(() => true),
  })),
  withRetry: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

import { MistralService } from '../mistral.service';
import { AiRunLedgerService } from '../ai-run-ledger.service';

describe('MistralService ledger wiring', () => {
  let mistralService: MistralService;
  let mockLedger: { recordRun: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLedger = { recordRun: vi.fn().mockResolvedValue(undefined) };

    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'AI_MODEL_SIMPLE') return 'mistral-small-latest';
        if (key === 'AI_MODEL_CREATIVE') return 'mistral-small-latest';
        if (key === 'AI_MODEL_ROUTER') return 'ministral-3b-latest';
        if (key === 'MISTRAL_API_KEY') return 'test-key';
        return undefined;
      }),
    };
    const mockMistralProvider = { getChatModel: vi.fn(() => 'mock-model') };
    const mockPromptGuard = {
      validateInput: vi.fn(() => ({ isValid: true, riskScore: 0, detectedPatterns: [] })),
      validateOutput: vi.fn(() => ({ isValid: true })),
      getDefensiveSystemPrompt: vi.fn(() => ''),
    };
    const mockEmbeddingService = {
      generateEmbedding: vi.fn(),
      generateBulkEmbeddings: vi.fn(),
      getEmbeddingModel: vi.fn(() => 'mistral-embed'),
    };
    const mockRagService = {
      setDependencies: vi.fn(),
      searchSimilarContent: vi.fn(),
      generateResponse: vi.fn(),
      getGracefulTimeoutResponse: vi.fn(),
    };

    mistralService = new MistralService(
      mockConfigService as any,
      mockMistralProvider as any,
      mockPromptGuard as any,
      mockEmbeddingService as any,
      mockRagService as any,
      undefined, // usageTrackingService
      undefined, // costProtectionService
      mockLedger as unknown as AiRunLedgerService,
    );

    mockGenerateText.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('completePrompt calls ledgerService.recordRun with runType from telemetryContext.promptName', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'hello world',
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
    });

    await mistralService.completePrompt({
      userPrompt: 'test prompt',
      telemetryContext: { tenantId: 'tenant-1', userId: 'user-1', promptName: 'smart-reply' },
    });

    expect(mockLedger.recordRun).toHaveBeenCalled();
    const call = mockLedger.recordRun.mock.calls[0][0];
    expect(call.runType).toBe('smart-reply');
    expect(call.promptTokens).toBe(80);
    expect(call.completionTokens).toBe(20);
    expect(call.tenantId).toBe('tenant-1');
  });

  it('completePrompt still returns a string (return contract unchanged)', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'hello world',
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
    });

    const result = await mistralService.completePrompt({
      userPrompt: 'test prompt',
      telemetryContext: { tenantId: 'tenant-1' },
    });

    expect(typeof result).toBe('string');
    expect(result).toBe('hello world');
  });

  it('generateChatTitle calls ledgerService.recordRun with runType=title-gen', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Chat About Weather',
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
    });

    await mistralService.generateChatTitle(
      [{ role: 'user', content: 'What is the weather?' }],
      'en',
    );

    // Wait for fire-and-forget
    await new Promise(r => setTimeout(r, 10));

    expect(mockLedger.recordRun).toHaveBeenCalled();
    const call = mockLedger.recordRun.mock.calls[0][0];
    expect(call.runType).toBe('title-gen');
  });

  it('ledger write failure does NOT break completePrompt (fire-and-forget)', async () => {
    mockLedger.recordRun.mockRejectedValue(new Error('Ledger DB down'));
    mockGenerateText.mockResolvedValue({
      text: 'still works',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    const result = await mistralService.completePrompt({
      userPrompt: 'test prompt',
      telemetryContext: { tenantId: 'tenant-1' },
    });

    expect(result).toBe('still works');
  });
});
