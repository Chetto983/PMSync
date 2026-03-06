/**
 * Unit tests for QueueMetricsCollector (OBS-03).
 *
 * Verifies that the collector:
 * - Calls getQueueStatuses and sets gauge with correct queue/state labels
 * - Sets up interval on onModuleInit
 * - Clears interval on onModuleDestroy
 * - Handles missing QueueHealthService gracefully
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { register } from 'prom-client';
import { QueueMetricsCollector } from '../queue-metrics.collector';

beforeEach(() => {
  register.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function createMockGauge() {
  return { set: vi.fn() };
}

function createMockQueueHealthService(statuses: Array<{
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}>) {
  return {
    getQueueStatuses: vi.fn().mockResolvedValue(statuses),
  };
}

describe('QueueMetricsCollector', () => {
  it('should set gauge values with correct labels when collect runs', async () => {
    const gauge = createMockGauge();
    const qhs = createMockQueueHealthService([
      { name: 'email-sync', waiting: 5, active: 2, delayed: 1, failed: 3 },
      { name: 'webhook', waiting: 0, active: 1, delayed: 0, failed: 0 },
    ]);

    const collector = new QueueMetricsCollector(gauge as any, qhs as any);
    collector.onModuleInit();

    // Let the initial fire-and-forget collect() resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(qhs.getQueueStatuses).toHaveBeenCalled();
    expect(gauge.set).toHaveBeenCalledWith({ queue: 'email-sync', state: 'waiting' }, 5);
    expect(gauge.set).toHaveBeenCalledWith({ queue: 'email-sync', state: 'active' }, 2);
    expect(gauge.set).toHaveBeenCalledWith({ queue: 'email-sync', state: 'delayed' }, 1);
    expect(gauge.set).toHaveBeenCalledWith({ queue: 'email-sync', state: 'failed' }, 3);
    expect(gauge.set).toHaveBeenCalledWith({ queue: 'webhook', state: 'waiting' }, 0);
    expect(gauge.set).toHaveBeenCalledWith({ queue: 'webhook', state: 'active' }, 1);

    collector.onModuleDestroy();
  });

  it('should set up interval that calls collect periodically', async () => {
    const gauge = createMockGauge();
    const qhs = createMockQueueHealthService([
      { name: 'q1', waiting: 1, active: 0, delayed: 0, failed: 0 },
    ]);

    const collector = new QueueMetricsCollector(gauge as any, qhs as any);
    collector.onModuleInit();

    // Initial call
    await vi.advanceTimersByTimeAsync(0);
    expect(qhs.getQueueStatuses).toHaveBeenCalledTimes(1);

    // Advance 15s (the collection interval)
    await vi.advanceTimersByTimeAsync(15_000);
    expect(qhs.getQueueStatuses).toHaveBeenCalledTimes(2);

    // Advance another 15s
    await vi.advanceTimersByTimeAsync(15_000);
    expect(qhs.getQueueStatuses).toHaveBeenCalledTimes(3);

    collector.onModuleDestroy();
  });

  it('should clear interval on onModuleDestroy', async () => {
    const gauge = createMockGauge();
    const qhs = createMockQueueHealthService([]);

    const collector = new QueueMetricsCollector(gauge as any, qhs as any);
    collector.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);

    collector.onModuleDestroy();

    // Reset call count
    qhs.getQueueStatuses.mockClear();

    // Advance time -- should NOT trigger another collect
    await vi.advanceTimersByTimeAsync(30_000);
    expect(qhs.getQueueStatuses).not.toHaveBeenCalled();
  });

  it('should not start interval if QueueHealthService is not available', () => {
    const gauge = createMockGauge();
    const collector = new QueueMetricsCollector(gauge as any, undefined);

    // Should not throw
    collector.onModuleInit();
    collector.onModuleDestroy();

    expect(gauge.set).not.toHaveBeenCalled();
  });
});
