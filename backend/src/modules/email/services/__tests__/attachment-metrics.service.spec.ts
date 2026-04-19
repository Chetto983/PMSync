/**
 * AttachmentMetricsService unit tests — SCALE-02 (revision v2)
 * Verifies that tenantCounters is fully deleted (no consumer per
 * 157-RESEARCH.md Open Q#2 RESOLVED) AND that getMetrics(tenantId?)
 * remains a no-op compatibility shim that returns global metrics.
 * Pure unit tests — no DB, no Redis.
 */
import { AttachmentMetricsService } from '../attachment-metrics.service';

describe('AttachmentMetricsService', () => {
  let service: AttachmentMetricsService;

  beforeEach(() => {
    service = new AttachmentMetricsService();
  });

  describe('SCALE-02: tenantCounters deletion', () => {
    it('does not declare a tenantCounters field on the instance', () => {
      // The field was removed in revision v2 — accessing it must yield undefined,
      // not an empty Map. This guards against accidental re-introduction.
      const lookup = (service as unknown as { tenantCounters?: unknown }).tenantCounters;
      expect(lookup).toBeUndefined();
    });
  });

  describe('SCALE-02: getMetrics(tenantId?) compatibility shim', () => {
    it('returns global metrics when called with no argument', () => {
      service.recordOperation('upload', { tenantId: 'tenant-x' });
      service.recordOperation('upload', { tenantId: 'tenant-y' });

      const metrics = service.getMetrics();
      expect(metrics.totalUploads).toBe(2);
    });

    it('returns the SAME global metrics when called with any tenantId (arg ignored)', () => {
      service.recordOperation('upload', { tenantId: 'tenant-x' });
      service.recordOperation('upload', { tenantId: 'tenant-y' });
      service.recordOperation('download', { tenantId: 'tenant-x' });

      const noArg = service.getMetrics();
      const withTenantArg = service.getMetrics('tenant-x');
      const withOtherTenantArg = service.getMetrics('nonexistent-tenant');

      // Compatibility shim: tenantId arg accepted but ignored.
      expect(withTenantArg.totalUploads).toBe(noArg.totalUploads);
      expect(withTenantArg.totalDownloads).toBe(noArg.totalDownloads);
      expect(withOtherTenantArg.totalUploads).toBe(noArg.totalUploads);
      expect(withOtherTenantArg.totalDownloads).toBe(noArg.totalDownloads);
      expect(noArg.totalUploads).toBe(2);
      expect(noArg.totalDownloads).toBe(1);
    });
  });

  describe('recordOperation', () => {
    it('increments the global counter for each call regardless of tenantId', () => {
      service.recordOperation('upload', { tenantId: 'tenant-a' });
      service.recordOperation('upload', { tenantId: 'tenant-b' });
      service.recordOperation('upload', { tenantId: 'tenant-a' });
      expect(service.getMetrics().totalUploads).toBe(3);
    });
  });

  describe('resetMetrics', () => {
    it('zeroes all counters and does not throw on the deleted tenantCounters field', () => {
      service.recordOperation('upload', { tenantId: 'tenant-a' });
      service.recordOperation('download', { tenantId: 'tenant-a' });
      service.recordOperation('upload', { tenantId: 'tenant-b' });

      expect(() => service.resetMetrics()).not.toThrow();

      expect(service.getMetrics().totalUploads).toBe(0);
      expect(service.getMetrics().totalDownloads).toBe(0);
    });
  });

  describe('SCALE-02: retained Maps are enum-bounded (no unbounded growth)', () => {
    it('counters map size never exceeds the AttachmentOperation enum cardinality (~9)', () => {
      // Drive every operation type at least once. The map is keyed by the union
      // type AttachmentOperation, so its size is bounded by the number of variants.
      const ops = [
        'upload',
        'download',
        'dedup_hit',
        'dedup_miss',
        'cleanup_success',
        'cleanup_failed',
        'hash_computed',
        'cache_hit',
        'cache_miss',
      ] as const;
      for (const op of ops) {
        service.recordOperation(op, { tenantId: 'any' });
      }
      const counters = (service as unknown as { counters: Map<unknown, unknown> }).counters;
      expect(counters.size).toBeLessThanOrEqual(ops.length);
    });

    it('bytesCounters map size is bounded by the 3 byte-type variants', () => {
      service.recordBytes('uploaded', 100, { tenantId: 'any' });
      service.recordBytes('downloaded', 200, { tenantId: 'any' });
      service.recordBytes('saved', 50, { tenantId: 'any' });
      const bytesCounters = (service as unknown as { bytesCounters: Map<unknown, unknown> }).bytesCounters;
      expect(bytesCounters.size).toBeLessThanOrEqual(3);
    });
  });
});
