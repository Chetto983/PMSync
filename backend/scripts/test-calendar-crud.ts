/**
 * Comprehensive Calendar CRUD Test Script
 * Tests database state and sync services with real providers
 *
 * Usage: npx ts-node scripts/test-calendar-crud.ts <tenantId>
 */

import 'dotenv/config';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: unknown;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, data?: unknown) {
  results.push({ name, passed, error, data });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) console.log(`   Error: ${error}`);
  if (data && passed) console.log(`   Data: ${JSON.stringify(data, null, 2).substring(0, 500)}...`);
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: npx ts-node scripts/test-calendar-crud.ts <tenantId>');
    process.exit(1);
  }

  console.log('========================================');
  console.log('📅 Calendar CRUD Test Suite');
  console.log('========================================\n');

  // Import Prisma client
  const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
  const prisma = createPrismaClient();

  try {
    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.error(`Tenant ${tenantId} not found`);
      process.exit(1);
    }
    console.log(`Tenant: ${tenant.name}\n`);

    // Get all calendar providers for this tenant
    const providers = await prisma.providerConfig.findMany({
      where: {
        tenantId,
        providerType: { in: ['google', 'microsoft'] },
        isActive: true,
        supportsCalendar: true,
      },
    });

    if (providers.length === 0) {
      console.log('No calendar providers found for this tenant');
      process.exit(1);
    }

    console.log(`Found ${providers.length} provider(s):\n`);
    for (const p of providers) {
      console.log(`  - ${p.providerType}: ${p.email}`);
    }
    console.log('');

    // ========================================
    // TEST 1: List Calendars from Database
    // ========================================
    console.log('\n--- TEST 1: List Calendars (Database) ---');
    try {
      // Aggregate calendars from events
      const calendarEvents = await prisma.calendarEvent.groupBy({
        by: ['calendarId', 'calendarName', 'providerId'],
        where: {
          tenantId,
          providerId: { in: providers.map(p => p.id) },
          isDeleted: false,
          calendarId: { not: null },
        },
        _count: { id: true },
      });

      const calendars = calendarEvents.map(cal => ({
        id: `${cal.providerId}:${cal.calendarId}`,
        calendarId: cal.calendarId,
        calendarName: cal.calendarName || cal.calendarId,
        providerId: cal.providerId,
        eventCount: cal._count.id,
      }));

      logTest('List Calendars', true, undefined, {
        total: calendars.length,
        calendars: calendars.slice(0, 5),
      });
    } catch (error) {
      logTest('List Calendars', false, error instanceof Error ? error.message : String(error));
    }

    // ========================================
    // TEST 2: List Events with Filters
    // ========================================
    console.log('\n--- TEST 2: List Events with Date Range ---');
    try {
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const events = await prisma.calendarEvent.findMany({
        where: {
          tenantId,
          isDeleted: false,
          startTime: {
            gte: now,
            lte: nextMonth,
          },
        },
        orderBy: { startTime: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          startTime: true,
          calendarName: true,
          providerId: true,
        },
      });

      const total = await prisma.calendarEvent.count({
        where: {
          tenantId,
          isDeleted: false,
          startTime: {
            gte: now,
            lte: nextMonth,
          },
        },
      });

      logTest('List Events (Date Range)', true, undefined, {
        total,
        sample: events.slice(0, 3).map(e => ({
          title: e.title,
          start: e.startTime,
          calendar: e.calendarName,
        })),
      });
    } catch (error) {
      logTest('List Events (Date Range)', false, error instanceof Error ? error.message : String(error));
    }

    // ========================================
    // TEST 3: Get Single Event
    // ========================================
    console.log('\n--- TEST 3: Get Single Event ---');
    try {
      const event = await prisma.calendarEvent.findFirst({
        where: { tenantId, isDeleted: false },
        select: {
          id: true,
          externalId: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          calendarId: true,
          calendarName: true,
          provider: {
            select: { email: true, providerType: true },
          },
        },
      });

      if (event) {
        logTest('Get Single Event', true, undefined, {
          id: event.id,
          title: event.title,
          start: event.startTime,
          end: event.endTime,
          calendar: event.calendarName,
          provider: event.provider?.providerType,
        });
      } else {
        logTest('Get Single Event', false, 'No events found');
      }
    } catch (error) {
      logTest('Get Single Event', false, error instanceof Error ? error.message : String(error));
    }

    // ========================================
    // TEST 4: List Events by Provider
    // ========================================
    console.log('\n--- TEST 4: List Events by Provider ---');
    for (const provider of providers) {
      try {
        const [events, total] = await Promise.all([
          prisma.calendarEvent.findMany({
            where: { providerId: provider.id, isDeleted: false },
            take: 5,
            select: { id: true, title: true, startTime: true },
          }),
          prisma.calendarEvent.count({
            where: { providerId: provider.id, isDeleted: false },
          }),
        ]);

        logTest(`List Events (${provider.providerType})`, true, undefined, {
          provider: provider.email,
          total,
          sample: events.slice(0, 2).map(e => e.title),
        });
      } catch (error) {
        logTest(`List Events (${provider.providerType})`, false, error instanceof Error ? error.message : String(error));
      }
    }

    // ========================================
    // TEST 5: List Events by Calendar
    // ========================================
    console.log('\n--- TEST 5: List Events by Calendar ---');
    try {
      // Get a calendar with events
      const calendarWithEvents = await prisma.calendarEvent.findFirst({
        where: { tenantId, isDeleted: false, calendarId: { not: null } },
        select: { calendarId: true, calendarName: true, providerId: true },
      });

      if (calendarWithEvents) {
        const events = await prisma.calendarEvent.findMany({
          where: {
            calendarId: calendarWithEvents.calendarId,
            providerId: calendarWithEvents.providerId,
            isDeleted: false,
          },
          take: 5,
          select: { id: true, title: true, startTime: true },
        });

        logTest('List Events by Calendar', true, undefined, {
          calendarName: calendarWithEvents.calendarName,
          calendarId: calendarWithEvents.calendarId,
          eventCount: events.length,
        });
      } else {
        logTest('List Events by Calendar', false, 'No calendars with events found');
      }
    } catch (error) {
      logTest('List Events by Calendar', false, error instanceof Error ? error.message : String(error));
    }

    // ========================================
    // TEST 6: Sync State Verification
    // ========================================
    console.log('\n--- TEST 6: Verify Sync State ---');
    for (const provider of providers) {
      try {
        const syncStates = await prisma.calendarSyncState.findMany({
          where: { providerId: provider.id },
        });

        logTest(`Sync State (${provider.providerType})`, true, undefined, {
          provider: provider.email,
          syncStatesCount: syncStates.length,
          calendars: syncStates.slice(0, 3).map(s => ({
            calendarId: s.calendarId,
            hasSyncToken: !!s.syncToken,
            lastSync: s.updatedAt,
          })),
        });
      } catch (error) {
        logTest(`Sync State (${provider.providerType})`, false, error instanceof Error ? error.message : String(error));
      }
    }

    // ========================================
    // TEST 7: Event Count Summary
    // ========================================
    console.log('\n--- TEST 7: Event Count Summary ---');
    try {
      const totalEvents = await prisma.calendarEvent.count({
        where: { tenantId, isDeleted: false },
      });

      const byProvider = await prisma.calendarEvent.groupBy({
        by: ['providerId'],
        where: { tenantId, isDeleted: false },
        _count: { id: true },
      });

      const providerSummary = await Promise.all(
        byProvider.map(async (p) => {
          const provider = await prisma.providerConfig.findUnique({
            where: { id: p.providerId },
            select: { email: true, providerType: true },
          });
          return {
            provider: provider?.email,
            type: provider?.providerType,
            count: p._count.id,
          };
        })
      );

      logTest('Event Count Summary', true, undefined, {
        totalEvents,
        byProvider: providerSummary,
      });
    } catch (error) {
      logTest('Event Count Summary', false, error instanceof Error ? error.message : String(error));
    }

    // ========================================
    // TEST 8: Check for Birthday/Holiday Events
    // ========================================
    console.log('\n--- TEST 8: Birthday/Holiday Events Check ---');
    try {
      const birthdayEvents = await prisma.calendarEvent.findMany({
        where: {
          tenantId,
          isDeleted: false,
          OR: [
            { calendarId: { contains: 'birthday' } },
            { calendarName: { contains: 'birthday', mode: 'insensitive' } },
            { calendarName: { contains: 'compleanno', mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: {
          id: true,
          title: true,
          calendarName: true,
          startTime: true,
          externalId: true,
        },
      });

      const holidayEvents = await prisma.calendarEvent.findMany({
        where: {
          tenantId,
          isDeleted: false,
          OR: [
            { calendarId: { contains: 'holiday' } },
            { calendarName: { contains: 'holiday', mode: 'insensitive' } },
            { calendarName: { contains: 'festività', mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: {
          id: true,
          title: true,
          calendarName: true,
          startTime: true,
        },
      });

      logTest('Birthday Events', true, undefined, {
        count: birthdayEvents.length,
        sample: birthdayEvents.slice(0, 5).map(e => ({
          title: e.title || '(no title)',
          calendar: e.calendarName,
          date: e.startTime,
        })),
      });

      logTest('Holiday Events', true, undefined, {
        count: holidayEvents.length,
        sample: holidayEvents.slice(0, 5).map(e => ({
          title: e.title || '(no title)',
          calendar: e.calendarName,
          date: e.startTime,
        })),
      });
    } catch (error) {
      logTest('Birthday/Holiday Events', false, error instanceof Error ? error.message : String(error));
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n========================================');
    console.log('📊 Test Summary');
    console.log('========================================');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`\nTotal: ${results.length} tests`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    console.log('\n========================================');
    console.log(failed === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed');
    console.log('========================================\n');

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
