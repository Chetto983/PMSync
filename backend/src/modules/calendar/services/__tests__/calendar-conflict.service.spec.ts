/**
 * CalendarConflictService integration tests — BTEST-01
 * Tests run against a real PostgreSQL test database.
 * Uses createTestCalendarEvent factory; cleanup is per-factory targeted.
 */
import { CalendarConflictService } from '../calendar-conflict.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
  createTestCalendarEvent,
} from '../../../../../test/helpers/factories';

describe('CalendarConflictService', () => {
  let service: CalendarConflictService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  // Per-factory tracked IDs for targeted cleanup
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];
  const eventIds: string[] = [];

  // Shared tenants and provider for tests that don't need isolation
  let tenantAId: string;
  let tenantBId: string;
  let providerAId: string;
  let providerBId: string;

  // Use a base timestamp far enough in the future to avoid conflicts with other test data
  const BASE_TIME = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

  beforeAll(async () => {
    prisma = getTestPrismaClient();
    service = new CalendarConflictService(prisma as any);

    // Create two tenants for cross-tenant isolation test
    const tenantA = await createTestTenant({ name: 'Conflict Test Tenant A' });
    tenantAId = tenantA.id;
    tenantIds.push(tenantAId);

    const tenantB = await createTestTenant({ name: 'Conflict Test Tenant B' });
    tenantBId = tenantB.id;
    tenantIds.push(tenantBId);

    // Create users and providers for each tenant
    const userA = await createTestUser(tenantAId);
    userIds.push(userA.id);
    const providerA = await createTestProviderAccount(tenantAId, userA.id);
    providerAId = providerA.id;
    providerIds.push(providerAId);

    const userB = await createTestUser(tenantBId);
    userIds.push(userB.id);
    const providerB = await createTestProviderAccount(tenantBId, userB.id);
    providerBId = providerB.id;
    providerIds.push(providerBId);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await cleanupTestData();
  });

  describe('detectConflicts', () => {
    it('returns severity=hard when one event fully contains another', async () => {
      // eventA: BASE+1h to BASE+2h (outer)
      // eventB: BASE+1h10m to BASE+1h30m (inner — fully contained)
      const eventA = await createTestCalendarEvent(tenantAId, providerAId, {
        title: 'Hard Outer Event',
        startTime: new Date(BASE_TIME.getTime() + 60 * 60 * 1000),
        endTime: new Date(BASE_TIME.getTime() + 2 * 60 * 60 * 1000),
      });
      eventIds.push(eventA.id);

      const eventB = await createTestCalendarEvent(tenantAId, providerAId, {
        title: 'Hard Inner Event',
        startTime: new Date(BASE_TIME.getTime() + 70 * 60 * 1000),
        endTime: new Date(BASE_TIME.getTime() + 90 * 60 * 1000),
      });
      eventIds.push(eventB.id);

      const conflicts = await service.detectConflicts(tenantAId, {
        startDate: BASE_TIME,
        endDate: new Date(BASE_TIME.getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      const hardConflict = conflicts.find(
        (c) =>
          (c.eventA.id === eventA.id && c.eventB.id === eventB.id) ||
          (c.eventA.id === eventB.id && c.eventB.id === eventA.id),
      );
      expect(hardConflict).toBeDefined();
      expect(hardConflict!.severity).toBe('hard');
    });

    it('returns severity=soft for partial overlap', async () => {
      // eventC ends at BASE+3h30m, eventD starts at BASE+3h15m (partial overlap)
      const offset = 2 * 60 * 60 * 1000; // shift 2h to avoid collision with previous test
      const eventC = await createTestCalendarEvent(tenantAId, providerAId, {
        title: 'Soft Event C',
        startTime: new Date(BASE_TIME.getTime() + offset + 3 * 60 * 60 * 1000),
        endTime: new Date(BASE_TIME.getTime() + offset + 3 * 60 * 60 * 1000 + 30 * 60 * 1000),
      });
      eventIds.push(eventC.id);

      const eventD = await createTestCalendarEvent(tenantAId, providerAId, {
        title: 'Soft Event D',
        startTime: new Date(BASE_TIME.getTime() + offset + 3 * 60 * 60 * 1000 + 15 * 60 * 1000),
        endTime: new Date(BASE_TIME.getTime() + offset + 4 * 60 * 60 * 1000),
      });
      eventIds.push(eventD.id);

      const conflicts = await service.detectConflicts(tenantAId, {
        startDate: BASE_TIME,
        endDate: new Date(BASE_TIME.getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      const softConflict = conflicts.find(
        (c) =>
          (c.eventA.id === eventC.id && c.eventB.id === eventD.id) ||
          (c.eventA.id === eventD.id && c.eventB.id === eventC.id),
      );
      expect(softConflict).toBeDefined();
      expect(softConflict!.severity).toBe('soft');
    });

    it('returns empty array for back-to-back events (no overlap)', async () => {
      const tenantNoConflict = await createTestTenant({ name: 'No Conflict Tenant' });
      tenantIds.push(tenantNoConflict.id);
      const userNC = await createTestUser(tenantNoConflict.id);
      userIds.push(userNC.id);
      const providerNC = await createTestProviderAccount(tenantNoConflict.id, userNC.id);
      providerIds.push(providerNC.id);

      // eventE ends exactly at time T, eventF starts exactly at time T — back-to-back
      const T = new Date(BASE_TIME.getTime() + 10 * 24 * 60 * 60 * 1000); // far future
      const eventE = await createTestCalendarEvent(tenantNoConflict.id, providerNC.id, {
        title: 'Back-to-back E',
        startTime: new Date(T.getTime()),
        endTime: new Date(T.getTime() + 60 * 60 * 1000),
      });
      eventIds.push(eventE.id);

      const eventF = await createTestCalendarEvent(tenantNoConflict.id, providerNC.id, {
        title: 'Back-to-back F',
        startTime: new Date(T.getTime() + 60 * 60 * 1000),
        endTime: new Date(T.getTime() + 2 * 60 * 60 * 1000),
      });
      eventIds.push(eventF.id);

      const conflicts = await service.detectConflicts(tenantNoConflict.id, {
        startDate: T,
        endDate: new Date(T.getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      // No overlap — events are back-to-back
      expect(conflicts).toHaveLength(0);
    });

    it('does not include tenant B events when querying for tenant A conflicts', async () => {
      const tenantCrossA = await createTestTenant({ name: 'Cross Tenant A' });
      tenantIds.push(tenantCrossA.id);
      const tenantCrossB = await createTestTenant({ name: 'Cross Tenant B' });
      tenantIds.push(tenantCrossB.id);

      const userCA = await createTestUser(tenantCrossA.id);
      userIds.push(userCA.id);
      const providerCA = await createTestProviderAccount(tenantCrossA.id, userCA.id);
      providerIds.push(providerCA.id);

      const userCB = await createTestUser(tenantCrossB.id);
      userIds.push(userCB.id);
      const providerCB = await createTestProviderAccount(tenantCrossB.id, userCB.id);
      providerIds.push(providerCB.id);

      const isolationBase = new Date(BASE_TIME.getTime() + 20 * 24 * 60 * 60 * 1000);

      // Overlapping events in tenant B
      const eventTB1 = await createTestCalendarEvent(tenantCrossB.id, providerCB.id, {
        title: 'Tenant B Event 1',
        startTime: new Date(isolationBase.getTime() + 60 * 60 * 1000),
        endTime: new Date(isolationBase.getTime() + 2 * 60 * 60 * 1000),
      });
      eventIds.push(eventTB1.id);

      const eventTB2 = await createTestCalendarEvent(tenantCrossB.id, providerCB.id, {
        title: 'Tenant B Event 2',
        startTime: new Date(isolationBase.getTime() + 70 * 60 * 1000),
        endTime: new Date(isolationBase.getTime() + 90 * 60 * 1000),
      });
      eventIds.push(eventTB2.id);

      // Query conflicts for tenant A (should be zero — no events in tenant A)
      const conflicts = await service.detectConflicts(tenantCrossA.id, {
        startDate: isolationBase,
        endDate: new Date(isolationBase.getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      // Tenant A has no events — no conflicts visible
      expect(conflicts).toHaveLength(0);

      // Verify tenant B events are there (not leaked to A)
      const tenantBConflicts = await service.detectConflicts(tenantCrossB.id, {
        startDate: isolationBase,
        endDate: new Date(isolationBase.getTime() + 3 * 24 * 60 * 60 * 1000),
      });
      expect(tenantBConflicts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
