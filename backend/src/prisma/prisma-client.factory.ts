/**
 * Prisma Client Factory for Prisma 7
 * Centralized adapter-based client creation for scripts and services
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Logger } from '@nestjs/common';

const logger = new Logger('PrismaClientFactory');

/**
 * Strip legacy URL-based pool params that pg.Pool silently ignores.
 * Prevents confusion when connection_limit/pool_timeout appear in DATABASE_URL
 * but have no effect in Prisma 7's adapter-pg mode.
 */
function stripPoolParams(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('connection_limit');
  parsed.searchParams.delete('pool_timeout');
  return parsed.toString();
}

/**
 * Creates a PrismaPg adapter with explicit pg.Pool configuration.
 *
 * Pool sizing for Railway multi-replica:
 *   DB_POOL_MAX = floor(max_connections / (replicas + 1)) - safety_margin
 *   Default max_connections=100, 2 replicas: floor(100/3) - 3 = 30
 *   Conservative default: 20 (works for 2-4 replicas)
 *
 * Environment variables:
 *   DB_POOL_MAX              - Max connections per replica (default: 20)
 *   DB_POOL_TIMEOUT_MS       - Connection acquisition timeout (default: 20000)
 *   DB_POOL_IDLE_TIMEOUT_MS  - Idle connection cleanup (default: 30000)
 */
export function createPrismaAdapter(): PrismaPg {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is not set for Prisma client');
  }

  const connectionString = stripPoolParams(rawUrl);

  const max = parseInt(process.env.DB_POOL_MAX ?? '20', 10);
  const connectionTimeoutMillis = parseInt(process.env.DB_POOL_TIMEOUT_MS ?? '20000', 10);
  const idleTimeoutMillis = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? '30000', 10);

  logger.log(
    `Prisma pool config: max=${max}, connectionTimeout=${connectionTimeoutMillis}ms, idleTimeout=${idleTimeoutMillis}ms`,
  );

  return new PrismaPg({
    connectionString,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis,
  });
}

export function createPrismaClient(): PrismaClient {
  const adapter = createPrismaAdapter();
  return new PrismaClient({ adapter });
}

export default createPrismaClient;
