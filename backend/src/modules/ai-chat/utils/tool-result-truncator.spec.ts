/**
 * Tool Result Truncator Unit Tests
 *
 * Tests the truncation strategies: array trimming, bodyText truncation, fallback.
 */
import { truncateToolResult } from './tool-result-truncator';

describe('truncateToolResult', () => {
  describe('fast path - under limit', () => {
    it('returns small results unchanged', () => {
      const result = { success: true, data: 'hello' };
      expect(truncateToolResult(result)).toEqual(result);
    });

    it('does not add truncated flag for small results', () => {
      const result = { emails: [{ id: '1', subject: 'Test' }] };
      const truncated = truncateToolResult(result);
      expect(truncated).not.toHaveProperty('truncated');
    });
  });

  describe('strategy 1 - array trimming', () => {
    it('trims results array when over limit', () => {
      const bigEmails = Array.from({ length: 500 }, (_, i) => ({
        id: `email-${i}`,
        subject: `Subject ${i} ${'x'.repeat(100)}`,
        body: `Body content ${'y'.repeat(200)}`,
      }));

      const result = { emails: bigEmails, total: 500 };
      const truncated = truncateToolResult(result);

      expect(truncated.truncated).toBe(true);
      expect(truncated.originalCount).toBe(500);
      expect((truncated.emails as unknown[]).length).toBeLessThan(500);
    });

    it('trims contacts array', () => {
      const bigContacts = Array.from({ length: 300 }, (_, i) => ({
        id: `contact-${i}`,
        name: `Contact ${i}`,
        email: `contact${i}@example.com`,
        notes: 'x'.repeat(200),
      }));

      const result = { contacts: bigContacts };
      const truncated = truncateToolResult(result);

      expect(truncated.truncated).toBe(true);
      expect((truncated.contacts as unknown[]).length).toBeLessThan(300);
    });

    it('trims events array', () => {
      const bigEvents = Array.from({ length: 200 }, (_, i) => ({
        id: `event-${i}`,
        title: `Event ${i}`,
        description: 'x'.repeat(300),
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      }));

      const result = { events: bigEvents };
      const truncated = truncateToolResult(result);

      expect(truncated.truncated).toBe(true);
    });

    it('trims folders array', () => {
      const bigFolders = Array.from({ length: 200 }, (_, i) => ({
        id: `folder-${i}`,
        name: `Folder ${'x'.repeat(200)} ${i}`,
        path: `/path/to/folder/${i}`,
      }));

      const result = { folders: bigFolders };
      const truncated = truncateToolResult(result);

      expect(truncated.truncated).toBe(true);
    });

    it('keeps at least 1 item in array', () => {
      const bigItem = {
        id: '1',
        data: 'x'.repeat(20_000),
      };

      const result = { results: [bigItem] };
      const truncated = truncateToolResult(result);

      expect((truncated.results as unknown[]).length).toBe(1);
    });
  });

  describe('strategy 2 - bodyText truncation', () => {
    it('truncates long bodyText', () => {
      const result = {
        id: 'email-1',
        subject: 'Test',
        bodyText: 'x'.repeat(20_000),
      };

      const truncated = truncateToolResult(result);
      expect(truncated.bodyTruncated).toBe(true);
      expect((truncated.bodyText as string).length).toBeLessThan(20_000);
    });

    it('preserves at least 200 chars of bodyText', () => {
      const result = {
        id: 'email-1',
        subject: 'Test',
        bodyText: 'x'.repeat(20_000),
        extraField: 'y'.repeat(15_000),
      };

      const truncated = truncateToolResult(result);
      expect((truncated.bodyText as string).length).toBeGreaterThanOrEqual(200);
    });
  });

  describe('strategy 3 - fallback truncation', () => {
    it('adds truncation notice for non-array non-body results', () => {
      const result: Record<string, unknown> = {};
      // Create a large result without array or bodyText fields
      for (let i = 0; i < 50; i++) {
        result[`field_${i}`] = 'x'.repeat(500);
      }

      const truncated = truncateToolResult(result);
      expect(truncated.truncated).toBe(true);
      expect(truncated.truncationNote).toContain('exceeded');
    });
  });

  describe('edge cases', () => {
    it('handles empty object', () => {
      const result = truncateToolResult({});
      expect(result).toEqual({});
    });

    it('handles result with empty arrays', () => {
      const result = { emails: [], total: 0 };
      const truncated = truncateToolResult(result);
      expect(truncated).toEqual(result);
    });

    it('handles nested objects', () => {
      const result = {
        success: true,
        data: { nested: { deep: 'value' } },
      };
      const truncated = truncateToolResult(result);
      expect(truncated).toEqual(result);
    });

    it('handles result at exactly the limit', () => {
      // Create a result that's just under 16K
      const padding = 'x'.repeat(15_900);
      const result = { data: padding };
      const truncated = truncateToolResult(result);
      // Should not be truncated if under limit
      expect(truncated).not.toHaveProperty('truncated');
    });
  });
});
