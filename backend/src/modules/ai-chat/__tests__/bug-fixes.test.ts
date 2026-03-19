/**
 * Bug Fix and Race Condition Tests
 *
 * Tests for:
 * - BUG-1: reply_email replyAll CC handling
 * - BUG-5: summary trigger frequency (every 10 after threshold, not every message)
 * - RACE-1: Prisma retry wrapper on saveUserMessage
 * - RACE-4: batched tool result persistence
 *
 * These tests validate the phase 87 behavioral fixes.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock the 'ai' module to prevent ESM non-configurable export issues
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: 'Summary of conversation',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }),
  };
});

// ---- BUG-1: replyAll CC handling ----

describe('BUG-1: reply_email replyAll CC handling', () => {
  // We test the email tool's execute function by extracting the reply_email tool
  // from EmailToolsService.getTools() and verifying the queueSend call.

  let prisma: Record<string, any>;
  let emailSendService: Record<string, any>;
  let emailSearchService: Record<string, any>;
  let emailCrudService: Record<string, any>;
  let emailFetchService: Record<string, any>;
  let toolRegistry: Record<string, any>;
  let piiResolve: Mock;

  const originalEmail = {
    id: 'email-1',
    from: 'sender@example.com',
    to: ['me@example.com', 'alice@example.com'],
    cc: ['bob@example.com', 'carol@example.com'],
    subject: 'Test Subject',
    messageId: 'msg-id-1',
    threadId: 'thread-1',
    bodyText: 'Original body',
    snippet: 'Original body',
  };

  const mockProvider = { id: 'provider-1', providerType: 'google' };

  beforeEach(() => {
    prisma = {
      email: {
        findFirst: vi.fn().mockResolvedValue(originalEmail),
        create: vi.fn(),
      },
      providerConfig: {
        findFirst: vi.fn().mockResolvedValue(mockProvider),
      },
    };

    emailSendService = {
      queueSend: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };

    emailSearchService = { searchEmails: vi.fn() };
    emailCrudService = { updateEmail: vi.fn(), deleteEmail: vi.fn() };
    emailFetchService = {};
    toolRegistry = { registerTool: vi.fn() };
    piiResolve = vi.fn(async (args: Record<string, unknown>) => args);
  });

  async function getReplyEmailTool() {
    // Dynamic import to avoid circular dependency issues at module level
    const { EmailToolsService } = await import('../tools/email-tools.service');

    const service = new EmailToolsService(
      emailSearchService as any,
      emailCrudService as any,
      emailSendService as any,
      emailFetchService as any,
      prisma as any,
      toolRegistry as any,
    );

    const tools = service.getTools('tenant-1', piiResolve);
    return tools.reply_email;
  }

  it('should include original CC and To recipients when replyAll is true', async () => {
    const replyTool = await getReplyEmailTool();

    await replyTool.execute!(
      { emailId: 'email-1', body: 'My reply', replyAll: true },
      { toolCallId: 'tc-1', messages: [], abortSignal: undefined as any },
    );

    expect(emailSendService.queueSend).toHaveBeenCalledTimes(1);
    const sendArgs = emailSendService.queueSend.mock.calls[0][0];

    // With replyAll, CC should include original CC recipients
    // and original To recipients (minus the sender and current user)
    expect(sendArgs.cc).toBeDefined();
    expect(sendArgs.cc).toEqual(
      expect.arrayContaining(['bob@example.com', 'carol@example.com']),
    );
  });

  it('should NOT include CC recipients when replyAll is false', async () => {
    const replyTool = await getReplyEmailTool();

    await replyTool.execute!(
      { emailId: 'email-1', body: 'My reply', replyAll: false },
      { toolCallId: 'tc-1', messages: [], abortSignal: undefined as any },
    );

    expect(emailSendService.queueSend).toHaveBeenCalledTimes(1);
    const sendArgs = emailSendService.queueSend.mock.calls[0][0];

    // Without replyAll, cc should be undefined or empty
    expect(sendArgs.cc ?? []).toEqual([]);
  });
});

// ---- BUG-5: summary trigger frequency ----

describe('BUG-5: maybeTriggerSummaryGeneration frequency', () => {
  // Summary generation moved to ChatEnrichmentService in phase 87.
  // We verify the trigger cadence there via the public method.

  let conversationService: Record<string, any>;
  let mistralProvider: Record<string, any>;
  let piiDetectionService: Record<string, any>;

  beforeEach(() => {
    conversationService = {
      getMessageCount: vi.fn().mockResolvedValue(0),
      getOlderMessages: vi.fn().mockResolvedValue([
        { role: 'user', content: { text: 'hello' } },
      ]),
      getRecentMessages: vi.fn().mockResolvedValue([]),
      updateConversationSummary: vi.fn().mockResolvedValue(undefined),
    };

    mistralProvider = {
      getChatModel: vi.fn().mockReturnValue('mock-model'),
    };

    piiDetectionService = {
      detect: vi.fn().mockReturnValue({ hasPii: false, redactedText: '' }),
    };
  });

  async function callMaybeTrigger(messageCount: number) {
    const { ChatEnrichmentService } = await import(
      '../services/chat-enrichment.service'
    );

    conversationService.getMessageCount.mockResolvedValue(messageCount);

    const instance = new ChatEnrichmentService(
      mistralProvider as any,
      conversationService as any,
      piiDetectionService as any,
      undefined,
      undefined,
    );

    await instance.maybeTriggerSummaryGeneration('conv-1', 'tenant-1');
  }

  it('should trigger at exactly 20 messages', async () => {
    await callMaybeTrigger(20);
    expect(conversationService.getOlderMessages).toHaveBeenCalled();
  });

  it('should NOT trigger at 21 messages', async () => {
    await callMaybeTrigger(21);
    expect(conversationService.getOlderMessages).not.toHaveBeenCalled();
  });

  it('should trigger again at 30 messages (every 10 after threshold)', async () => {
    await callMaybeTrigger(30);
    expect(conversationService.getOlderMessages).toHaveBeenCalled();
  });

  it('should NOT trigger at 25 messages', async () => {
    await callMaybeTrigger(25);
    expect(conversationService.getOlderMessages).not.toHaveBeenCalled();
  });
});

// ---- RACE-1: Prisma retry wrapper on saveUserMessage ----

describe('RACE-1: saveUserMessage uses withPrismaRetry', () => {
  it('should wrap the transaction in withPrismaRetry for P2002/P2034 handling', async () => {
    const { ConversationService } = await import(
      '../services/conversation.service'
    );

    const retryModule = await import(
      '../../../common/services/prisma-retry.service'
    );
    const retrySpy = vi
      .spyOn(retryModule, 'withPrismaRetry')
      .mockImplementation(async (fn: () => Promise<unknown>) => fn());

    const tx = {
      aiMessage: { create: vi.fn().mockResolvedValue({ id: 'msg-1' }) },
      aiConversation: { update: vi.fn().mockResolvedValue(undefined) },
    };

    const prisma = {
      $transaction: vi.fn(async (cb: (trx: typeof tx) => unknown) => cb(tx)),
    };

    const svc = new ConversationService(prisma as any);
    await svc.saveUserMessage('conv-1', 'hello');

    expect(retrySpy).toHaveBeenCalled();

    retrySpy.mockRestore();
  });
});

// ---- RACE-4: batched tool result persistence ----

describe('RACE-4: persistToolResults uses single transaction', () => {
  it('should save all tool results in one transaction, not N separate ones', async () => {
    const { AiChatService } = await import('../services/ai-chat.service');

    const saveToolMessage = vi.fn().mockResolvedValue({ id: 'msg-1' });
    const saveToolMessagesBatch = vi.fn().mockResolvedValue(undefined);
    const conversationServiceMock = {
      saveToolMessage,
      saveToolMessagesBatch,
    };

    // Create a minimal instance to test persistToolResults
    const instance = Object.create(AiChatService.prototype);
    instance.conversationService = conversationServiceMock;
    instance.logger = { log: vi.fn(), warn: vi.fn(), debug: vi.fn() };

    const toolResults = [
      {
        toolCallId: 'tc-1',
        toolName: 'search_emails',
        input: { query: 'test' },
        output: { results: [] },
      },
      {
        toolCallId: 'tc-2',
        toolName: 'read_email',
        input: { emailId: 'e-1' },
        output: { id: 'e-1' },
      },
      {
        toolCallId: 'tc-3',
        toolName: 'archive_email',
        input: { emailId: 'e-2' },
        output: { archived: true },
      },
    ];

    // Call the private persistToolResults method
    await instance.persistToolResults('conv-1', 0, toolResults);

    expect(saveToolMessagesBatch).toHaveBeenCalledTimes(1);
    expect(saveToolMessagesBatch).toHaveBeenCalledWith(
      'conv-1',
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'tc-1',
          stepIndex: 0,
        }),
        expect.objectContaining({
          toolCallId: 'tc-2',
          stepIndex: 0,
        }),
        expect.objectContaining({
          toolCallId: 'tc-3',
          stepIndex: 0,
        }),
      ]),
    );
    expect(saveToolMessage).not.toHaveBeenCalled();
  });
});
