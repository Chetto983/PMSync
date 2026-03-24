/**
 * Qwen 3.5 Chat Agent E2E — Tests the real ToolLoopAgent + streaming pipeline
 * to verify Qwen 3.5 via OpenRouter works with the AI SDK agent pattern.
 *
 * Requires: OPENROUTER_API_KEY
 */
import { describe, it, expect } from 'vitest';
import { ToolLoopAgent, stepCountIs, type ModelMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

const openRouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const FLASH = 'qwen/qwen3.5-flash-02-23';
const PLUS = 'qwen/qwen3.5-plus-02-15';

const chatModel = (id: string) =>
  openRouter.chat(id, { provider: { data_collection: 'deny', sort: 'latency' } });

describe('Qwen 3.5 ToolLoopAgent E2E', () => {

  // 1. Basic agent.generate() — no tools
  it('agent.generate() returns text without tools', async () => {
    const agent = new ToolLoopAgent({
      id: 'test-agent',
      model: chatModel(FLASH),
      instructions: 'You are a helpful email assistant. Be concise.',
      tools: {},
      toolChoice: 'auto',
      stopWhen: stepCountIs(3),
    });

    const result = await agent.generate({
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      abortSignal: AbortSignal.timeout(30_000),
    });

    console.log('generate() text:', result.text);
    expect(result.text.length).toBeGreaterThan(3);
  }, 60_000);

  // 2. Basic agent.stream() — no tools
  it('agent.stream() produces a valid UIMessageStream', async () => {
    const agent = new ToolLoopAgent({
      id: 'test-agent',
      model: chatModel(FLASH),
      instructions: 'You are a helpful email assistant. Be concise.',
      tools: {},
      toolChoice: 'auto',
      stopWhen: stepCountIs(3),
    });

    const result = await agent.stream({
      messages: [{ role: 'user', content: 'List 2 email tips.' }],
      abortSignal: AbortSignal.timeout(30_000),
    });

    const stream = result.toUIMessageStream({ sendReasoning: false });

    // toUIMessageStream returns ReadableStream<string>, not bytes
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(typeof value === 'string' ? value : String(value as unknown));
    }

    const fullOutput = chunks.join('');
    console.log('stream output length:', fullOutput.length, 'chunks:', chunks.length);
    console.log('first 500 chars:', fullOutput.slice(0, 500));
    expect(chunks.length).toBeGreaterThan(0);
    expect(fullOutput.length).toBeGreaterThan(10);
  }, 60_000);

  // 3. Agent with a simple tool
  it('agent.generate() with a tool call', async () => {
    const agent = new ToolLoopAgent({
      id: 'test-agent-tools',
      model: chatModel(FLASH),
      instructions: 'You are an email assistant. Use the get_unread_count tool when asked about emails.',
      tools: {
        get_unread_count: {
          description: 'Get the count of unread emails',
          inputSchema: z.object({}),
          execute: async () => ({ count: 5, label: '5 unread emails' }),
        },
      },
      toolChoice: 'auto',
      stopWhen: stepCountIs(5),
    });

    const result = await agent.generate({
      messages: [{ role: 'user', content: 'How many unread emails do I have?' }],
      abortSignal: AbortSignal.timeout(60_000),
    });

    console.log('tool agent text:', result.text);
    // The response should mention the number 5 (from the tool result)
    expect(result.text.toLowerCase()).toMatch(/5|five|unread/);
  }, 90_000);

  // 4. Agent stream with tool call
  it('agent.stream() with a tool call produces stream output', async () => {
    const agent = new ToolLoopAgent({
      id: 'test-agent-tools-stream',
      model: chatModel(FLASH),
      instructions: 'You are an email assistant. Use the check_inbox tool to answer questions.',
      tools: {
        check_inbox: {
          description: 'Check the inbox for recent emails',
          inputSchema: z.object({}),
          execute: async () => ({
            emails: [
              { from: 'john@acme.com', subject: 'Contract renewal', unread: true },
              { from: 'hr@company.com', subject: 'Benefits', unread: false },
            ],
          }),
        },
      },
      toolChoice: 'auto',
      stopWhen: stepCountIs(5),
    });

    const result = await agent.stream({
      messages: [{ role: 'user', content: 'What emails do I have?' }],
      abortSignal: AbortSignal.timeout(60_000),
    });

    const stream = result.toUIMessageStream({ sendReasoning: false });
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(typeof value === 'string' ? value : String(value as unknown));
    }

    const fullOutput = chunks.join('');
    console.log('tool stream output length:', fullOutput.length);
    console.log('first 500 chars:', fullOutput.slice(0, 500));
    expect(fullOutput.length).toBeGreaterThan(10);
  }, 90_000);

  // 5. Multi-turn conversation (simulates Telegram/chat history)
  it('agent.generate() handles multi-turn conversation', async () => {
    const agent = new ToolLoopAgent({
      id: 'test-multi-turn',
      model: chatModel(FLASH),
      instructions: 'You are an email assistant.',
      tools: {},
      toolChoice: 'auto',
      stopWhen: stepCountIs(3),
    });

    const messages: ModelMessage[] = [
      { role: 'user', content: 'My name is Marco.' },
      { role: 'assistant', content: 'Hello Marco! How can I help you?' },
      { role: 'user', content: 'What is my name?' },
    ];

    const result = await agent.generate({
      messages,
      abortSignal: AbortSignal.timeout(30_000),
    });

    console.log('multi-turn text:', result.text);
    expect(result.text.toLowerCase()).toContain('marco');
  }, 60_000);

  // 6. Qwen Plus model (used as default chat model)
  it('agent.generate() works with Qwen 3.5 Plus', async () => {
    const agent = new ToolLoopAgent({
      id: 'test-plus',
      model: chatModel(PLUS),
      instructions: 'You are an email assistant. Be concise.',
      tools: {},
      toolChoice: 'auto',
      stopWhen: stepCountIs(3),
    });

    const result = await agent.generate({
      messages: [{ role: 'user', content: 'Summarize: "Meeting moved to Friday 3pm, prepare slides."' }],
      abortSignal: AbortSignal.timeout(45_000),
    });

    console.log('Plus model text:', result.text);
    expect(result.text.length).toBeGreaterThan(10);
  }, 60_000);
});
