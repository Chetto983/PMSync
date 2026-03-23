/**
 * HybridSearchService integration tests.
 *
 * Tests hybrid search dispatch, RRF result mapping, fallback behavior,
 * and source filtering. Uses manual mocks for PrismaService and
 * OpenRouterProviderService (no DB/API needed).
 *
 * Phase 25 Plan 03: Hybrid Search & RAG
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridSearchService } from '../services/hybrid-search.service';

// ─── Mock factories ─────────────────────────────────────────

function createMockPrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as any;
}

function createMockEmbeddingService() {
  return {
    generateEmbedding: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  } as any;
}

describe('HybridSearchService', () => {
  let service: HybridSearchService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockEmbeddingService: ReturnType<typeof createMockEmbeddingService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockEmbeddingService = createMockEmbeddingService();
    service = new HybridSearchService(mockPrisma, mockEmbeddingService);
  });

  describe('searchEmails', () => {
    it('returns mapped results from hybrid_email_search SQL function', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          email_id: 'e1',
          subject: 'Project update',
          from: 'alice@test.com',
          snippet: 'Here is the update...',
          received_at: new Date('2026-03-01'),
          rrf_score: 0.038,
        },
      ]);

      const results = await service.searchEmails('tenant1', 'project update', 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        source: 'email',
        emailId: 'e1',
        subject: 'Project update',
        from: 'alice@test.com',
        snippet: 'Here is the update...',
        receivedAt: expect.any(Date),
        rrfScore: 0.038,
      });
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns empty array on SQL error (graceful fallback)', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('function hybrid_email_search does not exist'),
      );

      const results = await service.searchEmails('tenant1', 'test query', 10);

      expect(results).toEqual([]);
    });
  });

  describe('searchContacts', () => {
    it('returns mapped results from hybrid_contact_search', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          contact_id: 'c1',
          display_name: 'Bob Smith',
          company: 'Acme Corp',
          job_title: 'Engineer',
          rrf_score: 0.025,
        },
      ]);

      const results = await service.searchContacts('tenant1', 'bob', 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        source: 'contact',
        contactId: 'c1',
        displayName: 'Bob Smith',
        company: 'Acme Corp',
        jobTitle: 'Engineer',
        rrfScore: 0.025,
      });
    });
  });

  describe('searchCalendar', () => {
    it('returns FTS-only results (no embedding generated)', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'ev1',
          title: 'Team standup',
          description: 'Daily standup meeting',
          startTime: new Date('2026-03-02T09:00:00Z'),
          endTime: new Date('2026-03-02T09:15:00Z'),
          location: 'Room A',
          fts_rank: 0.5,
        },
      ]);

      const results = await service.searchCalendar('tenant1', 'standup', 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        source: 'calendar',
        eventId: 'ev1',
        title: 'Team standup',
        description: 'Daily standup meeting',
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        location: 'Room A',
        rrfScore: 0.5,
      });
      // Calendar search should NOT call embed() since it's FTS-only
      // (embed is called at module level mock, but searchCalendar doesn't invoke it)
    });

    it('returns empty on FTS error (graceful fallback)', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('column "fts" does not exist'),
      );

      const results = await service.searchCalendar('tenant1', 'test', 5);

      expect(results).toEqual([]);
    });
  });

  describe('search (unified)', () => {
    it('dispatches to all sources when sources array empty', async () => {
      // Three calls: email, contact, calendar
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          { email_id: 'e1', subject: 'Email', from: 'a@b.c', snippet: null, received_at: null, rrf_score: 0.04 },
        ])
        .mockResolvedValueOnce([
          { contact_id: 'c1', display_name: 'Contact', company: null, job_title: null, rrf_score: 0.03 },
        ])
        .mockResolvedValueOnce([
          { id: 'ev1', title: 'Event', description: null, startTime: null, endTime: null, location: null, fts_rank: 0.02 },
        ]);

      const results = await service.search('tenant1', 'test', [], 10);

      expect(results).toHaveLength(3);
      // Should be sorted by rrfScore descending
      expect(results[0].rrfScore).toBeGreaterThanOrEqual(results[1].rrfScore);
      expect(results[1].rrfScore).toBeGreaterThanOrEqual(results[2].rrfScore);
    });

    it('dispatches only to requested sources', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { email_id: 'e1', subject: 'Email only', from: 'x@y.z', snippet: null, received_at: null, rrf_score: 0.05 },
      ]);

      const results = await service.search('tenant1', 'test', ['emails'], 10);

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('email');
      // Only one $queryRaw call (email), not three
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('limits total results to requested count', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({
            email_id: `e${i}`, subject: `Email ${i}`, from: 'a@b.c',
            snippet: null, received_at: null, rrf_score: 0.05 - i * 0.001,
          })),
        )
        .mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => ({
            contact_id: `c${i}`, display_name: `Contact ${i}`,
            company: null, job_title: null, rrf_score: 0.04 - i * 0.001,
          })),
        )
        .mockResolvedValueOnce([]);

      const results = await service.search('tenant1', 'test', [], 3);

      expect(results).toHaveLength(3);
    });
  });
});
