import { Injectable, Logger } from '@nestjs/common';
import { formatBytes } from '../../../common/utils';

/**
 * Attachment operation types for metrics tracking
 * Based on 2025 best practices for observability (OpenTelemetry patterns)
 * @see https://signoz.io/blog/opentelemetry-nestjs/
 */
export type AttachmentOperation =
  | 'upload'
  | 'download'
  | 'dedup_hit'
  | 'dedup_miss'
  | 'cleanup_success'
  | 'cleanup_failed'
  | 'hash_computed'
  | 'cache_hit'
  | 'cache_miss';

/**
 * Context for structured logging with consistent identifiers
 * Enables correlation across distributed logs
 */
export interface AttachmentLogContext {
  tenantId: string;
  providerId?: string;
  emailId?: string;
  attachmentId?: string;
  filename?: string;
  contentHash?: string;
  mimeType?: string;
  size?: number;
}

/**
 * Metrics data for attachment operations
 * Aligned with RED metrics pattern (Rate, Error, Duration)
 */
export interface AttachmentMetrics {
  // Deduplication metrics
  dedupHits: number;
  dedupMisses: number;
  dedupRatio: number;

  // Storage metrics
  totalUploads: number;
  totalDownloads: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  bytesSaved: number; // Bytes saved through deduplication

  // Error metrics
  uploadFailures: number;
  downloadFailures: number;
  cleanupFailures: number;

  // Latency metrics (in milliseconds)
  avgUploadLatencyMs: number;
  avgDownloadLatencyMs: number;
  avgHashComputeMs: number;
}

/**
 * AttachmentMetricsService - Centralized observability for attachment operations
 *
 * Features:
 * - Structured logging with consistent context (tenantId/providerId/emailId/attachmentId)
 * - Metrics aggregation for dedup hit/miss, upload failures, cleanup failures
 * - Latency tracking for upload/download/hash operations
 *
 * Best Practices Applied:
 * - Uses OpenTelemetry-compatible patterns for future integration
 * - Follows RED metrics pattern (Rate, Error, Duration)
 * - Provides structured JSON logging for log aggregation tools (Loki, ELK)
 *
 * @see EMAIL_MODULE_ROADMAP.md Phase 3 - Observability & Alerts
 */
@Injectable()
export class AttachmentMetricsService {
  private readonly logger = new Logger(AttachmentMetricsService.name);

  // In-memory counters (can be replaced with Prometheus/OpenTelemetry in production)
  private counters: Map<AttachmentOperation, number> = new Map();
  private bytesCounters: Map<string, number> = new Map();
  private latencies: Map<AttachmentOperation, number[]> = new Map();
  private tenantCounters: Map<string, Map<AttachmentOperation, number>> = new Map();

  constructor() {
    // Initialize all counters to 0
    this.initializeCounters();
  }

  /**
   * Initialize all metric counters
   */
  private initializeCounters(): void {
    const operations: AttachmentOperation[] = [
      'upload',
      'download',
      'dedup_hit',
      'dedup_miss',
      'cleanup_success',
      'cleanup_failed',
      'hash_computed',
      'cache_hit',
      'cache_miss',
    ];

    operations.forEach((op) => {
      this.counters.set(op, 0);
      this.latencies.set(op, []);
    });

    this.bytesCounters.set('uploaded', 0);
    this.bytesCounters.set('downloaded', 0);
    this.bytesCounters.set('saved', 0);
  }

  /**
   * Record an attachment operation with structured logging
   *
   * @param operation - Type of operation being recorded
   * @param context - Structured context for logging correlation
   * @param durationMs - Optional duration in milliseconds
   */
  recordOperation(
    operation: AttachmentOperation,
    context: AttachmentLogContext,
    durationMs?: number,
  ): void {
    // Increment global counter
    const current = this.counters.get(operation) || 0;
    this.counters.set(operation, current + 1);

    // Increment tenant-specific counter
    if (context.tenantId) {
      if (!this.tenantCounters.has(context.tenantId)) {
        this.tenantCounters.set(context.tenantId, new Map());
      }
      const tenantMap = this.tenantCounters.get(context.tenantId)!;
      const tenantCount = tenantMap.get(operation) || 0;
      tenantMap.set(operation, tenantCount + 1);
    }

    // Record latency if provided
    if (durationMs !== undefined) {
      const latencyArray = this.latencies.get(operation) || [];
      latencyArray.push(durationMs);
      // Keep only last 1000 entries to prevent memory growth
      if (latencyArray.length > 1000) {
        latencyArray.shift();
      }
      this.latencies.set(operation, latencyArray);
    }

    // Emit structured log with consistent format
    this.emitStructuredLog(operation, context, durationMs);
  }

  /**
   * Record bytes transferred for upload/download operations
   */
  recordBytes(
    type: 'uploaded' | 'downloaded' | 'saved',
    bytes: number,
    context: AttachmentLogContext,
  ): void {
    const current = this.bytesCounters.get(type) || 0;
    this.bytesCounters.set(type, current + bytes);

    this.logger.debug(
      JSON.stringify({
        event: `attachment_bytes_${type}`,
        bytes,
        ...this.formatContext(context),
      }),
    );
  }

