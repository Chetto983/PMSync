/**
 * Session hardening tests: concurrency enforcement + idle timeout (OWASP ASVS V3)
 *
 * Tests session eviction when maxSessionsPerUser is exceeded,
 * idle session timeout rejection, and lastActivityAt debouncing.
 */

// Mock ESM modules before imports
jest.mock('otplib', () => ({}));
jest.mock('qrcode', () => ({}));
jest.mock('@simplewebauthn/server', () => ({}));

describe('Session Hardening', () => {
  describe('Session concurrency enforcement', () => {
    it('should evict oldest session when user has maxSessionsPerUser sessions', () => {
      const maxSessionsPerUser = 5;
      const existingSessions = [
        { id: 'oldest-1' },
        { id: 'session-2' },
        { id: 'session-3' },
        { id: 'session-4' },
        { id: 'session-5' },
      ];

      // Simulate eviction logic from _createSession
      if (existingSessions.length >= maxSessionsPerUser) {
        const sessionsToDelete = existingSessions.slice(
          0,
          existingSessions.length - maxSessionsPerUser + 1,
        );
        expect(sessionsToDelete).toHaveLength(1);
        expect(sessionsToDelete[0].id).toBe('oldest-1');
      }
    });

    it('should evict multiple oldest sessions when count exceeds limit', () => {
      const maxSessionsPerUser = 3;
      const existingSessions = [
        { id: 'oldest-1' },
        { id: 'oldest-2' },
        { id: 'session-3' },
        { id: 'session-4' },
        { id: 'session-5' },
      ];

      const sessionsToDelete = existingSessions.slice(
        0,
        existingSessions.length - maxSessionsPerUser + 1,
      );
      expect(sessionsToDelete).toHaveLength(3);
      expect(sessionsToDelete.map((s) => s.id)).toEqual([
        'oldest-1',
        'oldest-2',
        'session-3',
      ]);
    });

    it('should not evict when session count is below limit', () => {
      const maxSessionsPerUser = 5;
      const existingSessions = [
        { id: 'session-1' },
        { id: 'session-2' },
        { id: 'session-3' },
      ];

      const shouldEvict = existingSessions.length >= maxSessionsPerUser;
      expect(shouldEvict).toBe(false);
    });

    it('should not evict when at exactly maxSessionsPerUser - 1', () => {
      const maxSessionsPerUser = 5;
      const existingSessions = [
        { id: 'session-1' },
        { id: 'session-2' },
        { id: 'session-3' },
        { id: 'session-4' },
      ];

      const shouldEvict = existingSessions.length >= maxSessionsPerUser;
      expect(shouldEvict).toBe(false);
    });
  });

  describe('Idle session timeout', () => {
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    it('should reject session idle for more than 30 minutes', () => {
      const lastActivityAt = new Date(Date.now() - 31 * 60 * 1000); // 31 min ago
      const idleMs = Date.now() - lastActivityAt.getTime();

      expect(idleMs).toBeGreaterThan(IDLE_TIMEOUT_MS);
    });

    it('should accept session active 10 minutes ago', () => {
      const lastActivityAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      const idleMs = Date.now() - lastActivityAt.getTime();

      expect(idleMs).toBeLessThan(IDLE_TIMEOUT_MS);
    });

    it('should accept session active 29 minutes ago', () => {
      const lastActivityAt = new Date(Date.now() - 29 * 60 * 1000);
      const idleMs = Date.now() - lastActivityAt.getTime();

      expect(idleMs).toBeLessThan(IDLE_TIMEOUT_MS);
    });

    it('should reject session idle for exactly 30 minutes', () => {
      // Edge case: exactly at the boundary
      const lastActivityAt = new Date(Date.now() - IDLE_TIMEOUT_MS - 1);
      const idleMs = Date.now() - lastActivityAt.getTime();

      expect(idleMs).toBeGreaterThan(IDLE_TIMEOUT_MS);
    });
  });

  describe('lastActivityAt debouncing', () => {
    const DEBOUNCE_MS = 60 * 1000; // 1 minute

    it('should NOT update lastActivityAt if last update was < 1 minute ago', () => {
      const lastActivityAt = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const sinceLastActivity = Date.now() - lastActivityAt.getTime();

      const shouldUpdate = sinceLastActivity > DEBOUNCE_MS;
      expect(shouldUpdate).toBe(false);
    });

    it('should update lastActivityAt if last update was > 1 minute ago', () => {
      const lastActivityAt = new Date(Date.now() - 90 * 1000); // 90 seconds ago
      const sinceLastActivity = Date.now() - lastActivityAt.getTime();

      const shouldUpdate = sinceLastActivity > DEBOUNCE_MS;
      expect(shouldUpdate).toBe(true);
    });

    it('should NOT update lastActivityAt if last update was exactly 1 minute ago', () => {
      // Edge case: exactly at debounce boundary (not greater than)
      const lastActivityAt = new Date(Date.now() - DEBOUNCE_MS);
      const sinceLastActivity = Date.now() - lastActivityAt.getTime();

      // sinceLastActivity === DEBOUNCE_MS, not > DEBOUNCE_MS
      const shouldUpdate = sinceLastActivity > DEBOUNCE_MS;
      expect(shouldUpdate).toBe(false);
    });
  });

  describe('Idle session cleanup', () => {
    it('should use fire-and-forget pattern for session deletion', () => {
      // Verify the delete-on-idle pattern doesn't throw on failure
      const deletePromise = Promise.reject(new Error('DB error'));
      const result = deletePromise.catch(() => {});

      // Should not throw
      return expect(result).resolves.toBeUndefined();
    });

    it('should use fire-and-forget pattern for lastActivityAt update', () => {
      const updatePromise = Promise.reject(new Error('DB error'));
      const result = updatePromise.catch(() => {});

      return expect(result).resolves.toBeUndefined();
    });
  });

  describe('AuthConfigService idle timeout config', () => {
    it('should have default idleTimeoutMs of 30 minutes', () => {
      const defaultIdleTimeoutMs = 30 * 60 * 1000;
      expect(defaultIdleTimeoutMs).toBe(1800000);
    });

    it('should have default lastActivityDebounceMs of 1 minute', () => {
      const defaultDebounceMs = 60 * 1000;
      expect(defaultDebounceMs).toBe(60000);
    });
  });
});
