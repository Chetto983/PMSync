import { describe, it, expect, afterEach, vi } from 'vitest';
import { getReplicaCount, scaleForReplicas } from '../queue.config';

describe('getReplicaCount', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 1 when WORKER_REPLICA_COUNT is unset', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '');
    // Empty string parses to NaN, should default to 1
    // But actually parseInt('', 10) is NaN. Let's delete it entirely.
    delete process.env.WORKER_REPLICA_COUNT;
    expect(getReplicaCount()).toBe(1);
  });

  it('returns 2 when WORKER_REPLICA_COUNT=2', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '2');
    expect(getReplicaCount()).toBe(2);
  });

  it('returns 1 when WORKER_REPLICA_COUNT=0 (invalid, clamps to 1)', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '0');
    expect(getReplicaCount()).toBe(1);
  });

  it('returns 1 when WORKER_REPLICA_COUNT=abc (NaN, defaults to 1)', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', 'abc');
    expect(getReplicaCount()).toBe(1);
  });

  it('returns 3 when WORKER_REPLICA_COUNT=3', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '3');
    expect(getReplicaCount()).toBe(3);
  });

  it('returns 1 when WORKER_REPLICA_COUNT=-1 (negative, clamps to 1)', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '-1');
    expect(getReplicaCount()).toBe(1);
  });
});

describe('scaleForReplicas', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns base concurrency when replica count is 1 (default)', () => {
    delete process.env.WORKER_REPLICA_COUNT;
    expect(scaleForReplicas(17)).toBe(17);
  });

  it('returns Math.floor(17/2) = 8 when replica count is 2', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '2');
    expect(scaleForReplicas(17)).toBe(8);
  });

  it('returns Math.floor(10/2) = 5 when replica count is 2', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '2');
    expect(scaleForReplicas(10)).toBe(5);
  });

  it('returns Math.floor(7/2) = 3 when replica count is 2', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '2');
    expect(scaleForReplicas(7)).toBe(3);
  });

  it('returns 1 when base is 1 and replica count is 2 (minimum floor)', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '2');
    expect(scaleForReplicas(1)).toBe(1);
  });

  it('returns Math.floor(2/3) = 1 (minimum floor) when replica count is 3', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '3');
    expect(scaleForReplicas(2)).toBe(1);
  });

  it('returns 1 when base is 0 (clamps to minimum 1)', () => {
    vi.stubEnv('WORKER_REPLICA_COUNT', '2');
    expect(scaleForReplicas(0)).toBe(1);
  });

  it('returns 1 when base is 0 and replica is 1', () => {
    delete process.env.WORKER_REPLICA_COUNT;
    expect(scaleForReplicas(0)).toBe(1);
  });
});
