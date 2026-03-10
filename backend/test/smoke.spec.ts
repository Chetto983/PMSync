/**
 * Smoke test: validates real PostgreSQL and Redis connectivity,
 * factory helpers, and cleanup utility work end-to-end.
 */
import Redis from 'ioredis';
import { cleanupTestData } from './helpers/cleanup';
import {
  createTestSession,
  createTestTenant,
  createTestUser,
} from './helpers/factories';
import { getTestPrismaClient } from './helpers/prisma-test-client';

describe('Test Infrastructure Smoke Test', () => {
  const prisma = getTestPrismaClient();

  afterAll(async () => {
    await cleanupTestData();
  });

  it('connects to PostgreSQL and runs a query', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result).toEqual([{ ok: 1 }]);
  });

  it('creates a tenant via factory', async () => {
    const tenant = await createTestTenant();
    expect(tenant).toHaveProperty('id');
    expect(tenant.slug).toMatch(/^test-tenant-/);
    expect(tenant.isActive).toBe(true);
  });

  it('creates linked user and session', async () => {
    const tenant = await createTestTenant();
    const user = await createTestUser(tenant.id);
    const session = await createTestSession(user.id);

    const found = await prisma.session.findUnique({
      where: { token: session.token },
      include: { user: true },
    });

    expect(found).not.toBeNull();
    expect(found!.user.tenantId).toBe(tenant.id);
  });

  it('connects to Redis', async () => {
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6380,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const key = `smoke-test:${Date.now()}`;
      await redis.set(key, 'ok');
      const value = await redis.get(key);
      expect(value).toBe('ok');
      await redis.del(key);
    } finally {
      await redis.quit();
    }
  });

  it('cleanup removes test data', async () => {
    // Insert data first
    await createTestTenant({ slug: `cleanup-check-${Date.now()}` });

    // Clean up
    await cleanupTestData();

    // Verify empty
    const tenants = await prisma.tenant.findMany();
    expect(tenants).toHaveLength(0);
  });
});
