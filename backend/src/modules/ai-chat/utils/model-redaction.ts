import type { AiMessage } from '@prisma/client';
import type { ModelMessage } from 'ai';

type PiiDetector = {
  detect(text: string): {
    redactedText: string;
  };
};

export function redactTextForModel(
  piiDetector: PiiDetector,
  text: string,
): string {
  if (!text) return text;
  return piiDetector.detect(text).redactedText;
}

export function redactValueForModel<T>(
  piiDetector: PiiDetector,
  value: T,
): T {
  if (typeof value === 'string') {
    return redactTextForModel(piiDetector, value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValueForModel(piiDetector, item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        redactValueForModel(piiDetector, nestedValue),
      ]),
    ) as T;
  }

  return value;
}

export function redactModelMessagesForModel(
  piiDetector: PiiDetector,
  messages: ModelMessage[],
): ModelMessage[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: redactTextForModel(piiDetector, message.content),
      } as ModelMessage;
    }

    return {
      ...message,
      content: redactValueForModel(piiDetector, message.content),
    } as ModelMessage;
  });
}

export function extractSafeMessageTextForModel(
  piiDetector: PiiDetector,
  message: Pick<AiMessage, 'role' | 'content'>,
): string {
  return redactTextForModel(
    piiDetector,
    normalizeConversationMessageContent(message.role, message.content),
  );
}

function normalizeConversationMessageContent(
  role: string,
  content: unknown,
): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!content || typeof content !== 'object') {
    return '';
  }

  const record = content as Record<string, unknown>;

  if (typeof record.redactedText === 'string') {
    return record.redactedText;
  }

  if (typeof record.text === 'string') {
    return record.text;
  }

  if (role === 'tool' && record.output !== undefined) {
    return typeof record.output === 'string'
      ? record.output
      : JSON.stringify(record.output);
  }

  if (role === 'tool' && record.result !== undefined) {
    return typeof record.result === 'string'
      ? record.result
      : JSON.stringify(record.result);
  }

  return JSON.stringify(record);
}
