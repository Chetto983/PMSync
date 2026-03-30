/**
 * T-1802: Gmail Search Query Sanitization Tests
 *
 * Tests sanitizeUserQuery() to verify all injection vectors are caught:
 * - Gmail operators (from:, to:, in:, label:, etc.)
 * - Boolean operators (OR, AND)
 * - Negation prefix (-in:inbox)
 * - Parenthesized groups and curly brace ranges
 */
import { describe, it, expect } from '@jest/globals';

/**
 * Mirror of GmailMessageService.sanitizeUserQuery() for direct testing.
 * Must be kept in sync with the actual implementation.
 */
function sanitizeUserQuery(query: string): string {
  const GMAIL_OPERATORS = /\b(from|to|subject|in|is|has|label|filename|after|before|older|newer|deliveredto|list|cc|bcc|size|larger|smaller|category|rfc822msgid):/i;
  const BOOLEAN_OPS = /\b(OR|AND)\b/;
  const NEGATION = /-\w+:/;
  const GROUPING = /[(){}]/;

  const needsQuoting =
    GMAIL_OPERATORS.test(query) ||
    BOOLEAN_OPS.test(query) ||
    NEGATION.test(query) ||
    GROUPING.test(query);

  if (needsQuoting) {
    return `"${query.replace(/"/g, '')}"`;
  }
  return query;
}

describe('sanitizeUserQuery — G-H6 injection prevention', () => {
  describe('plain text (pass-through)', () => {
    it('should return plain text unchanged', () => {
      expect(sanitizeUserQuery('hello world')).toBe('hello world');
    });

    it('should return single word unchanged', () => {
      expect(sanitizeUserQuery('invoice')).toBe('invoice');
    });

    it('should return empty string unchanged', () => {
      expect(sanitizeUserQuery('')).toBe('');
    });

    it('should not trigger on colon in normal text', () => {
      expect(sanitizeUserQuery('meeting at 3:00')).toBe('meeting at 3:00');
    });

    it('should not trigger on lowercase "or" (not boolean)', () => {
      expect(sanitizeUserQuery('this or that')).toBe('this or that');
    });
  });

  describe('Gmail operators (wrap in quotes)', () => {
    it('should wrap from: operator', () => {
      expect(sanitizeUserQuery('from:attacker@evil.com')).toBe('"from:attacker@evil.com"');
    });

    it('should wrap to: operator', () => {
      expect(sanitizeUserQuery('to:victim@example.com')).toBe('"to:victim@example.com"');
    });

    it('should wrap in: operator', () => {
      expect(sanitizeUserQuery('in:trash')).toBe('"in:trash"');
    });

    it('should wrap is: operator', () => {
      expect(sanitizeUserQuery('is:unread')).toBe('"is:unread"');
    });

    it('should wrap label: operator', () => {
      expect(sanitizeUserQuery('label:secret')).toBe('"label:secret"');
    });

    it('should wrap subject: operator', () => {
      expect(sanitizeUserQuery('subject:password reset')).toBe('"subject:password reset"');
    });

    it('should wrap has: operator', () => {
      expect(sanitizeUserQuery('has:attachment')).toBe('"has:attachment"');
    });

    it('should wrap category: operator', () => {
      expect(sanitizeUserQuery('category:social')).toBe('"category:social"');
    });

    it('should wrap mixed text with operator', () => {
      expect(sanitizeUserQuery('search from:user@test.com important')).toBe('"search from:user@test.com important"');
    });

    it('should be case-insensitive', () => {
      expect(sanitizeUserQuery('FROM:user@test.com')).toBe('"FROM:user@test.com"');
    });
  });

  describe('boolean operators', () => {
    it('should wrap OR boolean', () => {
      expect(sanitizeUserQuery('cats OR dogs')).toBe('"cats OR dogs"');
    });

    it('should wrap AND boolean', () => {
      expect(sanitizeUserQuery('cats AND dogs')).toBe('"cats AND dogs"');
    });

    it('should not trigger on "Organic" (OR as substring)', () => {
      // "OR" must be a whole word
      expect(sanitizeUserQuery('Organic food')).toBe('Organic food');
    });
  });

  describe('negation prefix', () => {
    it('should wrap -in:inbox negation', () => {
      expect(sanitizeUserQuery('-in:inbox')).toBe('"-in:inbox"');
    });

    it('should wrap -from: negation', () => {
      expect(sanitizeUserQuery('-from:spam@junk.com')).toBe('"-from:spam@junk.com"');
    });

    it('should wrap -label: negation', () => {
      expect(sanitizeUserQuery('-label:important')).toBe('"-label:important"');
    });
  });

  describe('parenthesized groups and curly braces', () => {
    it('should wrap parenthesized group', () => {
      expect(sanitizeUserQuery('(from:a OR to:b)')).toBe('"(from:a OR to:b)"');
    });

    it('should wrap curly brace range', () => {
      expect(sanitizeUserQuery('{before:2024/01/01 after:2023/01/01}')).toBe('"{before:2024/01/01 after:2023/01/01}"');
    });

    it('should wrap lone parenthesis', () => {
      expect(sanitizeUserQuery('test (injection)')).toBe('"test (injection)"');
    });
  });

  describe('quote stripping', () => {
    it('should strip existing quotes before re-wrapping', () => {
      expect(sanitizeUserQuery('from:"attacker"')).toBe('"from:attacker"');
    });

    it('should handle multiple quotes', () => {
      expect(sanitizeUserQuery('"from:a" OR "to:b"')).toBe('"from:a OR to:b"');
    });
  });
});
