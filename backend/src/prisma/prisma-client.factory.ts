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
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for Prisma client');
  }

  // Ensure connection pool configuration for production.
  // Neon free tier + 54 BullMQ workers need explicit pool sizing to avoid
  // connection starvation with the default pool (~5-9 connections).
  if (!connectionString.includes('connection_limit')) {
    const separator = connectionString.includes('?') ? '&' : '?';
    connectionString += `${separator}connection_limit=20&pool_timeout=20`;
  }

  return new PrismaPg({
    connectionString,
    // Prevent infinite hang when Neon is cold-starting (default is 0 = no timeout)
    connectionTimeoutMillis: 15_000,
  });
}

export function createPrismaClient(): PrismaClient {
  const adapter = createPrismaAdapter();
  return new PrismaClient({ adapter });
}

export default createPrismaClient;
