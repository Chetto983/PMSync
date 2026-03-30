/**
 * Chat Pipeline MSW Integration Test
 *
 * Tests the full AiChatService pipeline with MSW-mocked streaming Mistral:
 * - Message -> intent routing -> tool selection -> streaming response
 * - Destructive action -> HITL action created
 * - Multi-step conversation -> context preserved
 *
 * No real Mistral API calls. No real database. All deterministic.
 *
 * Phase 26 Plan 03 -- TEST-02
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  mistralChatHandler,
  openRouterChatHandler,
  createStreamingHandler,
} from '../../../test/msw-handlers/mistral-chat.handler';
import { mistralEmbedHandler } from '../../../test/msw-handlers/mistral-embed.handler';
import { ConfigService } from '@nestjs/config';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { AiChatService } from '../services/ai-chat.service';
import { PiiDetectionService } from '../../ai/guards/pii-detection-sentinel.service';
import { circuitBreakerRegistry } from '../../../common/utils/circuit-breaker.utils';

// MSW server with default handlers (OpenRouter for chat, Mistral for embeddings)
const server = setupServer(openRouterChatHandler, mistralChatHandler, mistralEmbedHandler);

// Fake ConfigService
const configService = {
  get: (key: string, defaultValue?: string) => {
    const map: Record<string, string> = {
      MISTRAL_API_KEY: 'msw-fake-key',
      OPENROUTER_API_KEY: 'msw-fake-openrouter-key',
      INTENT_MODEL_PATH: '',
    };
    return map[key] ?? defaultValue;
  },
  getOrThrow: (key: string) => {
    if (key === 'MISTRAL_API_KEY') return 'msw-fake-key';
    if (key === 'OPENROUTER_API_KEY') return 'msw-fake-openrouter-key';
    if (key === 'INTENT_MODEL_PATH') return '';
    throw new Error(`Config key ${key} not found`);
  },
} as unknown as ConfigService;

/** Rate limiter stub -- always allows */
const rateLimiterStub = {
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: new Date(Date.now() + 60_000),
    retryAfterSeconds: 0,
  }),
} as any;

/** PII Resolution stub -- passthrough */
const piiResolutionStub = {
  storeMapping: vi.fn().mockResolvedValue(undefined),
  resolvePayload: vi.fn().mockImplementation(
    async (_t: string, _s: string, payload: Record<string, unknown>) => payload,
  ),
  resolveText: vi.fn().mockImplementation(
    async (_t: string, _s: string, text: string) => text,
  ),
} as any;

/** Tools service stub */
const toolsServiceStub = { getTools: () => ({}) } as any;

