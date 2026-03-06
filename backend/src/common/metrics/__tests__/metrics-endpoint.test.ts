/**
 * Integration test for GET /metrics Prometheus endpoint (OBS-01, TEST-09).
 *
 * Verifies that the /metrics endpoint returns:
 * - 200 status with Prometheus text content-type
 * - Valid Prometheus exposition format (# HELP, # TYPE lines)
 * - All expected application metric names
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { register } from 'prom-client';
import { MetricsModule } from '../metrics.module';

let app: INestApplication;

beforeAll(async () => {
  // Clear registry before creating the module to avoid "already registered" conflicts
  register.clear();

  const moduleRef = await Test.createTestingModule({
    imports: [MetricsModule],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  register.clear();
});

describe('GET /metrics', () => {
  it('should return 200 with text/plain content type', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('should contain valid Prometheus exposition format', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    // Must have HELP and TYPE comment lines
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });

  it('should contain expected application metric names', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;

    // HTTP metrics (from metrics.module.ts providers)
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('http_requests_in_flight');

    // Queue metrics
    expect(body).toContain('bullmq_queue_depth');

    // AI metrics
    expect(body).toContain('ai_tokens_total');
    expect(body).toContain('ai_cost_usd_total');
    expect(body).toContain('ai_requests_total');
  });

  it('should return well-formed Prometheus text with comment and data lines', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    const body: string = res.text;
    const allLines = body.split('\n').filter((l) => l.trim());

    // Should have at least comment lines (# HELP, # TYPE) for each registered metric
    // Unused metrics produce only comment lines; metrics with observations also produce data lines
    const commentLines = allLines.filter((l) => l.startsWith('#'));
    expect(commentLines.length).toBeGreaterThanOrEqual(6); // At least 6 metrics x HELP+TYPE = 12

    // Any data lines present should match Prometheus exposition format
    const dataLines = allLines.filter((l) => !l.startsWith('#'));
    for (const line of dataLines) {
      expect(line).toMatch(
        /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})?\s+[\d.eE+\-NaN]+(\s+\d+)?$/,
      );
    }
  });
});
