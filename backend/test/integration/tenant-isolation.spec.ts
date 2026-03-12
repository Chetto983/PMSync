/**
 * Cross-Tenant Isolation Integration Test (BINT-01)
 *
 * Proves that the Prisma tenant-scoping extension prevents cross-tenant data leaks
 * across 6 domains: email (User), labels, calendar, contacts, providers, subscription.
 *
 * Pattern for every domain:
 *  1. Create rows for tenantA and tenantB via factories (plain client, no scoping).
 *  2. Query via scopedClient wrapped in CorrelationContext.run({ tenantId: tenantX.id }).
 *  3. Assert the other tenant's rows are absent from the scoped query result.
 *
 * Critical: PrismaPromise is a lazy thenable. Wrapping with Promise.resolve() inside
 * CorrelationContext.run forces .then() to be called within the ALS scope so the
 * extension can read tenantId from the active context.
 */

import type { Tenant, User } from '@prisma/client';
import {
  createTestTenant,
  createTestUser,
  createTestLabel,
  createTestCalendarEvent,
  createTestContact,
  createTestProviderAccount,
  createTestSubscription,
} from '../helpers/factories';
import { getTestPrismaClient } from '../helpers/prisma-test-client';
import { createTenantScopingExtension } from '../../src/prisma/tenant-scoping/tenant-scoping.extension';
import { withoutTenantScopingAsync } from '../../src/prisma/tenant-scoping/tenant-context';
import { CorrelationContext } from '../../src/common/services/correlation-context.service';

/**
 * Execute a scoped Prisma query within a tenant's ALS context.
 * Promise.resolve() forces PrismaPromise.then() to be called inside the ALS scope,
 * which is required for the tenant-scoping extension to read tenantId.
 */
async function queryAs<T>(
  tenantId: string,
   
  queryFn: () => any,
): Promise<T> {
  return CorrelationContext.run({ tenantId }, () =>
    Promise.resolve(queryFn()) as Promise<T>,
  );
}