/** Mock ConversationService to avoid DB writes */
const conversationServiceMock = {
  getOrCreateConversation: vi.fn().mockResolvedValue({
    id: 'conv-msw-001',
    tenantId: 'test-tenant',
    userId: 'test-user',
    title: 'Test Conversation',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  saveUserMessage: vi.fn().mockResolvedValue({
    id: 'msg-001',
    conversationId: 'conv-msw-001',
    role: 'user',
    content: '',
    createdAt: new Date(),
  }),
  getMessagesForContext: vi.fn().mockResolvedValue([]),
  listConversations: vi.fn().mockResolvedValue([]),
  saveAssistantMessage: vi.fn().mockResolvedValue(undefined),
  saveToolMessage: vi.fn().mockResolvedValue(undefined),
  updateConversationTitle: vi.fn().mockResolvedValue(undefined),
  getMessageCount: vi.fn().mockResolvedValue(0),
  getOlderMessages: vi.fn().mockResolvedValue([]),
  updateConversationSummary: vi.fn().mockResolvedValue(undefined),
} as any;

/** Mock AuditService */
const auditServiceMock = {
  logAudit: vi.fn().mockResolvedValue(undefined),
} as any;

/** Mock MemoryService */
const memoryServiceMock = {
  getRelevantMemories: vi.fn().mockResolvedValue([]),
  formatMemoriesForPrompt: vi.fn().mockReturnValue(''),
} as any;

/**
 * Drain a ReadableStream to string.
 */
async function drainStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (typeof value === 'string') {
        chunks.push(value);
      } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
        chunks.push(new TextDecoder().decode(value));
      } else {
        chunks.push(String(value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  return chunks.join('');
}

describe('Chat Pipeline (MSW)', () => {
  let mistralProvider: OpenRouterProviderService;
  let aiChatService: AiChatService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });

    mistralProvider = new OpenRouterProviderService(configService);

    // AiChatService with all mocked dependencies
    aiChatService = new AiChatService(
      null as any, // PrismaService (Phase 108)
      mistralProvider,
      conversationServiceMock,
      new PiiDetectionService(),
      piiResolutionStub,
      auditServiceMock,
      rateLimiterStub,
      toolsServiceStub, // EmailToolsService
      toolsServiceStub, // CalendarToolsService
      toolsServiceStub, // ContactToolsService
      toolsServiceStub, // FolderToolsService
      toolsServiceStub, // RagToolsService
      toolsServiceStub, // ConversationToolsService
      toolsServiceStub, // SandboxToolsService
      toolsServiceStub, // EmailProductivityToolsService
      toolsServiceStub, // FollowUpToolsService
      toolsServiceStub, // ReminderToolsService
      { getTools: () => ({}) } as any, // CrmToolsService
      memoryServiceMock,
      { getRuntimeContextMetadata: async () => ({}), maybeGenerateSmartTitle: async () => {}, maybeTriggerSummaryGeneration: async () => {} } as any, // ChatEnrichmentService
      { classify: () => ({ complexity: 'search', confidence: 0.5, signals: [] }), getExcludedDomains: () => [] } as any, // QueryRouterService
      undefined, // UsageTrackingService
    );
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
    circuitBreakerRegistry.resetAll();
  });

  afterAll(() => server.close());

  it('message -> streaming response collected without router middleware', async () => {
    // Override with custom streaming chunks
    server.use(
      createStreamingHandler([
        { content: 'I found' },
        { content: ' 3 emails' },
        { content: ' from John.' },
      ]),
    );

    const stream = await aiChatService.streamChat({
      tenantId: 'test-tenant',
      userId: 'test-user',
      message: 'search my emails from John',
    });

    expect(stream).toBeInstanceOf(ReadableStream);

    const text = await drainStream(stream);
    expect(text.length).toBeGreaterThan(0);

    // Conversation was created/retrieved
    expect(conversationServiceMock.getOrCreateConversation).toHaveBeenCalled();

    // User message was saved
    expect(conversationServiceMock.saveUserMessage).toHaveBeenCalled();

    // Audit log was called
    expect(auditServiceMock.logAudit).toHaveBeenCalled();
  }, 30_000);

  it('redacts historical, memory, and current-turn PII before calling the model', async () => {
    let capturedMessages: Array<{ role: string; content: unknown }> = [];

    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
        const body = (await request.json()) as {
          stream?: boolean;
          model?: string;
          messages?: Array<{ role: string; content: unknown }>;
        };

        capturedMessages = body.messages ?? [];

        if (!body.stream) {
          return HttpResponse.json({
            id: 'chatcmpl-msw-test',
            object: 'chat.completion',
            model: body.model ?? 'mistral-small-latest',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'OK' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 1,
              total_tokens: 11,
            },
          });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const firstChunk = JSON.stringify({
              id: 'chatcmpl-msw-redaction',
              object: 'chat.completion.chunk',
              model: body.model ?? 'mistral-small-latest',
              choices: [
                {
                  index: 0,
                  delta: { content: 'Redacted' },
                  finish_reason: null,
                },
              ],
            });
            const finalChunk = JSON.stringify({
              id: 'chatcmpl-msw-redaction',
              object: 'chat.completion.chunk',
              model: body.model ?? 'mistral-small-latest',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: 20,
                completion_tokens: 1,
                total_tokens: 21,
              },
            });

            controller.enqueue(encoder.encode(`data: ${firstChunk}\n\n`));
            controller.enqueue(encoder.encode(`data: ${finalChunk}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return new HttpResponse(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }),
    );

    conversationServiceMock.getMessagesForContext.mockResolvedValueOnce([
      {
        role: 'user',
        content: 'My old email is history@example.com',
      },
      {
        role: 'assistant',
        content: 'I previously replied to history@example.com',
      },
    ]);
    memoryServiceMock.getRelevantMemories.mockResolvedValueOnce([
      {
        content: 'Preferred contact: memory@example.com',
        category: 'contact',
        createdAt: new Date('2026-03-18T00:00:00.000Z'),
      },
    ]);
    memoryServiceMock.formatMemoriesForPrompt.mockReturnValueOnce(
      '## Known Facts About This User\n- Preferred contact: memory@example.com',
    );

    const stream = await aiChatService.streamChat({
      tenantId: 'test-tenant',
      userId: 'test-user',
      message: 'Send a note to current@example.com',
      conversationId: 'conv-msw-001',
    });

    await drainStream(stream);

    const requestPayload = JSON.stringify(capturedMessages);
    expect(requestPayload).not.toContain('history@example.com');
    expect(requestPayload).not.toContain('memory@example.com');
    expect(requestPayload).not.toContain('current@example.com');
    expect(requestPayload).toContain('[EMAIL_REDACTED');

    const getContextOrder =
      conversationServiceMock.getMessagesForContext.mock.invocationCallOrder.at(-1);
    const saveUserOrder =
      conversationServiceMock.saveUserMessage.mock.invocationCallOrder.at(-1);

    expect(getContextOrder).toBeTypeOf('number');
    expect(saveUserOrder).toBeTypeOf('number');
    expect(getContextOrder).toBeLessThan(saveUserOrder);
  }, 30_000);

  it('rate limiter rejection returns 429', async () => {
    // Override rate limiter to reject
    rateLimiterStub.checkRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
      retryAfterSeconds: 30,
    });

    await expect(
      aiChatService.streamChat({
        tenantId: 'test-tenant',
        userId: 'test-user',
        message: 'this should be rate limited',
      }),
    ).rejects.toThrow();
  });

  it('multi-step conversation loads history', async () => {
    // First call -- empty history
    conversationServiceMock.getMessagesForContext.mockResolvedValueOnce([]);

    const stream1 = await aiChatService.streamChat({
      tenantId: 'test-tenant',
      userId: 'test-user',
      message: 'Hello, my name is TestUser.',
      conversationId: 'conv-msw-001',
    });
    await drainStream(stream1);

    // Second call -- history has previous messages
    conversationServiceMock.getMessagesForContext.mockResolvedValueOnce([
      { role: 'user', content: 'Hello, my name is TestUser.' },
      { role: 'assistant', content: 'Hello TestUser!' },
    ]);

    const stream2 = await aiChatService.streamChat({
      tenantId: 'test-tenant',
      userId: 'test-user',
      message: 'What is my name?',
      conversationId: 'conv-msw-001',
    });

    const text2 = await drainStream(stream2);
    expect(text2.length).toBeGreaterThan(0);

    // getMessagesForContext should have been called for the second message
    expect(conversationServiceMock.getMessagesForContext).toHaveBeenCalledWith(
      'conv-msw-001',
      10,
      'test-tenant',
    );
  }, 30_000);

  it('memory service queried during chat', async () => {
    const stream = await aiChatService.streamChat({
      tenantId: 'test-tenant',
      userId: 'test-user',
      message: 'What do you know about our project?',
    });

    await drainStream(stream);

    // Memory retrieval was called
    expect(memoryServiceMock.getRelevantMemories).toHaveBeenCalledWith(
      'test-tenant',
      'test-user',
      expect.any(String),
      expect.any(Number),
    );
  }, 30_000);
});
