/**
 * Memory Manager Service
 *
 * Manages Node.js memory with:
 * - Scheduled GC trigger when heap > threshold
 * - Memory usage logging for monitoring
 * - Heap pressure detection
 *
 * Target: <200MB per tenant @ 1000 users
 * Requires: node --expose-gc flag for manual GC
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

@Injectable()
export class MemoryManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryManagerService.name);

  /** Heap threshold for triggering GC (300MB) */
  private readonly GC_THRESHOLD_MB = parseInt(process.env.GC_THRESHOLD_MB || '300', 10);
  /** Check interval (5 minutes) */
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;
  /** Log memory stats interval (1 minute) */
  private readonly LOG_INTERVAL_MS = 60 * 1000;

  private gcInterval: NodeJS.Timeout | null = null;
  private logInterval: NodeJS.Timeout | null = null;
  private gcAvailable = false;

  onModuleInit() {
    // Check if GC is exposed
    this.gcAvailable = typeof global.gc === 'function';

    if (this.gcAvailable) {
      this.logger.log('✅ Manual GC available (--expose-gc flag detected)');
    } else {
      this.logger.warn('⚠️ Manual GC not available. Start with: node --expose-gc');
    }

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Log initial memory state
    this.logMemoryStats('INIT');
  }

  onModuleDestroy() {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
    if (this.logInterval) {
      clearInterval(this.logInterval);
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    };
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  /**
   * Check if heap is under pressure
   */
  isUnderPressure(): boolean {
    const stats = this.getMemoryStats();
    const heapMB = stats.heapUsed / (1024 * 1024);
    return heapMB > this.GC_THRESHOLD_MB;
  }

  /**
   * Trigger manual garbage collection if available
   */
  triggerGC(reason: string): boolean {
    if (!this.gcAvailable || typeof global.gc !== 'function') {
      return false;
    }

    const before = this.getMemoryStats();
    global.gc();
    const after = this.getMemoryStats();

    const freed = before.heapUsed - after.heapUsed;
    this.logger.log(
      `🗑️ GC triggered (${reason}): ` +
      `freed ${this.formatBytes(freed)}, ` +
      `heap now ${this.formatBytes(after.heapUsed)}`,
    );

    return true;
  }

  /**
   * Log current memory statistics
   */
  logMemoryStats(label: string): void {
    const stats = this.getMemoryStats();
    const heapPercent = ((stats.heapUsed / stats.heapTotal) * 100).toFixed(1);

    this.logger.log(
      `[${label}] Heap: ${this.formatBytes(stats.heapUsed)}/${this.formatBytes(stats.heapTotal)} (${heapPercent}%) | ` +
      `RSS: ${this.formatBytes(stats.rss)} | ` +
      `External: ${this.formatBytes(stats.external)}`,
    );
  }

  /**
   * Start memory monitoring intervals
   */
  private startMemoryMonitoring(): void {
    // GC trigger check every 5 minutes
    this.gcInterval = setInterval(() => {
      if (this.isUnderPressure()) {
        this.triggerGC('heap threshold exceeded');
      }
    }, this.CHECK_INTERVAL_MS);

    // Memory logging every minute (only in dev mode to reduce noise)
    if (process.env.NODE_ENV !== 'production') {
      this.logInterval = setInterval(() => {
        this.logMemoryStats('MONITOR');
      }, this.LOG_INTERVAL_MS);
    }
  }

  /**
   * Get memory health status for health checks
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    gcAvailable: boolean;
  } {
    const stats = this.getMemoryStats();
    const heapMB = stats.heapUsed / (1024 * 1024);

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (heapMB > this.GC_THRESHOLD_MB * 1.5) {
      status = 'critical';
    } else if (heapMB > this.GC_THRESHOLD_MB) {
      status = 'warning';
    }

    return {
      status,
      heapUsedMB: Math.round(heapMB),
      heapTotalMB: Math.round(stats.heapTotal / (1024 * 1024)),
      rssMB: Math.round(stats.rss / (1024 * 1024)),
      gcAvailable: this.gcAvailable,
    };
  }
}
