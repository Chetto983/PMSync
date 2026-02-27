# Technology Stack: v3.2 AI Rebuild & Cleanup

**Project:** MailAgent v3.2
**Researched:** 2026-02-27
**Confidence:** HIGH (all core libraries verified against official docs and npm)

## Executive Summary

The v3.2 AI rebuild requires **zero new frameworks** -- only version bumps and 3 new packages. The core migration is: drop `@voltagent/core` (and its 2 companion packages), replace with AI SDK v6's native `ToolLoopAgent` + `Output` API (already installed as `ai@^6.0.77`), and add `@assistant-ui/react-ai-sdk` to connect the frontend chat UI to the streaming backend. Testing stays on Jest (migration to Vitest costs more than it saves in a NestJS codebase), with MSW v2 added for mocking LLM streaming responses.

**PACKAGES TO ADD:** 3
**PACKAGES TO REMOVE:** 3
**NET CHANGE:** 0

---

## Current State (Already Installed)

These are already in `package.json` and DO NOT need changes:

| Package | Version | Where | Role |
|---------|---------|-------|------|
| `ai` | `^6.0.77` | Both | AI SDK v6 core -- `streamText`, `generateText`, `Output`, `ToolLoopAgent` |
| `@ai-sdk/react` | `^3.0.79` | Frontend | `useChat` hook for streaming chat |
| `@ai-sdk/mistral` | `^3.0.19` | Backend | Mistral LLM provider for AI SDK v6 |
| `@assistant-ui/react` | `^0.12.9` | Frontend | Chat UI primitives (Thread, Composer, Message parts) |
| `@assistant-ui/react-markdown` | `^0.12.3` | Frontend | Markdown rendering in chat messages |
| `streamdown` | `^2.1.0` | Frontend | Streaming markdown renderer |
| `@streamdown/code` | `^1.0.1` | Frontend | Syntax highlighting plugin |
| `@streamdown/math` | `^1.0.1` | Frontend | KaTeX math plugin |
| `@streamdown/mermaid` | `^1.0.1` | Frontend | Mermaid diagram plugin |
| `@streamdown/cjk` | `^1.0.1` | Frontend | CJK text optimization |
| `zod` | `^4.3.6` | Backend | Schema validation (used by AI SDK `Output.object()`) |
| `@playwright/test` | `^1.58.2` | Frontend (dev) | E2E testing |
| `jest` | `^30.2.0` | Both (dev) | Unit/integration testing |

---

## Packages to ADD

### 1. `@assistant-ui/react-ai-sdk` (Frontend)

**Purpose:** Connects `@assistant-ui/react` chat primitives to AI SDK v6's `useChat` streaming. Provides `useChatRuntime` hook and `AssistantChatTransport` that auto-forwards system messages and frontend tools to the backend.

**Why:** You already have `@assistant-ui/react@0.12.9` installed but it's NOT wired to the AI SDK -- there's zero usage of `useChat`, `AssistantRuntime`, or `useChatRuntime` anywhere in `frontend/src/`. This package is the glue layer. Without it, you'd have to manually bridge assistant-ui's runtime model to AI SDK's streaming protocol.

**Version:** `^0.12.3` (matches `@assistant-ui/react` major)

