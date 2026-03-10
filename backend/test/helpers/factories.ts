/**
 * Test factory helpers for creating real database rows.
 * All factories insert into the actual test database via Prisma
 * and return fully typed Prisma objects.
 */
import { randomBytes } from 'crypto';
import type { Account, Session, Tenant, User } from '@prisma/client';
import { getTestPrismaClient } from './prisma-test-client';

let counter = 0;
const ts = Date.now();

function nextId(): string {
  return `${++counter}-${ts}`;
}

/**
 * Creates a real tenant row in the database.
 */
export async function createTestTenant(
  overrides: Partial<{
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
  }> = {},
): Promise<Tenant> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  return prisma.tenant.create({
    data: {
      name: overrides.name ?? `Test Tenant ${uid}`,
      slug: overrides.slug ?? `test-tenant-${uid}`,
      description: overrides.description ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

/**
 * Creates a real user row linked to a tenant.
 */
export async function createTestUser(
  tenantId: string,
  overrides: Partial<{
    email: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
    emailVerified: boolean;
  }> = {},
): Promise<User> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  return prisma.user.create({
    data: {
      tenantId,
      email: overrides.email ?? `test-user-${uid}@test.local`,
      name: overrides.name ?? `Test User ${uid}`,
      firstName: overrides.firstName ?? null,
      lastName: overrides.lastName ?? null,
      role: overrides.role ?? 'member',
      isActive: overrides.isActive ?? true,
      emailVerified: overrides.emailVerified ?? false,
    },
  });
}

/**
 * Creates a real session row linked to a user.
 */
export async function createTestSession(
  userId: string,
  overrides: Partial<{
    token: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    tenantId: string | null;
  }> = {},
): Promise<Session> {
  const prisma = getTestPrismaClient();
  return prisma.session.create({
    data: {
      userId,
      token: overrides.token ?? randomBytes(32).toString('hex'),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      ipAddress: overrides.ipAddress ?? null,
      userAgent: overrides.userAgent ?? null,
      tenantId: overrides.tenantId ?? null,
    },
  });
}

/**
 * Creates a real account row linked to a user (better-auth credential account).
 */
export async function createTestAccount(
  userId: string,
  overrides: Partial<{
    accountId: string;
    providerId: string;
    password: string | null;
  }> = {},
): Promise<Account> {
  const prisma = getTestPrismaClient();
  return prisma.account.create({
    data: {
      userId,
      accountId: overrides.accountId ?? userId,
      providerId: overrides.providerId ?? 'credential',
      password: overrides.password ?? null,
    },
  });
}
