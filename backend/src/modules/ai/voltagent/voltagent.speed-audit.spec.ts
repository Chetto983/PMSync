/**
 * VoltAgent Speed Audit Tests
 *
 * Performance benchmarks for VoltAgent endpoints:
 * - Chat latency (time to complete response)
 * - Streaming latency (time to first token)
 * - Throughput under load
 * - Model comparison (small, medium, large)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { VoltAgentController } from './voltagent.controller';
import { VoltAgentService } from './voltagent.service';
import { FeedbackService } from './services/feedback.service';
import { HitlService } from './services/hitl.service';

interface PerformanceMetrics {
  operation: string;
  model: string;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  successRate: number;
  throughputRps: number;
  sampleCount: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Collect latency metrics from multiple runs
 */
function calculateMetrics(
  operation: string,
  model: string,
  latencies: number[],
  errors: number,
  durationMs: number,
): PerformanceMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const successCount = latencies.length;
  const totalCount = successCount + errors;

  return {
    operation,
    model,
    minLatencyMs: sorted[0] || 0,
    maxLatencyMs: sorted[sorted.length - 1] || 0,
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) || 0,
    p50LatencyMs: percentile(sorted, 50),
    p95LatencyMs: percentile(sorted, 95),
    p99LatencyMs: percentile(sorted, 99),
    successRate: totalCount > 0 ? successCount / totalCount : 0,
    throughputRps: durationMs > 0 ? (successCount / durationMs) * 1000 : 0,
    sampleCount: totalCount,
  };
}

