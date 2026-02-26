/**
 * Tests for consolidated LLM sanitization utilities
 */
import { sanitizeLlmResponse } from '../sanitize.utils';

describe('sanitizeLlmResponse', () => {
  it('should return empty string for empty input', () => {
    expect(sanitizeLlmResponse('')).toBe('');
  });

  it('should return null/undefined as-is', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeLlmResponse(null as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeLlmResponse(undefined as any)).toBeUndefined();
  });

  it('should strip [User Memory] sections with --- delimiter', () => {
    const input = '[User Memory]\nJohn prefers formal emails\n---\n\nHello!';
    expect(sanitizeLlmResponse(input)).toBe('Hello!');
  });

  it('should strip [User Memory] sections case-insensitively', () => {
    const input = '[user memory]\nSome data\n---\n\nResponse text';
    expect(sanitizeLlmResponse(input)).toBe('Response text');
  });

  it('should strip ## Learned Constraints sections', () => {
    const input = '## Learned Constraints\nDo not use informal greetings.\n\n## Response\nHello!';
    expect(sanitizeLlmResponse(input)).toBe('## Response\nHello!');
  });

  it('should strip ## Learned Constraints at end of text', () => {
    const input = 'Here is my reply.\n\n## Learned Constraints\nNever use slang.';
    expect(sanitizeLlmResponse(input)).toBe('Here is my reply.');
  });

  it('should collapse 3+ newlines to 2', () => {
    const input = 'Line one\n\n\n\nLine two';
    expect(sanitizeLlmResponse(input)).toBe('Line one\n\nLine two');
  });

  it('should handle multiple cleanup operations together', () => {
    const input =
      '[User Memory]\nContext data\n---\n\n\n\nHello world\n\n\n\n## Learned Constraints\nSome constraint';
    expect(sanitizeLlmResponse(input)).toBe('Hello world');
  });

  it('should pass through clean text unchanged', () => {
    const input = 'This is a perfectly normal response.';
    expect(sanitizeLlmResponse(input)).toBe('This is a perfectly normal response.');
  });

  it('should trim leading/trailing whitespace', () => {
    const input = '   Some response text   ';
    expect(sanitizeLlmResponse(input)).toBe('Some response text');
  });
});
