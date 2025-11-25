/**
 * Prisma Client Factory for Prisma 7
 * Centralized adapter-based client creation for scripts and services
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Creates a new PrismaClient instance with the PostgreSQL adapter
 * Use this for scripts and standalone utilities
 */
export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export default createPrismaClient;
