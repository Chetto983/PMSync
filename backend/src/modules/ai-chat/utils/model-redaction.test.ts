import { describe, it, expect } from 'vitest';
import type { ModelMessage } from 'ai';
import {
  extractSafeMessageTextForModel,
  redactModelMessagesForModel,
  redactTextForModel,
} from './model-redaction';

const piiDetectorStub = {
  detect(text: string) {
    return {
      redactedText: text.replaceAll(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        '[EMAIL_REDACTED:test]',
      ),
    };
  },
};

describe('model-redaction', () => {
  it('redacts strings recursively across model messages', () => {
    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: 'Summary: owner@example.com requested help.',
      },
      {
        role: 'assistant',
        content: 'I replied to helper@example.com already.',
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-1',
            toolName: 'send_email',
            input: {},
            output: {
              to: 'nested@example.com',
              body: 'CC owner@example.com',
            },
            dynamic: true,
          },
        ],
      } as unknown as ModelMessage,
    ];

    const redacted = redactModelMessagesForModel(piiDetectorStub, messages);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('owner@example.com');
    expect(serialized).not.toContain('helper@example.com');
    expect(serialized).not.toContain('nested@example.com');
    expect(serialized).toContain('[EMAIL_REDACTED:test]');
  });

  it('extracts safe text from conversation records', () => {
    const safeText = extractSafeMessageTextForModel(piiDetectorStub, {
      role: 'user',
      content: {
        type: 'text',
        text: 'Reach me at user@example.com',
      },
    } as any);

    expect(safeText).toBe('Reach me at [EMAIL_REDACTED:test]');
  });

  it('preserves empty strings', () => {
    expect(redactTextForModel(piiDetectorStub, '')).toBe('');
  });
});