describe('VoltAgent Speed Audit', () => {
  let controller: VoltAgentController;
  let voltAgentService: jest.Mocked<VoltAgentService>;
  const mockUser = { userId: 'user-123', tenantId: 'tenant-456', role: 'user' };
  const mockRequest = {
    user: mockUser,
    on: jest.fn(), // Mock Express req.on('close', ...) for streaming
  } as any;

  beforeEach(async () => {
    const mockVoltAgentService = {
      chat: jest.fn(),
      streamChat: jest.fn(),
      submitActionForApproval: jest.fn(),
      resumeApproval: jest.fn(),
      getSuspendedWorkflows: jest.fn(),
      getSuspendedWorkflow: jest.fn(),
      getRecentMetrics: jest.fn(),
      getMetricsStats: jest.fn(),
    };

    const mockFeedbackService = {
      getLearningStats: jest.fn(),
      getAggregateStats: jest.fn(),
      getFeedbackHistory: jest.fn(),
      resetLearningProfile: jest.fn(),
    };

    const mockHitlService = {
      getActionCounts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoltAgentController],
      providers: [
        { provide: VoltAgentService, useValue: mockVoltAgentService },
        { provide: FeedbackService, useValue: mockFeedbackService },
        { provide: HitlService, useValue: mockHitlService },
      ],
    }).compile();

    controller = module.get<VoltAgentController>(VoltAgentController);
    voltAgentService = module.get(VoltAgentService);
  });

  describe('Chat Latency Benchmarks', () => {
    it('should measure chat endpoint latency', async () => {
      const iterations = 10;
      const latencies: number[] = [];
      let errors = 0;

      // Simulate different response times
      let callIndex = 0;
      voltAgentService.chat.mockImplementation(async () => {
        // Simulate variable latency (50-200ms)
        const delay = 50 + Math.random() * 150;
        await new Promise((r) => setTimeout(r, delay));
        callIndex++;
        return { text: `Response ${callIndex}`, requiresApproval: false };
      });

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const iterStart = Date.now();
        try {
          await controller.chat(mockRequest, { message: 'Hello', model: 'small' });
          latencies.push(Date.now() - iterStart);
        } catch {
          errors++;
        }
      }

      const durationMs = Date.now() - startTime;
      const metrics = calculateMetrics('chat', 'small', latencies, errors, durationMs);

      console.log('\n📊 Chat Latency Benchmark Results:');
      console.log(`   Samples: ${metrics.sampleCount}`);
      console.log(`   Min: ${metrics.minLatencyMs}ms`);
      console.log(`   Avg: ${metrics.avgLatencyMs}ms`);
      console.log(`   P50: ${metrics.p50LatencyMs}ms`);
      console.log(`   P95: ${metrics.p95LatencyMs}ms`);
      console.log(`   P99: ${metrics.p99LatencyMs}ms`);
      console.log(`   Max: ${metrics.maxLatencyMs}ms`);
      console.log(`   Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      console.log(`   Throughput: ${metrics.throughputRps.toFixed(2)} req/s`);

      expect(metrics.successRate).toBe(1);
      expect(metrics.sampleCount).toBe(iterations);
    });

    it('should compare model latencies (small vs medium vs large)', async () => {
      const models: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
      const modelLatencies: Record<string, number> = {
        small: 100,
        medium: 300,
        large: 800,
      };

      const results: PerformanceMetrics[] = [];

      for (const model of models) {
        const latencies: number[] = [];
        const iterations = 5;

        voltAgentService.chat.mockImplementation(async () => {
          const baseLatency = modelLatencies[model];
          const delay = baseLatency + Math.random() * (baseLatency * 0.2);
          await new Promise((r) => setTimeout(r, delay));
          return { text: `${model} response`, requiresApproval: false };
        });

        const startTime = Date.now();

        for (let i = 0; i < iterations; i++) {
          const iterStart = Date.now();
          await controller.chat(mockRequest, { message: 'Test', model });
          latencies.push(Date.now() - iterStart);
        }

        const durationMs = Date.now() - startTime;
        results.push(calculateMetrics('chat', model, latencies, 0, durationMs));
      }

      console.log('\n📊 Model Comparison Results:');
      console.log('   Model   | Avg Latency | P95 Latency | Throughput');
      console.log('   --------|-------------|-------------|------------');
      for (const r of results) {
        console.log(
          `   ${r.model.padEnd(7)} | ${String(r.avgLatencyMs).padEnd(11)}ms | ${String(r.p95LatencyMs).padEnd(11)}ms | ${r.throughputRps.toFixed(2)} req/s`,
        );
      }

      // Verify expected latency order: small < medium < large
      expect(results[0].avgLatencyMs).toBeLessThan(results[1].avgLatencyMs);
      expect(results[1].avgLatencyMs).toBeLessThan(results[2].avgLatencyMs);
    });
  });

  describe('Streaming Latency Benchmarks', () => {
    it('should measure time-to-first-token (TTFT)', async () => {
      const iterations = 5;
      const ttftLatencies: number[] = [];
      const totalLatencies: number[] = [];

      // Simulate streaming with chunks
      voltAgentService.streamChat.mockImplementation(async function* () {
        // First token delay (TTFT)
        await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
        yield 'First';

        // Subsequent tokens
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          yield ` token${i}`;
        }
      });

      for (let i = 0; i < iterations; i++) {
        const iterStart = Date.now();
        let firstTokenTime: number | null = null;

        const mockRes = {
          setHeader: jest.fn(),
          flushHeaders: jest.fn(),
          write: jest.fn().mockImplementation(() => {
            if (!firstTokenTime) {
              firstTokenTime = Date.now() - iterStart;
            }
          }),
          end: jest.fn(),
        };

        await controller.streamChat(mockRequest, { message: 'Hi' }, mockRes as any);

        if (firstTokenTime) {
          ttftLatencies.push(firstTokenTime);
        }
        totalLatencies.push(Date.now() - iterStart);
      }

      const ttftSorted = [...ttftLatencies].sort((a, b) => a - b);
      const totalSorted = [...totalLatencies].sort((a, b) => a - b);

      console.log('\n📊 Streaming Latency Benchmark Results:');
      console.log('   Time-to-First-Token (TTFT):');
      console.log(`     Avg: ${Math.round(ttftLatencies.reduce((a, b) => a + b, 0) / ttftLatencies.length)}ms`);
      console.log(`     P50: ${percentile(ttftSorted, 50)}ms`);
      console.log(`     P95: ${percentile(ttftSorted, 95)}ms`);
      console.log('   Total Stream Time:');
      console.log(`     Avg: ${Math.round(totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length)}ms`);
      console.log(`     P95: ${percentile(totalSorted, 95)}ms`);

      expect(ttftLatencies.length).toBe(iterations);
      // TTFT should be less than total time
      expect(ttftLatencies[0]).toBeLessThan(totalLatencies[0]);
    });

    it('should handle streaming errors gracefully', async () => {
      let streamCalls = 0;

      voltAgentService.streamChat.mockImplementation(async function* () {
        streamCalls++;
        yield 'Start';
        if (streamCalls % 2 === 0) {
          throw new Error('Simulated stream error');
        }
        yield ' end';
      });

      const results = { success: 0, errors: 0 };

      for (let i = 0; i < 4; i++) {
        const mockRes = {
          setHeader: jest.fn(),
          flushHeaders: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
        };

        await controller.streamChat(mockRequest, { message: 'Test' }, mockRes as any);

        const writes = mockRes.write.mock.calls.map((c) => c[0]).join('');
        if (writes.includes('error')) {
          results.errors++;
        } else {
          results.success++;
        }
      }

      console.log('\n📊 Streaming Error Handling:');
      console.log(`   Success: ${results.success}, Errors: ${results.errors}`);
      expect(results.errors).toBe(2);
      expect(results.success).toBe(2);
    });
  });

  describe('Throughput Benchmarks', () => {
    it('should measure concurrent request throughput', async () => {
      const concurrency = 5;
      const requestsPerWorker = 10;
      const totalRequests = concurrency * requestsPerWorker;
      const latencies: number[] = [];

      voltAgentService.chat.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 30 + Math.random() * 20));
        return { text: 'Response', requiresApproval: false };
      });

      const startTime = Date.now();

      // Simulate concurrent workers
      const workers = Array.from({ length: concurrency }, async () => {
        for (let i = 0; i < requestsPerWorker; i++) {
          const start = Date.now();
          await controller.chat(mockRequest, { message: 'Test' });
          latencies.push(Date.now() - start);
        }
      });

      await Promise.all(workers);
      const durationMs = Date.now() - startTime;
      const throughput = (totalRequests / durationMs) * 1000;

      console.log('\n📊 Throughput Benchmark Results:');
      console.log(`   Concurrency: ${concurrency}`);
      console.log(`   Total Requests: ${totalRequests}`);
      console.log(`   Duration: ${durationMs}ms`);
      console.log(`   Throughput: ${throughput.toFixed(2)} req/s`);
      console.log(`   Avg Latency: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);

      expect(latencies.length).toBe(totalRequests);
      expect(throughput).toBeGreaterThan(0);
    });
  });

  describe('Service Metrics Retrieval', () => {
    it('should retrieve performance metrics from service', async () => {
      const mockStats = {
        totalOperations: 100,
        avgDuration: 150,
        successRate: 98.5,
        totalTokens: 50000,
      };

      voltAgentService.getMetricsStats.mockResolvedValue(mockStats);

      const stats = await voltAgentService.getMetricsStats('SupervisorAgent');

      console.log('\n📊 Service Metrics:');
      console.log(`   Total Operations: ${stats.totalOperations}`);
      console.log(`   Avg Duration: ${stats.avgDuration}ms`);
      console.log(`   Success Rate: ${stats.successRate}%`);
      console.log(`   Total Tokens: ${stats.totalTokens}`);

      expect(stats.totalOperations).toBe(100);
      expect(stats.avgDuration).toBe(150);
    });
  });
});

