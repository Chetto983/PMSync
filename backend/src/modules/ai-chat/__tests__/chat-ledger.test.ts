/**
 * AiChatService Ledger Integration Test
 *
 * Phase 35 Plan 01 -- Task 3 (TDD)
 * Tests: ledger wiring in streamChat onFinish and maybeTriggerSummaryGeneration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiRunStatus } from '@prisma/client';

// Capture the onFinish callback for simulated invocation
let capturedOnFinish: ((...args: any[]) => any) | null = null;
let capturedOnStepFinish: ((...args: any[]) => any) | null = null;

vi.mock('ai', () => ({
  ToolLoopAgent: class {
    private readonly settings: any;

    constructor(settings: any) {
      this.settings = settings;
      capturedOnFinish = settings.onFinish;
      capturedOnStepFinish = settings.onStepFinish;
    }

    stream() {
      return Promise.resolve({
        toUIMessageStream: vi.fn(() => new ReadableStream()),
      });
    }
  },
  generateText: vi.fn().mockResolvedValue({ text: 'Summary text', usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 } }),
  stepCountIs: vi.fn(() => () => false),
}));

import { AiChatService } from '../services/ai-chat.service';
import { AiRunLedgerService } from '../../ai/services/ai-run-ledger.service';

describe('AiChatService ledger wiring', () => {
  let mockLedger: { recordRun: ReturnType<typeof vi.fn> };
  let aiChatService: AiChatService;
  let mockConversationService: {
    getOrCreateConversation: ReturnType<typeof vi.fn>;
    saveUserMessage: ReturnType<typeof vi.fn>;
    getMessagesForContext: ReturnType<typeof vi.fn>;
    saveAssistantMessage: ReturnType<typeof vi.fn>;
    saveToolMessagesBatch: ReturnType<typeof vi.fn>;
    updateConversationTitle: ReturnType<typeof vi.fn>;
    getMessageCount: ReturnType<typeof vi.fn>;
    getOlderMessages: ReturnType<typeof vi.fn>;
    updateConversationSummary: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    capturedOnFinish = null;
    capturedOnStepFinish = null;
    mockLedger = { recordRun: vi.fn().mockResolvedValue(undefined) };

    // Build AiChatService with minimal mocks
    const mockMistralProvider = { getChatModel: vi.fn(() => 'mock-model') };
    mockConversationService = {
      getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      saveUserMessage: vi.fn().mockResolvedValue(undefined),
      getMessagesForContext: vi.fn().mockResolvedValue([]),
      saveAssistantMessage: vi.fn().mockResolvedValue(undefined),
      saveToolMessagesBatch: vi.fn().mockResolvedValue(undefined),
      updateConversationTitle: vi.fn().mockResolvedValue(undefined),
      getMessageCount: vi.fn().mockResolvedValue(5),
      getOlderMessages: vi.fn().mockResolvedValue([]),
      updateConversationSummary: vi.fn().mockResolvedValue(undefined),
    };
    const mockPiiDetection = { detect: vi.fn(() => ({ hasPii: false, redactedText: 'test' })) };
    const mockPiiResolution = {};
    const mockAudit = { logAudit: vi.fn().mockResolvedValue(undefined), logToolExecution: vi.fn().mockResolvedValue(undefined) };
    const mockRateLimiter = { checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) };
    const mockEmailTools = { getTools: vi.fn(() => ({})) };
    const mockCalendarTools = { getTools: vi.fn(() => ({})) };
    const mockContactTools = { getTools: vi.fn(() => ({})) };
    const mockFolderTools = { getTools: vi.fn(() => ({})) };
    const mockRagTools = { getTools: vi.fn(() => ({})) };
    const mockEmailProductivityTools = { getTools: vi.fn(() => ({})) };
    const mockFollowUpTools = { getTools: vi.fn(() => ({})) };
    const mockReminderTools = { getTools: vi.fn(() => ({})) };
    const mockMemoryService = {
      getRelevantMemories: vi.fn().mockResolvedValue([]),
      formatMemoriesForPrompt: vi.fn(() => ''),
    };
    const mockChatEnrichmentService = {
      getRuntimeContextMetadata: vi.fn().mockResolvedValue({}),
      maybeGenerateSmartTitle: vi.fn().mockResolvedValue(undefined),
      maybeTriggerSummaryGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const mockUsageTracking = { trackUsage: vi.fn().mockResolvedValue(undefined) };

    aiChatService = new AiChatService(
      mockMistralProvider as any,
      mockConversationService as any,
      mockPiiDetection as any,
      mockPiiResolution as any,
      mockAudit as any,
      mockRateLimiter as any,
      mockEmailTools as any,
      mockCalendarTools as any,
      mockContactTools as any,
      mockFolderTools as any,
      mockRagTools as any,
      { getTools: () => ({}) } as any, // ConversationToolsService
      { getTools: () => ({}) } as any, // SandboxToolsService
      mockEmailProductivityTools as any,
      mockFollowUpTools as any,
      mockReminderTools as any,
      mockMemoryService as any,
      mockChatEnrichmentService as any,
      mockUsageTracking as any,
      mockLedger as unknown as AiRunLedgerService,
    );

    vi.clearAllMocks();
    // Re-set the mock for the important ones after clearAllMocks
    mockLedger.recordRun.mockResolvedValue(undefined);
    (mockConversationService.getOrCreateConversation as any).mockResolvedValue({ id: 'conv-1' });
    (mockConversationService.saveUserMessage as any).mockResolvedValue(undefined);
    (mockConversationService.getMessagesForContext as any).mockResolvedValue([]);
    (mockConversationService.saveAssistantMessage as any).mockResolvedValue(undefined);
    (mockConversationService.saveToolMessagesBatch as any).mockResolvedValue(undefined);
    (mockConversationService.getMessageCount as any).mockResolvedValue(5);
    (mockPiiDetection.detect as any).mockReturnValue({ hasPii: false, redactedText: 'test' });
    (mockRateLimiter.checkRateLimit as any).mockResolvedValue({ allowed: true });
    (mockAudit.logAudit as any).mockResolvedValue(undefined);
    (mockMemoryService.getRelevantMemories as any).mockResolvedValue([]);
    (mockMemoryService.formatMemoriesForPrompt as any).mockReturnValue('');
    (mockMistralProvider.getChatModel as any).mockReturnValue('mock-model');
    (mockUsageTracking.trackUsage as any).mockResolvedValue(undefined);
    (mockChatEnrichmentService.getRuntimeContextMetadata as any).mockResolvedValue({});
    (mockChatEnrichmentService.maybeGenerateSmartTitle as any).mockResolvedValue(undefined);
    (mockChatEnrichmentService.maybeTriggerSummaryGeneration as any).mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('onFinish callback calls ledgerService.recordRun with runType=chat', async () => {
    await aiChatService.streamChat({
      tenantId: 'tenant-1',
      userId: 'user-1',
      message: 'Hello',
    });

    // Simulate the onFinish callback
    expect(capturedOnFinish).toBeDefined();
    await capturedOnFinish!({
      text: 'Hello response',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      steps: [],
    });

    // Wait for fire-and-forget promises
    await new Promise(r => setTimeout(r, 10));

    expect(mockLedger.recordRun).toHaveBeenCalled();
    const calls = mockLedger.recordRun.mock.calls;
    const chatCall = calls.find((c: any) => c[0].runType === 'chat');
    expect(chatCall).toBeDefined();
    expect(chatCall![0].tenantId).toBe('tenant-1');
    expect(chatCall![0].userId).toBe('user-1');
    expect(chatCall![0].promptTokens).toBe(100);
    expect(chatCall![0].completionTokens).toBe(50);
  });

  it('ledger write failure in onFinish does NOT break the stream (fire-and-forget)', async () => {
    mockLedger.recordRun.mockRejectedValue(new Error('DB exploded'));

    await aiChatService.streamChat({
      tenantId: 'tenant-1',
      userId: 'user-1',
      message: 'Hello',
    });

    // Simulate onFinish -- should NOT throw despite ledger failure
    expect(capturedOnFinish).toBeDefined();
    await expect(
      capturedOnFinish!({
        text: 'Response',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        steps: [],
      }),
    ).resolves.not.toThrow();
  });

  it('onStepFinish persists tool results into conversation history', async () => {
    await aiChatService.streamChat({
      tenantId: 'tenant-1',
      userId: 'user-1',
      message: 'List my unread emails',
    });

    expect(capturedOnStepFinish).toBeDefined();

    await capturedOnStepFinish!({
      text: '',
      usage: { totalTokens: 42 },
      toolCalls: [
        {
          toolCallId: 'tool-1',
          toolName: 'list_email_index',
          input: { folder: 'inbox' },
          dynamic: true,
        },
      ],
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          toolName: 'list_email_index',
          input: { folder: 'inbox' },
          output: { count: 3 },
          dynamic: true,
        },
      ],
    });

    expect(mockConversationService.saveToolMessagesBatch).toHaveBeenCalledWith(
      'conv-1',
      [
        expect.objectContaining({
          content: expect.objectContaining({
            type: 'tool-result',
            toolCallId: 'tool-1',
            toolName: 'list_email_index',
            input: { folder: 'inbox' },
            output: { count: 3 },
          }),
          toolCallId: 'tool-1',
          stepIndex: 0,
        }),
      ],
    );
  });
});
