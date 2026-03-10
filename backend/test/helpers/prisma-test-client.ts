/**
 * Singleton Prisma test client shared across test suites.
 * Uses globalThis to survive Jest module reloading and prevent
 * connection pool exhaustion across test files.
 */
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../src/prisma/prisma-client.factory';

declare global {
  // eslint-disable-next-line no-var
  var __TEST_PRISMA_CLIENT__: PrismaClient | undefined;
}

/**
 * Returns a singleton PrismaClient for test usage.
 * Reuses the same connection across all test files in a Jest run.
 */
export function getTestPrismaClient(): PrismaClient {
  if (!globalThis.__TEST_PRISMA_CLIENT__) {
    globalThis.__TEST_PRISMA_CLIENT__ = createPrismaClient();
  }
  return globalThis.__TEST_PRISMA_CLIENT__;
}

/**
 * Disconnects the test client and clears the global reference.
 * Called from globalTeardown.
 */
export async function disconnectTestClient(): Promise<void> {
  if (globalThis.__TEST_PRISMA_CLIENT__) {
    await globalThis.__TEST_PRISMA_CLIENT__.$disconnect();
    globalThis.__TEST_PRISMA_CLIENT__ = undefined;
  }
}
