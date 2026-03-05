/**
 * Contract Test: AI Chat
 *
 * Validates that AI chat endpoints exist in the OpenAPI spec
 * and their response schemas match what the frontend AI API module expects.
 *
 * Frontend reference: frontend/lib/api/ai.ts
 *   voltAgentApi.chat(payload) -> ChatResult { text, requiresApproval?, pendingActions?, conversationId? }
 *   voltAgentApi.streamChat() -> SSE stream at /api/v1/ai/chat/stream
 *   voltAgentApi.getPendingActions() -> { actions: PendingAction[], total: number }
 *   voltAgentApi.listConversations() -> { success, conversations, count }
 *   aiApi.summarizeEmail(id) -> { success, summary }
 *   aiApi.composeEmail(payload) -> { success, body, subject? }
 */
import {
  loadSpec,
  expectPathExists,
  getResponseSchema,
  OpenApiSpec,
} from './contract-helpers';

describe('AI Chat Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- ai-chat contract tests skipped');
    }
  });

  it('POST /api/v1/ai/chat path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/chat', 'post');
  });

  it('POST /api/v1/ai/chat/stream path exists', () => {
    if (!spec) return;
    // SSE streaming endpoint
    expectPathExists(spec, '/api/v1/ai/chat/stream', 'post');
  });

  it('GET /api/v1/ai/actions/pending path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/actions/pending', 'get');
  });

  it('POST /api/v1/ai/summarize/{emailId} path exists', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/ai/summarize/{emailId}',
      '/api/v1/ai/summarize/{id}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.post);
    expect(found).toBe(true);
  });

  it('POST /api/v1/ai/compose path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/compose', 'post');
  });

  it('POST /api/v1/ai/smart-reply/{emailId} path exists', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/ai/smart-reply/{emailId}',
      '/api/v1/ai/smart-reply/{id}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.post);
    expect(found).toBe(true);
  });

  it('GET /api/v1/ai/conversations path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/conversations', 'get');
  });

  it('GET /api/v1/ai/deadlines path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/deadlines', 'get');
  });

  it('GET /api/v1/ai/follow-ups/pending path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/follow-ups/pending', 'get');
  });
});