  /**
   * Record a successful deduplication hit
   *
   * @param context - Attachment context
   * @param bytesSaved - Bytes saved by reusing existing object
   */
  recordDedupHit(context: AttachmentLogContext, bytesSaved: number): void {
    this.recordOperation('dedup_hit', context);
    this.recordBytes('saved', bytesSaved, context);

    this.logger.log(
      JSON.stringify({
        event: 'attachment_dedup_hit',
        bytesSaved,
        ...this.formatContext(context),
        message: `Attachment deduplicated, reused existing S3 object (saved ${formatBytes(bytesSaved)})`,
      }),
    );
  }

  /**
   * Record a deduplication miss (new upload)
   */
  recordDedupMiss(context: AttachmentLogContext): void {
    this.recordOperation('dedup_miss', context);
  }

  /**
   * Record a successful upload with timing
   */
  recordUpload(
    context: AttachmentLogContext,
    durationMs: number,
    dedupHit: boolean,
  ): void {
    this.recordOperation('upload', context, durationMs);
    if (context.size) {
      this.recordBytes('uploaded', context.size, context);
    }

    if (dedupHit) {
      this.recordDedupHit(context, context.size || 0);
    } else {
      this.recordDedupMiss(context);
    }
  }

  /**
   * Record a successful download with timing
   */
  recordDownload(
    context: AttachmentLogContext,
    durationMs: number,
    cacheHit: boolean,
  ): void {
    this.recordOperation('download', context, durationMs);
    if (context.size) {
      this.recordBytes('downloaded', context.size, context);
    }

    if (cacheHit) {
      this.recordOperation('cache_hit', context);
    } else {
      this.recordOperation('cache_miss', context);
    }
  }

  /**
   * Record cleanup operation result
   */
  recordCleanup(
    context: AttachmentLogContext,
    success: boolean,
    objectsDeleted?: number,
    objectsFailed?: number,
  ): void {
    const operation = success ? 'cleanup_success' : 'cleanup_failed';
    this.recordOperation(operation, context);

    if (!success) {
      this.logger.warn(
        JSON.stringify({
          event: 'attachment_cleanup_failed',
          objectsDeleted,
          objectsFailed,
          ...this.formatContext(context),
          message: `Cleanup failed: ${objectsFailed} objects could not be deleted`,
        }),
      );
    }
  }

  /**
   * Get current metrics snapshot
   *
   * @param tenantId - Optional filter by tenant
   * @returns Current metrics snapshot
   */
  getMetrics(tenantId?: string): AttachmentMetrics {
    const getCount = (op: AttachmentOperation): number => {
      if (tenantId && this.tenantCounters.has(tenantId)) {
        return this.tenantCounters.get(tenantId)!.get(op) || 0;
      }
      return this.counters.get(op) || 0;
    };

    const getAvgLatency = (op: AttachmentOperation): number => {
      const latencyArray = this.latencies.get(op) || [];
      if (latencyArray.length === 0) return 0;
      return latencyArray.reduce((a, b) => a + b, 0) / latencyArray.length;
    };

    const dedupHits = getCount('dedup_hit');
    const dedupMisses = getCount('dedup_miss');
    const dedupTotal = dedupHits + dedupMisses;

    return {
      dedupHits,
      dedupMisses,
      dedupRatio: dedupTotal > 0 ? dedupHits / dedupTotal : 0,

      totalUploads: getCount('upload'),
      totalDownloads: getCount('download'),
      bytesUploaded: this.bytesCounters.get('uploaded') || 0,
      bytesDownloaded: this.bytesCounters.get('downloaded') || 0,
      bytesSaved: this.bytesCounters.get('saved') || 0,

      uploadFailures: 0, // Track via error interceptor if needed
      downloadFailures: 0,
      cleanupFailures: getCount('cleanup_failed'),

      avgUploadLatencyMs: getAvgLatency('upload'),
      avgDownloadLatencyMs: getAvgLatency('download'),
      avgHashComputeMs: getAvgLatency('hash_computed'),
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.initializeCounters();
    this.tenantCounters.clear();
  }

  /**
   * Format context for structured logging
   */
  private formatContext(context: AttachmentLogContext): Record<string, unknown> {
    return {
      tenantId: context.tenantId,
      ...(context.providerId && { providerId: context.providerId }),
      ...(context.emailId && { emailId: context.emailId }),
      ...(context.attachmentId && { attachmentId: context.attachmentId }),
      ...(context.filename && { filename: context.filename }),
      ...(context.contentHash && { contentHash: context.contentHash.substring(0, 16) + '...' }),
      ...(context.mimeType && { mimeType: context.mimeType }),
      ...(context.size && { size: context.size, sizeHuman: formatBytes(context.size) }),
    };
  }

  /**
   * Emit structured log entry
   */
  private emitStructuredLog(
    operation: AttachmentOperation,
    context: AttachmentLogContext,
    durationMs?: number,
  ): void {
    const logData = {
      event: `attachment_${operation}`,
      ...this.formatContext(context),
      ...(durationMs && { durationMs, durationHuman: `${durationMs.toFixed(2)}ms` }),
      timestamp: new Date().toISOString(),
    };

    // Use debug level for routine operations, log level for significant events
    const isSignificant = ['dedup_hit', 'cleanup_failed', 'upload', 'download'].includes(operation);
    if (isSignificant) {
      this.logger.log(JSON.stringify(logData));
    } else {
      this.logger.debug(JSON.stringify(logData));
    }
  }
}