**Verified:** [npm](https://www.npmjs.com/package/@assistant-ui/react-ai-sdk), [official docs](https://www.assistant-ui.com/docs/api-reference/integrations/vercel-ai-sdk), [v6 example](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-ai-sdk-v6)

**Integration pattern:**
```typescript
// Frontend: Chat page
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@assistant-ui/react-ui'; // or custom

function ChatPage() {
  const runtime = useChatRuntime({
    api: '/api/v1/ai/chat', // your NestJS endpoint
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

```typescript
// Backend: NestJS controller
import { pipeAgentUIStreamToResponse } from 'ai';

@Post('chat')
async chat(@Req() req, @Res() res) {
  await pipeAgentUIStreamToResponse({
    response: res,
    agent: this.chatAgent, // ToolLoopAgent instance
    uiMessages: req.body.messages,
  });
}
```

**Confidence:** HIGH -- official integration, v6-compatible example exists, actively maintained.

---

### 2. `@assistant-ui/react-ui` (Frontend)

**Purpose:** Pre-styled Thread, ThreadList, AssistantModal components built on Tailwind + Radix UI. These are the actual visible chat components -- `@assistant-ui/react` only provides headless primitives.

**Why:** As of the January 2025 changelog, styled components were moved from `@assistant-ui/react` to `@assistant-ui/react-ui`. Without this package, you get primitives but no pre-built UI. You will customize these, but starting from their styled defaults saves significant effort over building from scratch.

**Version:** `^0.12.3`

**Verified:** [npm](https://www.npmjs.com/package/@assistant-ui/react-ui), [changelog](https://www.assistant-ui.com/blog/2025-01-31-changelog)

**Confidence:** HIGH -- direct dependency of the styled component architecture.

---

### 3. `msw` (Both, dev dependency)

**Purpose:** Mock Service Worker v2 -- intercepts HTTP and SSE requests at the network level for testing. Critical for mocking LLM streaming responses in AI tool chain tests without calling real APIs.

**Why:** AI SDK v6 uses SSE (Server-Sent Events) for streaming. MSW v2.12+ has first-class `sse()` handler support. This lets you write deterministic tests for:
- Tool execution chains (agent calls tool A, gets result, calls tool B)
- Streaming response handling
- Error scenarios (timeout, rate limit, malformed response)
- The entire chat pipeline without hitting Mistral's API

**Version:** `^2.12.0` (minimum for SSE support)

**Verified:** [MSW SSE docs](https://mswjs.io/docs/sse/), [MSW streaming docs](https://mswjs.io/docs/http/mocking-responses/streaming/)

**Integration pattern:**
```typescript
// test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { sse } from 'msw';

// Mock a streaming chat response
export const handlers = [
  sse('/api/v1/ai/chat', ({ client }) => {
    // Simulate AI SDK v6 UI message stream protocol
    client.send({ data: JSON.stringify({ type: 'text-delta', textDelta: 'Hello' }) });
    client.send({ data: JSON.stringify({ type: 'tool-call', toolCallId: '1', toolName: 'searchEmails', args: {} }) });
    client.send({ data: JSON.stringify({ type: 'finish', finishReason: 'stop' }) });
    queueMicrotask(() => client.close());
  }),
];
```

**Confidence:** HIGH -- industry standard, SSE support verified in docs.

---

## Packages to REMOVE

### 1. `@voltagent/core` (Backend)

**Current:** `^2.3.5`
**Why remove:** This is the entire point of v3.2. VoltAgent wraps AI SDK with its own agent abstraction, tool factory, memory management, and lifecycle hooks. AI SDK v6's native `ToolLoopAgent` provides the same loop+tools pattern without the framework weight. VoltAgent's abstractions add indirection (45+ services, tool factory overhead, AgentPoolService) without proportional value.

**Replaced by:** `ToolLoopAgent` from `ai` package (already installed).

**Migration:**
```typescript
// BEFORE (VoltAgent)
const agent = new VoltAgent({
  model: mistralModel,
  tools: [...toolFactoryOutput],
  systemPrompt: '...',
});
const result = await agent.run(prompt);

// AFTER (AI SDK v6 ToolLoopAgent)
const agent = new ToolLoopAgent({
  model: createMistral({ apiKey })('mistral-large-latest'),
  instructions: '...',
  tools: { searchEmails, createEvent, ... },
  stopWhen: stepCountIs(10),
});
const result = await agent.generate({ prompt });
```

### 2. `@voltagent/postgres` (Backend)

**Current:** `^2.1.0`
**Why remove:** VoltAgent's Postgres adapter for conversation persistence. Replace with direct Prisma models for chat history -- you already have Prisma 7.3 with full JSON support.

### 3. `@sentinelseed/voltagent` (Backend)

**Current:** `^0.2.2`
**Why remove:** Companion package to `@voltagent/core`. No longer needed.

---

## Packages to KEEP AS-IS (No Version Change Needed)

### AI SDK v6 -- What You Already Have

Your `ai@^6.0.77` already includes everything for the rebuild. Here's what's available without adding packages:

| API | Purpose | Replaces |
|-----|---------|----------|
| `ToolLoopAgent` | Reusable agent with tool loop (up to 20 steps default) | `@voltagent/core` Agent |
| `streamText()` | Streaming text generation with tools | VoltAgent streaming |
| `generateText()` + `Output.object()` | Structured output (replaces deprecated `generateObject`) | VoltAgent `generateObject` calls |
| `generateText()` + `Output.array()` | Streaming array elements | N/A |
| `generateText()` + `Output.choice()` | Classification tasks | Custom prompt parsing |
| `tool()` | Type-safe tool definition with Zod schemas | VoltAgent tool factory |
| `pipeAgentUIStreamToResponse()` | Stream agent output to Express/NestJS response | Custom streaming |
| `pipeUIMessageStreamToResponse()` | Stream raw text to response | Custom streaming |
| `createUIMessageStream()` | Custom stream with metadata injection | N/A |
| `convertToModelMessages()` | Convert UI messages to model format (now async in v6) | Manual conversion |

### Key AI SDK v6 Breaking Changes to Handle

These are already in your installed version but the codebase uses v5 patterns through VoltAgent:

| Change | Old (v5) | New (v6) | Impact |
|--------|----------|----------|--------|
| Agent class | `Experimental_Agent` | `ToolLoopAgent` | Low -- VoltAgent hid this |
| System prompt | `system` param | `instructions` param | Search-replace |
| Object generation | `generateObject()` | `generateText({ output: Output.object() })` | Medium -- briefing, follow-ups, triage |
| Message types | `CoreMessage` | `ModelMessage` | Low -- mostly internal |
| Message conversion | `convertToCoreMessages()` (sync) | `convertToModelMessages()` (async) | Medium -- add awaits |
| Tool options type | `ToolCallOptions` | `ToolExecutionOptions` | Low -- rename |
| Finish reason | `"unknown"` | `"other"` | Low |
| Default stop | `stepCountIs(1)` | `stepCountIs(20)` | Check your loops |
| Mock classes | `MockLanguageModelV2` | `MockLanguageModelV3` | Test files only |

### Automated Migration

Run the codemod AFTER removing VoltAgent wrappers:
```bash
npx @ai-sdk/codemod v6
```
This handles most renames automatically. Manual work is the VoltAgent-to-ToolLoopAgent structural change.

---

## Testing Stack Decision: Stay on Jest

### Why NOT Vitest

Despite Vitest 4.x being the default for new projects in 2026, migrating MailAgent to Vitest is a bad trade:

1. **NestJS uses Jest natively.** `@nestjs/testing` is built around Jest. The backend has `jest.config.js` with ts-jest, module mappers for ESM packages (nanoid, jsdom, p-retry), and `forceExit: true` for handle cleanup. Rewriting all this for Vitest gains nothing.

2. **Migration cost is real.** The backend has `jest.mock()` factory patterns, custom module mappers, and ESM workarounds that would all need manual conversion. Vitest's `vi.mock()` has different closure behavior.

3. **Frontend also uses Jest 30.** Both workspaces are unified on Jest 30.2.0 with ts-jest. Consistency matters more than marginal speed gains.

4. **Playwright already handles E2E.** The speed argument for Vitest matters for unit tests; your E2E tests (chat pipeline, streaming) will use Playwright regardless.

### What to Add for AI Testing

| Tool | Purpose | Where |
|------|---------|-------|
| `msw@^2.12.0` | Mock SSE/HTTP for LLM calls | Both (dev) |
| `jest` (existing) | Unit tests for tools, services | Both (existing) |
| `@playwright/test` (existing) | E2E chat pipeline tests | Frontend (existing) |
| `@nestjs/testing` (existing) | Integration tests for NestJS modules | Backend (existing) |

### AI-Specific Testing Patterns

```typescript
// 1. Tool unit test (Jest, no mocking needed)
describe('searchEmails tool', () => {
  it('returns emails matching query', async () => {
    const result = await searchEmailsTool.execute({
      query: 'from:boss subject:urgent',
      limit: 5,
    }, { /* mock context */ });
    expect(result).toMatchObject({ emails: expect.any(Array) });
  });
});

// 2. Agent integration test (Jest + MSW)
describe('chat agent', () => {
  it('uses tools to answer email questions', async () => {
    // MSW intercepts the Mistral API call
    server.use(
      http.post('https://api.mistral.ai/v1/chat/completions', () => {
        return HttpResponse.json({
          choices: [{ message: { tool_calls: [{ function: { name: 'searchEmails' } }] } }]
        });
      })
    );
    const result = await agent.generate({ prompt: 'Find emails from John' });
    expect(result.steps).toHaveLength(2); // tool call + final response
  });
});

// 3. Chat E2E test (Playwright)
test('chat sends message and receives streamed response', async ({ page }) => {
  await page.goto('/chat');
  await page.fill('[data-testid="chat-input"]', 'Summarize my inbox');
  await page.click('[data-testid="send-button"]');
  await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible();
});
```

---

## Packages NOT to Add

| Package | Why Not |
|---------|---------|
| **Mastra** | Explicitly rejected -- no NestJS support (GitHub #5081, #5880, #3301), Hono-coupled, ESM-only. Already in PROJECT.md out-of-scope. |
| **LangChain** | Massive dependency tree, poor tree-shaking, AI SDK v6 covers all our use cases natively. |
| **Vitest** | Migration cost exceeds benefit for existing Jest 30 + NestJS codebase. See analysis above. |
| **promptfoo** | Overkill for our testing needs. Useful for prompt regression testing at scale, but MSW + Jest covers tool chain testing. Revisit if prompt quality becomes a recurring issue. |
| **@assistant-ui/react-streamdown** | Already have `streamdown` + `@streamdown/*` plugins directly. The assistant-ui wrapper just re-exports them -- no added value when you control the markdown component. |
| **@assistant-ui/react-devtools** | Nice-to-have for debugging, but not needed for the rebuild itself. Add later if runtime inspection becomes painful. |
| **`@google/genai`** | Already installed (`^1.40.0`) but used for what? If it's dead code from experimentation, remove it during cleanup. NOT needed for Mistral-based AI. |

---

## Architecture: How Packages Wire Together

```
Frontend                          Backend (NestJS)
---------                         ----------------
@assistant-ui/react-ai-sdk        ai (ToolLoopAgent)
  useChatRuntime() ----SSE---->     pipeAgentUIStreamToResponse()
  AssistantChatTransport              |
       |                              v
@assistant-ui/react               ToolLoopAgent.stream()
  AssistantRuntimeProvider           model: @ai-sdk/mistral
  Thread, Composer                   tools: { ...30 tools }
       |                              |
@assistant-ui/react-ui            tool() definitions
  Styled Thread, Messages           Zod schemas for params
       |                              |
streamdown + plugins              Output.object() / Output.array()
  Markdown rendering                generateText() for non-chat AI
```

### Key Integration Points

1. **Backend streaming endpoint** uses `pipeAgentUIStreamToResponse()` which takes a `ToolLoopAgent` and Express `Response`. NestJS controllers inject `@Res()`.

2. **Frontend runtime** uses `useChatRuntime({ api: '/api/v1/ai/chat' })` which returns a runtime for `AssistantRuntimeProvider`. This auto-handles streaming, tool calls, retries.

3. **Non-chat AI** (briefing, follow-up generation, triage) uses `generateText()` with `Output.object({ schema })` directly -- no agent loop, no streaming. Cheaper and faster.

4. **Tool definitions** use AI SDK v6's `tool()` with Zod schemas. Same tools work in both `ToolLoopAgent` (chat) and `generateText` (non-chat).

---

## Installation Commands

```bash
# Frontend -- add 2 packages
cd frontend
npm install @assistant-ui/react-ai-sdk@^0.12.3 @assistant-ui/react-ui@^0.12.3

# Frontend dev -- add MSW
npm install -D msw@^2.12.0

# Backend dev -- add MSW
cd ../backend
npm install -D msw@^2.12.0

# Backend -- remove VoltAgent
npm uninstall @voltagent/core @voltagent/postgres @sentinelseed/voltagent

# Run AI SDK v6 codemod (after VoltAgent removal, from project root)
npx @ai-sdk/codemod v6

# Verify
cd frontend && npm run type-check
cd ../backend && npm run type-check
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Agent Framework | AI SDK v6 `ToolLoopAgent` | Mastra, LangChain, VoltAgent | Mastra: no NestJS. LangChain: bloated. VoltAgent: being removed. |
| Chat UI | assistant-ui | Custom, shadcn-chat | assistant-ui already installed, AI SDK native, production-ready |
| LLM Mocking | MSW v2 `sse()` | nock, custom mocks, jest.mock | MSW intercepts at network level (SSE support), works in both browser and Node |
| Structured Output | `Output.object()` | `generateObject()` (deprecated) | generateObject is deprecated in v6, will be removed |
| Testing | Jest 30 + MSW + Playwright | Vitest + MSW + Playwright | Migration cost, NestJS Jest-native, both workspaces on Jest |
| Markdown | streamdown (existing) | react-markdown, @assistant-ui/react-streamdown | streamdown already installed with all plugins, better streaming support |

---

## Version Compatibility Matrix

| Package | Version | Requires | Compatible With |
|---------|---------|----------|-----------------|
| `ai` | `^6.0.77` | Node 18+ | `@ai-sdk/react@^3.x`, `@ai-sdk/mistral@^3.x` |
| `@ai-sdk/react` | `^3.0.79` | React 18+/19 | `ai@^6.x`, `@assistant-ui/react-ai-sdk@^0.12.x` |
| `@ai-sdk/mistral` | `^3.0.19` | - | `ai@^6.x` |
| `@assistant-ui/react` | `^0.12.9` | React 18+/19 | `@assistant-ui/react-ai-sdk@^0.12.x`, `@assistant-ui/react-ui@^0.12.x` |
| `@assistant-ui/react-ai-sdk` | `^0.12.3` | `ai@^6.x`, `@ai-sdk/react@^3.x` | `@assistant-ui/react@^0.12.x` |
| `@assistant-ui/react-ui` | `^0.12.3` | Tailwind CSS 4.x | `@assistant-ui/react@^0.12.x` |
| `msw` | `^2.12.0` | Node 18+ | Jest 30, Playwright |
| `zod` | `^4.3.6` | - | AI SDK `Output.object()`, `tool()` schemas |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| AI SDK v6 API | HIGH | Official docs, migration guide, codemod, NestJS cookbook all verified |
| ToolLoopAgent | HIGH | Official reference docs with complete API, production-ready (not experimental) |
| assistant-ui integration | HIGH | Official v6 example exists, `react-ai-sdk` package verified on npm |
| MSW for LLM mocking | HIGH | SSE support documented, industry standard |
| Jest over Vitest decision | HIGH | Verified both configs, NestJS native, migration cost analysis based on actual codebase |
| Packages to remove | HIGH | VoltAgent usage traced across 30+ files -- clean removal path |
| generateObject deprecation | HIGH | Explicitly deprecated in v6, Output API documented as replacement |

---

## Sources

- [AI SDK v6 Release Blog](https://vercel.com/blog/ai-sdk-6) -- Released 2025-12-22
- [AI SDK v5 to v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [ToolLoopAgent Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [Output API Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
- [pipeAgentUIStreamToResponse](https://ai-sdk.dev/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)
- [AI SDK NestJS Cookbook](https://ai-sdk.dev/cookbook/api-servers/nest)
- [assistant-ui GitHub](https://github.com/assistant-ui/assistant-ui)
- [assistant-ui AI SDK v6 Example](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-ai-sdk-v6)
- [assistant-ui AI SDK Integration Docs](https://www.assistant-ui.com/docs/api-reference/integrations/vercel-ai-sdk)
- [assistant-ui Streamdown Docs](https://www.assistant-ui.com/docs/ui/streamdown)
- [MSW SSE Documentation](https://mswjs.io/docs/sse/)
- [MSW Streaming Documentation](https://mswjs.io/docs/http/mocking-responses/streaming/)
- [@assistant-ui/react-ai-sdk on npm](https://www.npmjs.com/package/@assistant-ui/react-ai-sdk)
- [@ai-sdk/mistral on npm](https://www.npmjs.com/package/@ai-sdk/mistral)