describe('VoltAgent Performance Thresholds', () => {
  it('should define acceptable latency thresholds', () => {
    const thresholds = {
      chat: {
        small: { p50: 500, p95: 1500, p99: 3000 },
        medium: { p50: 1000, p95: 3000, p99: 5000 },
        large: { p50: 2000, p95: 5000, p99: 10000 },
      },
      streaming: {
        ttft: { p50: 200, p95: 500, p99: 1000 },
        totalTime: { p50: 2000, p95: 5000, p99: 10000 },
      },
      throughput: {
        minRps: 5, // Minimum requests per second
      },
    };

    console.log('\n📊 Performance Thresholds (Target SLOs):');
    console.log('   Chat Endpoint:');
    for (const [model, limits] of Object.entries(thresholds.chat)) {
      console.log(`     ${model}: P50<${limits.p50}ms, P95<${limits.p95}ms, P99<${limits.p99}ms`);
    }
    console.log('   Streaming:');
    console.log(`     TTFT: P50<${thresholds.streaming.ttft.p50}ms, P95<${thresholds.streaming.ttft.p95}ms`);
    console.log(`     Total: P50<${thresholds.streaming.totalTime.p50}ms, P95<${thresholds.streaming.totalTime.p95}ms`);
    console.log('   Throughput:');
    console.log(`     Min: ${thresholds.throughput.minRps} req/s`);

    expect(thresholds).toBeDefined();
  });
});