describe('Cross-Tenant Isolation (BINT-01)', () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let userA: User;
  let userB: User;
   
  let scopedClient: any;

  beforeAll(async () => {
    const baseClient = getTestPrismaClient();
     
    scopedClient = (baseClient as any).$extends(createTenantScopingExtension());
    tenantA = await createTestTenant();
    tenantB = await createTestTenant();
    userA = await createTestUser(tenantA.id);
    userB = await createTestUser(tenantB.id);
  });

  afterAll(async () => {
    const baseClient = getTestPrismaClient();
    await withoutTenantScopingAsync(async () => {
      await baseClient.userLabel.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      await baseClient.calendarEvent.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      await baseClient.contact.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      await baseClient.subscription.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      await baseClient.providerConfig.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      await baseClient.user.deleteMany({
        where: { tenantId: { in: [tenantA.id, tenantB.id] } },
      });
      await baseClient.tenant.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Email domain — User rows are tenant-scoped representatives
  // ---------------------------------------------------------------------------
  describe('Email domain', () => {
    it('tenant A cannot see tenant B User row', async () => {
      // userA and userB already created in beforeAll
      const resultsAsA = await queryAs<{ tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.user.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.tenantId === tenantB.id)).toBe(false);
    });

    it('tenant A sees its own User row', async () => {
      const resultsAsA = await queryAs<{ id: string; tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.user.findMany(),
      );

      expect(resultsAsA.some((r) => r.id === userA.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Labels domain
  // ---------------------------------------------------------------------------
  describe('Labels domain', () => {
    it('tenant A cannot see tenant B labels', async () => {
      await createTestLabel(tenantB.id);

      const resultsAsA = await queryAs<{ tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.userLabel.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.tenantId === tenantB.id)).toBe(false);
    });

    it('tenant A sees only its own labels', async () => {
      const labelA = await createTestLabel(tenantA.id);

      const resultsAsA = await queryAs<{ id: string; tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.userLabel.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.id === labelA.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Calendar domain — CalendarEvent requires a ProviderConfig FK
  // ---------------------------------------------------------------------------
  describe('Calendar domain', () => {
    it('tenant A cannot see tenant B calendar events', async () => {
      const providerB = await createTestProviderAccount(tenantB.id, userB.id);
      await createTestCalendarEvent(tenantB.id, providerB.id);

      const resultsAsA = await queryAs<{ tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.calendarEvent.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.tenantId === tenantB.id)).toBe(false);
    });

    it('tenant A sees its own calendar events', async () => {
      const providerA = await createTestProviderAccount(tenantA.id, userA.id);
      const eventA = await createTestCalendarEvent(tenantA.id, providerA.id);

      const resultsAsA = await queryAs<{ id: string; tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.calendarEvent.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.id === eventA.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Contacts domain
  // ---------------------------------------------------------------------------
  describe('Contacts domain', () => {
    it('tenant A cannot see tenant B contacts', async () => {
      await createTestContact(tenantB.id);

      const resultsAsA = await queryAs<{ tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.contact.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.tenantId === tenantB.id)).toBe(false);
    });

    it('tenant A sees its own contacts', async () => {
      const contactA = await createTestContact(tenantA.id);

      const resultsAsA = await queryAs<{ id: string; tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.contact.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.id === contactA.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Providers domain — ProviderConfig
  // ---------------------------------------------------------------------------
  describe('Providers domain', () => {
    it('tenant A cannot see tenant B provider configs', async () => {
      await createTestProviderAccount(tenantB.id, userB.id);

      const resultsAsA = await queryAs<{ tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.providerConfig.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.tenantId === tenantB.id)).toBe(false);
    });

    it('tenant A sees its own provider configs', async () => {
      const providerA = await createTestProviderAccount(tenantA.id, userA.id);

      const resultsAsA = await queryAs<{ id: string; tenantId: string }[]>(
        tenantA.id,
        () => scopedClient.providerConfig.findMany(),
      );

      expect(resultsAsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(resultsAsA.some((r) => r.id === providerA.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Subscription domain
  // Subscription has a UNIQUE constraint on tenantId — use fresh tenantC/tenantD
  // so no unique constraint violation occurs with the shared tenantA/tenantB above.
  // ---------------------------------------------------------------------------
  describe('Subscription domain', () => {
    let tenantC: Tenant;
    let tenantD: Tenant;

    beforeAll(async () => {
      tenantC = await createTestTenant();
      tenantD = await createTestTenant();
      // Create a user for tenantC to mirror production tenant structure
      await createTestUser(tenantC.id);
    });

    afterAll(async () => {
      const baseClient = getTestPrismaClient();
      await withoutTenantScopingAsync(async () => {
        await baseClient.subscription.deleteMany({
          where: { tenantId: { in: [tenantC.id, tenantD.id] } },
        });
        await baseClient.user.deleteMany({
          where: { tenantId: { in: [tenantC.id, tenantD.id] } },
        });
        await baseClient.tenant.deleteMany({
          where: { id: { in: [tenantC.id, tenantD.id] } },
        });
      });
    });

    it('tenant C cannot see tenant D subscription', async () => {
      await createTestSubscription(tenantD.id);

      const resultsAsC = await queryAs<{ tenantId: string }[]>(
        tenantC.id,
        () => scopedClient.subscription.findMany(),
      );

      expect(resultsAsC.every((r) => r.tenantId === tenantC.id)).toBe(true);
      expect(resultsAsC.some((r) => r.tenantId === tenantD.id)).toBe(false);
    });

    it('tenant C sees its own subscription', async () => {
      const subC = await createTestSubscription(tenantC.id);

      const resultsAsC = await queryAs<{ id: string; tenantId: string }[]>(
        tenantC.id,
        () => scopedClient.subscription.findMany(),
      );

      expect(resultsAsC.every((r) => r.tenantId === tenantC.id)).toBe(true);
      expect(resultsAsC.some((r) => r.id === subC.id)).toBe(true);
    });
  });
});
