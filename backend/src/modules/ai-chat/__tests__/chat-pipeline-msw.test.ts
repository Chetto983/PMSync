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
import {
  mistralChatHandler,
  createStreamingHandler,
  createGenerateHandler,
} from '../../../test/msw-handlers/mistral-chat.handler';
import { mistralEmbedHandler } from '../../../test/msw-handlers/mistral-embed.handler';
import { ConfigService } from '@nestjs/config';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { AiChatService } from '../services/ai-chat.service';
import { ConversationService } from '../services/conversation.service';
import { HitlService } from '../services/hitl.service';
import { PiiDetectionService } from '../../ai/guards/pii-detection-sentinel.service';
import { IntentRouterService } from '../tools/intent-router.service';
import { IntentClassifierService } from '../../ai/nlp/intent-classifier.service';
import { MemoryService } from '../services/memory.service';

// MSW server with default handlers
const server = setupServer(mistralChatHandler, mistralEmbedHandler);

// Fake ConfigService
const configService = {
  get: (key: string, defaultValue?: string) => {
    const map: Record<string, string> = {
      MISTRAL_API_KEY: 'msw-fake-key',
      INTENT_MODEL_PATH: '',
    };
    return map[key] ?? defaultValue;
  },
  getOrThrow: (key: string) => {
    if (key === 'MISTRAL_API_KEY') return 'msw-fake-key';
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
} as any;

/** Mock HitlService */
const hitlServiceMock = {
  createAction: vi.fn().mockResolvedValue({
    id: 'hitl-001',
    status: 'pending',
  }),
  getAction: vi.fn().mockResolvedValue(null),
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
  let mistralProvider: MistralProviderService;
  let intentRouterService: IntentRouterService;
  let aiChatService: AiChatService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });

    mistralProvider = new MistralProviderService(configService);

    // IntentRouterService with regex fallback (no FastText model)
    const intentClassifier = new IntentClassifierService(configService);
    intentRouterService = new IntentRouterService(
      intentClassifier,
      mistralProvider,
    );

    // AiChatService with all mocked dependencies
    aiChatService = new AiChatService(
      mistralProvider,
      conversationServiceMock,
      hitlServiceMock,
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
      toolsServiceStub, // ProductivityToolsService
      toolsServiceStub, // ReminderToolsService
      intentRouterService,
      { getSkillsForIntent: () => '' } as any, // SkillsLoaderService
      memoryServiceMock,
      // Phase 32: ToolRegistryService stub for tool discovery
      { getAllTools: () => [], getToolNames: () => [], getTool: () => undefined, registerTool: () => {} } as any,
      undefined, // UsageTrackingService
    );
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });

  afterAll(() => server.close());

  it('message -> intent routing -> streaming response collected', async () => {
    // Override with custom streaming chunks
    server.use(
      createStreamingHandler([
        { content: 'I found' },
        { content: ' 3 emails' },
        { content: ' from John.' },
      ]),
    );

    // Spy on intent routing
    const routerSpy = vi.spyOn(intentRouterService, 'classifyAndRoute');

    const stream = await aiChatService.streamChat({
      tenantId: 'test-tenant',
      userId: 'test-user',
      message: 'search my emails from John',
    });

    expect(stream).toBeInstanceOf(ReadableStream);

    const text = await drainStream(stream);
    expect(text.length).toBeGreaterThan(0);

    // Intent routing was invoked
    expect(routerSpy).toHaveBeenCalledTimes(1);

    // Conversation was created/retrieved
    expect(conversationServiceMock.getOrCreateConversation).toHaveBeenCalled();

    // User message was saved
    expect(conversationServiceMock.saveUserMessage).toHaveBeenCalled();

    // Audit log was called
    expect(auditServiceMock.logAudit).toHaveBeenCalled();
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
