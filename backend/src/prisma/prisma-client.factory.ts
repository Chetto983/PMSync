/**
 * Prisma Client Factory for Prisma 7
 * Centralized adapter-based client creation for scripts and services
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Creates a new PrismaClient instance with the PostgreSQL adapter
 * Use this for scripts and standalone utilities
 */
export function createPrismaAdapter() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for Prisma client');
  }
  return new PrismaPg({ connectionString });
}

export function createPrismaClient(): PrismaClient {
  const adapter = createPrismaAdapter();
  return new PrismaClient({ adapter });
}

export default createPrismaClient;
