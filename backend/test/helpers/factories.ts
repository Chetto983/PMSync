/**
 * Test factory helpers for creating real database rows.
 * All factories insert into the actual test database via Prisma
 * and return fully typed Prisma objects.
 */
import { randomBytes } from 'crypto';
import type {
  Account,
  CalendarEvent,
  ProviderConfig,
  Session,
  Subscription,
  Tenant,
  User,
  UserLabel,
} from '@prisma/client';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
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

/**
 * Creates a real UserLabel row linked to a tenant.
 * Used by labels.service.spec.ts tests.
 */
export async function createTestLabel(
  tenantId: string,
  overrides: Partial<{
    name: string;
    parentId: string | null;
    color: Record<string, unknown> | null;
    icon: string | null;
  }> = {},
): Promise<UserLabel> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  const name = overrides.name ?? `Test Label ${uid}`;
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return prisma.userLabel.create({
    data: {
      tenantId,
      name,
      slug,
      type: 'USER',
      parentId: overrides.parentId ?? null,
      level: overrides.parentId ? 1 : 0,
      orderIndex: 0,
      color: overrides.color ?? undefined,
      icon: overrides.icon ?? null,
    },
  });
}

/**
 * Creates a real CalendarEvent row linked to a tenant and provider.
 * Requires an existing ProviderConfig row (providerId).
 */
export async function createTestCalendarEvent(
  tenantId: string,
  providerId: string,
  overrides: Partial<{
    title: string;
    externalId: string;
    calendarId: string;
    startTime: Date;
    endTime: Date;
    isCancelled: boolean;
    isDeleted: boolean;
  }> = {},
): Promise<CalendarEvent> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  const now = new Date();
  return prisma.calendarEvent.create({
    data: {
      tenantId,
      providerId,
      externalId: overrides.externalId ?? `ext-event-${uid}`,
      calendarId: overrides.calendarId ?? `calendar-${uid}`,
      calendarName: 'Test Calendar',
      title: overrides.title ?? `Test Event ${uid}`,
      startTime: overrides.startTime ?? now,
      endTime: overrides.endTime ?? new Date(now.getTime() + 60 * 60 * 1000),
      isCancelled: overrides.isCancelled ?? false,
      isDeleted: overrides.isDeleted ?? false,
      timeZone: 'UTC',
      isAllDay: false,
      lastSyncedAt: now,
    },
  });
}

/**
 * Creates a real Contact row linked to a tenant.
 * Uses `any` return type due to JSON field complexity (emails field).
 */
export async function createTestContact(
  tenantId: string,
  overrides: Partial<{
    displayName: string;
    emails: unknown;
    totalInteractions: number;
    sentCount: number;
    receivedCount: number;
    lastInteractedAt: Date | null;
  }> = {},
): Promise<any> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  return prisma.contact.create({
    data: {
      tenantId,
      displayName: overrides.displayName ?? `Test Contact ${uid}`,
      emails: (overrides.emails ??
        [{ value: `contact-${uid}@test.local`, type: 'work' }]) as any,
      totalInteractions: overrides.totalInteractions ?? 0,
      sentCount: overrides.sentCount ?? 0,
      receivedCount: overrides.receivedCount ?? 0,
      lastInteractedAt: overrides.lastInteractedAt ?? null,
      isDeleted: false,
    },
  });
}

/**
 * Creates a real ProviderConfig row linked to a tenant and optionally a user.
 * Pass tokenExpiresAt: new Date(Date.now() - 60000) to simulate an expired token.
 */
export async function createTestProviderAccount(
  tenantId: string,
  userId: string,
  overrides: Partial<{
    providerType: string;
    email: string;
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;
    supportsCalendar: boolean;
    supportsContacts: boolean;
  }> = {},
): Promise<ProviderConfig> {
  const prisma = getTestPrismaClient();
  const uid = nextId();
  const now = new Date();
  return prisma.providerConfig.create({
    data: {
      tenantId,
      userId,
      providerType: overrides.providerType ?? 'google',
      email: overrides.email ?? `provider-${uid}@test.local`,
      supportsEmail: true,
      supportsCalendar: overrides.supportsCalendar ?? true,
      supportsContacts: overrides.supportsContacts ?? true,
      accessToken: overrides.accessToken ?? 'test-access-token',
      tokenEncryptionIv: 'test-iv',
      refreshToken: overrides.refreshToken ?? null,
      tokenExpiresAt:
        overrides.tokenExpiresAt !== undefined
          ? overrides.tokenExpiresAt
          : new Date(now.getTime() + 60 * 60 * 1000),
      isActive: true,
      isDefault: false,
    },
  });
}

/**
 * Creates a real Subscription row linked to a tenant.
 * NOTE: Subscription has a unique constraint on tenantId.
 * Each test calling this factory must use a fresh tenant created in that test.
 */
export async function createTestSubscription(
  tenantId: string,
  overrides: Partial<{
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    monthlyEmailLimit: number;
    monthlyAICallLimit: number;
    emailsProcessed: number;
    aiCallsUsed: number;
  }> = {},
): Promise<Subscription> {
  const prisma = getTestPrismaClient();
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return prisma.subscription.create({
    data: {
      tenantId,
      plan: overrides.plan ?? SubscriptionPlan.FREE,
      status: overrides.status ?? SubscriptionStatus.ACTIVE,
      monthlyEmailLimit: overrides.monthlyEmailLimit ?? 100,
      monthlyAICallLimit: overrides.monthlyAICallLimit ?? 50,
      maxUsers: 1,
      emailsProcessed: overrides.emailsProcessed ?? 0,
      aiCallsUsed: overrides.aiCallsUsed ?? 0,
      usageResetAt: nextMonth,
    },
  });
}
